import { useState, useCallback, useMemo } from 'react'
import clsx from 'clsx'
import { JigCanvas } from './JigCanvas'
import { jigApi, type LightBurnParseResult, type JigTemplate, type ParsedShape } from '../api/jig'
import { useJigTemplates } from '../hooks/useJigTemplates'

type EditorMode = 'idle' | 'parsing' | 'editing' | 'saving'

export function JigTemplateEditor() {
  const { templates, loading: templatesLoading, deleteTemplate, renameTemplate, refetch } = useJigTemplates()

  // Editor state
  const [mode, setMode] = useState<EditorMode>('idle')
  const [parseResult, setParseResult] = useState<LightBurnParseResult | null>(null)
  const [originalFileContent, setOriginalFileContent] = useState('')
  const [selectedShapeIds, setSelectedShapeIds] = useState<Set<string>>(new Set())
  const [templateName, setTemplateName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  // Which template is highlighted in the list (for view/rename/delete actions)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // -------------------------------------------------------------------------
  // File upload → parse
  // -------------------------------------------------------------------------

  const handleFileDrop = useCallback(async (file: File) => {
    if (!file.name.endsWith('.lbrn') && !file.name.endsWith('.lbrn2')) {
      setParseError('Please upload a .lbrn or .lbrn2 LightBurn file.')
      return
    }
    setParseError(null)
    setMode('parsing')
    setSelectedShapeIds(new Set())

    try {
      const content = await file.text()
      const result = await jigApi.parseFile(content)
      setParseResult(result)
      setOriginalFileContent(content)
      setTemplateName(file.name.replace(/\.lbrn2?$/, ''))
      setMode('editing')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file')
      setMode('idle')
    }
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileDrop(file)
    e.target.value = ''
  }, [handleFileDrop])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileDrop(file)
  }, [handleFileDrop])

  // -------------------------------------------------------------------------
  // Slot selection
  // -------------------------------------------------------------------------

  const toggleSlot = useCallback((id: string) => {
    setSelectedShapeIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Build ordered slot list from parseResult shapes.
  // Strategy:
  //   1. If any Groups with path children exist → collect leaf Groups (domino-jig.lbrn2 style)
  //   2. Otherwise → collect ALL shapes with valid bounds (path or group)
  const orderedSlots = useMemo((): ParsedShape[] => {
    if (!parseResult) return []

    function hasAnyGroups(shapes: ParsedShape[]): boolean {
      for (const s of shapes) {
        if (s.type === 'Group' && s.hasPathChildren && s.bounds.w > 0 && s.bounds.h > 0) return true
        if (s.children && hasAnyGroups(s.children)) return true
      }
      return false
    }

    let result: ParsedShape[]

    if (hasAnyGroups(parseResult.shapes)) {
      // Group-based file: collect leaf groups (groups that have path children but no sub-groups with paths)
      function isLeaf(s: ParsedShape): boolean {
        if (s.type !== 'Group' || !s.hasPathChildren) return false
        if (!s.bounds.w || !s.bounds.h) return false
        return !(s.children?.some(c => c.type === 'Group' && c.hasPathChildren) ?? false)
      }

      function collectGroups(shapes: ParsedShape[]): ParsedShape[] {
        const out: ParsedShape[] = []
        for (const s of shapes) {
          if (s.type === 'Group' && s.hasPathChildren) {
            if (isLeaf(s)) out.push(s)
            else out.push(...collectGroups(s.children ?? []))
          } else if (s.children) {
            out.push(...collectGroups(s.children))
          }
        }
        return out
      }
      result = collectGroups(parseResult.shapes)
    } else {
      // Bare-path / bare-shape file: every top-level shape with valid bounds is a candidate slot
      result = parseResult.shapes.filter(
        s => s.bounds.w > 0 && s.bounds.h > 0
      )
    }

    // Debug: log what was found
    console.log('[JigTemplateEditor] orderedSlots:', result.length,
      '| total shapes:', parseResult.stats.total,
      '| groups:', parseResult.stats.groups,
      '| paths:', parseResult.stats.paths,
      '| hasAnyGroups:', hasAnyGroups(parseResult.shapes),
      '| shapes with w=0:', parseResult.shapes.filter(s => s.bounds.w === 0).length,
    )

    return result
  }, [parseResult])

  // -------------------------------------------------------------------------
  // Save template
  // -------------------------------------------------------------------------

  const handleSave = async () => {
    if (!parseResult || !templateName.trim()) return
    setSaveError(null)
    setMode('saving')

    // Build slot definitions in selection order
    let idx = 0
    const slots = orderedSlots
      .filter(s => selectedShapeIds.has(s.id))
      .map(s => ({
        slotIndex: idx++,
        cx: s.bounds.cx,
        cy: s.bounds.cy,
        width: s.bounds.w,
        height: s.bounds.h,
        label: s.label,
      }))

    try {
      await jigApi.create({
        name: templateName.trim(),
        originalFile: originalFileContent,
        slots,
      })
      await refetch()
      // Reset editor
      setMode('idle')
      setParseResult(null)
      setOriginalFileContent('')
      setSelectedShapeIds(new Set())
      setTemplateName('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save template')
      setMode('editing')
    }
  }

  const handleCancelEdit = () => {
    setMode('idle')
    setParseResult(null)
    setOriginalFileContent('')
    setSelectedShapeIds(new Set())
    setTemplateName('')
    setParseError(null)
    setSaveError(null)
  }

  // -------------------------------------------------------------------------
  // Rename
  // -------------------------------------------------------------------------

  const startRename = (t: JigTemplate) => {
    setRenamingId(t.id)
    setRenameValue(t.name)
  }

  const commitRename = async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null)
      return
    }
    await renameTemplate(renamingId, renameValue.trim())
    setRenamingId(null)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex-1 flex min-w-0 h-screen overflow-hidden">
      {/* ------------------------------------------------------------------ */}
      {/* Left panel: template list                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Jig Templates</h2>
          <button
            onClick={() => {
              setMode('idle')
              setParseResult(null)
              setSelectedShapeIds(new Set())
              setTemplateName('')
              setParseError(null)
            }}
            className="text-xs text-red-600 hover:text-red-700 font-medium"
          >
            + New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {templatesLoading ? (
            <p className="px-4 py-3 text-sm text-gray-400">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-400">No templates yet. Upload a .lbrn2 file to create one.</p>
          ) : (
            <ul className="space-y-0.5 px-2">
              {templates.map(t => (
                <li key={t.id}>
                  {renamingId === t.id ? (
                    <input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      autoFocus
                      className="w-full px-3 py-1.5 text-sm border border-red-400 rounded-md outline-none"
                    />
                  ) : (
                    <div
                      className={clsx(
                        'group flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors',
                        activeTemplateId === t.id
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-700 hover:bg-gray-50'
                      )}
                      onClick={() => setActiveTemplateId(t.id)}
                    >
                      {/* Jig icon */}
                      <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      <span className="flex-1 truncate">{t.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{t.slotCount}</span>
                      {/* Actions */}
                      <div className="hidden group-hover:flex items-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); startRename(t) }}
                          className="p-0.5 rounded text-gray-400 hover:text-gray-600"
                          title="Rename"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={async e => {
                            e.stopPropagation()
                            if (confirm(`Delete template "${t.name}"?`)) {
                              await deleteTemplate(t.id)
                              if (activeTemplateId === t.id) setActiveTemplateId(null)
                            }
                          }}
                          className="p-0.5 rounded text-gray-400 hover:text-red-600"
                          title="Delete"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right panel: upload / canvas / summary                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header bar */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {mode === 'editing' || mode === 'saving' ? (
              <>
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  placeholder="Template name…"
                  className="text-lg font-semibold text-gray-900 bg-transparent border-b-2 border-red-400 outline-none px-1 min-w-[200px]"
                />
                <span className="text-sm text-gray-500">
                  {selectedShapeIds.size} of {orderedSlots.length} slots selected
                </span>
              </>
            ) : (
              <h1 className="text-lg font-semibold text-gray-900">Jig Templates</h1>
            )}
          </div>

          {(mode === 'editing' || mode === 'saving') && (
            <div className="flex items-center gap-3">
              {saveError && <span className="text-sm text-red-600">{saveError}</span>}
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!templateName.trim() || selectedShapeIds.size === 0 || mode === 'saving'}
                className={clsx(
                  'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                  (!templateName.trim() || selectedShapeIds.size === 0 || mode === 'saving')
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
                )}
              >
                {mode === 'saving' ? 'Saving…' : `Save Template (${selectedShapeIds.size} slots)`}
              </button>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          {/* Idle / upload state */}
          {(mode === 'idle' || mode === 'parsing') && (
            <div className="h-full flex items-center justify-center p-8">
              <div
                className={clsx(
                  'w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center transition-colors',
                  mode === 'parsing'
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-300 hover:border-red-400 hover:bg-gray-50 cursor-pointer'
                )}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                {mode === 'parsing' ? (
                  <>
                    <div className="w-10 h-10 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm text-red-600 font-medium">Parsing LightBurn file…</p>
                  </>
                ) : (
                  <>
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <p className="text-gray-700 font-medium mb-1">Upload a LightBurn jig file</p>
                    <p className="text-sm text-gray-400 mb-4">Drag & drop a .lbrn or .lbrn2 file here</p>
                    <label className="inline-block cursor-pointer px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
                      Choose file
                      <input
                        type="file"
                        accept=".lbrn,.lbrn2"
                        className="hidden"
                        onChange={handleFileInput}
                      />
                    </label>
                    {parseError && (
                      <p className="mt-3 text-sm text-red-600">{parseError}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Canvas (editing / saving) */}
          {(mode === 'editing' || mode === 'saving') && parseResult && (
            <JigCanvas
              shapes={parseResult.shapes}
              canvasBounds={parseResult.canvasBounds}
              slotCandidates={orderedSlots}
              selectedIds={selectedShapeIds}
              onToggleSlot={toggleSlot}
            />
          )}
        </div>

        {/* Footer: stats strip when editing */}
        {(mode === 'editing' || mode === 'saving') && parseResult && (
          <div className="flex-shrink-0 border-t border-gray-100 bg-white px-6 py-2 flex items-center gap-6 text-xs text-gray-400">
            <span>LightBurn {parseResult.appVersion}</span>
            <span>{parseResult.stats.paths} paths · {parseResult.stats.groups} groups · {parseResult.stats.ellipses} ellipses</span>
            <span className={orderedSlots.length === 0 ? 'text-amber-500 font-medium' : ''}>
              {orderedSlots.length} slot candidates detected
              {orderedSlots.length === 0 && ' — check browser console for details'}
            </span>
            <span className="ml-auto">Canvas: {parseResult.canvasBounds.w.toFixed(0)} × {parseResult.canvasBounds.h.toFixed(0)} mm</span>
          </div>
        )}
      </div>
    </div>
  )
}
