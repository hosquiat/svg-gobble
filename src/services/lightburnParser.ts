import { XMLParser } from 'fast-xml-parser'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface XForm {
  a: number; b: number; c: number; d: number
  tx: number; ty: number
}

interface LocalBounds {
  minX: number; minY: number; maxX: number; maxY: number
}

export interface ShapeBounds {
  x: number   // min X in mm (LightBurn world coords)
  y: number   // min Y in mm
  w: number   // width in mm
  h: number   // height in mm
  cx: number  // center X in mm
  cy: number  // center Y in mm
}

export interface ParsedShape {
  id: string
  type: string
  cutIndex: number
  bounds: ShapeBounds
  children?: ParsedShape[]
  label?: string          // Str attribute for Text shapes
  hasPathChildren: boolean // true if this group contains Path shapes at any depth
}

export interface ParsedCutSetting {
  index: number
  name: string
  type: string  // 'Scan' | 'Cut'
}

export interface LightBurnParseResult {
  appVersion: string
  mirrorX: boolean
  mirrorY: boolean
  cutSettings: ParsedCutSetting[]
  shapes: ParsedShape[]   // top-level shapes
  canvasBounds: ShapeBounds
  stats: {
    total: number
    groups: number
    paths: number
    ellipses: number
    text: number
  }
}

// ---------------------------------------------------------------------------
// XForm helpers
// ---------------------------------------------------------------------------

const IDENTITY: XForm = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

function parseXForm(str: string | undefined): XForm {
  if (!str) return IDENTITY
  const p = String(str).trim().split(/\s+/).map(Number)
  if (p.length !== 6 || p.some(isNaN)) return IDENTITY
  return { a: p[0], b: p[1], c: p[2], d: p[3], tx: p[4], ty: p[5] }
}

/** Multiply two affine matrices: result = parent × child */
function multiply(parent: XForm, child: XForm): XForm {
  return {
    a:  parent.a * child.a + parent.b * child.c,
    b:  parent.a * child.b + parent.b * child.d,
    c:  parent.c * child.a + parent.d * child.c,
    d:  parent.c * child.b + parent.d * child.d,
    tx: parent.a * child.tx + parent.b * child.ty + parent.tx,
    ty: parent.c * child.tx + parent.d * child.ty + parent.ty,
  }
}

function transformPoint(xf: XForm, x: number, y: number) {
  return {
    x: xf.a * x + xf.b * y + xf.tx,
    y: xf.c * x + xf.d * y + xf.ty,
  }
}

/** Transform a local bounding box through an XForm (handles rotation/scale) */
function transformBounds(xf: XForm, b: LocalBounds): LocalBounds {
  const corners = [
    transformPoint(xf, b.minX, b.minY),
    transformPoint(xf, b.maxX, b.minY),
    transformPoint(xf, b.minX, b.maxY),
    transformPoint(xf, b.maxX, b.maxY),
  ]
  return {
    minX: Math.min(...corners.map(c => c.x)),
    minY: Math.min(...corners.map(c => c.y)),
    maxX: Math.max(...corners.map(c => c.x)),
    maxY: Math.max(...corners.map(c => c.y)),
  }
}

function mergeBounds(a: LocalBounds | null, b: LocalBounds): LocalBounds {
  if (!a) return b
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

function toShapeBounds(b: LocalBounds): ShapeBounds {
  return {
    x: b.minX, y: b.minY,
    w: b.maxX - b.minX,
    h: b.maxY - b.minY,
    cx: (b.minX + b.maxX) / 2,
    cy: (b.minY + b.maxY) / 2,
  }
}

// ---------------------------------------------------------------------------
// VertList parser
// Extracts vertex positions from LightBurn's compact VertList format.
// Format example: "V-68.791664 34.392303c0x1c1x1V-34.395832 68.784607c0x..."
// We only need the V x y entries (the Bezier vertex positions), not the
// control point handles (c0x / c1y / etc.), to compute a bounding box.
// ---------------------------------------------------------------------------

function parseVertListBounds(vertList: string): LocalBounds | null {
  // Match every "V" followed by two floats (possibly scientific notation)
  const regex = /V(-?[\d.]+(?:e[+\-]?\d+)?)\s+(-?[\d.]+(?:e[+\-]?\d+)?)/g
  let match: RegExpExecArray | null
  let bounds: LocalBounds | null = null
  while ((match = regex.exec(vertList)) !== null) {
    const x = parseFloat(match[1])
    const y = parseFloat(match[2])
    if (!isNaN(x) && !isNaN(y)) {
      bounds = mergeBounds(bounds, { minX: x, minY: y, maxX: x, maxY: y })
    }
  }
  return bounds
}

// ---------------------------------------------------------------------------
// Raw XML shape type (as produced by fast-xml-parser)
// ---------------------------------------------------------------------------

interface RawShape {
  '@_Type'?: string
  '@_CutIndex'?: string | number
  '@_Rx'?: string | number
  '@_Ry'?: string | number
  '@_Str'?: string
  '@_H'?: string | number
  '@_VertID'?: string | number
  '@_PrimID'?: string | number
  XForm?: string
  VertList?: string
  Children?: { Shape?: RawShape | RawShape[] }
  BackupPath?: unknown
}

interface RawCutSetting {
  '@_type'?: string
  index?: { '@_Value'?: string | number }
  name?: { '@_Value'?: string }
}

// ---------------------------------------------------------------------------
// Shape tree walker
// ---------------------------------------------------------------------------

interface WalkResult {
  shape: ParsedShape
  worldBounds: LocalBounds | null
  hasPathChildren: boolean
}

/**
 * Global lookup for shared VertList geometry.
 * LightBurn reuses vertex/primitive data across shapes via VertID+PrimID.
 * The first shape with a given VertID:PrimID pair that has an inline VertList
 * stores its local bounds here. Subsequent shapes with the same pair but no
 * inline VertList look up the cached bounds.
 */
type VertCache = Map<string, LocalBounds>

function walkShape(raw: RawShape, parentXForm: XForm, idGen: { n: number }, vertCache: VertCache): WalkResult {
  const id = `shape-${++idGen.n}`
  const type = raw['@_Type'] || 'Other'
  const cutIndex = Number(raw['@_CutIndex'] ?? -1)

  const localXForm = parseXForm(raw.XForm)
  const worldXForm = multiply(parentXForm, localXForm)

  let localBounds: LocalBounds | null = null
  let children: ParsedShape[] | undefined
  let label: string | undefined
  let hasPathChildren = false

  if (type === 'Ellipse') {
    const rx = Number(raw['@_Rx'] ?? 1)
    const ry = Number(raw['@_Ry'] ?? 1)
    localBounds = { minX: -rx, minY: -ry, maxX: rx, maxY: ry }

  } else if (type === 'Path') {
    hasPathChildren = true
    const vertKey = raw['@_VertID'] !== undefined && raw['@_PrimID'] !== undefined
      ? `${raw['@_VertID']}:${raw['@_PrimID']}`
      : null

    if (raw.VertList) {
      localBounds = parseVertListBounds(raw.VertList)
      // Cache for subsequent shapes that share this VertID:PrimID
      if (localBounds && vertKey && !vertCache.has(vertKey)) {
        vertCache.set(vertKey, localBounds)
      }
    } else if (vertKey && vertCache.has(vertKey)) {
      // Reuse bounds from the first occurrence of this shared geometry
      localBounds = vertCache.get(vertKey)!
    }

    // Final fallback: treat as a point at origin (XForm center is still used)
    if (!localBounds) {
      localBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    }

  } else if (type === 'Text') {
    const h = Number(raw['@_H'] ?? 5)
    label = raw['@_Str']
    // Rough estimate: text bounding box based on font height
    localBounds = { minX: -(h * 3), minY: -(h / 2), maxX: h * 3, maxY: h / 2 }

  } else if (type === 'Group') {
    const rawChildren = raw.Children?.Shape
    if (rawChildren) {
      const childArray = Array.isArray(rawChildren) ? rawChildren : [rawChildren]
      children = []
      let childUnionBounds: LocalBounds | null = null

      for (const rawChild of childArray) {
        // Children are positioned relative to the group's worldXForm
        const result = walkShape(rawChild, worldXForm, idGen, vertCache)
        children.push(result.shape)
        if (result.worldBounds) {
          childUnionBounds = mergeBounds(childUnionBounds, result.worldBounds)
        }
        if (result.hasPathChildren) hasPathChildren = true
      }

      // Group bounds = union of children's already-world-space bounds
      const worldBounds = childUnionBounds
      const shape: ParsedShape = {
        id, type, cutIndex, label, hasPathChildren,
        bounds: worldBounds
          ? toShapeBounds(worldBounds)
          : { x: worldXForm.tx, y: worldXForm.ty, w: 0, h: 0, cx: worldXForm.tx, cy: worldXForm.ty },
        children,
      }
      return { shape, worldBounds, hasPathChildren }
    }
    // Empty group
    localBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

  // Transform local bounds to world space
  const worldBounds = localBounds ? transformBounds(worldXForm, localBounds) : null

  const bounds: ShapeBounds = worldBounds
    ? toShapeBounds(worldBounds)
    : { x: worldXForm.tx, y: worldXForm.ty, w: 0, h: 0, cx: worldXForm.tx, cy: worldXForm.ty }

  const shape: ParsedShape = { id, type, cutIndex, bounds, children, label, hasPathChildren }
  return { shape, worldBounds, hasPathChildren }
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseLightBurnFile(xmlContent: string): LightBurnParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'Shape' || name === 'CutSetting',
    parseAttributeValue: false,  // keep as strings, we convert manually
    textNodeName: '#text',
    cdataPropName: '__cdata',
  })

  const doc = parser.parse(xmlContent)
  const project = doc?.LightBurnProject

  if (!project) {
    throw new Error('Not a valid LightBurn project file (missing <LightBurnProject> root)')
  }

  const appVersion = String(project['@_AppVersion'] || 'unknown')
  const mirrorX = project['@_MirrorX'] === 'True'
  const mirrorY = project['@_MirrorY'] === 'True'

  // Parse cut settings
  const rawCutSettings: RawCutSetting[] = Array.isArray(project.CutSetting)
    ? project.CutSetting
    : project.CutSetting ? [project.CutSetting] : []

  const cutSettings: ParsedCutSetting[] = rawCutSettings.map(cs => ({
    index: Number(cs.index?.['@_Value'] ?? -1),
    name: String(cs.name?.['@_Value'] ?? ''),
    type: String(cs['@_type'] ?? 'Scan'),
  }))

  // Walk shape tree
  const rawShapes: RawShape[] = Array.isArray(project.Shape)
    ? project.Shape
    : project.Shape ? [project.Shape] : []

  const idGen = { n: 0 }
  const vertCache: VertCache = new Map()
  const shapes: ParsedShape[] = []
  let globalBounds: LocalBounds | null = null

  const stats = { total: 0, groups: 0, paths: 0, ellipses: 0, text: 0 }

  for (const rawShape of rawShapes) {
    const result = walkShape(rawShape, IDENTITY, idGen, vertCache)
    shapes.push(result.shape)
    if (result.worldBounds) {
      globalBounds = mergeBounds(globalBounds, result.worldBounds)
    }

    // Tally stats (including children)
    const tally = (s: ParsedShape) => {
      stats.total++
      if (s.type === 'Group') stats.groups++
      else if (s.type === 'Path') stats.paths++
      else if (s.type === 'Ellipse') stats.ellipses++
      else if (s.type === 'Text') stats.text++
      s.children?.forEach(tally)
    }
    tally(result.shape)
  }

  const canvasBounds: ShapeBounds = globalBounds
    ? toShapeBounds(globalBounds)
    : { x: 0, y: 0, w: 500, h: 500, cx: 250, cy: 250 }

  return { appVersion, mirrorX, mirrorY, cutSettings, shapes, canvasBounds, stats }
}
