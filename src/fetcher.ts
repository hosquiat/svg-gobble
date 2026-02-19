import axios, { AxiosError } from 'axios'

const DEFAULT_TIMEOUT = 30000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface FetchResult {
  success: boolean
  html?: string
  error?: string
}

/**
 * Fetch HTML content from a URL.
 */
export async function fetchHtml(url: string, timeout = DEFAULT_TIMEOUT): Promise<FetchResult> {
  try {
    const response = await axios.get(url, {
      timeout,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      maxRedirects: 5,
      responseType: 'text',
    })

    return {
      success: true,
      html: response.data,
    }
  } catch (error) {
    const axiosError = error as AxiosError
    return {
      success: false,
      error: axiosError.message || 'Failed to fetch URL',
    }
  }
}

/**
 * Fetch SVG content from a URL.
 */
export async function fetchSvg(url: string, timeout = DEFAULT_TIMEOUT): Promise<FetchResult> {
  try {
    const response = await axios.get(url, {
      timeout,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'image/svg+xml,*/*;q=0.8',
      },
      maxRedirects: 5,
      responseType: 'text',
    })

    return {
      success: true,
      html: response.data,
    }
  } catch (error) {
    const axiosError = error as AxiosError
    return {
      success: false,
      error: axiosError.message || 'Failed to fetch SVG',
    }
  }
}

/**
 * Decode a data URI to its content.
 */
export function decodeDataUri(dataUri: string): string | null {
  if (!dataUri.startsWith('data:')) {
    return null
  }

  try {
    // Format: data:[<mediatype>][;base64],<data>
    const match = dataUri.match(/^data:([^;,]+)?(;base64)?,(.*)$/)
    if (!match) return null

    const [, , isBase64, data] = match

    if (isBase64) {
      return Buffer.from(data, 'base64').toString('utf-8')
    } else {
      return decodeURIComponent(data)
    }
  } catch {
    return null
  }
}

/**
 * Fetch and resolve external SVG content.
 * Handles both URLs and data URIs.
 */
export async function resolveExternalSvg(
  src: string,
  timeout = DEFAULT_TIMEOUT
): Promise<{ svg: string | null; error?: string }> {
  // Handle data URIs
  if (src.startsWith('data:')) {
    const decoded = decodeDataUri(src)
    if (decoded && decoded.includes('<svg')) {
      return { svg: decoded }
    }
    return { svg: null, error: 'Invalid SVG data URI' }
  }

  // Handle HTTP URLs
  if (src.startsWith('http://') || src.startsWith('https://')) {
    const result = await fetchSvg(src, timeout)
    if (result.success && result.html && result.html.includes('<svg')) {
      return { svg: result.html }
    }
    return { svg: null, error: result.error || 'Not a valid SVG' }
  }

  return { svg: null, error: 'Unsupported URL scheme' }
}
