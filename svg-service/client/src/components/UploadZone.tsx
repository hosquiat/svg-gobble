import { useCallback, useState } from 'react'
import clsx from 'clsx'
import type { ExtractedSvg } from '../types'

interface UploadZoneProps {
  onUpload: (svgs: ExtractedSvg[]) => void
  fullScreen?: boolean
  compact?: boolean
}

const generateId = () => Math.random().toString(36).substring(2, 15)

export function UploadZone({ onUpload, fullScreen = false, compact = false }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

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
      onUpload(validSvgs)
    }
  }, [onUpload])

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

    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFiles(files)
    }
  }, [handleFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFiles(files)
    }
    e.target.value = ''
  }, [handleFiles])

  // Compact drop zone for when collection has SVGs
  if (compact) {
    return (
      <div
        className={clsx(
          'mx-4 mt-4 border-2 border-dashed rounded-lg transition-all',
          isDragging
            ? 'border-red-500 bg-red-50 py-12'
            : 'border-gray-200 hover:border-gray-300 py-8'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="svg-upload-compact"
          accept=".svg,image/svg+xml"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />

        <label
          htmlFor="svg-upload-compact"
          className="flex items-center justify-center gap-3 cursor-pointer"
        >
          <svg
            className={clsx(
              'w-5 h-5 transition-colors',
              isDragging ? 'text-red-500' : 'text-gray-400'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span
            className={clsx(
              'text-sm transition-colors',
              isDragging ? 'text-red-600 font-medium' : 'text-gray-500'
            )}
          >
            {isDragging ? 'Drop SVGs here' : 'Drag and drop SVGs here, or click to upload'}
          </span>
        </label>
      </div>
    )
  }

  // Full upload zone for empty state
  return (
    <div
      className={clsx(
        'border-2 border-dashed rounded-xl transition-all flex flex-col items-center justify-center',
        isDragging
          ? 'border-red-500 bg-red-50'
          : 'border-gray-300',
        fullScreen ? 'flex-1 m-4' : 'p-8'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="svg-upload"
        accept=".svg,image/svg+xml"
        multiple
        onChange={handleFileInput}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-4">
        {/* Search/magnifying glass icon */}
        <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>

        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-1">No SVGs found</h3>
          <p className="text-sm text-gray-500">
            Select or drag SVGs into this area to upload into this collection
          </p>
        </div>

        <label
          htmlFor="svg-upload"
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Upload SVGs
        </label>
      </div>
    </div>
  )
}
