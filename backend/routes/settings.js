const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getSettings, saveSetting, testConnection } = require('../services/googleDrive');
const { pool } = require('../db');

const SETUP_INSTRUCTIONS = [
  {
    step: 1,
    title: 'Create OAuth 2.0 Credentials',
    description: 'Go to console.cloud.google.com → APIs & Services → Credentials → Create Credentials → OAuth client ID. Application type: Web application. Name: "SRS Platform". Add Authorized redirect URI: http://142.132.189.59:6001/api/admin/settings/google-drive/oauth/callback',
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
    title: 'Enter Client ID and Secret',
    description: 'Copy the Client ID and Client Secret from the OAuth client you just created. Paste them into the fields above.',
  },
  {
    step: 5,
    title: 'Connect with Google',
    description: 'Click the "Connect with Google" button. You will be redirected to Google\'s consent screen. Sign in with the Google account you want to use and approve the permissions.',
  },
  {
    step: 6,
    title: 'Create Root Folder in Google Drive',
    description: 'In Google Drive (drive.google.com), create a new folder named "SRS Platform". Open the folder and copy the folder ID from the URL (the part after /folders/). Paste it into the Root Folder ID field above.',
  },
  {
    step: 7,
    title: 'Test the Connection',
    description: 'Click "Test Connection" to verify everything is working.',
  },
];

// GET /admin/settings/google-drive — get current settings (no secrets returned)
router.get('/google-drive', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const settings = await getSettings();

    res.json({
      google_drive_enabled: settings.google_drive_enabled || 'false',
      google_drive_root_folder_id: settings.google_drive_root_folder_id || '',
      google_oauth_client_id: settings.google_oauth_client_id || '',
      google_oauth_redirect_uri: settings.google_oauth_redirect_uri || '',
      google_oauth_connected: !!(settings.google_oauth_refresh_token && settings.google_oauth_refresh_token !== '' && settings.google_oauth_refresh_token !== 'null'),
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

    const { google_drive_enabled, google_drive_root_folder_id, google_oauth_client_id, google_oauth_client_secret, google_oauth_redirect_uri } = req.body;

    await saveSetting('google_drive_enabled', String(google_drive_enabled === true || google_drive_enabled === 'true'), req.user.id);
    await saveSetting('google_drive_root_folder_id', google_drive_root_folder_id || '', req.user.id);


    if (google_oauth_client_id) {
      await saveSetting('google_oauth_client_id', google_oauth_client_id, req.user.id);
    }
    if (google_oauth_client_secret) {
      await saveSetting('google_oauth_client_secret', google_oauth_client_secret, req.user.id);
    }
    if (google_oauth_redirect_uri) {
      await saveSetting('google_oauth_redirect_uri', google_oauth_redirect_uri, req.user.id);
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

// GET /admin/settings/google-drive/oauth-url — generate OAuth authorization URL
router.get('/google-drive/oauth-url', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const settings = await getSettings();

    if (!settings.google_oauth_client_id) {
      return res.status(400).json({ error: 'OAuth Client ID is not configured. Please save Client ID and Secret first.' });
    }

    const redirectUri = settings.google_oauth_redirect_uri || `http://142.132.189.59:6001/api/admin/settings/google-drive/oauth/callback`;


    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(settings.google_oauth_client_id)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents')}&` +
      `access_type=offline&` +
      `prompt=consent`;

    res.json({ authUrl });
  } catch (err) {
    console.error('Generate OAuth URL error:', err);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// GET /admin/settings/google-drive/oauth/callback — exchange code for tokens, store refresh token
router.get('/google-drive/oauth/callback', async (req, res) => {
  try {
    const { code } = req.query;


    if (!code) {
      return res.status(400).send('<html><body style="font-family:sans-serif;padding:40px;background:#0f1117;color:#f1f5f9;"><h2 style="color:#f87171;">❌ Authorization failed — no code received</h2><p><a href="http://142.132.189.59:6001/admin/settings/google-drive" style="color:#F47B20;">← Return to settings</a></p></body></html>');
    }

    const settings = await getSettings();
    const clientId = settings.google_oauth_client_id;
    const clientSecret = settings.google_oauth_client_secret;
    const redirectUri = settings.google_oauth_redirect_uri || `http://142.132.189.59:6001/api/admin/settings/google-drive/oauth/callback`;

    if (!clientId || !clientSecret) {
      return res.status(400).send('<html><body style="font-family:sans-serif;padding:40px;background:#0f1117;color:#f1f5f9;"><h2 style="color:#f87171;">❌ OAuth credentials not configured</h2><p><a href="http://142.132.189.59:6001/admin/settings/google-drive" style="color:#F47B20;">← Return to settings</a></p></body></html>');
    }

    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      return res.status(400).send('<html><body style="font-family:sans-serif;padding:40px;background:#0f1117;color:#f1f5f9;"><h2 style="color:#f87171;">❌ No refresh token received</h2><p>Google did not return a refresh token. This usually means the account does not permit offline access or the token was previously reused.</p><p><a href="http://142.132.189.59:6001/admin/settings/google-drive" style="color:#F47B20;">← Return to settings</a></p></body></html>');
    }

    // Store refresh token in DB
    await pool.query(
      `INSERT INTO platform_settings (setting_key, setting_value, updated_at, updated_by)
       VALUES ($1, $2, NOW(), NULL)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $2, updated_at = NOW()`,
      ['google_oauth_refresh_token', tokens.refresh_token]
    );

    return res.send('<html><body style="font-family:sans-serif;padding:40px;background:#0f1117;color:#f1f5f9;"><h2 style="color:#4ade80;">✅ Google account connected!</h2><p>Your Google account has been successfully connected. Return to the settings page to test the connection.</p><p><a href="http://142.132.189.59:6001/admin/settings/google-drive" style="color:#F47B20;">← Return to settings</a></p></body></html>');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).send('<html><body style="font-family:sans-serif;padding:40px;background:#0f1117;color:#f1f5f9;"><h2 style="color:#f87171;">❌ Token exchange failed</h2><p>' + err.message + '</p><p><a href="http://142.132.189.59:6001/admin/settings/google-drive" style="color:#F47B20;">← Return to settings</a></p></body></html>');
  }
});

// GET /admin/settings/google-drive/oauth-status — check if connected
router.get('/google-drive/oauth-status', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    const settings = await getSettings();
    const connected = !!(settings.google_oauth_refresh_token && settings.google_oauth_refresh_token !== '' && settings.google_oauth_refresh_token !== 'null');


    res.json({ connected });
  } catch (err) {
    console.error('OAuth status error:', err);
    res.status(500).json({ error: 'Failed to check OAuth status' });
  }
});

// POST /admin/settings/google-drive/oauth/disconnect — clear refresh token
router.post('/google-drive/oauth/disconnect', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Super admin access required' });
    }

    await pool.query(
      `UPDATE platform_settings SET setting_value = '', updated_at = NOW() WHERE setting_key = 'google_oauth_refresh_token'`
    );

    res.json({ success: true, message: 'Google account disconnected' });
  } catch (err) {
    console.error('OAuth disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

module.exports = router;
