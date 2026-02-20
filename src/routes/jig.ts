import { Router, Request, Response } from 'express'
import { parseLightBurnFile } from '../services/lightburnParser'
import prisma from '../db'

const router = Router()

// ---------------------------------------------------------------------------
// POST /api/jig-templates/parse
// Parse a .lbrn2 file and return the shape tree for the visual template editor.
// Body: { content: string }  (raw .lbrn2 XML)
// ---------------------------------------------------------------------------
router.post('/parse', (req: Request, res: Response) => {
  try {
    const { content } = req.body as { content?: string }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing required field: content (the .lbrn2 XML string)' })
    }

    const result = parseLightBurnFile(content)
    return res.json({ success: true, ...result })
  } catch (error) {
    console.error('Error parsing LightBurn file:', error)
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse LightBurn file',
    })
  }
})

// ---------------------------------------------------------------------------
// POST /api/jig-templates
// Save a new jig template with its slot definitions.
// Body: { name: string, originalFile: string, slots: SlotDef[] }
// ---------------------------------------------------------------------------
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, originalFile, slots } = req.body as {
      name?: string
      originalFile?: string
      slots?: Array<{ slotIndex: number; cx: number; cy: number; width: number; height: number; label?: string }>
    }

    if (!name || !originalFile || !Array.isArray(slots)) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, originalFile, slots' })
    }

    const template = await prisma.jigTemplate.create({
      data: {
        name,
        originalFile,
        slotCount: slots.length,
        slots: {
          create: slots.map(s => ({
            slotIndex: s.slotIndex,
            cx: s.cx,
            cy: s.cy,
            width: s.width,
            height: s.height,
            label: s.label ?? null,
          })),
        },
      },
      include: { slots: { orderBy: { slotIndex: 'asc' } } },
    })

    return res.status(201).json({ success: true, template })
  } catch (error) {
    console.error('Error creating jig template:', error)
    return res.status(500).json({ success: false, error: 'Failed to create jig template' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/jig-templates
// List all saved jig templates (without the full originalFile content).
// ---------------------------------------------------------------------------
router.get('/', async (_req: Request, res: Response) => {
  try {
    const templates = await prisma.jigTemplate.findMany({
      select: {
        id: true,
        name: true,
        slotCount: true,
        createdAt: true,
        updatedAt: true,
        slots: { orderBy: { slotIndex: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return res.json({ success: true, templates })
  } catch (error) {
    console.error('Error fetching jig templates:', error)
    return res.status(500).json({ success: false, error: 'Failed to fetch jig templates' })
  }
})

// ---------------------------------------------------------------------------
// GET /api/jig-templates/:id
// Get a single template including its originalFile (for generation).
// ---------------------------------------------------------------------------
router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params
    const template = await prisma.jigTemplate.findUnique({
      where: { id },
      include: { slots: { orderBy: { slotIndex: 'asc' } } },
    })
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' })
    }
    return res.json({ success: true, template })
  } catch (error) {
    console.error('Error fetching jig template:', error)
    return res.status(500).json({ success: false, error: 'Failed to fetch jig template' })
  }
})

// ---------------------------------------------------------------------------
// PUT /api/jig-templates/:id
// Rename a template.
// Body: { name: string }
// ---------------------------------------------------------------------------
router.put('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params
    const { name } = req.body as { name?: string }

    if (!name) {
      return res.status(400).json({ success: false, error: 'Missing required field: name' })
    }

    const template = await prisma.jigTemplate.update({
      where: { id },
      data: { name },
      include: { slots: { orderBy: { slotIndex: 'asc' } } },
    })
    return res.json({ success: true, template })
  } catch (error) {
    console.error('Error updating jig template:', error)
    return res.status(500).json({ success: false, error: 'Failed to update jig template' })
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/jig-templates/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { id } = req.params
    await prisma.jigTemplate.delete({ where: { id } })
    return res.json({ success: true, message: 'Template deleted' })
  } catch (error) {
    console.error('Error deleting jig template:', error)
    return res.status(500).json({ success: false, error: 'Failed to delete jig template' })
  }
})

export default router
