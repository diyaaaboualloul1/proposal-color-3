const { google } = require('googleapis');
const path = require('path');

const pool = new (require('pg').Pool)({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

/**
 * Get Google Drive client initialized from DB settings
 */
async function getDriveClient() {
  const settings = await getSettings();

  if (!settings.google_drive_enabled || settings.google_drive_enabled === 'false') {
    throw new Error('Google Drive integration is not enabled');
  }

  if (!settings.google_service_account_key) {
    throw new Error('Service account key is not configured');
  }

  let keyJson;
  try {
    keyJson = typeof settings.google_service_account_key === 'string'
      ? JSON.parse(settings.google_service_account_key)
      : settings.google_service_account_key;
  } catch {
    throw new Error('Invalid service account JSON key');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: keyJson,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });
  return drive;
}

/**
 * Get all Google Drive settings from DB
 */
async function getSettings() {
  const result = await pool.query('SELECT setting_key, setting_value FROM platform_settings WHERE setting_key LIKE $1', ['google_%']);
  const settings = {};
  for (const row of result.rows) {
    settings[row.setting_key] = row.setting_value;
  }
  return settings;
}

/**
 * Get a single setting value
 */
async function getSetting(key) {
  const result = await pool.query('SELECT setting_value FROM platform_settings WHERE setting_key = $1', [key]);
  return result.rows[0]?.setting_value || null;
}

/**
 * Save a platform setting
 */
async function saveSetting(key, value, userId) {
  await pool.query(
    `INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = NOW(), updated_by = $3`,
    [key, value, userId]
  );
}

/**
 * Find or create the project folder inside root
 */
async function ensureProjectFolder(projectName) {
  const drive = await getDriveClient();
  const rootFolderId = await getSetting('google_drive_root_folder_id');

  if (!rootFolderId) {
    throw new Error('Root folder ID is not configured');
  }

  // Search for existing project folder
  const searchRes = await drive.files.list({
    q: `name = '${escapeSearch(projectName)}' and '${rootFolderId}' in parents and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id;
  }

  // Create project folder
  const folderMeta = {
    name: projectName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [rootFolderId],
  };

  const created = await drive.files.create({
    resource: folderMeta,
    fields: 'id',
    supportsAllDrives: true,
  });

  return created.data.id;
}

/**
 * Find or create the version subfolder inside project folder
 */
async function ensureVersionFolder(projectFolderId, versionLabel) {
  const drive = await getDriveClient();

  // Search for existing version folder
  const searchRes = await drive.files.list({
    q: `name = '${escapeSearch(versionLabel)}' and '${projectFolderId}' in parents and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id;
  }

  // Create version folder
  const folderMeta = {
    name: versionLabel,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [projectFolderId],
  };

  const created = await drive.files.create({
    resource: folderMeta,
    fields: 'id',
    supportsAllDrives: true,
  });

  return created.data.id;
}

/**
 * Upload a file to a Drive folder
 */
async function uploadFile(folderId, fileName, fileBuffer, mimeType) {
  const drive = await getDriveClient();

  const { Readable } = require('stream');
  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  const uploaded = await drive.files.create({
    resource: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id, webViewLink, webContentLink',
    supportsAllDrives: true,
  });

  return {
    fileId: uploaded.data.id,
    webViewLink: uploaded.data.webViewLink,
    webContentLink: uploaded.data.webContentLink,
  };
}

/**
 * Set sharing permission so anyone with link can view/comment
 */
async function setSharePermission(fileId) {
  const drive = await getDriveClient();

  await drive.permissions.create({
    fileId,
    requestBody: {
      type: 'anyone',
      role: 'commenter',
    },
    supportsAllDrives: true,
  });
}

/**
 * Main function: upload all 3 files for a version
 * @param {string} projectName
 * @param {string} versionLabel
 * @param {object} files - { pdf: Buffer, docx: Buffer, md: Buffer }
 * @returns {object} { folderId, docxFileId, shareUrl }
 */
async function uploadVersionFiles(projectName, versionLabel, files) {
  // Ensure project folder
  const projectFolderId = await ensureProjectFolder(projectName);

  // Ensure version folder
  const versionFolderId = await ensureVersionFolder(projectFolderId, versionLabel);

  // Build filenames
  const safeProjectSlug = projectName.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().replace(/\s+/g, '-').substring(0, 40).replace(/-$/, '');
  const pdfName = `${safeProjectSlug}-v${versionLabel}.pdf`;
  const docxName = `${safeProjectSlug}-v${versionLabel}.docx`;
  const mdName = `${safeProjectSlug}-v${versionLabel}.md`;

  // Upload files in parallel
  const [pdfResult, docxResult, mdResult] = await Promise.all([
    uploadFile(versionFolderId, pdfName, files.pdf, 'application/pdf'),
    uploadFile(versionFolderId, docxName, files.docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    uploadFile(versionFolderId, mdName, files.md, 'text/markdown'),
  ]);

  // Set share permissions on all files
  await Promise.all([
    setSharePermission(pdfResult.fileId),
    setSharePermission(docxResult.fileId),
    setSharePermission(mdResult.fileId),
  ]);

  return {
    driveFolderId: versionFolderId,
    driveFileIdDocx: docxResult.fileId,
    shareUrl: docxResult.webViewLink,
  };
}

/**
 * Test Google Drive connection with current settings
 * @returns {object} { success: true } or throws error
 */
async function testConnection() {
  const drive = await getDriveClient();
  const rootFolderId = await getSetting('google_drive_root_folder_id');

  // Try to access the root folder
  if (rootFolderId) {
    await drive.files.get({
      fileId: rootFolderId,
      fields: 'id, name',
      supportsAllDrives: true,
    });
  }

  return { success: true };
}

/**
 * Escape special characters in Google Drive search query
 */
function escapeSearch(str) {
  return str.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}

module.exports = {
  getDriveClient,
  getSettings,
  getSetting,
  saveSetting,
  ensureProjectFolder,
  ensureVersionFolder,
  uploadFile,
  setSharePermission,
  uploadVersionFiles,
  testConnection,
};
