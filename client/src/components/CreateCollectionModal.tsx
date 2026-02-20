import { useState, useEffect, useRef, useCallback } from 'react'
import clsx from 'clsx'
import type { ExtractedSvg } from '../types'

interface CreateCollectionModalProps {
  isOpen: boolean
  onClose: () => void
  onCreate: (name: string, svgs: ExtractedSvg[]) => void
  initialName?: string
  initialSvgs?: ExtractedSvg[]
}

const generateId = () => Math.random().toString(36).substring(2, 15)

export function CreateCollectionModal({
  isOpen,
  onClose,
  onCreate,
  initialName = '',
  initialSvgs = [],
}: CreateCollectionModalProps) {
  const [name, setName] = useState(initialName)
  const [svgs, setSvgs] = useState<ExtractedSvg[]>(initialSvgs)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setName(initialName)
      setSvgs(initialSvgs)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen, initialName, initialSvgs])

  const processSvgFile = async (file: File): Promise<ExtractedSvg | null> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        if (content && content.includes('<svg')) {
          resolve({
            id: generateId(),
            name: file.name.replace(/\.svg$/i, ''),
            svg: content,
            type: 'uploaded',
          })
        } else {
          resolve(null)
        }
      }
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    })
  }

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const svgFiles = Array.from(files).filter(
      (f) => f.type === 'image/svg+xml' || f.name.endsWith('.svg')
    )
    const results = await Promise.all(svgFiles.map(processSvgFile))
    const validSvgs = results.filter((s): s is ExtractedSvg => s !== null)
    if (validSvgs.length > 0) {
      setSvgs((prev) => [...prev, ...validSvgs])
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
    e.target.value = ''
  }, [handleFiles])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onCreate(name.trim(), svgs)
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const canSubmit = name.trim().length > 0

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 pb-4">
            <h2 className="text-xl font-semibold text-gray-900">Create a new collection</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="px-6 pb-6 space-y-4">
            {/* Name Input */}
            <div>
              <label htmlFor="collection-name" className="block text-sm font-medium text-gray-700 mb-2">
                Name
              </label>
              <input
                ref={inputRef}
                type="text"
                id="collection-name"
                name="collection-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder=""
                className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm
                  text-gray-900 placeholder:text-gray-400
                  focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                autoComplete="off"
              />
            </div>

            {/* Upload Zone */}
            <div
              className={clsx(
                'border-2 border-dashed rounded-lg p-8 transition-all text-center',
                isDragging
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-300'
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="modal-svg-upload"
                accept=".svg,image/svg+xml"
                multiple
                onChange={handleFileInput}
                className="hidden"
              />
              <label htmlFor="modal-svg-upload" className="cursor-pointer">
                <div className="flex flex-col items-center gap-3">
                  <svg className="w-10 h-10 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <span className="text-red-500 font-medium">Upload files</span>
                    <span className="text-gray-600"> or drag and drop</span>
                  </div>
                  <p className="text-xs text-gray-500">SVG files up to 10mb (optional)</p>
                </div>
              </label>

              {/* Show uploaded files count */}
              {svgs.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    {svgs.length} SVG{svgs.length !== 1 && 's'} ready to add
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300
                text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={clsx(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                canSubmit
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              )}
            >
              Create collection
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
