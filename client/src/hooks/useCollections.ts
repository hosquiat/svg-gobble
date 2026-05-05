import { useState, useEffect, useCallback } from 'react'
import type { Collection, ExtractedSvg } from '../types'
import { collectionsApi, svgsApi } from '../api/client'

interface UseCollectionsReturn {
  collections: Collection[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  createCollection: (data: { name: string; emoji?: string; parentId?: string }) => Promise<Collection>
  updateCollection: (id: string, data: { name?: string; emoji?: string; parentId?: string | null }) => Promise<void>
  deleteCollection: (id: string) => Promise<void>
  archiveCollection: (id: string) => Promise<void>
  restoreCollection: (id: string) => Promise<void>
  addSvgs: (collectionId: string, svgs: Array<{ name: string; svg: string; type: string }>) => Promise<ExtractedSvg[]>
  updateSvg: (id: string, data: { name?: string; svg?: string; collectionId?: string; rotation?: number }) => Promise<void>
  deleteSvg: (id: string) => Promise<void>
  archiveSvg: (id: string) => Promise<void>
  restoreSvg: (id: string) => Promise<void>
  duplicateSvg: (id: string, collectionId?: string) => Promise<ExtractedSvg>
  moveSvg: (svgId: string, toCollectionId: string) => Promise<void>
  moveSvgs: (svgIds: string[], toCollectionId: string) => Promise<void>
}

/**
 * Flatten collection tree to array including children
 */
function flattenCollections(collections: Collection[]): Collection[] {
  const result: Collection[] = []
  const stack = [...collections]

  while (stack.length > 0) {
    const collection = stack.pop()!
    result.push(collection)
    if (collection.children) {
      stack.push(...collection.children)
    }
  }

  return result
}

export function useCollections(): UseCollectionsReturn {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await collectionsApi.getAll()
      setCollections(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch collections')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const createCollection = useCallback(async (data: { name: string; emoji?: string; parentId?: string }) => {
    const collection = await collectionsApi.create(data)
    await refetch()
    return collection
  }, [refetch])

  const updateCollection = useCallback(async (id: string, data: { name?: string; emoji?: string; parentId?: string | null }) => {
    await collectionsApi.update(id, data)
    await refetch()
  }, [refetch])

  const deleteCollection = useCallback(async (id: string) => {
    await collectionsApi.delete(id)
    await refetch()
  }, [refetch])

  const archiveCollection = useCallback(async (id: string) => {
    await collectionsApi.archive(id)
    await refetch()
  }, [refetch])

  const restoreCollection = useCallback(async (id: string) => {
    await collectionsApi.restore(id)
    await refetch()
  }, [refetch])

  const addSvgs = useCallback(async (collectionId: string, svgs: Array<{ name: string; svg: string; type: string }>) => {
    const result = await collectionsApi.addSvgs(collectionId, svgs)
    await refetch()
    return result
  }, [refetch])

  const updateSvg = useCallback(async (id: string, data: { name?: string; svg?: string; collectionId?: string; rotation?: number }) => {
    await svgsApi.update(id, data)
    await refetch()
  }, [refetch])

  const deleteSvg = useCallback(async (id: string) => {
    await svgsApi.delete(id)
    await refetch()
  }, [refetch])

  const archiveSvg = useCallback(async (id: string) => {
    await svgsApi.archive(id)
    await refetch()
  }, [refetch])

  const restoreSvg = useCallback(async (id: string) => {
    await svgsApi.restore(id)
    await refetch()
  }, [refetch])

  const duplicateSvg = useCallback(async (id: string, collectionId?: string) => {
    const result = await svgsApi.duplicate(id, collectionId)
    await refetch()
    return result
  }, [refetch])

  const moveSvg = useCallback(async (svgId: string, toCollectionId: string) => {
    await svgsApi.update(svgId, { collectionId: toCollectionId })
    await refetch()
  }, [refetch])

  const moveSvgs = useCallback(async (svgIds: string[], toCollectionId: string) => {
    await Promise.all(svgIds.map(id => svgsApi.update(id, { collectionId: toCollectionId })))
    await refetch()
  }, [refetch])

  return {
    collections,
    loading,
    error,
    refetch,
    createCollection,
    updateCollection,
    deleteCollection,
    archiveCollection,
    restoreCollection,
    addSvgs,
    updateSvg,
    deleteSvg,
    archiveSvg,
    restoreSvg,
    duplicateSvg,
    moveSvg,
    moveSvgs,
  }
}

export { flattenCollections }
