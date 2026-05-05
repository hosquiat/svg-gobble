import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import clsx from 'clsx'
import type { ExtractedSvg, Collection } from '../types'

export interface GroupedSvg {
  svg: ExtractedSvg
  collectionName: string
  isSubCollection: boolean
}

interface SvgGridProps {
  svgs: ExtractedSvg[]
  groupedSvgs?: GroupedSvg[]
  collections: Collection[]
  currentCollectionId?: string | null
  onDeleteSvg: (id: string) => void
  onArchiveSvg: (id: string) => void
  onEditSvg: (svg: ExtractedSvg) => void
  onDuplicateSvg: (svg: ExtractedSvg) => void
  onRenameSvg: (id: string, name: string) => void
  onMoveSvg: (svgId: string, toCollectionId: string) => void
  onRotateSvg: (id: string, rotation: number) => void
  showSizes: boolean
  showNames: boolean
  cardSize: number
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
}

export function SvgGrid({
  svgs,
  groupedSvgs,
  collections,
  currentCollectionId,
  onDeleteSvg,
  onArchiveSvg,
  onEditSvg,
  onDuplicateSvg,
  onRenameSvg,
  onMoveSvg,
  onRotateSvg,
  showSizes,
  showNames,
  cardSize,
  selectedIds,
  onToggleSelect,
}: SvgGridProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  const copySvg = async (svg: ExtractedSvg) => {
    try {
      await navigator.clipboard.writeText(svg.svg)
      setCopiedId(svg.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard failed
    }
  }

  const copyDataUri = async (svg: ExtractedSvg) => {
    try {
      const dataUri = `data:image/svg+xml,${encodeURIComponent(svg.svg)}`
      await navigator.clipboard.writeText(dataUri)
      setCopiedId(svg.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard failed
    }
  }

  const copyBase64Uri = async (svg: ExtractedSvg) => {
    try {
      const base64 = btoa(unescape(encodeURIComponent(svg.svg)))
      const dataUri = `data:image/svg+xml;base64,${base64}`
      await navigator.clipboard.writeText(dataUri)
      setCopiedId(svg.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Clipboard failed
    }
  }

  const downloadSvg = (svg: ExtractedSvg) => {
    const blob = new Blob([svg.svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${svg.name}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(2)} kB`
  }

  const getSvgSize = (svg: ExtractedSvg) => {
    return new Blob([svg.svg]).size
  }

  // Group SVGs by collection when groupedSvgs is provided
  const sections = useMemo(() => {
    if (!groupedSvgs || groupedSvgs.length === 0) {
      return [{ name: '', isSubCollection: false, svgs }]
    }

    const groups: Array<{ name: string; isSubCollection: boolean; svgs: ExtractedSvg[] }> = []
    let currentGroup: typeof groups[0] | null = null

    for (const item of groupedSvgs) {
      const key = item.isSubCollection ? item.collectionName : ''
      if (!currentGroup || currentGroup.name !== key || currentGroup.isSubCollection !== item.isSubCollection) {
        currentGroup = { name: key, isSubCollection: item.isSubCollection, svgs: [] }
        groups.push(currentGroup)
      }
      currentGroup.svgs.push(item.svg)
    }

    return groups
  }, [groupedSvgs, svgs])

  if (svgs.length === 0) {
    return null
  }

  const renderSvgCard = (svg: ExtractedSvg) => (
    <SvgCard
      key={svg.id}
      svg={svg}
      isSelected={selectedIds.has(svg.id)}
      isCopied={copiedId === svg.id}
      isMenuOpen={menuOpenId === svg.id}
      showSize={showSizes}
      showName={showNames}
      cardSize={cardSize}
      collections={collections}
      currentCollectionId={currentCollectionId}
      onToggleSelect={() => onToggleSelect(svg.id)}
      onCopy={() => copySvg(svg)}
      onCopyDataUri={() => copyDataUri(svg)}
      onCopyBase64Uri={() => copyBase64Uri(svg)}
      onDownload={() => downloadSvg(svg)}
      onEdit={() => onEditSvg(svg)}
      onDuplicate={() => onDuplicateSvg(svg)}
      onDelete={() => onDeleteSvg(svg.id)}
      onArchive={() => onArchiveSvg(svg.id)}
      onRename={(name) => onRenameSvg(svg.id, name)}
      onMove={(toCollectionId) => onMoveSvg(svg.id, toCollectionId)}
      onRotate={(rotation) => onRotateSvg(svg.id, rotation)}
      onMenuToggle={() => setMenuOpenId(menuOpenId === svg.id ? null : svg.id)}
      onMenuClose={() => setMenuOpenId(null)}
      size={formatBytes(getSvgSize(svg))}
    />
  )

  // Calculate responsive min card size
  const responsiveMinSize = Math.max(cardSize * 0.6, 120) // At least 120px, or 60% of card size

  return (
    <div className="p-2 sm:p-4">
      {sections.map((section, idx) => (
        <div key={section.name || idx}>
          {/* Section header for sub-collections */}
          {section.isSubCollection && section.name && (
            <div className="flex items-center gap-2 mb-3 mt-6 pt-4 first:mt-0">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-sm font-medium text-gray-700">{section.name}</span>
                <span className="text-xs text-gray-400">({section.svgs.length})</span>
              </div>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          )}
          <div
            className="grid gap-2 sm:gap-4"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(min(${responsiveMinSize}px, 100%), 1fr))`,
            }}
          >
            {section.svgs.map(renderSvgCard)}
          </div>
        </div>
      ))}
    </div>
  )
}

interface SvgCardProps {
  svg: ExtractedSvg
  isSelected: boolean
  isCopied: boolean
  isMenuOpen: boolean
  showSize: boolean
  showName: boolean
  cardSize: number
  collections: Collection[]
  currentCollectionId?: string | null
  onToggleSelect: () => void
  onCopy: () => void
  onCopyDataUri: () => void
  onCopyBase64Uri: () => void
  onDownload: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onArchive: () => void
  onRename: (name: string) => void
  onMove: (toCollectionId: string) => void
  onRotate: (rotation: number) => void
  onMenuToggle: () => void
  onMenuClose: () => void
  size: string
}

function SvgCard({
  svg,
  isSelected,
  isCopied,
  isMenuOpen,
  showSize,
  showName,
  cardSize: _cardSize,
  collections,
  currentCollectionId,
  onToggleSelect,
  onCopy,
  onCopyDataUri,
  onCopyBase64Uri,
  onDownload,
  onEdit,
  onDuplicate,
  onDelete: _onDelete,
  onArchive,
  onRename,
  onMove,
  onRotate,
  onMenuToggle,
  onMenuClose,
  size,
}: SvgCardProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(svg.name)
  const [showMoveSubmenu, setShowMoveSubmenu] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Drag handlers for SVG cards
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', svg.id)
    e.dataTransfer.setData('application/x-svg-id', svg.id)
    e.dataTransfer.effectAllowed = 'move'
    setIsDragging(true)
  }, [svg.id])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Flatten collections for the move menu
  const flatCollections = useMemo(() => {
    const result: Array<{ id: string; name: string; depth: number }> = []
    const flatten = (colls: Collection[], depth = 0) => {
      for (const c of colls) {
        if (!c.archivedAt) {
          result.push({ id: c.id, name: c.name, depth })
          if (c.children) {
            flatten(c.children, depth + 1)
          }
        }
      }
    }
    flatten(collections)
    return result
  }, [collections])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onMenuClose()
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen, onMenuClose])

  const handleSaveName = () => {
    if (editedName.trim() && editedName !== svg.name) {
      onRename(editedName.trim())
    }
    setIsEditingName(false)
  }

  const handleCancelEdit = () => {
    setEditedName(svg.name)
    setIsEditingName(false)
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={clsx(
        'group relative bg-white rounded-xl border transition-all flex flex-col cursor-grab active:cursor-grabbing',
        isSelected
          ? 'border-red-500 ring-2 ring-red-500/20'
          : 'border-gray-200 hover:border-gray-300',
        isDragging && 'opacity-50 ring-2 ring-red-500'
      )}
    >
      {/* Drag handle indicator */}
      <div className="absolute top-2 left-2 text-gray-300 group-hover:text-gray-400 transition-colors pointer-events-none">
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="4" r="1.5" />
          <circle cx="11" cy="4" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="11" cy="12" r="1.5" />
        </svg>
      </div>

      {/* Header bar with checkbox and menu */}
      <div className="flex items-center justify-between pl-8 pr-3 py-2 border-b border-gray-100">
        <button
          onClick={onToggleSelect}
          className={clsx(
            'w-5 h-5 rounded border-2 transition-all flex items-center justify-center',
            isSelected
              ? 'bg-red-500 border-red-500'
              : 'border-gray-300 bg-white hover:border-gray-400'
          )}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div ref={menuRef} className="relative">
          <button
            onClick={onMenuToggle}
            className={clsx(
              'p-1.5 rounded-lg transition-all',
              isMenuOpen ? 'bg-gray-100' : 'hover:bg-gray-100'
            )}
          >
            <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {/* Dropdown menu */}
          {isMenuOpen && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50">
              <MenuItem icon="copy" label="Copy original" onClick={onCopy} />
              <MenuItem icon="download" label="Download original" onClick={onDownload} />
              <MenuItem icon="code" label="Copy data URI" onClick={onCopyDataUri} />
              <MenuItem icon="code" label="Copy base64 URI" onClick={onCopyBase64Uri} />
              <div className="border-t border-gray-200 my-1" />
              <MenuItem icon="duplicate" label="Duplicate" onClick={onDuplicate} />
              {/* Move to submenu */}
              <div className="relative">
                <button
                  onClick={() => setShowMoveSubmenu(!showMoveSubmenu)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className="flex items-center gap-3">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    Move to
                  </span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {showMoveSubmenu && (
                  <div className="absolute left-full top-0 ml-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1 max-h-64 overflow-y-auto">
                    {flatCollections.map((coll) => (
                      <button
                        key={coll.id}
                        onClick={() => {
                          onMove(coll.id)
                          onMenuClose()
                          setShowMoveSubmenu(false)
                        }}
                        disabled={coll.id === currentCollectionId}
                        className={clsx(
                          'w-full text-left px-3 py-2 text-sm transition-colors',
                          coll.id === currentCollectionId
                            ? 'text-gray-400 cursor-not-allowed'
                            : 'text-gray-700 hover:bg-gray-50'
                        )}
                        style={{ paddingLeft: `${12 + coll.depth * 12}px` }}
                      >
                        {coll.name}
                        {coll.id === currentCollectionId && ' (current)'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-200 my-1" />
              <MenuItem icon="archive" label="Archive" onClick={() => { onArchive(); onMenuClose() }} />
            </div>
          )}
        </div>
      </div>

      {/* SVG Preview - consistent square aspect ratio */}
      <div
        className="relative cursor-pointer bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZjNmNGY2Ii8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiNmM2Y0ZjYiLz48L3N2Zz4=')] overflow-hidden"
        style={{ aspectRatio: '1/1' }}
        onClick={onEdit}
      >
        <div
          className="absolute inset-2 flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:h-auto transition-transform duration-200"
          style={{ transform: `rotate(${svg.rotation ?? 0}deg)` }}
          dangerouslySetInnerHTML={{ __html: svg.svg }}
        />
        {/* Rotate buttons — visible on card hover */}
        <div className="absolute bottom-1.5 inset-x-0 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <button
            className="pointer-events-auto p-1 rounded bg-white/90 shadow-sm hover:bg-white text-gray-600 hover:text-gray-900 transition-colors"
            title="Rotate counter-clockwise"
            onClick={(e) => {
              e.stopPropagation()
              onRotate(((svg.rotation ?? 0) - 90 + 360) % 360)
            }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <button
            className="pointer-events-auto p-1 rounded bg-white/90 shadow-sm hover:bg-white text-gray-600 hover:text-gray-900 transition-colors"
            title="Rotate clockwise"
            onClick={(e) => {
              e.stopPropagation()
              onRotate(((svg.rotation ?? 0) + 90) % 360)
            }}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Copy button */}
      <div className="px-3 pb-2">
        <button
          onClick={onCopy}
          className="w-full py-2 text-sm font-medium border border-gray-200 rounded-lg
            hover:bg-gray-50 transition-colors text-gray-700"
        >
          {isCopied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Name and Size at bottom */}
      {(showName || showSize) && (
        <div className="px-3 pb-3">
          {showName && (
            isEditingName ? (
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName()
                  if (e.key === 'Escape') handleCancelEdit()
                }}
                autoFocus
                className="w-full text-sm text-gray-900 text-center bg-transparent border-b-2 border-red-500 outline-none px-1"
              />
            ) : (
              <p
                className="text-sm text-gray-600 truncate text-center cursor-pointer hover:text-red-600"
                onClick={() => {
                  setEditedName(svg.name)
                  setIsEditingName(true)
                }}
                title="Click to rename"
              >
                {svg.name}
              </p>
            )
          )}
          {showSize && (
            <p className="text-xs text-gray-400 text-center mt-1">{size}</p>
          )}
        </div>
      )}
    </div>
  )
}

interface MenuItemProps {
  icon: string
  label: string
  onClick: () => void
  danger?: boolean
}

function MenuItem({ icon, label, onClick, danger }: MenuItemProps) {
  const icons: Record<string, JSX.Element> = {
    copy: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
    download: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
    code: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    duplicate: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
      </svg>
    ),
    delete: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    archive: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
  }

  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors',
        danger
          ? 'text-red-600 hover:bg-red-50'
          : 'text-gray-700 hover:bg-gray-50'
      )}
    >
      {icons[icon]}
      {label}
    </button>
  )
}
