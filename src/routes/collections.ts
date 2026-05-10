import { Router, Request, Response } from 'express'
import prisma from '../db'
import { hashSvgContent } from '../utils/hash'

const router = Router()

interface IdParams {
  id: string
}

/**
 * GET /api/collections - List all collections with tree structure
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const collections = await prisma.collection.findMany({
      include: {
        svgs: true,
        children: {
          include: {
            svgs: true,
            children: {
              include: {
                svgs: true,
              },
            },
          },
        },
      },
      where: {
        parentId: null, // Only root collections
      },
      orderBy: [
        { createdAt: 'asc' },
      ],
    })

    res.json({ success: true, collections })
  } catch (error) {
    console.error('Error fetching collections:', error)
    res.status(500).json({ success: false, error: 'Failed to fetch collections' })
  }
})

/**
 * POST /api/collections - Create a new collection
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, emoji, parentId } = req.body

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' })
    }

    // Verify parent exists if provided
    if (parentId) {
      const parent = await prisma.collection.findUnique({ where: { id: parentId } })
      if (!parent) {
        return res.status(404).json({ success: false, error: 'Parent collection not found' })
      }
    }

    const collection = await prisma.collection.create({
      data: {
        name,
        emoji,
        parentId,
      },
      include: {
        svgs: true,
        children: true,
      },
    })

    res.status(201).json({ success: true, collection })
  } catch (error) {
    console.error('Error creating collection:', error)
    res.status(500).json({ success: false, error: 'Failed to create collection' })
  }
})

/**
 * PUT /api/collections/:id - Update a collection
 */
router.put('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params
    const { name, emoji, parentId } = req.body

    const existing = await prisma.collection.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Collection not found' })
    }

    // Prevent moving a collection to its own descendant
    if (parentId) {
      let current: string | null = parentId
      while (current) {
        if (current === id) {
          return res.status(400).json({ success: false, error: 'Cannot move collection to its own descendant' })
        }
        const parent = await prisma.collection.findUnique({ where: { id: current } })
        current = parent?.parentId || null
      }
    }

    const collection = await prisma.collection.update({
      where: { id },
      data: {
        name: name ?? existing.name,
        emoji: emoji !== undefined ? emoji : existing.emoji,
        parentId: parentId !== undefined ? parentId : existing.parentId,
      },
      include: {
        svgs: true,
        children: true,
      },
    })

    res.json({ success: true, collection })
  } catch (error) {
    console.error('Error updating collection:', error)
    res.status(500).json({ success: false, error: 'Failed to update collection' })
  }
})

/**
 * DELETE /api/collections/:id - Delete a collection
 */
router.delete('/:id', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params

    const existing = await prisma.collection.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Collection not found' })
    }

    await prisma.collection.delete({ where: { id } })

    res.json({ success: true, message: 'Collection deleted' })
  } catch (error) {
    console.error('Error deleting collection:', error)
    res.status(500).json({ success: false, error: 'Failed to delete collection' })
  }
})

/**
 * POST /api/collections/:id/archive - Archive a collection
 */
router.post('/:id/archive', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params

    const existing = await prisma.collection.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Collection not found' })
    }

    const collection = await prisma.collection.update({
      where: { id },
      data: { archivedAt: new Date() },
      include: {
        svgs: true,
        children: true,
      },
    })

    res.json({ success: true, collection })
  } catch (error) {
    console.error('Error archiving collection:', error)
    res.status(500).json({ success: false, error: 'Failed to archive collection' })
  }
})

/**
 * POST /api/collections/:id/restore - Restore an archived collection
 */
router.post('/:id/restore', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params

    const existing = await prisma.collection.findUnique({ where: { id } })
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Collection not found' })
    }

    if (!existing.archivedAt) {
      return res.status(400).json({ success: false, error: 'Collection is not archived' })
    }

    const collection = await prisma.collection.update({
      where: { id },
      data: { archivedAt: null },
      include: {
        svgs: true,
        children: true,
      },
    })

    res.json({ success: true, collection })
  } catch (error) {
    console.error('Error restoring collection:', error)
    res.status(500).json({ success: false, error: 'Failed to restore collection' })
  }
})

/**
 * POST /api/collections/:id/svgs - Add SVGs to a collection
 */
router.post('/:id/svgs', async (req: Request<IdParams>, res: Response) => {
  try {
    const { id } = req.params
    const { svgs } = req.body

    if (!Array.isArray(svgs) || svgs.length === 0) {
      return res.status(400).json({ success: false, error: 'SVGs array is required' })
    }

    const collection = await prisma.collection.findUnique({ where: { id } })
    if (!collection) {
      return res.status(404).json({ success: false, error: 'Collection not found' })
    }

    const createdSvgs = await prisma.$transaction(
      svgs.map((svg: { name: string; svg: string; type: string }) =>
        prisma.svg.create({
          data: {
            name: svg.name,
            svg: svg.svg,
            type: svg.type,
            contentHash: hashSvgContent(svg.svg),
            collectionId: id,
          },
        })
      )
    )

    res.status(201).json({ success: true, svgs: createdSvgs })
  } catch (error) {
    console.error('Error adding SVGs:', error)
    res.status(500).json({ success: false, error: 'Failed to add SVGs' })
  }
})

export default router
