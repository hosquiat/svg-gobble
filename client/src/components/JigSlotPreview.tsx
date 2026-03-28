import clsx from 'clsx'
import type { JigSlot } from '../api/jig'
import type { ExtractedSvg } from '../types'

interface JigSlotPreviewProps {
  slot: JigSlot
  svg: ExtractedSvg | null
  onCycle?: (slotIndex: number) => void  // click to cycle to next SVG
}

export function JigSlotPreview({ slot, svg, onCycle }: JigSlotPreviewProps) {
  return (
    <div
      className={clsx(
        'relative group border rounded-lg overflow-hidden bg-white transition-colors',
        onCycle ? 'cursor-pointer hover:border-red-400' : '',
        svg ? 'border-gray-200' : 'border-dashed border-gray-300',
      )}
      style={{ aspectRatio: '1' }}
      onClick={() => onCycle?.(slot.slotIndex)}
      title={svg ? svg.name : 'Empty slot'}
    >
      {svg ? (
        <div
          className="w-full h-full flex items-center justify-center p-1"
          dangerouslySetInnerHTML={{ __html: svg.svg }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
          —
        </div>
      )}
      {/* Slot label */}
      {slot.label && (
        <div className="absolute bottom-0 left-0 right-0 text-center text-[9px] text-gray-400 bg-white/80 truncate px-1">
          {slot.label}
        </div>
      )}
      {/* Hover overlay */}
      {onCycle && (
        <div className="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
      )}
    </div>
  )
}
