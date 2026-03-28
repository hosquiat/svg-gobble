/**
 * LightBurn file generator (Phase 6)
 *
 * Produces a valid .lbrn2 file from a saved JigTemplate + SVG slot assignments.
 *
 * Two output modes:
 *  "full"         - Clone the original .lbrn2 jig geometry + add SVG designs
 *  "designs-only" - Minimal .lbrn2 skeleton with only SVG design paths
 */

import { svgToLightBurnShapes } from './svgToLightburn'

export interface SlotAssignment {
  slotIndex: number
  svgContent: string  // raw SVG XML
}

export interface JigSlotData {
  slotIndex: number
  cx: number
  cy: number
  width: number
  height: number
  label: string | null
}

export interface GeneratorOptions {
  mode: 'full' | 'designs-only'
  mirrorX: boolean
  mirrorY: boolean
}

// ---------------------------------------------------------------------------
// Minimal .lbrn2 skeleton (designs-only mode)
// Mirror settings must match the template so slot coordinates/vertex encoding
// land in the correct coordinate space.
// ---------------------------------------------------------------------------

function buildMinimalSkeleton(mirrorX: boolean, mirrorY: boolean): string {
  const mx = mirrorX ? 'True' : 'False'
  const my = mirrorY ? 'True' : 'False'
  return `<?xml version="1.0" encoding="UTF-8"?>
<LightBurnProject AppVersion="2.0.05" FormatVersion="1" MaterialHeight="0" MirrorX="${mx}" MirrorY="${my}">
    <CutSetting type="Scan">
        <index Value="0"/>
        <name Value="C00"/>
        <minPower Value="70"/>
        <maxPower Value="70"/>
        <speed Value="300"/>
        <zOffset Value="0"/>
        <dotTime Value="1"/>
        <interval Value="0.0254"/>
        <priority Value="0"/>
        <doOutput Value="1"/>
        <tabCount Value="1"/>
        <tabCountMax Value="1"/>
    </CutSetting>
</LightBurnProject>`
}

// ---------------------------------------------------------------------------
// Engrave CutSetting block to inject when the original file lacks one
// ---------------------------------------------------------------------------

const ENGRAVE_CUT_SETTING = `    <CutSetting type="Scan">
        <index Value="0"/>
        <name Value="C00"/>
        <minPower Value="70"/>
        <maxPower Value="70"/>
        <speed Value="300"/>
        <zOffset Value="0"/>
        <dotTime Value="1"/>
        <interval Value="0.0254"/>
        <priority Value="0"/>
        <doOutput Value="1"/>
    </CutSetting>`

// ---------------------------------------------------------------------------
// XML helper: build a Group shape wrapping children XML strings
// ---------------------------------------------------------------------------

function buildGroupShape(cutIndex: number, tx: number, ty: number, children: string[]): string {
  const fmt = (n: number) => parseFloat(n.toPrecision(8)).toString()
  return [
    `<Shape Type="Group" CutIndex="${cutIndex}">`,
    `    <XForm>1 0 0 1 ${fmt(tx)} ${fmt(ty)}</XForm>`,
    `    <Children>`,
    ...children.map(c => '        ' + c.split('\n').join('\n        ')),
    `    </Children>`,
    `</Shape>`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Insert shapes into existing .lbrn2 XML (full mode)
// ---------------------------------------------------------------------------

/**
 * Inject Shape XML elements into a .lbrn2 XML string.
 * Inserts before the closing </LightBurnProject> tag.
 * Ensures a CutSetting for index 0 (engrave layer) exists and is enabled.
 */
function injectShapesIntoXml(originalXml: string, shapesXml: string): string {
  let xml = originalXml

  // Check if a CutSetting for index 0 already exists
  if (xml.includes('<index Value="0"')) {
    // Exists but may be hidden — enable it
    xml = xml.replace(
      /(<CutSetting[^>]*>[\s\S]*?<index\s+Value="0"[^/]*\/>[\s\S]*?)<doOutput\s+Value="0"\s*\/>/,
      '$1<doOutput Value="1"/>',
    )
  } else {
    // Missing entirely — insert the engrave CutSetting before the first <Shape>
    // (so LightBurn parses CutSettings before shapes)
    const firstShape = xml.indexOf('<Shape')
    if (firstShape !== -1) {
      xml = xml.slice(0, firstShape) + ENGRAVE_CUT_SETTING + '\n    ' + xml.slice(firstShape)
    } else {
      // No shapes yet — insert before closing tag
      const closeTag = xml.lastIndexOf('</LightBurnProject>')
      if (closeTag !== -1) {
        xml = xml.slice(0, closeTag) + ENGRAVE_CUT_SETTING + '\n' + xml.slice(closeTag)
      }
    }
  }

  // Insert all shape XML before </LightBurnProject>
  const insertPoint = xml.lastIndexOf('</LightBurnProject>')
  if (insertPoint === -1) return xml

  xml =
    xml.slice(0, insertPoint) +
    '\n    ' + shapesXml.split('\n').join('\n    ') + '\n' +
    xml.slice(insertPoint)

  return xml
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

/**
 * Generate a .lbrn2 file from a template and slot assignments.
 *
 * @param originalFile  The raw .lbrn2 XML (from JigTemplate.originalFile)
 * @param slots         Slot definitions (from JigTemplate.slots)
 * @param assignments   Which SVG goes in which slot
 * @param options       mode + mirrorY flag
 * @returns             Complete .lbrn2 XML string ready to download
 */
export function generateLightBurnFile(
  originalFile: string,
  slots: JigSlotData[],
  assignments: SlotAssignment[],
  options: GeneratorOptions,
): string {
  const { mode, mirrorX, mirrorY } = options

  // Build a map: slotIndex → svgContent
  const assignMap = new Map<number, string>()
  for (const a of assignments) {
    assignMap.set(a.slotIndex, a.svgContent)
  }

  // Generate one Group Shape per filled slot
  const allGroupShapes: string[] = []

  for (const slot of slots) {
    const svgContent = assignMap.get(slot.slotIndex)
    if (!svgContent) continue

    const pathShapes = svgToLightBurnShapes(
      svgContent,
      {
        cx: slot.cx,
        cy: slot.cy,
        width: slot.width,
        height: slot.height,
      },
      0, // CutIndex 0 = engrave layer
      mirrorY,
    )

    if (pathShapes.length === 0) continue

    // Wrap paths in a Group centered at slot position
    // (The individual paths already have XForm at slot center, so Group is at origin)
    const group = buildGroupShape(0, 0, 0, pathShapes)
    allGroupShapes.push(group)
  }

  if (allGroupShapes.length === 0) {
    // Nothing to generate — return original or skeleton unchanged
    return mode === 'full' ? originalFile : buildMinimalSkeleton(mirrorX, mirrorY)
  }

  // Wrap all slot groups in one parent Group for the entire job
  const topGroup = buildGroupShape(0, 0, 0, allGroupShapes)

  if (mode === 'full') {
    return injectShapesIntoXml(originalFile, topGroup)
  } else {
    // designs-only: use a skeleton with the same Mirror settings as the template
    // so that slot coordinates and vertex encoding match the output file's coordinate space
    return injectShapesIntoXml(buildMinimalSkeleton(mirrorX, mirrorY), topGroup)
  }
}
