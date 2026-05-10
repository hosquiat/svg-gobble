import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import clsx from "clsx"
import type { Collection } from "../types"

function countSvgsDeep(collection: Collection): number {
  const direct = collection.svgs.filter((s) => !s.archivedAt).length
  return (
    direct +
    (collection.children ?? [])
      .filter((c) => !c.archivedAt)
      .reduce((sum, child) => sum + countSvgsDeep(child), 0)
  )
}

// Collection color palette - parent colors
const COLLECTION_COLORS = [
  { primary: "text-red-500", secondary: "text-red-300" },
  { primary: "text-blue-500", secondary: "text-blue-300" },
  { primary: "text-green-500", secondary: "text-green-300" },
  { primary: "text-purple-500", secondary: "text-purple-300" },
  { primary: "text-orange-500", secondary: "text-orange-300" },
  { primary: "text-pink-500", secondary: "text-pink-300" },
  { primary: "text-teal-500", secondary: "text-teal-300" },
  { primary: "text-indigo-500", secondary: "text-indigo-300" },
]

interface SidebarProps {
  collections: Collection[]
  activeCollectionId: string | null
  onSelectCollection: (id: string) => void
  onCreateCollection: () => void
  onDeleteCollection: (id: string) => void
  onRenameCollection: (id: string, name: string) => void
  onArchiveCollection: (id: string) => void
  onRestoreCollection: (id: string) => void
  onMoveCollection: (id: string, parentId: string | null) => void
  onCreateSubCollection: (parentId: string) => void
  onMoveSvgToCollection: (svgId: string, collectionId: string) => void
  onOpenSettings: () => void
  archiveRetentionDays?: number
  width: number
  onWidthChange: (width: number) => void
  isOpen: boolean
  onClose: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  onSelectAllView?: () => void
  isAllViewActive?: boolean
  totalSvgCount?: number
}

export function Sidebar({
  collections,
  activeCollectionId,
  onSelectCollection,
  onCreateCollection,
  onDeleteCollection,
  onRenameCollection,
  onArchiveCollection,
  onRestoreCollection,
  onMoveCollection,
  onCreateSubCollection,
  onMoveSvgToCollection,
  onOpenSettings,
  archiveRetentionDays = 90,
  width,
  onWidthChange,
  isOpen,
  onClose,
  isCollapsed,
  onToggleCollapse,
  onSelectAllView,
  isAllViewActive = false,
  totalSvgCount,
}: SidebarProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [showArchived, setShowArchived] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null) // 'root' or collection id for nesting
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      const newWidth = Math.min(Math.max(e.clientX, 180), 400)
      onWidthChange(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
  }, [isResizing, onWidthChange])

  // Separate active and archived collections
  const { activeCollections, archivedCollections } = useMemo(() => {
    const active: Collection[] = []
    const archived: Collection[] = []

    const categorize = (colls: Collection[]) => {
      for (const c of colls) {
        if (c.archivedAt) {
          archived.push(c)
        } else {
          active.push(c)
        }
        if (c.children) {
          categorize(c.children)
        }
      }
    }

    categorize(collections)
    return {
      activeCollections: collections.filter((c) => !c.archivedAt),
      archivedCollections: archived,
    }
  }, [collections])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <>
      {/* Mobile dropdown backdrop — sits below the header so the hamburger stays tappable */}
      {isOpen && (
        <div
          className="fixed inset-x-0 top-16 bottom-0 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile dropdown — full-width, drops from top of screen */}
      <div
        className={clsx(
          "fixed inset-x-0 top-16 z-50 lg:hidden",
          "bg-white border-b border-gray-200 shadow-xl",
          "max-h-[70vh] overflow-y-auto",
          "transition-all duration-200 ease-out",
          isOpen
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-2 pointer-events-none",
        )}
      >
        {/* Actions row */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <button
            onClick={() => {
              onCreateCollection()
              onClose()
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New collection
          </button>
          <div className="flex-1" />
          <button
            onClick={() => {
              onOpenSettings()
              onClose()
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </button>
        </div>

        {/* All SVGs */}
        {onSelectAllView && (
          <button
            onClick={() => {
              onSelectAllView()
              onClose()
            }}
            className={clsx(
              "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors",
              isAllViewActive
                ? "bg-gray-100 text-gray-900 font-medium"
                : "text-gray-700 hover:bg-gray-50",
            )}
          >
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            <span className="flex-1 text-left">Show All SVGs</span>
            {totalSvgCount !== undefined && (
              <span
                className={clsx(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  isAllViewActive
                    ? "bg-white text-gray-600"
                    : "bg-gray-100 text-gray-500",
                )}
              >
                {totalSvgCount}
              </span>
            )}
          </button>
        )}

        {/* Collections list */}
        <ul>
          {activeCollections.map((collection) => (
            <li key={collection.id}>
              <button
                onClick={() => {
                  onSelectCollection(collection.id)
                  onClose()
                }}
                className={clsx(
                  "w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors",
                  collection.id === activeCollectionId
                    ? "bg-gray-100 text-gray-900 font-medium"
                    : "text-gray-700 hover:bg-gray-50",
                )}
              >
                {collection.emoji ? (
                  <span className="flex-shrink-0">{collection.emoji}</span>
                ) : (
                  <svg
                    className="w-4 h-4 flex-shrink-0 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                  </svg>
                )}
                <span className="flex-1 text-left truncate">
                  {collection.name}
                </span>
                <span className="text-xs text-gray-400">
                  {countSvgsDeep(collection)}
                </span>
              </button>
              {collection.children
                ?.filter((c) => !c.archivedAt)
                .map((child) => (
                  <button
                    key={child.id}
                    onClick={() => {
                      onSelectCollection(child.id)
                      onClose()
                    }}
                    className={clsx(
                      "w-full flex items-center gap-3 pl-10 pr-4 py-2.5 text-sm transition-colors",
                      child.id === activeCollectionId
                        ? "bg-gray-100 text-gray-900 font-medium"
                        : "text-gray-600 hover:bg-gray-50",
                    )}
                  >
                    {child.emoji ? (
                      <span className="flex-shrink-0 text-sm">
                        {child.emoji}
                      </span>
                    ) : (
                      <svg
                        className="w-3.5 h-3.5 flex-shrink-0 text-gray-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                        />
                      </svg>
                    )}
                    <span className="flex-1 text-left truncate">
                      {child.name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {child.svgs.filter((s) => !s.archivedAt).length}
                    </span>
                  </button>
                ))}
            </li>
          ))}
        </ul>

        {/* Archived section */}
        {archivedCollections.length > 0 && (
          <div className="border-t border-gray-100">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <svg
                className={clsx(
                  "w-4 h-4 transition-transform",
                  showArchived && "rotate-90",
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              Archived ({archivedCollections.length})
            </button>
            {showArchived &&
              archivedCollections.map((collection) => (
                <div
                  key={collection.id}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-400"
                >
                  <svg
                    className="w-4 h-4 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
                  </svg>
                  <span className="flex-1 truncate">{collection.name}</span>
                  <button
                    onClick={() => onRestoreCollection(collection.id)}
                    className="text-xs text-blue-500 hover:text-blue-700 transition-colors"
                  >
                    Restore
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside
        ref={sidebarRef}
        className={clsx(
          "hidden lg:flex bg-white border-r border-gray-200 flex-col h-screen flex-shrink-0 relative",
          "transition-[width] duration-300",
        )}
        style={{ width: isCollapsed ? "64px" : `${width}px` }}
      >
        {/* Logo */}
        <div
          className={clsx(
            "p-4 flex items-center",
            isCollapsed ? "justify-center" : "justify-between",
          )}
        >
          <div className="flex items-center w-full">
            {isCollapsed ? (
              <img src="/icon.svg" alt="SVG Gobble" className="w-8 h-8" />
            ) : (
              <img src="/logo.svg" alt="SVG Gobble" className="h-7 w-full object-contain object-left" />
            )}
          </div>
        </div>

        {/* All SVGs View Button */}
        {onSelectAllView && (
          <div className={clsx("mb-2", isCollapsed ? "px-2 mx-auto" : "px-3")}>
            <button
              onClick={onSelectAllView}
              className={clsx(
                "flex items-center text-sm transition-colors",
                isCollapsed
                  ? "w-10 h-10 justify-center rounded-lg"
                  : "w-full gap-2 px-3 py-2 rounded-lg",
                isAllViewActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50",
              )}
              title={isCollapsed ? "Show All SVGs" : undefined}
            >
              <svg
                className="w-4 h-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
              {!isCollapsed && (
                <>
                  <span className="flex-1 text-left">Show All SVGs</span>
                  {totalSvgCount !== undefined && (
                    <span
                      className={clsx(
                        "text-xs px-1.5 py-0.5 rounded-full",
                        isAllViewActive
                          ? "bg-white text-gray-600"
                          : "bg-gray-100 text-gray-500",
                      )}
                    >
                      {totalSvgCount}
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        )}

        {/* Collections List */}
        <div
          className={clsx(
            "flex-1 overflow-y-auto",
            isCollapsed ? "px-2 mx-auto" : "px-3",
          )}
        >
          {/* Collapsed view - just icons */}
          {isCollapsed ? (
            <div className="space-y-1">
              {activeCollections.map((collection, index) => (
                <button
                  key={collection.id}
                  onClick={() => onSelectCollection(collection.id)}
                  className={clsx(
                    "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                    collection.id === activeCollectionId
                      ? "bg-gray-100 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50",
                  )}
                  title={collection.name}
                >
                  {collection.emoji ? (
                    <span className="text-lg">{collection.emoji}</span>
                  ) : (
                    <svg
                      className={clsx(
                        "w-5 h-5",
                        COLLECTION_COLORS[index % COLLECTION_COLORS.length]
                          .primary,
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  )}
                </button>
              ))}
              {/* Archived indicator when collapsed */}
              {archivedCollections.length > 0 && (
                <button
                  onClick={() => {
                    onToggleCollapse()
                    setShowArchived(true)
                  }}
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-50 transition-colors"
                  title={`Archived (${archivedCollections.length})`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Root drop zone - move collection to root level */}
              {draggedId && (
                <div
                  className={clsx(
                    "mb-2 border-2 border-dashed rounded-lg transition-all py-2 px-3 text-center text-sm",
                    dropTargetId === "root"
                      ? "border-red-500 bg-red-50 text-red-600"
                      : "border-gray-300 text-gray-400",
                  )}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDropTargetId("root")
                  }}
                  onDragLeave={() => setDropTargetId(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData("text/plain")
                    if (id) {
                      onMoveCollection(id, null)
                    }
                    setDraggedId(null)
                    setDropTargetId(null)
                  }}
                >
                  Move to root level
                </div>
              )}

              <ul className="space-y-1">
                {activeCollections.map((collection, index) => (
                  <CollectionItem
                    key={collection.id}
                    collection={collection}
                    isActive={collection.id === activeCollectionId}
                    isExpanded={expandedIds.has(collection.id)}
                    activeCollectionId={activeCollectionId}
                    onSelect={() => onSelectCollection(collection.id)}
                    onDelete={() => onDeleteCollection(collection.id)}
                    onRename={(name) => onRenameCollection(collection.id, name)}
                    onArchive={() => onArchiveCollection(collection.id)}
                    onCreateSub={() => onCreateSubCollection(collection.id)}
                    onToggleExpand={() => toggleExpand(collection.id)}
                    expandedIds={expandedIds}
                    onSelectChild={onSelectCollection}
                    onDeleteChild={onDeleteCollection}
                    onRenameChild={onRenameCollection}
                    onArchiveChild={onArchiveCollection}
                    onCreateSubChild={onCreateSubCollection}
                    onToggleExpandChild={toggleExpand}
                    onMoveCollection={onMoveCollection}
                    onMoveSvgToCollection={onMoveSvgToCollection}
                    depth={0}
                    colorIndex={index % COLLECTION_COLORS.length}
                    draggedId={draggedId}
                    onDragStart={setDraggedId}
                    onDragEnd={() => {
                      setDraggedId(null)
                      setDropTargetId(null)
                    }}
                    dropTargetId={dropTargetId}
                    onDropTargetChange={setDropTargetId}
                  />
                ))}
              </ul>

              {/* Archived Section */}
              {archivedCollections.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowArchived(!showArchived)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <svg
                      className={clsx(
                        "w-4 h-4 transition-transform",
                        showArchived && "rotate-90",
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    Archived ({archivedCollections.length})
                  </button>
                  {showArchived && (
                    <ul className="mt-1 space-y-1">
                      {archivedCollections.map((collection) => (
                        <ArchivedCollectionItem
                          key={collection.id}
                          collection={collection}
                          retentionDays={archiveRetentionDays}
                          onRestore={() => onRestoreCollection(collection.id)}
                          onDelete={() => onDeleteCollection(collection.id)}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className={clsx(
            "border-t border-gray-200",
            isCollapsed ? "p-2 space-y-1 mx-auto" : "p-3 space-y-1",
          )}
        >
          {/* New Collection Button */}
          <div className={clsx(
              "flex items-center text-gray;-600 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100",
              isCollapsed
                ? "w-10 h-10 justify-center"
                : "w-full gap-2 px-3 py-2 text-sm",
            )}>
            <button
              onClick={onCreateCollection}
              className={clsx(
                "flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors",
                isCollapsed
                  ? "w-10 h-10 justify-center rounded-lg hover:bg-gray-100"
                  : "w-full gap-2",
              )}
              title={isCollapsed ? "New collection" : undefined}
            >
              <svg
                className="w-4 h-4 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {!isCollapsed && <span>New collection</span>}
            </button>
          </div>

          <button
            onClick={onOpenSettings}
            className={clsx(
              "flex items-center text-gray-600 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-100",
              isCollapsed
                ? "w-10 h-10 justify-center"
                : "w-full gap-2 px-3 py-2 text-sm",
            )}
            title={isCollapsed ? "Settings" : undefined}
          >
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {!isCollapsed && <span>Settings</span>}
          </button>

          {/* Collapse toggle button */}
          <button
            onClick={onToggleCollapse}
            className={clsx(
              "hidden lg:flex items-center text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100",
              isCollapsed
                ? "w-10 h-10 justify-center"
                : "w-full gap-2 px-3 py-2 text-sm",
            )}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              className={clsx(
                "w-4 h-4 flex-shrink-0 transition-transform",
                isCollapsed && "rotate-180",
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
            {!isCollapsed && <span>Collapse</span>}
          </button>
        </div>

        {/* Resize handle - hidden on mobile and when collapsed */}
        {!isCollapsed && (
          <div
            className="hidden lg:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-red-500/50 transition-colors group"
            onMouseDown={handleMouseDown}
          >
            <div className="absolute top-1/2 right-0 -translate-y-1/2 w-4 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-1 h-6 bg-gray-300 rounded-full" />
            </div>
          </div>
        )}
      </aside>
    </>
  )
}

interface CollectionItemProps {
  collection: Collection
  isActive: boolean
  isExpanded: boolean
  activeCollectionId: string | null
  onSelect: () => void
  onDelete: () => void
  onRename: (name: string) => void
  onArchive: () => void
  onCreateSub: () => void
  onToggleExpand: () => void
  expandedIds: Set<string>
  onSelectChild: (id: string) => void
  onDeleteChild: (id: string) => void
  onRenameChild: (id: string, name: string) => void
  onArchiveChild: (id: string) => void
  onCreateSubChild: (parentId: string) => void
  onToggleExpandChild: (id: string) => void
  onMoveCollection: (id: string, parentId: string | null) => void
  onMoveSvgToCollection: (svgId: string, collectionId: string) => void
  depth: number
  colorIndex: number
  draggedId: string | null
  onDragStart: (id: string | null) => void
  onDragEnd: () => void
  dropTargetId: string | null
  onDropTargetChange: (id: string | null) => void
}

function CollectionItem({
  collection,
  isActive,
  isExpanded,
  activeCollectionId,
  onSelect,
  onDelete: _onDelete,
  onRename,
  onArchive,
  onCreateSub,
  onToggleExpand,
  expandedIds,
  onSelectChild,
  onDeleteChild,
  onRenameChild,
  onArchiveChild,
  onCreateSubChild,
  onToggleExpandChild,
  onMoveCollection,
  onMoveSvgToCollection,
  depth,
  colorIndex,
  draggedId,
  onDragStart,
  onDragEnd,
  dropTargetId,
  onDropTargetChange,
}: CollectionItemProps) {
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })

  const isDragOver = dropTargetId === collection.id
  const isBeingDragged = draggedId === collection.id

  const hasChildren =
    collection.children &&
    collection.children.filter((c) => !c.archivedAt).length > 0
  const activeChildren = collection.children?.filter((c) => !c.archivedAt) || []

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  const closeContextMenu = () => {
    setShowContextMenu(false)
  }

  // Drag handlers
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", collection.id)
    e.dataTransfer.setData("application/x-collection-id", collection.id)
    e.dataTransfer.effectAllowed = "move"
    // Use setTimeout to ensure state updates after the drag image is captured
    setTimeout(() => onDragStart(collection.id), 0)
  }

  const handleDragEnd = () => {
    onDragEnd()
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Check if this is a collection or SVG drag
    const isCollectionDrag = e.dataTransfer.types.includes(
      "application/x-collection-id",
    )
    const isSvgDrag = e.dataTransfer.types.includes("application/x-svg-id")
    if (isCollectionDrag || isSvgDrag) {
      onDropTargetChange(collection.id)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation()
    // Only clear if we're leaving to a non-child element
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      if (dropTargetId === collection.id) {
        onDropTargetChange(null)
      }
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Check if it's an SVG drag
    const isSvgDrag = e.dataTransfer.types.includes("application/x-svg-id")
    const droppedId = e.dataTransfer.getData("text/plain")

    if (isSvgDrag && droppedId) {
      // Move SVG to this collection
      onMoveSvgToCollection(droppedId, collection.id)
    } else if (droppedId && droppedId !== collection.id) {
      // Move collection
      onMoveCollection(droppedId, collection.id)
    }
    onDragEnd()
  }

  return (
    <>
      <li>
        {/* Drop indicator line above this item */}
        {draggedId && draggedId !== collection.id && isDragOver && (
          <div className="h-0.5 bg-red-500 rounded-full mx-2 -mb-0.5" />
        )}

        <div
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={clsx(
            "group flex w-full items-center gap-1.5 text-sm font-normal leading-6 transition-all duration-300 ease-in-out rounded-md px-2 py-1",
            "cursor-grab active:cursor-grabbing",
            isActive
              ? "bg-gray-100 text-gray-900"
              : "text-gray-900 hover:bg-gray-50",
            isDragOver && "ring-2 ring-red-500 bg-red-50",
            isBeingDragged && "opacity-50",
          )}
          style={{ paddingLeft: `${4 + depth * 16}px` }}
          onClick={onSelect}
          onContextMenu={handleContextMenu}
        >
          {/* Drag handle */}
          <span className="flex-shrink-0 text-gray-300 group-hover:text-gray-400 cursor-grab active:cursor-grabbing">
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="3" r="1.5" />
              <circle cx="11" cy="3" r="1.5" />
              <circle cx="5" cy="8" r="1.5" />
              <circle cx="11" cy="8" r="1.5" />
              <circle cx="5" cy="13" r="1.5" />
              <circle cx="11" cy="13" r="1.5" />
            </svg>
          </span>

          {/* Expand/collapse arrow */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleExpand()
              }}
              className="w-4 h-4 flex-shrink-0 flex items-center justify-center"
            >
              <svg
                className={clsx(
                  "w-3 h-3 transition-transform",
                  isExpanded && "rotate-90",
                )}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          ) : (
            <span className="w-4 h-4 flex-shrink-0" />
          )}

          {/* Icon or emoji */}
          {collection.emoji ? (
            <span className="flex-shrink-0">{collection.emoji}</span>
          ) : (
            <svg
              className={clsx(
                "w-4 h-4 flex-shrink-0",
                depth === 0
                  ? COLLECTION_COLORS[colorIndex].primary
                  : COLLECTION_COLORS[colorIndex].secondary,
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
          )}

          <span className="flex-1 truncate">{collection.name}</span>

          {/* SVG count */}
          <span className="text-xs text-gray-400">
            {countSvgsDeep(collection)}
          </span>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <ul className="mt-1 space-y-1">
            {activeChildren.map((child) => (
              <CollectionItem
                key={child.id}
                collection={child}
                isActive={child.id === activeCollectionId}
                isExpanded={expandedIds.has(child.id)}
                activeCollectionId={activeCollectionId}
                onSelect={() => onSelectChild(child.id)}
                onDelete={() => onDeleteChild(child.id)}
                onRename={(name) => onRenameChild(child.id, name)}
                onArchive={() => onArchiveChild(child.id)}
                onCreateSub={() => onCreateSubChild(child.id)}
                onToggleExpand={() => onToggleExpandChild(child.id)}
                expandedIds={expandedIds}
                onSelectChild={onSelectChild}
                onDeleteChild={onDeleteChild}
                onRenameChild={onRenameChild}
                onArchiveChild={onArchiveChild}
                onCreateSubChild={onCreateSubChild}
                onToggleExpandChild={onToggleExpandChild}
                onMoveCollection={onMoveCollection}
                onMoveSvgToCollection={onMoveSvgToCollection}
                depth={depth + 1}
                colorIndex={colorIndex}
                draggedId={draggedId}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                dropTargetId={dropTargetId}
                onDropTargetChange={onDropTargetChange}
              />
            ))}
          </ul>
        )}
      </li>

      {/* Context Menu */}
      {showContextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={closeContextMenu} />
          <div
            className="fixed z-50 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          >
            <button
              onClick={() => {
                closeContextMenu()
                const name = prompt("Rename collection:", collection.name)
                if (name && name.trim()) {
                  onRename(name.trim())
                }
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Rename
            </button>
            <button
              onClick={() => {
                closeContextMenu()
                onCreateSub()
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Create sub-collection
            </button>
            {depth > 0 && (
              <button
                onClick={() => {
                  closeContextMenu()
                  onMoveCollection(collection.id, null)
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Move to root
              </button>
            )}
            <button
              onClick={() => {
                closeContextMenu()
                onArchive()
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Archive
            </button>
          </div>
        </>
      )}
    </>
  )
}

interface ArchivedCollectionItemProps {
  collection: Collection
  retentionDays: number
  onRestore: () => void
  onDelete: () => void
}

function ArchivedCollectionItem({
  collection,
  retentionDays,
  onRestore,
  onDelete,
}: ArchivedCollectionItemProps) {
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })

  // Calculate days remaining until auto-delete based on retention setting
  const daysRemaining = useMemo(() => {
    if (!collection.archivedAt) return 0
    const archivedDate = new Date(collection.archivedAt)
    const deleteDate = new Date(archivedDate)
    deleteDate.setDate(deleteDate.getDate() + retentionDays)
    const now = new Date()
    const diff = deleteDate.getTime() - now.getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
  }, [collection.archivedAt, retentionDays])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  return (
    <>
      <li
        className="group flex w-full items-center gap-2 text-sm font-normal leading-6 transition-all duration-300 ease-in-out rounded-md px-2 py-1 cursor-pointer text-gray-400 hover:bg-gray-50"
        onContextMenu={handleContextMenu}
      >
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
          />
        </svg>
        <span className="flex-1 truncate">{collection.name}</span>
        <span
          className="text-xs"
          title={`Auto-deletes in ${daysRemaining} days`}
        >
          {daysRemaining}d
        </span>
      </li>

      {/* Context Menu */}
      {showContextMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setShowContextMenu(false)}
          />
          <div
            className="fixed z-50 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          >
            <button
              onClick={() => {
                setShowContextMenu(false)
                onRestore()
              }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Restore
            </button>
            <button
              onClick={() => {
                setShowContextMenu(false)
                if (
                  confirm(
                    `Permanently delete "${collection.name}"? This cannot be undone.`,
                  )
                ) {
                  onDelete()
                }
              }}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Delete permanently
            </button>
          </div>
        </>
      )}
    </>
  )
}
