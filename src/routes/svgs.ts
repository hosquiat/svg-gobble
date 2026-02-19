import { Router, Request, Response } from 'express'
import prisma from '../db'
import { hashSvgContent } from '../utils/hash'

const router = Router()

interface IdParams {
  id: string
}

/**
 * PUT /api/svgs/:id - Update an SVG
 */
router.put('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params
    const { name, svg, collectionId } = req.body

    const existing = await prisma.svg.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SVG not found' })
    }

    // Verify new collection exists if provided
    if (collectionId && collectionId !== existing.collectionId) {
      const collection = await prisma.collection.findUnique({ where: { id: collectionId } })
      if (!collection) {
        return res.status(404).json({ success: false, error: 'Target collection not found' })
      }
    }

    const updatedSvg = await prisma.svg.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        svg: svg ?? existing.svg,
        contentHash: svg ? hashSvgContent(svg) : existing.contentHash,
        collectionId: collectionId ?? existing.collectionId,
      },
    })

    res.json({ success: true, svg: updatedSvg })
  } catch (error) {
    console.error('Error updating SVG:', error)
    res.status(500).json({ success: false, error: 'Failed to update SVG' })
  }
})

/**
 * DELETE /api/svgs/:id - Delete an SVG
 */
router.delete('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params

    const existing = await prisma.svg.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SVG not found' })
    }

    await prisma.svg.delete({ where: { id } })

    res.json({ success: true, message: 'SVG deleted' })
  } catch (error) {
    console.error('Error deleting SVG:', error)
    res.status(500).json({ success: false, error: 'Failed to delete SVG' })
  }
})

/**
 * POST /api/svgs/:id/archive - Archive an SVG
 */
router.post('/:id/archive', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params

    const existing = await prisma.svg.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SVG not found' })
    }

    const updatedSvg = await prisma.svg.update({
      where: { id },
      data: { archivedAt: new Date() },
    })

    res.json({ success: true, svg: updatedSvg })
  } catch (error) {
    console.error('Error archiving SVG:', error)
    res.status(500).json({ success: false, error: 'Failed to archive SVG' })
  }
})

/**
 * POST /api/svgs/:id/restore - Restore an archived SVG
 */
router.post('/:id/restore', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params

    const existing = await prisma.svg.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SVG not found' })
    }

    const updatedSvg = await prisma.svg.update({
      where: { id },
      data: { archivedAt: null },
    })

    res.json({ success: true, svg: updatedSvg })
  } catch (error) {
    console.error('Error restoring SVG:', error)
    res.status(500).json({ success: false, error: 'Failed to restore SVG' })
  }
})

/**
 * POST /api/svgs/:id/duplicate - Duplicate an SVG
 */
router.post('/:id/duplicate', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params
    const { collectionId } = req.body

    const existing = await prisma.svg.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, error: 'SVG not found' })
    }

    // Use target collection or same collection
    const targetCollectionId = collectionId ?? existing.collectionId

    // Verify target collection exists
    const collection = await prisma.collection.findUnique({ where: { id: targetCollectionId } })
    if (!collection) {
      return res.status(404).json({ success: false, error: 'Target collection not found' })
    }

    const duplicatedSvg = await prisma.svg.create({
      data: {
        name: `${existing.name} (copy)`,
        svg: existing.svg,
        type: existing.type,
        contentHash: existing.contentHash,
        collectionId: targetCollectionId,
      },
    })

    res.status(201).json({ success: true, svg: duplicatedSvg })
  } catch (error) {
    console.error('Error duplicating SVG:', error)
    res.status(500).json({ success: false, error: 'Failed to duplicate SVG' })
  }
})

/**
 * POST /api/svgs/check-duplicates - Check for duplicate SVGs
 */
router.post('/check-duplicates', async (req: Request, res: Response) => {
  try {
    const { svgs, collectionId } = req.body

    if (!Array.isArray(svgs) || svgs.length === 0) {
      return res.status(400).json({ success: false, error: 'SVGs array is required' })
    }

    // Hash all incoming SVGs
    const hashes = svgs.map((svg: string) => hashSvgContent(svg))

    // Find existing SVGs with matching hashes
    const whereClause: { contentHash: { in: string[] }; collectionId?: string } = {
      contentHash: { in: hashes },
    }

    if (collectionId) {
      whereClause.collectionId = collectionId
    }

    const existingSvgs = await prisma.svg.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        contentHash: true,
        collectionId: true,
        collection: {
          select: {
            name: true,
          },
        },
      },
    })

    // Create a map of hash -> existing SVG
    const hashMap = new Map(existingSvgs.map((svg) => [svg.contentHash, svg]))

    // Check each SVG for duplicates
    const duplicates = svgs.map((svg: string, index: number) => {
      const hash = hashes[index]
      const existingSvg = hashMap.get(hash)
      return {
        index,
        isDuplicate: !!existingSvg,
        existingSvg: existingSvg
          ? {
              id: existingSvg.id,
              name: existingSvg.name,
              collectionId: existingSvg.collectionId,
              collectionName: existingSvg.collection.name,
            }
          : null,
      }
    })

    res.json({ success: true, duplicates })
  } catch (error) {
    console.error('Error checking duplicates:', error)
    res.status(500).json({ success: false, error: 'Failed to check duplicates' })
  }
})

export default router
