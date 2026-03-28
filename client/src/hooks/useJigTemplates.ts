import { useState, useEffect, useCallback } from 'react'
import { jigApi, type JigTemplate } from '../api/jig'

export function useJigTemplates() {
  const [templates, setTemplates] = useState<JigTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { templates: data } = await jigApi.list()
      setTemplates(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jig templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const deleteTemplate = useCallback(async (id: string) => {
    await jigApi.delete(id)
    await refetch()
  }, [refetch])

  const renameTemplate = useCallback(async (id: string, name: string) => {
    await jigApi.rename(id, name)
    await refetch()
  }, [refetch])

  return { templates, loading, error, refetch, deleteTemplate, renameTemplate }
}
