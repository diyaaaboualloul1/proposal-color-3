const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getSettings, saveSetting, testConnection } = require('../services/googleDrive');

const SETUP_INSTRUCTIONS = [
  {
    step: 1,
    title: 'Create Google Cloud Project',
    description: 'Go to console.cloud.google.com, create a new project named "SRS Platform"',
  },
  {
    step: 2,
    title: 'Enable Google Drive API',
    description: 'In APIs & Services > Library, search and enable "Google Drive API"',
  },
  {
    step: 3,
    title: 'Enable Google Docs API',
    description: 'In APIs & Services > Library, search and enable "Google Docs API"',
  },
  {
    step: 4,
    title: 'Create Service Account',
    description: 'In APIs & Services > Credentials, click "Create Credentials > Service Account". Name it "SRS Platform Drive"',
  },
  {
    step: 5,
    title: 'Download Service Account Key',
    description: 'Click the service account > Keys tab > Add Key > Create New Key > JSON. Download the file',
  },
  {
    step: 6,
    title: 'Copy Service Account Email',
    description: 'From the Credentials page, copy the service account email (looks like name@project-id.iam.gserviceaccount.com)',
  },
  {
    step: 7,
    title: 'Create Root Folder in Google Drive',
    description: 'Create a new folder in Google Drive called "SRS Platform". Right-click > Share > add the service account email with "Editor" access',
  },
  {
    step: 8,
    title: 'Copy Root Folder ID',
    description: 'Open the folder. The folder ID is the part of the URL after /folders/ (e.g. https://drive.google.com/drive/folders/THIS_PART_IS_THE_ID)',
  },
];

// GET /admin/settings/google-drive — get current settings (no key returned)
router.get('/google-drive', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const settings = await getSettings();

    // Return settings without the actual key
    res.json({
      google_drive_enabled: settings.google_drive_enabled || 'false',
      google_drive_root_folder_id: settings.google_drive_root_folder_id || '',
      google_service_account_email: settings.google_service_account_email || '',
      // Do NOT return google_service_account_key — admin must re-enter to confirm
      has_service_account_key: !!(settings.google_service_account_key && settings.google_service_account_key !== '' && settings.google_service_account_key !== 'null'),
    });
  } catch (err) {
    console.error('Get Google Drive settings error:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// PUT /admin/settings/google-drive — save settings
router.put('/google-drive', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const { google_drive_enabled, google_drive_root_folder_id, google_service_account_email, google_service_account_key } = req.body;

    // Save enabled flag
    await saveSetting('google_drive_enabled', String(google_drive_enabled === true || google_drive_enabled === 'true'), req.user.id);

    // Save root folder ID
    await saveSetting('google_drive_root_folder_id', google_drive_root_folder_id || '', req.user.id);

    // Save service account email
    await saveSetting('google_service_account_email', google_service_account_email || '', req.user.id);

    // Save service account key (only if provided)
    if (google_service_account_key && google_service_account_key.trim() !== '') {
      await saveSetting('google_service_account_key', google_service_account_key, req.user.id);
    }

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    console.error('Save Google Drive settings error:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// POST /admin/settings/google-drive/test — test connection
router.post('/google-drive/test', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    await testConnection();
    res.json({ success: true, message: 'Connection successful' });
  } catch (err) {
    console.error('Test Google Drive connection error:', err);
    res.status(400).json({ success: false, error: err.message || 'Connection failed' });
  }
});

// GET /admin/settings/google-drive/instructions — get setup steps
router.get('/google-drive/instructions', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    res.json({ instructions: SETUP_INSTRUCTIONS });
  } catch (err) {
    console.error('Get instructions error:', err);
    res.status(500).json({ error: 'Failed to get instructions' });
  }
});

module.exports = router;
