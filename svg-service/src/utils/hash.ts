import crypto from 'crypto'

/**
 * Normalize and hash SVG content for duplicate detection.
 * Removes comments and normalizes whitespace before hashing.
 */
export function hashSvgContent(svg: string): string {
  const normalized = svg
    .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
  return crypto.createHash('sha256').update(normalized).digest('hex')
}
