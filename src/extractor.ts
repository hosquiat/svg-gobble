import * as cheerio from 'cheerio'
import { v4 as uuidv4 } from 'uuid'

export interface ExtractedSvg {
  id: string
  name: string
  svg: string
  type: 'inline' | 'external'
}

/**
 * Checks if a string is related to SVG content.
 * Ported from find-svg.ts
 */
export function isSvgRelated(str: string): boolean {
  if (!str) return false

  return (
    str.includes('.svg') ||
    str.includes('data:image/svg+xml') ||
    str.includes('image/svg+xml') ||
    (str.includes('data:') && str.includes('<svg')) ||
    str.includes('http://www.w3.org/2000/svg') ||
    /<(?:svg|path|circle|rect|g)\s/i.test(str) ||
    /viewBox\s*=\s*["']/i.test(str)
  )
}

/**
 * Generate a best-attempt name for an SVG based on its content.
 * Ported from find-svg.ts
 */
export function bestAttemptAtName(svg: string, baseUrl: string, index: number): string {
  // Try to infer a name from a .svg filename in the string
  const fileMatch = svg.match(/\/([^/"']+)\.svg/i)
  if (fileMatch?.[1]) {
    return fileMatch[1]
  }

  // Try to infer name from an id
  const idMatch = svg.match(/id=["']([^"']+)["']/i)
  if (idMatch?.[1]) {
    return idMatch[1]
  }

  // Try to infer name from a title element
  const titleMatch = svg.match(/<title>([^<]+)<\/title>/i)
  if (titleMatch?.[1]) {
    return titleMatch[1]
  }

  // Try to get host from baseUrl
  try {
    const url = new URL(baseUrl)
    return `${url.host}-${index + 1}`
  } catch {
    return `svg-${index + 1}`
  }
}

/**
 * Resolve a potentially relative URL against a base URL.
 */
export function resolveUrl(src: string, baseUrl: string): string {
  if (!src) return ''

  // Already absolute
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
    return src
  }

  try {
    return new URL(src, baseUrl).href
  } catch {
    return src
  }
}

/**
 * Extract SVG content from HTML using Cheerio.
 */
export function extractSvgs(html: string, baseUrl: string): ExtractedSvg[] {
  const $ = cheerio.load(html)
  const results: ExtractedSvg[] = []
  const seen = new Set<string>()

  const addResult = (svg: string, type: 'inline' | 'external') => {
    const trimmed = svg.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      results.push({
        id: uuidv4(),
        name: bestAttemptAtName(trimmed, baseUrl, results.length),
        svg: trimmed,
        type,
      })
    }
  }

  // 1. Inline SVGs (excluding those with use/symbol as they're handled separately)
  $('svg').each((_, el) => {
    const $svg = $(el)
    // Skip SVGs that only contain use or symbol elements
    if (!$svg.find('use').length && !$svg.find('symbol').length) {
      const outerHtml = $.html(el)
      if (outerHtml) {
        addResult(outerHtml, 'inline')
      }
    }
  })

  // 2. Image elements with SVG sources
  $('img[src*=".svg"], img[src*="data:image/svg+xml"]').each((_, el) => {
    const src = $(el).attr('src')
    if (src && isSvgRelated(src)) {
      const resolvedSrc = resolveUrl(src, baseUrl)
      // Create an img tag representation for external SVGs
      addResult(`<img src="${resolvedSrc}" />`, 'external')
    }
  })

  // 3. Object elements with SVG type
  $('object[type="image/svg+xml"]').each((_, el) => {
    const data = $(el).attr('data')
    if (data) {
      const resolvedData = resolveUrl(data, baseUrl)
      addResult(`<img src="${resolvedData}" />`, 'external')
    }
  })

  // 4. Embed elements with SVG
  $('embed[type="image/svg+xml"], embed[src*=".svg"]').each((_, el) => {
    const src = $(el).attr('src')
    if (src) {
      const resolvedSrc = resolveUrl(src, baseUrl)
      addResult(`<img src="${resolvedSrc}" />`, 'external')
    }
  })

  // 5. Iframe elements with SVG
  $('iframe[src*=".svg"]').each((_, el) => {
    const src = $(el).attr('src')
    if (src) {
      const resolvedSrc = resolveUrl(src, baseUrl)
      addResult(`<img src="${resolvedSrc}" />`, 'external')
    }
  })

  // 6. Symbol elements
  $('symbol').each((_, el) => {
    const outerHtml = $.html(el)
    if (outerHtml) {
      addResult(outerHtml, 'inline')
    }
  })

  // 7. G elements (SVG groups)
  $('g').each((_, el) => {
    const outerHtml = $.html(el)
    if (outerHtml) {
      addResult(outerHtml, 'inline')
    }
  })

  // 8. Use elements with external references
  $('use[href], use[xlink\\:href]').each((_, el) => {
    const href = $(el).attr('href') || $(el).attr('xlink:href')
    if (href && isSvgRelated(href)) {
      const resolvedHref = resolveUrl(href, baseUrl)
      addResult(`<img src="${resolvedHref}" />`, 'external')
    }
  })

  // 9. Background images in inline styles
  $('[style*=".svg"], [style*="data:image/svg+xml"]').each((_, el) => {
    const style = $(el).attr('style')
    if (style) {
      const match = style.match(/url\(['"]?([^'"()]+\.svg[^'"()]*)['"]?\)/i)
      if (match?.[1]) {
        const resolvedUrl = resolveUrl(match[1], baseUrl)
        addResult(`<img src="${resolvedUrl}" />`, 'external')
      }

      // Also check for data URI SVGs
      const dataMatch = style.match(/url\(['"]?(data:image\/svg\+xml[^'"()]*)['"]?\)/i)
      if (dataMatch?.[1]) {
        addResult(`<img src="${dataMatch[1]}" />`, 'external')
      }
    }
  })

  // 10. Picture elements with SVG sources
  $('picture').each((_, el) => {
    const $picture = $(el)

    // Check source elements with SVG type
    $picture.find('source[type="image/svg+xml"]').each((_, source) => {
      const srcset = $(source).attr('srcset')
      if (srcset) {
        // Handle multiple sources in srcset
        for (const src of srcset.split(',')) {
          const trimmedSrc = src.trim().split(' ')[0]
          const resolvedSrc = resolveUrl(trimmedSrc, baseUrl)
          addResult(`<img src="${resolvedSrc}" />`, 'external')
        }
      }
    })

    // Check if the fallback img is SVG
    const $img = $picture.find('img')
    const imgSrc = $img.attr('src')
    if (imgSrc && isSvgRelated(imgSrc)) {
      const resolvedSrc = resolveUrl(imgSrc, baseUrl)
      addResult(`<img src="${resolvedSrc}" />`, 'external')
    }
  })

  // 11. Template elements (parse their content)
  $('template').each((_, el) => {
    const templateHtml = $(el).html()
    if (templateHtml) {
      // Recursively extract from template content
      const templateSvgs = extractSvgs(templateHtml, baseUrl)
      for (const svg of templateSvgs) {
        addResult(svg.svg, svg.type)
      }
    }
  })

  return results
}
