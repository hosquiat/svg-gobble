import { useState, useCallback, useEffect } from 'react'
import clsx from 'clsx'
import { jigApi } from '../api/jig'
import { useJigTemplates } from '../hooks/useJigTemplates'
import { JigSlotPreview } from './JigSlotPreview'
import type { JigTemplate, JigSlot } from '../api/jig'
import type { ExtractedSvg } from '../types'

interface JigGeneratorModalProps {
  isOpen: boolean
  onClose: () => void
  /** The pool of SVGs the user has selected — these will be randomly assigned to slots */
  selectedSvgs: ExtractedSvg[]
}

type OutputMode = 'full' | 'designs-only'

/** Build a random assignment: each slot independently picks a random SVG (repeats allowed) */
function buildAssignment(svgs: ExtractedSvg[], slots: JigSlot[]): Map<number, ExtractedSvg> {
  if (svgs.length === 0 || slots.length === 0) return new Map()
  const result = new Map<number, ExtractedSvg>()
  for (const slot of slots) {
    result.set(slot.slotIndex, svgs[Math.floor(Math.random() * svgs.length)])
  }
  return result
}

export function JigGeneratorModal({ isOpen, onClose, selectedSvgs }: JigGeneratorModalProps) {
  const { templates, loading: templatesLoading } = useJigTemplates()

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [fullTemplate, setFullTemplate] = useState<JigTemplate | null>(null)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [assignment, setAssignment] = useState<Map<number, ExtractedSvg>>(new Map())
  const [outputMode, setOutputMode] = useState<OutputMode>('full')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the full template (with slots) when user picks one
  useEffect(() => {
    if (!selectedTemplateId) {
      setFullTemplate(null)
      setAssignment(new Map())
      return
    }
    setLoadingTemplate(true)
    jigApi.getById(selectedTemplateId)
      .then(data => {
        setFullTemplate(data.template)
        setAssignment(buildAssignment(selectedSvgs, data.template.slots))
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load template'))
      .finally(() => setLoadingTemplate(false))
  }, [selectedTemplateId, selectedSvgs])

  // Auto-select the first template if only one exists
  useEffect(() => {
    if (!selectedTemplateId && templates.length === 1) {
      setSelectedTemplateId(templates[0].id)
    }
  }, [templates, selectedTemplateId])

  const handleRandomize = useCallback(() => {
    if (fullTemplate) {
      setAssignment(buildAssignment(selectedSvgs, fullTemplate.slots))
    }
  }, [fullTemplate, selectedSvgs])

  /** Cycle the SVG for a specific slot to the next one in the pool */
  const handleCycleSlot = useCallback((slotIndex: number) => {
    if (selectedSvgs.length === 0) return
    setAssignment(prev => {
      const current = prev.get(slotIndex)
      const currentIdx = current ? selectedSvgs.findIndex(s => s.id === current.id) : -1
      const nextIdx = (currentIdx + 1) % selectedSvgs.length
      const next = new Map(prev)
      next.set(slotIndex, selectedSvgs[nextIdx])
      return next
    })
  }, [selectedSvgs])

  const handleGenerate = async () => {
    if (!fullTemplate) return
    setError(null)
    setGenerating(true)

    try {
      const assignments = fullTemplate.slots.map(slot => {
        const svg = assignment.get(slot.slotIndex)
        return { slotIndex: slot.slotIndex, svgId: svg?.id ?? '' }
      }).filter(a => a.svgId !== '')

      const blob = await jigApi.generate({
        templateId: fullTemplate.id,
        assignments,
        mode: outputMode,
      })

      // Trigger download
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${fullTemplate.name.replace(/[^a-z0-9_\-]/gi, '_')}-jig.lbrn2`
      a.click()
      URL.revokeObjectURL(url)

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handleClose = () => {
    setSelectedTemplateId(null)
    setFullTemplate(null)
    setAssignment(new Map())
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  const slots = fullTemplate?.slots ?? []
  const filledCount = slots.filter(s => assignment.has(s.slotIndex)).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Generate Jig File</h2>
          <button onClick={handleClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Template picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jig Template</label>
            {templatesLoading ? (
              <p className="text-sm text-gray-400">Loading templates…</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-500">No templates yet. Create one in the Jig Templates section first.</p>
            ) : (
              <select
                value={selectedTemplateId ?? ''}
                onChange={e => setSelectedTemplateId(e.target.value || null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                <option value="">Select a template…</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.slotCount} slots
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Slot preview grid */}
          {loadingTemplate && (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {fullTemplate && !loadingTemplate && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">
                  Slot Assignments
                  <span className="ml-2 text-xs text-gray-400">
                    {filledCount} / {slots.length} filled
                    {selectedSvgs.length > 0 && ` · ${selectedSvgs.length} SVG${selectedSvgs.length > 1 ? 's' : ''} in pool`}
                  </span>
                </p>
                <button
                  onClick={handleRandomize}
                  disabled={selectedSvgs.length === 0}
                  className={clsx(
                    'text-xs px-3 py-1 rounded-md font-medium transition-colors',
                    selectedSvgs.length > 0
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  )}
                >
                  Randomize
                </button>
              </div>

              {selectedSvgs.length === 0 ? (
                <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  No SVGs selected. Close this dialog and select some SVGs first.
                </p>
              ) : (
                <div
                  className="grid gap-2 max-h-64 overflow-y-auto pr-1"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))' }}
                >
                  {slots.map(slot => (
                    <JigSlotPreview
                      key={slot.slotIndex}
                      slot={slot}
                      svg={assignment.get(slot.slotIndex) ?? null}
                      onCycle={handleCycleSlot}
                    />
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">Click a slot to cycle its SVG</p>
            </div>
          )}

          {/* Output mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Output</label>
            <div className="space-y-2">
              {([
                { value: 'full', label: 'Full file (jig geometry + designs)', desc: 'Ready to cut and engrave in one job' },
                { value: 'designs-only', label: 'Designs only', desc: 'Only the SVG engrave paths, no jig geometry' },
              ] as const).map(opt => (
                <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="outputMode"
                    value={opt.value}
                    checked={outputMode === opt.value}
                    onChange={() => setOutputMode(opt.value)}
                    className="mt-0.5 accent-red-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">{opt.label}</span>
                    <p className="text-xs text-gray-400">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!fullTemplate || generating || filledCount === 0}
            className={clsx(
              'px-5 py-2 text-sm font-medium rounded-lg transition-colors',
              !fullTemplate || generating || filledCount === 0
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-red-600 text-white hover:bg-red-700'
            )}
          >
            {generating ? 'Generating…' : 'Generate & Download'}
          </button>
        </div>
      </div>
    </div>
  )
}
