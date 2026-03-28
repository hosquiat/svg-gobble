import { useMemo } from 'react'
import type { ParsedShape, ShapeBounds } from '../api/jig'

interface Props {
  shapes: ParsedShape[]
  canvasBounds: ShapeBounds
  /** Shapes the user can click to mark as slots. Computed by the parent. */
  slotCandidates: ParsedShape[]
  selectedIds: Set<string>
  onToggleSlot: (id: string) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively collect bounding boxes of all shapes for the background layer. */
function collectAllBounds(shapes: ParsedShape[]): Array<{ id: string; bounds: ShapeBounds }> {
  const results: Array<{ id: string; bounds: ShapeBounds }> = []
  for (const s of shapes) {
    if (s.bounds.w > 0 && s.bounds.h > 0) {
      results.push({ id: s.id, bounds: s.bounds })
    }
    if (s.children) results.push(...collectAllBounds(s.children))
  }
  return results
}

const PAD = 10 // mm padding around the canvas

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JigCanvas({ shapes, canvasBounds, slotCandidates, selectedIds, onToggleSlot }: Props) {
  const viewBox = `${canvasBounds.x - PAD} ${canvasBounds.y - PAD} ${canvasBounds.w + PAD * 2} ${canvasBounds.h + PAD * 2}`

  const allBounds = useMemo(() => collectAllBounds(shapes), [shapes])

  // Set of IDs that are slot candidates (for background filter)
  const candidateIdSet = useMemo(() => new Set(slotCandidates.map(s => s.id)), [slotCandidates])

  // Render selected slots on top of unselected ones
  const unselected = slotCandidates.filter(s => !selectedIds.has(s.id))
  const selected = slotCandidates.filter(s => selectedIds.has(s.id))

  // Selection order map (1-based index in the order shapes appear in the tree)
  const selectionOrder = useMemo(() => {
    const map = new Map<string, number>()
    let i = 1
    for (const s of slotCandidates) {
      if (selectedIds.has(s.id)) map.set(s.id, i++)
    }
    return map
  }, [slotCandidates, selectedIds])

  return (
    <div className="w-full h-full flex flex-col">
      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs text-gray-500 border-b border-gray-100 flex-shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded border border-blue-400 bg-blue-50" />
          Click to mark as slot
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded border border-emerald-500 bg-emerald-100" />
          Marked as slot
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-3 rounded border border-gray-300 bg-transparent" />
          Other shapes
        </span>
        <span className="ml-auto font-medium text-gray-700">
          {selectedIds.size} / {slotCandidates.length} slots marked
        </span>
      </div>

      {/* SVG Canvas */}
      <div className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center p-4">
        <svg
          viewBox={viewBox}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        >
          {/* Grid */}
          <defs>
            <pattern id="jig-grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e5e7eb" strokeWidth="0.25" />
            </pattern>
          </defs>
          <rect
            x={canvasBounds.x - PAD}
            y={canvasBounds.y - PAD}
            width={canvasBounds.w + PAD * 2}
            height={canvasBounds.h + PAD * 2}
            fill="url(#jig-grid)"
          />

          {/* Background: all non-slot shapes (context only, not interactive) */}
          {allBounds
            .filter(({ id, bounds }) => !candidateIdSet.has(id) && bounds.w > 1)
            .map(({ bounds }, i) => (
              <rect
                key={`bg-${i}`}
                x={bounds.x} y={bounds.y}
                width={bounds.w} height={bounds.h}
                fill="none"
                stroke="#d1d5db"
                strokeWidth="0.3"
                strokeDasharray="1.5 1.5"
              />
            ))}

          {/* Slot candidates — unselected */}
          {unselected.map(s => (
            <g key={s.id} onClick={() => onToggleSlot(s.id)} style={{ cursor: 'pointer' }}>
              <rect
                x={s.bounds.x} y={s.bounds.y}
                width={s.bounds.w} height={s.bounds.h}
                fill="rgba(59, 130, 246, 0.08)"
                stroke="#3b82f6"
                strokeWidth="0.6"
                rx="0.5"
              />
              {/* Invisible larger hit area */}
              <rect
                x={s.bounds.x - 1} y={s.bounds.y - 1}
                width={s.bounds.w + 2} height={s.bounds.h + 2}
                fill="transparent"
                stroke="none"
              />
            </g>
          ))}

          {/* Slot candidates — selected (rendered on top) */}
          {selected.map(s => {
            const idx = selectionOrder.get(s.id)
            const badgeR = Math.min(s.bounds.w, s.bounds.h) * 0.22

            return (
              <g key={s.id} onClick={() => onToggleSlot(s.id)} style={{ cursor: 'pointer' }}>
                <rect
                  x={s.bounds.x} y={s.bounds.y}
                  width={s.bounds.w} height={s.bounds.h}
                  fill="rgba(16, 185, 129, 0.18)"
                  stroke="#059669"
                  strokeWidth="0.8"
                  rx="0.5"
                />
                {idx !== undefined && (
                  <>
                    <circle cx={s.bounds.cx} cy={s.bounds.cy} r={badgeR} fill="#059669" />
                    <text
                      x={s.bounds.cx} y={s.bounds.cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={badgeR * 1.1}
                      fill="white"
                      fontWeight="700"
                      style={{ userSelect: 'none', pointerEvents: 'none' }}
                    >
                      {idx}
                    </text>
                  </>
                )}
              </g>
            )
          })}

          {slotCandidates.length === 0 && (
            <text
              x={canvasBounds.cx} y={canvasBounds.cy}
              textAnchor="middle" dominantBaseline="central"
              fontSize="6" fill="#9ca3af"
            >
              No shapes found on the selected layer
            </text>
          )}
        </svg>
      </div>
    </div>
  )
}
