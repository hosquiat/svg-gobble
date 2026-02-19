import { Router, Request, Response } from 'express'
import {
  getAuthUrl,
  exchangeCodeForTokens,
  getUserInfo,
  revokeTokens,
  getValidAccessToken,
  saveGoogleDriveAuth,
  getConnectionStatus,
  isGoogleOAuthConfigured,
  saveGoogleConfig,
  deleteGoogleConfig,
  getGoogleConfig,
} from '../services/googleDriveService'

const router = Router()

/**
 * GET /api/google-drive/status - Check connection status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await getConnectionStatus()
    res.json({ success: true, ...status })
  } catch (error) {
    console.error('Error getting Google Drive status:', error)
    res.status(500).json({ success: false, error: 'Failed to get status' })
  }
})

/**
 * GET /api/google-drive/auth-url - Get OAuth authorization URL
 */
router.get('/auth-url', async (_req: Request, res: Response) => {
  try {
    const configured = await isGoogleOAuthConfigured()
    if (!configured) {
      return res.status(400).json({
        success: false,
        error: 'Google OAuth not configured. Please configure credentials in Settings or set environment variables.',
      })
    }

    const url = await getAuthUrl()
    res.json({ success: true, url })
  } catch (error) {
    console.error('Error generating auth URL:', error)
    res.status(500).json({ success: false, error: 'Failed to generate auth URL' })
  }
})

/**
 * POST /api/google-drive/config - Save Google OAuth configuration
 */
router.post('/config', async (req: Request, res: Response) => {
  try {
    const { clientId, clientSecret, redirectUri } = req.body

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: 'Client ID and Client Secret are required',
      })
    }

    await saveGoogleConfig({
      clientId,
      clientSecret,
      redirectUri: redirectUri || 'http://localhost:3000/api/google-drive/oauth-callback',
    })

    res.json({ success: true, message: 'Configuration saved' })
  } catch (error) {
    console.error('Error saving config:', error)
    res.status(500).json({ success: false, error: 'Failed to save configuration' })
  }
})

/**
 * DELETE /api/google-drive/config - Delete Google OAuth configuration
 */
router.delete('/config', async (_req: Request, res: Response) => {
  try {
    // Also disconnect if connected
    const accessToken = await getValidAccessToken()
    if (accessToken) {
      await revokeTokens(accessToken)
    }

    await deleteGoogleConfig()

    res.json({ success: true, message: 'Configuration deleted' })
  } catch (error) {
    console.error('Error deleting config:', error)
    res.status(500).json({ success: false, error: 'Failed to delete configuration' })
  }
})

/**
 * GET /api/google-drive/oauth-callback - Handle OAuth callback (redirect)
 * This is the redirect URI that Google calls after authorization
 */
router.get('/oauth-callback', async (req: Request, res: Response) => {
  try {
    const { code, error } = req.query

    if (error) {
      // Render error page or redirect with error
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>OAuth Error</title>
            <style>
              body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
              h1 { color: #dc2626; margin-bottom: 1rem; }
              p { color: #6b7280; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Authorization Failed</h1>
              <p>${error}</p>
              <p>You can close this window.</p>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'oauth-error', error: '${error}' }, '*');
                setTimeout(() => window.close(), 2000);
              }
            </script>
          </body>
        </html>
      `)
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).send('Missing authorization code')
    }

    // Exchange code for tokens
    const { accessToken, refreshToken, expiresAt } = await exchangeCodeForTokens(code)

    // Get user info
    const userInfo = await getUserInfo(accessToken)

    // Save to database
    await saveGoogleDriveAuth(accessToken, refreshToken, expiresAt, userInfo.email)

    // Render success page that posts message to parent window
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Success</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h1 { color: #22c55e; margin-bottom: 1rem; }
            p { color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Connected!</h1>
            <p>Successfully connected to Google Drive.</p>
            <p>You can close this window.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-success', email: '${userInfo.email}' }, '*');
              setTimeout(() => window.close(), 1500);
            }
          </script>
        </body>
      </html>
    `)
  } catch (error) {
    console.error('OAuth callback error:', error)
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Error</title>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            h1 { color: #dc2626; margin-bottom: 1rem; }
            p { color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Connection Failed</h1>
            <p>Failed to connect to Google Drive. Please try again.</p>
            <p>You can close this window.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-error', error: 'Connection failed' }, '*');
              setTimeout(() => window.close(), 2000);
            }
          </script>
        </body>
      </html>
    `)
  }
})

/**
 * POST /api/google-drive/callback - Handle OAuth callback (API)
 * Alternative endpoint for popup-based flow
 */
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.body

    if (!code) {
      return res.status(400).json({ success: false, error: 'Missing authorization code' })
    }

    // Exchange code for tokens
    const { accessToken, refreshToken, expiresAt } = await exchangeCodeForTokens(code)

    // Get user info
    const userInfo = await getUserInfo(accessToken)

    // Save to database
    await saveGoogleDriveAuth(accessToken, refreshToken, expiresAt, userInfo.email)

    res.json({ success: true, email: userInfo.email })
  } catch (error) {
    console.error('OAuth callback error:', error)
    res.status(500).json({ success: false, error: 'Failed to connect to Google Drive' })
  }
})

/**
 * POST /api/google-drive/disconnect - Disconnect Google Drive
 */
router.post('/disconnect', async (_req: Request, res: Response) => {
  try {
    const accessToken = await getValidAccessToken()

    if (accessToken) {
      await revokeTokens(accessToken)
    }

    res.json({ success: true, message: 'Disconnected from Google Drive' })
  } catch (error) {
    console.error('Error disconnecting Google Drive:', error)
    res.status(500).json({ success: false, error: 'Failed to disconnect' })
  }
})

export default router
