import { useEffect, useState } from 'react'

/**
 * OAuth callback page component
 * This captures the OAuth code from URL and posts it to the parent window
 */
export function OAuthCallback() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')

    if (error) {
      setStatus('error')
      setMessage(error)
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth-error', error }, '*')
        setTimeout(() => window.close(), 2000)
      }
      return
    }

    if (code) {
      // Post the code to parent window
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth-code', code }, '*')
        setStatus('success')
        setMessage('Authorization successful! This window will close automatically.')
        setTimeout(() => window.close(), 1500)
      } else {
        setStatus('error')
        setMessage('No parent window found. Please try again.')
      }
    } else {
      setStatus('error')
      setMessage('No authorization code received.')
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
      <div className="text-center p-8 bg-white dark:bg-zinc-900 rounded-xl shadow-lg max-w-sm">
        {status === 'loading' && (
          <>
            <div className="animate-spin w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-600 dark:text-zinc-400">Processing authorization...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Connected!</h2>
            <p className="text-gray-600 dark:text-zinc-400">{message}</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="w-12 h-12 bg-red-100 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Error</h2>
            <p className="text-gray-600 dark:text-zinc-400">{message}</p>
          </>
        )}
      </div>
    </div>
  )
}
