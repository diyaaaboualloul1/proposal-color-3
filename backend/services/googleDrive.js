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

  const { Readable } = require('stream');
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
 * Create a native Google Doc directly in a Drive folder
 * (bypasses storage quota because Google Docs don't count against quota)
 */
async function createGoogleDoc(folderId, fileName, textContent) {
  const { drive, docs } = await getDriveClient();

  // Create a blank Google Doc directly in the folder
  const file = await drive.files.create({
    resource: {
      name: fileName,
      mimeType: 'application/vnd.google-apps.document',
      parents: [folderId],
    },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const docId = file.data.id;

  // Insert text content into the Google Doc using Docs API
  if (textContent && textContent.trim().length > 0) {
    try {
      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [{
            insertText: {
              location: { index: 0 },
              text: textContent,
            },
          }],
        },
      });
    } catch (e) {
      console.error('Failed to populate Google Doc content:', e.message);
      // File was created, just couldn't populate — that's okay
    }
  }

  return {
    fileId: docId,
    webViewLink: file.data.webViewLink,
  };
}

/**
 * Main function: create a Google Doc from the SRS DOCX content
 * Only creates the Google Doc — no PDF/MD uploads
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

  // Build filename
  const safeProjectSlug = projectName.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().replace(/\s+/g, '-').substring(0, 40).replace(/-$/, '');
  const docxName = `${safeProjectSlug}-v${versionLabel}`;

  // Extract text from DOCX buffer using mammoth
  let textContent = '';
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer: files.docx });
    textContent = result.value || '';
  } catch (e) {
    console.error('Failed to extract text from DOCX:', e.message);
    textContent = 'SRS Document — content could not be extracted.';
  }

  // Create native Google Doc directly in the folder (no upload = no quota needed)
  const docxResult = await createGoogleDoc(versionFolderId, docxName, textContent);

  // Set share permission so anyone with link can comment
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
  uploadFile,
  setSharePermission,
  uploadVersionFiles,
  testConnection,
  createGoogleDoc,
};
