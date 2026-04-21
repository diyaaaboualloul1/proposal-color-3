const { google } = require('googleapis');
const { Readable } = require('stream');
const path = require('path');

const pool = new (require('pg').Pool)({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

/**
 * Get Google Drive client initialized from DB settings using OAuth2
 */
async function getDriveClient() {
  const settings = await getSettings();

  if (!settings.google_drive_enabled || settings.google_drive_enabled === 'false') {
    throw new Error('Google Drive integration is not enabled');
  }

  if (!settings.google_oauth_refresh_token) {
    throw new Error('Google account not connected. Please click "Connect with Google" first.');
  }

  if (!settings.google_oauth_client_id || !settings.google_oauth_client_secret) {
    throw new Error('OAuth Client ID and Secret are not configured');
  }

  const oauth2Client = new google.auth.OAuth2(
    settings.google_oauth_client_id,
    settings.google_oauth_client_secret,
    settings.google_oauth_redirect_uri
  );

  oauth2Client.setCredentials({
    refresh_token: settings.google_oauth_refresh_token,
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const docs = google.docs({ version: 'v1', auth: oauth2Client });
  return { drive, docs };
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
  const { drive } = await getDriveClient();
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
  const { drive } = await getDriveClient();

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
  const { drive } = await getDriveClient();

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
    includeItemsFromAllDrives: true,
    convert: mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
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
  const { drive } = await getDriveClient();

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
 * Upload DOCX buffer as a native Google Doc (converted server-side by Google)
 * Uses Drive API's convert=true which converts DOCX → Google Doc on Google's servers
 * @param {string} folderId
 * @param {string} fileName
 * @param {Buffer} docxBuffer
 * @returns {Promise<{fileId: string, webViewLink: string}>}
 */
async function uploadAsGoogleDoc(folderId, fileName, docxBuffer) {
  const { drive } = await getDriveClient();

  const { Readable } = require('stream');
  const stream = new Readable();
  stream.push(docxBuffer);
  stream.push(null);

  // Upload with convert=true → Google converts DOCX → Google Doc on their servers
  // This uses OAuth credentials (real user's quota) — no service account quota issue
  const file = await drive.files.create({
    resource: {
      name: fileName,
      mimeType: 'application/vnd.google-apps.document',
      parents: [folderId],
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: stream,
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    convert: true,
  });

  return {
    fileId: file.data.id,
    webViewLink: file.data.webViewLink,
  };
}

/**
 * @deprecated Use uploadAsGoogleDoc instead — simpler and more reliable
 */
async function createGoogleDoc(folderId, fileName, textContent) {
  // Legacy — kept for backwards compatibility
  const { drive, docs } = await getDriveClient();
  const file = await drive.files.create({
    resource: { name: fileName, mimeType: 'application/vnd.google-apps.document', parents: [folderId] },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return { fileId: file.data.id, webViewLink: file.data.webViewLink };
}

/**
 * Ensure the client-summaries subfolder exists inside a version folder.
 * Only created when a client summary is actually being uploaded.
 */
async function ensureClientSummariesFolder(versionFolderId) {
  const { drive } = await getDriveClient();

  const searchRes = await drive.files.list({
    q: `name = 'client-summaries' and '${versionFolderId}' in parents and trashed = false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (searchRes.data.files.length > 0) {
    return searchRes.data.files[0].id;
  }

  const folderMeta = {
    name: 'client-summaries',
    mimeType: 'application/vnd.google-apps.folder',
    parents: [versionFolderId],
  };

  const created = await drive.files.create({
    resource: folderMeta,
    fields: 'id',
    supportsAllDrives: true,
  });

  return created.data.id;
}

/**
 * Main function: create a Google Doc from the SRS DOCX content.
 * For technical SRS: uploads to ProjectName/v{version}/ folder.
 * For client summaries: uploads to ProjectName/v{parentVersion}/client-summaries/ folder.
 *
 * @param {string} projectName
 * @param {object} opts - { type: 'technical'|'client', version, parentVersion, files }
 * @returns {object} { folderId, docxFileId, shareUrl }
 */
async function uploadVersionFiles(projectName, { type, version, parentVersion, files }) {
  const { drive } = await getDriveClient();
  const safeProjectSlug = projectName.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().replace(/\s+/g, '-').substring(0, 40).replace(/-$/, '');

  // Ensure project folder
  const projectFolderId = await ensureProjectFolder(projectName);

  if (type === 'client' && parentVersion) {
    // Client summary → upload to parent version folder / client-summaries subfolder
    // Create parent version folder if it doesn't exist (e.g. technical SRS never uploaded)
    const versionFolderId = await ensureVersionFolder(projectFolderId, `v${parentVersion}`);
    const clientSummariesFolderId = await ensureClientSummariesFolder(versionFolderId);

    const docxName = `${safeProjectSlug}-${version}`; // e.g. "BarberCo-client-v1.0-of-1.0"
    const docxResult = await uploadAsGoogleDoc(clientSummariesFolderId, docxName, files.docx);
    await setSharePermission(docxResult.fileId);

    return {
      driveFolderId: clientSummariesFolderId,
      driveFileIdDocx: docxResult.fileId,
      shareUrl: docxResult.webViewLink,
    };
  }

  // Technical SRS → upload to ProjectName/v{version}/
  const versionFolderId = await ensureVersionFolder(projectFolderId, `v${version}`);
  const docxName = `${safeProjectSlug}-v${version}`;
  const docxResult = await uploadAsGoogleDoc(versionFolderId, docxName, files.docx);
  await setSharePermission(docxResult.fileId);

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
  const settings = await getSettings();

  if (!settings.google_oauth_refresh_token) {
    throw new Error('Google account not connected. Please click "Connect with Google" first.');
  }

  const { drive } = await getDriveClient();
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
  pool,
  getDriveClient,
  getSettings,
  getSetting,
  saveSetting,
  ensureProjectFolder,
  ensureVersionFolder,
  ensureClientSummariesFolder,
  uploadFile,
  setSharePermission,
  uploadVersionFiles,
  testConnection,
  createGoogleDoc,
};
