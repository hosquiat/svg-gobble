/**
 * SVG → LightBurn path converter (Phase 4)
 *
 * Converts an SVG file's path data into LightBurn's VertList/PrimList format
 * and places it centered at a given slot position (in LightBurn mm coordinates).
 *
 * LightBurn VertList format (per vertex):
 *   V{x} {y}c0x{hInX}c0y{hInY}c1x{hOutX}c1y{hOutY}
 *   where "1" as the sole value after c0x or c1x means "smooth/auto handle"
 *
 * LightBurn PrimList format (per segment):
 *   L{i} {j}  = straight line from vertex i to vertex j
 *   B{i} {j}  = cubic bezier from vertex i to vertex j
 *               (vertex i's c1 = cp1, vertex j's c0 = cp2)
 */

import { XMLParser } from 'fast-xml-parser'
import SvgPath from 'svgpath'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Vec2 = { x: number; y: number }
type M6 = [number, number, number, number, number, number] // [a, b, c, d, e, f]

interface Vertex {
  x: number
  y: number
  hIn: Vec2 | null   // incoming bezier control point (null = auto/corner)
  hOut: Vec2 | null  // outgoing bezier control point (null = auto/corner)
}

interface Contour {
  vertices: Vertex[]
  closed: boolean
}

export interface SlotDimensions {
  cx: number      // center X in LightBurn mm
  cy: number      // center Y in LightBurn mm
  width: number   // slot width in mm
  height: number  // slot height in mm
}

// ---------------------------------------------------------------------------
// Matrix helpers (SVG 2D affine matrix [a,b,c,d,e,f])
// ---------------------------------------------------------------------------

const IDENTITY: M6 = [1, 0, 0, 1, 0, 0]

function multiplyM(p: M6, c: M6): M6 {
  return [
    p[0] * c[0] + p[2] * c[1],
    p[1] * c[0] + p[3] * c[1],
    p[0] * c[2] + p[2] * c[3],
    p[1] * c[2] + p[3] * c[3],
    p[0] * c[4] + p[2] * c[5] + p[4],
    p[1] * c[4] + p[3] * c[5] + p[5],
  ]
}

function applyM(m: M6, x: number, y: number): Vec2 {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  }
}

function parseTransform(transform: string | undefined): M6 {
  if (!transform) return IDENTITY

  const t = transform.trim()

  // Handle multiple transforms (e.g. "translate(x y) scale(s)")
  // We accumulate them left to right
  let result: M6 = IDENTITY
  const tokenRe = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
  let match: RegExpExecArray | null
  while ((match = tokenRe.exec(t)) !== null) {
    const fn = match[1]
    const args = match[2].trim().split(/[\s,]+/).map(Number)
    let m: M6 = IDENTITY
    switch (fn) {
      case 'matrix':
        m = [args[0], args[1], args[2], args[3], args[4], args[5]]
        break
      case 'translate':
        m = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0]
        break
      case 'scale':
        m = [args[0], 0, 0, args[1] ?? args[0], 0, 0]
        break
      case 'rotate': {
        const angle = (args[0] * Math.PI) / 180
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        if (args.length >= 3) {
          const cx = args[1], cy = args[2]
          m = [cos, sin, -sin, cos, cx - cx * cos + cy * sin, cy - cx * sin - cy * cos]
        } else {
          m = [cos, sin, -sin, cos, 0, 0]
        }
        break
      }
      case 'skewX': {
        const angle = (args[0] * Math.PI) / 180
        m = [1, 0, Math.tan(angle), 1, 0, 0]
        break
      }
      case 'skewY': {
        const angle = (args[0] * Math.PI) / 180
        m = [1, Math.tan(angle), 0, 1, 0, 0]
        break
      }
    }
    result = multiplyM(result, m)
  }
  return result
}

// ---------------------------------------------------------------------------
// SVG element → path extraction
// ---------------------------------------------------------------------------

/** Raw SVG element node from fast-xml-parser */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawNode = Record<string, any>

interface ExtractedPath {
  d: string            // SVG path data (already in absolute coords from svgpath)
  transform: M6        // accumulated world transform at this element
}

/** Recursively walk the SVG element tree, collect path data strings */
function walkSvgNode(node: RawNode, parentTransform: M6, paths: ExtractedPath[]) {
  const myTransform = multiplyM(parentTransform, parseTransform(node['@_transform']))

  const tagName = node['#tagName'] as string | undefined

  // Handle known shape elements → convert to path d
  let dStr: string | null = null

  if (tagName === 'path') {
    dStr = String(node['@_d'] ?? '')
  } else if (tagName === 'rect') {
    dStr = rectToPath(
      Number(node['@_x'] ?? 0),
      Number(node['@_y'] ?? 0),
      Number(node['@_width'] ?? 0),
      Number(node['@_height'] ?? 0),
      Number(node['@_rx'] ?? 0),
      Number(node['@_ry'] ?? 0),
    )
  } else if (tagName === 'circle') {
    dStr = circleToPath(Number(node['@_cx'] ?? 0), Number(node['@_cy'] ?? 0), Number(node['@_r'] ?? 0))
  } else if (tagName === 'ellipse') {
    dStr = ellipseToPath(
      Number(node['@_cx'] ?? 0), Number(node['@_cy'] ?? 0),
      Number(node['@_rx'] ?? 0), Number(node['@_ry'] ?? 0),
    )
  } else if (tagName === 'line') {
    const x1 = Number(node['@_x1'] ?? 0), y1 = Number(node['@_y1'] ?? 0)
    const x2 = Number(node['@_x2'] ?? 0), y2 = Number(node['@_y2'] ?? 0)
    dStr = `M${x1},${y1}L${x2},${y2}`
  } else if (tagName === 'polyline' || tagName === 'polygon') {
    const pts = String(node['@_points'] ?? '').trim()
    if (pts) {
      const nums = pts.split(/[\s,]+/).map(Number).filter(n => !isNaN(n))
      const coords: string[] = []
      for (let i = 0; i + 1 < nums.length; i += 2) {
        coords.push(`${i === 0 ? 'M' : 'L'}${nums[i]},${nums[i + 1]}`)
      }
      if (tagName === 'polygon') coords.push('Z')
      dStr = coords.join('')
    }
  }

  if (dStr && dStr.length > 0) {
    // Normalize path: absolute, no arcs, no shorthand beziers
    const normalized = SvgPath(dStr).abs().unarc().unshort().toString()
    if (normalized) {
      paths.push({ d: normalized, transform: myTransform })
    }
  }

  // Recurse into children
  for (const key of Object.keys(node)) {
    if (key.startsWith('@_') || key === '#text' || key === '#tagName') continue
    const children = Array.isArray(node[key]) ? node[key] : [node[key]]
    for (const child of children) {
      if (child && typeof child === 'object') {
        const childWithTag = { ...child, '#tagName': key }
        walkSvgNode(childWithTag, myTransform, paths)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Shape → path d converters
// ---------------------------------------------------------------------------

function rectToPath(x: number, y: number, w: number, h: number, rx: number, ry: number): string {
  if (w <= 0 || h <= 0) return ''
  if (rx === 0 && ry === 0) {
    return `M${x},${y}H${x + w}V${y + h}H${x}Z`
  }
  // Clamp radii
  rx = Math.min(rx, w / 2)
  ry = Math.min(ry || rx, h / 2)
  const r = rx
  return [
    `M${x + r},${y}`,
    `H${x + w - r}`,
    `A${r},${ry},0,0,1,${x + w},${y + ry}`,
    `V${y + h - ry}`,
    `A${r},${ry},0,0,1,${x + w - r},${y + h}`,
    `H${x + r}`,
    `A${r},${ry},0,0,1,${x},${y + h - ry}`,
    `V${y + ry}`,
    `A${r},${ry},0,0,1,${x + r},${y}`,
    'Z',
  ].join('')
}

function circleToPath(cx: number, cy: number, r: number): string {
  if (r <= 0) return ''
  // Approximate circle with 4 bezier curves
  const k = r * 0.5522847498
  return [
    `M${cx},${cy - r}`,
    `C${cx + k},${cy - r},${cx + r},${cy - k},${cx + r},${cy}`,
    `C${cx + r},${cy + k},${cx + k},${cy + r},${cx},${cy + r}`,
    `C${cx - k},${cy + r},${cx - r},${cy + k},${cx - r},${cy}`,
    `C${cx - r},${cy - k},${cx - k},${cy - r},${cx},${cy - r}`,
    'Z',
  ].join('')
}

function ellipseToPath(cx: number, cy: number, rx: number, ry: number): string {
  if (rx <= 0 || ry <= 0) return ''
  const kx = rx * 0.5522847498
  const ky = ry * 0.5522847498
  return [
    `M${cx},${cy - ry}`,
    `C${cx + kx},${cy - ry},${cx + rx},${cy - ky},${cx + rx},${cy}`,
    `C${cx + rx},${cy + ky},${cx + kx},${cy + ry},${cx},${cy + ry}`,
    `C${cx - kx},${cy + ry},${cx - rx},${cy + ky},${cx - rx},${cy}`,
    `C${cx - rx},${cy - ky},${cx - kx},${cy - ry},${cx},${cy - ry}`,
    'Z',
  ].join('')
}

// ---------------------------------------------------------------------------
// SVG path segments → LightBurn contours
// ---------------------------------------------------------------------------

/** Build contours from a normalized (abs, unarc, unshort) SVG path string */
function pathToContours(d: string, worldTransform: M6): Contour[] {
  const contours: Contour[] = []
  let current: Contour | null = null as Contour | null
  let curX = 0
  let curY = 0
  let startX = 0
  let startY = 0

  SvgPath(d).abs().unarc().unshort().iterate((seg) => {
    const cmd = seg[0] as string

    switch (cmd) {
      case 'M': {
        // Save current contour if it has vertices
        if (current && current.vertices.length >= 2) contours.push(current)
        curX = seg[1] as number
        curY = seg[2] as number
        startX = curX
        startY = curY
        const p = applyM(worldTransform, curX, curY)
        current = {
          vertices: [{ x: p.x, y: p.y, hIn: null, hOut: null }],
          closed: false,
        }
        break
      }

      case 'L': {
        if (!current) break
        // Set current vertex outgoing handle to null (straight line)
        const last = current.vertices[current.vertices.length - 1]
        last.hOut = null
        curX = seg[1] as number
        curY = seg[2] as number
        const p = applyM(worldTransform, curX, curY)
        current.vertices.push({ x: p.x, y: p.y, hIn: null, hOut: null })
        break
      }

      case 'H': {
        if (!current) break
        const last = current.vertices[current.vertices.length - 1]
        last.hOut = null
        curX = seg[1] as number
        const p = applyM(worldTransform, curX, curY)
        current.vertices.push({ x: p.x, y: p.y, hIn: null, hOut: null })
        break
      }

      case 'V': {
        if (!current) break
        const last = current.vertices[current.vertices.length - 1]
        last.hOut = null
        curY = seg[1] as number
        const p = applyM(worldTransform, curX, curY)
        current.vertices.push({ x: p.x, y: p.y, hIn: null, hOut: null })
        break
      }

      case 'C': {
        if (!current) break
        // SVG C: cp1x cp1y cp2x cp2y x y
        const cp1x = seg[1] as number, cp1y = seg[2] as number
        const cp2x = seg[3] as number, cp2y = seg[4] as number
        const ex = seg[5] as number, ey = seg[6] as number

        const cp1 = applyM(worldTransform, cp1x, cp1y)
        const cp2 = applyM(worldTransform, cp2x, cp2y)
        const endPt = applyM(worldTransform, ex, ey)

        // Outgoing handle of current vertex = cp1
        const last = current.vertices[current.vertices.length - 1]
        last.hOut = cp1

        // New vertex with incoming handle = cp2
        current.vertices.push({ x: endPt.x, y: endPt.y, hIn: cp2, hOut: null })

        curX = ex
        curY = ey
        break
      }

      case 'Z': {
        if (!current) break
        current.closed = true

        // Check if last vertex is essentially the same as the first
        const first = current.vertices[0]
        const last = current.vertices[current.vertices.length - 1]
        const dx = Math.abs(last.x - first.x)
        const dy = Math.abs(last.y - first.y)
        if (dx < 1e-6 && dy < 1e-6 && current.vertices.length > 1) {
          // Merge last vertex into first (transfer incoming handle)
          first.hIn = last.hIn
          current.vertices.pop()
        }

        if (current.vertices.length >= 2) contours.push(current)
        current = null
        curX = startX
        curY = startY
        break
      }
    }
  })

  // Flush open contour
  if (current && current.vertices.length >= 2) contours.push(current)

  return contours
}

// ---------------------------------------------------------------------------
// Bounding box
// ---------------------------------------------------------------------------

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

function contoursToWorld(contours: Contour[]): Bounds | null {
  let b: Bounds | null = null
  for (const c of contours) {
    for (const v of c.vertices) {
      if (!b) {
        b = { minX: v.x, minY: v.y, maxX: v.x, maxY: v.y }
      } else {
        b.minX = Math.min(b.minX, v.x)
        b.minY = Math.min(b.minY, v.y)
        b.maxX = Math.max(b.maxX, v.x)
        b.maxY = Math.max(b.maxY, v.y)
      }
      // Include control points in bounds
      for (const h of [v.hIn, v.hOut]) {
        if (h) {
          b.minX = Math.min(b.minX, h.x)
          b.minY = Math.min(b.minY, h.y)
          b.maxX = Math.max(b.maxX, h.x)
          b.maxY = Math.max(b.maxY, h.y)
        }
      }
    }
  }
  return b
}

// ---------------------------------------------------------------------------
// Scale and translate contours to fit a slot
// ---------------------------------------------------------------------------

/** Scale/translate all contour vertices and handles uniformly */
function transformContours(
  contours: Contour[],
  scale: number,
  dx: number,
  dy: number,
): Contour[] {
  function tv(v: Vec2): Vec2 {
    return { x: v.x * scale + dx, y: v.y * scale + dy }
  }
  return contours.map(c => ({
    closed: c.closed,
    vertices: c.vertices.map(v => ({
      x: v.x * scale + dx,
      y: v.y * scale + dy,
      hIn: v.hIn ? tv(v.hIn) : null,
      hOut: v.hOut ? tv(v.hOut) : null,
    })),
  }))
}

// ---------------------------------------------------------------------------
// Encode contours as LightBurn VertList + PrimList
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  // Compact float formatting (avoid unnecessary trailing zeros)
  const s = n.toPrecision(8)
  return parseFloat(s).toString()
}

function encodeHandle(hx: number, hy: number, prefix: 'c0' | 'c1'): string {
  // "1" is the smooth sentinel — avoid using it as an actual coordinate value.
  // If the handle coordinate is exactly 1, encode as 0.9999999 to avoid ambiguity.
  const safeX = hx === 1 ? 0.9999999 : hx
  const safeY = hy === 1 ? 0.9999999 : hy
  let s = `${prefix}x${fmt(safeX)}`
  if (safeY !== 0) s += `${prefix}y${fmt(safeY)}`
  return s
}

interface Encoded {
  vertList: string
  primList: string
  vertexCount: number
}

function encodeContours(contours: Contour[]): Encoded {
  let vertList = ''
  let primList = ''
  let globalIdx = 0

  for (const contour of contours) {
    const verts = contour.vertices
    if (verts.length < 2) continue

    const baseIdx = globalIdx
    // Emit vertices
    for (const v of verts) {
      vertList += `V${fmt(v.x)} ${fmt(v.y)}`
      vertList += v.hIn ? encodeHandle(v.hIn.x, v.hIn.y, 'c0') : 'c0x1'
      vertList += v.hOut ? encodeHandle(v.hOut.x, v.hOut.y, 'c1') : 'c1x1'
      globalIdx++
    }

    // Emit primitives
    const n = verts.length
    for (let i = 0; i < n - 1; i++) {
      const vi = baseIdx + i
      const vj = baseIdx + i + 1
      // Bezier if either the outgoing handle of i or incoming of i+1 is explicit
      const isBez = verts[i].hOut !== null || verts[i + 1].hIn !== null
      primList += (isBez ? 'B' : 'L') + vi + ' ' + vj
    }
    // Close the loop
    if (contour.closed) {
      const vi = baseIdx + n - 1
      const vj = baseIdx
      const isBez = verts[n - 1].hOut !== null || verts[0].hIn !== null
      primList += (isBez ? 'B' : 'L') + vi + ' ' + vj
    }
  }

  return { vertList, primList, vertexCount: globalIdx }
}

// ---------------------------------------------------------------------------
// SVG XML parsing
// ---------------------------------------------------------------------------

/** Parse SVG XML and collect all drawable paths */
function extractPathsFromSvg(svgXml: string): ExtractedPath[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseAttributeValue: false,
    textNodeName: '#text',
    // Preserve tag names in output
    transformTagName: (tag: string) => tag.toLowerCase(),
  })

  const doc = parser.parse(svgXml)

  // Find the <svg> element
  const svgNode: RawNode | null = doc?.svg ?? null
  if (!svgNode) return []

  // Parse viewBox / width / height to get the SVG → user-units transform
  // We pass IDENTITY here; coordinates come out in SVG user units
  const paths: ExtractedPath[] = []
  const svgWithTag = { ...svgNode, '#tagName': 'svg' }
  walkSvgNode(svgWithTag, IDENTITY, paths)
  return paths
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert SVG content to LightBurn <Shape Type="Path"> XML elements.
 *
 * The shapes are positioned at the given slot center (cx, cy) in LightBurn
 * coordinates (mm). The design is scaled uniformly to fill the slot's
 * width × height with a 10% margin.
 *
 * If mirrorY is true (as in the domino jig template), the Y-axis of the
 * design is negated so it renders correctly in LightBurn's flipped display.
 *
 * @returns Array of XML strings for `<Shape Type="Path">` elements,
 *          wrapped in a `<Shape Type="Group">` caller should add their own wrapper.
 */
export function svgToLightBurnShapes(
  svgXml: string,
  slot: SlotDimensions,
  cutIndex = 0,
  mirrorY = false,
): string[] {
  // 1. Extract paths from the SVG
  const extractedPaths = extractPathsFromSvg(svgXml)
  if (extractedPaths.length === 0) return []

  // 2. Build contours from all paths (in SVG coordinate space)
  let allContours: Contour[] = []
  for (const ep of extractedPaths) {
    const contours = pathToContours(ep.d, ep.transform)
    allContours = allContours.concat(contours)
  }
  if (allContours.length === 0) return []

  // 3. Compute overall bounding box
  const bounds = contoursToWorld(allContours)
  if (!bounds) return []

  const svgW = bounds.maxX - bounds.minX
  const svgH = bounds.maxY - bounds.minY
  if (svgW < 1e-6 || svgH < 1e-6) return []

  // 4. Scale to fit slot (90% of slot dimensions, maintaining aspect ratio)
  const margin = 0.9
  const availW = slot.width * margin
  const availH = slot.height * margin
  const scale = Math.min(availW / svgW, availH / svgH)

  // 5. Translate so design is centered at (0, 0) in local space,
  //    then slot center will be applied via XForm
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  const dx = -cx * scale
  const dy = -cy * scale

  let scaled = transformContours(allContours, scale, dx, dy)

  // 6. If mirrorY, negate Y coordinates (LightBurn's coordinate space is flipped)
  if (mirrorY) {
    scaled = scaled.map(c => ({
      ...c,
      vertices: c.vertices.map(v => ({
        x: v.x,
        y: -v.y,
        hIn: v.hIn ? { x: v.hIn.x, y: -v.hIn.y } : null,
        hOut: v.hOut ? { x: v.hOut.x, y: -v.hOut.y } : null,
      })),
    }))
  }

  // 7. Encode as VertList/PrimList
  const { vertList, primList } = encodeContours(scaled)
  if (!vertList || !primList) return []

  // 8. Build the Shape XML
  const xform = `1 0 0 1 ${fmt(slot.cx)} ${fmt(slot.cy)}`
  const shapeXml = [
    `<Shape Type="Path" CutIndex="${cutIndex}">`,
    `    <XForm>${xform}</XForm>`,
    `    <VertList>${vertList}</VertList>`,
    `    <PrimList>${primList}</PrimList>`,
    `</Shape>`,
  ].join('\n')

  return [shapeXml]
}
