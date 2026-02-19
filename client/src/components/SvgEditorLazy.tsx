import { lazy, Suspense } from 'react'
import type { ExtractedSvg } from '../types'

const SvgEditor = lazy(() =>
  import('./SvgEditor').then((module) => ({ default: module.SvgEditor }))
)

interface SvgEditorLazyProps {
  svg: ExtractedSvg
  onSave: (svg: ExtractedSvg) => void
  onSaveAsCopy: (svg: ExtractedSvg) => void
  onClose: () => void
}

function LoadingSpinner() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-zinc-400">Loading editor...</span>
      </div>
    </div>
  )
}

export function SvgEditorLazy(props: SvgEditorLazyProps) {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SvgEditor {...props} />
    </Suspense>
  )
}
