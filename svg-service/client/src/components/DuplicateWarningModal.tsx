import type { ExtractedSvg, DuplicateCheckResult } from '../types'

interface DuplicateWarningModalProps {
  isOpen: boolean
  duplicates: DuplicateCheckResult[]
  svgs: ExtractedSvg[]
  onAction: (action: 'skip' | 'add' | 'cancel') => void
}

export function DuplicateWarningModal({
  isOpen,
  duplicates,
  svgs,
  onAction,
}: DuplicateWarningModalProps) {
  if (!isOpen) return null

  const duplicateCount = duplicates.filter((d) => d.isDuplicate).length
  const uniqueCount = duplicates.length - duplicateCount

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-yellow-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Duplicate SVGs Found
              </h2>
              <p className="text-sm text-gray-500">
                {duplicateCount} of {svgs.length} SVG(s) already exist
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-64 overflow-y-auto">
          <ul className="space-y-2">
            {duplicates.map((result, index) => (
              <li
                key={index}
                className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0"
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    result.isDuplicate ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                />
                <span className="flex-1 text-sm text-gray-700 truncate">
                  {svgs[index]?.name || `SVG ${index + 1}`}
                </span>
                {result.isDuplicate && result.existingSvg && (
                  <span className="text-xs text-gray-500">
                    in {result.existingSvg.collectionName}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => onAction('skip')}
            className="w-full px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            Skip Duplicates ({uniqueCount} will be added)
          </button>
          <button
            onClick={() => onAction('add')}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Add Anyway (All {svgs.length})
          </button>
          <button
            onClick={() => onAction('cancel')}
            className="w-full px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
