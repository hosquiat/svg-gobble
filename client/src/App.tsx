import { useState, useCallback, useMemo, useEffect } from 'react'
import clsx from 'clsx'
import { Sidebar, UploadZone, SvgGrid, CreateCollectionModal, SvgEditor } from './components'
import type { GroupedSvg } from './components/SvgGrid'
import { SettingsPage } from './components/SettingsPage'
import { DuplicateWarningModal } from './components/DuplicateWarningModal'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useCollections, flattenCollections } from './hooks/useCollections'
import { useSettings } from './hooks/useSettings'
import { svgsApi } from './api/client'
import type { ExtractedSvg, DuplicateCheckResult } from './types'

type SortOption = 'none' | 'alpha-asc' | 'alpha-desc' | 'size-asc' | 'size-desc'

const CARD_SIZE_OPTIONS = [
  { value: 100, label: 'XS (100px)' },
  { value: 140, label: 'S (140px)' },
  { value: 192, label: 'M (192px)' },
  { value: 260, label: 'L (260px)' },
  { value: 340, label: 'XL (340px)' },
  { value: 400, label: 'XXL (400px)' },
]

function App() {
  const {
    collections,
    loading: collectionsLoading,
    createCollection,
    updateCollection,
    deleteCollection,
    archiveCollection,
    restoreCollection,
    addSvgs,
    updateSvg,
    deleteSvg,
    archiveSvg,
    restoreSvg: _restoreSvg,
    duplicateSvg,
    moveSvg,
    moveSvgs,
  } = useCollections()

  const { settings, updateSettings } = useSettings()

  const [activeCollectionId, setActiveCollectionId] = useLocalStorage<string | null>('active-collection', null)
  const [activeView, setActiveView] = useLocalStorage<'collection' | 'all-svgs'>('active-view', 'collection')

  // View settings (local, sync with server settings on load)
  const [showSizes, setShowSizes] = useLocalStorage('view-show-sizes', true)
  const [showNames, setShowNames] = useLocalStorage('view-show-names', true)
  const [cardSize, setCardSize] = useLocalStorage('view-card-size', 192)
  const [sortBy, setSortBy] = useLocalStorage<SortOption>('view-sort', 'none')

  // Sidebar state
  const [sidebarWidth, setSidebarWidth] = useLocalStorage('sidebar-width', 208)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('sidebar-collapsed', false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  // Dropdown states
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false)

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [pendingSvgs, setPendingSvgs] = useState<ExtractedSvg[]>([])
  const [pendingCollectionName, setPendingCollectionName] = useState('')

  // Editor state
  const [editingSvg, setEditingSvg] = useState<ExtractedSvg | null>(null)

  // Duplicate detection state
  const [duplicateResults, setDuplicateResults] = useState<DuplicateCheckResult[]>([])
  const [pendingUploadSvgs, setPendingUploadSvgs] = useState<ExtractedSvg[]>([])
  const [showDuplicateModal, setShowDuplicateModal] = useState(false)

  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')

  // Selection state (lifted from SvgGrid)
  const [selectedSvgIds, setSelectedSvgIds] = useState<Set<string>>(new Set())

  // Flatten collections to get all including children
  const allCollections = useMemo(() => flattenCollections(collections), [collections])

  // Find active collection in flattened list
  const activeCollection = useMemo(() => {
    if (!activeCollectionId) return null
    return allCollections.find((c) => c.id === activeCollectionId) || null
  }, [allCollections, activeCollectionId])

  // Set default active collection on load
  useEffect(() => {
    if (!activeCollectionId && allCollections.length > 0) {
      const defaultCollection = allCollections.find(c => c.isDefault) || allCollections[0]
      setActiveCollectionId(defaultCollection.id)
    }
  }, [activeCollectionId, allCollections, setActiveCollectionId])

  // Sync settings from server
  useEffect(() => {
    if (settings) {
      setShowSizes(settings.showSizes)
      setShowNames(settings.showNames)
      setCardSize(settings.cardSize)
    }
  }, [settings, setShowSizes, setShowNames, setCardSize])

  // Helper to get all SVGs from a collection and its sub-collections (excluding archived SVGs)
  const getCollectionWithSubsSvgs = useCallback((collection: typeof activeCollection) => {
    if (!collection) return []

    const result: Array<{ svg: ExtractedSvg; collectionName: string; isSubCollection: boolean }> = []

    // Add parent collection SVGs first (filter out archived)
    for (const svg of collection.svgs) {
      if (!svg.archivedAt) {
        result.push({ svg, collectionName: collection.name, isSubCollection: false })
      }
    }

    // Add sub-collection SVGs
    const addSubCollectionSvgs = (children: typeof collection.children, depth = 1) => {
      if (!children) return
      for (const child of children) {
        if (!child.archivedAt) {
          for (const svg of child.svgs) {
            if (!svg.archivedAt) {
              result.push({ svg, collectionName: child.name, isSubCollection: true })
            }
          }
          if (child.children) {
            addSubCollectionSvgs(child.children, depth + 1)
          }
        }
      }
    }

    addSubCollectionSvgs(collection.children)
    return result
  }, [])

  // Grouped SVGs with collection info (for active collection view)
  const groupedSvgs = useMemo(() => {
    if (!activeCollection) return []
    return getCollectionWithSubsSvgs(activeCollection)
  }, [activeCollection, getCollectionWithSubsSvgs])

  // All SVGs across every non-archived collection, grouped by collection for the overview view
  const allGroupedSvgs = useMemo<GroupedSvg[]>(() => {
    const result: GroupedSvg[] = []
    for (const c of allCollections) {
      if (!c.archivedAt) {
        for (const svg of c.svgs) {
          if (!svg.archivedAt) {
            result.push({ svg, collectionName: c.name, isSubCollection: true })
          }
        }
      }
    }
    return result
  }, [allCollections])

  // Active grouped list depends on current view
  const activeGroupedSvgs = activeView === 'all-svgs' ? allGroupedSvgs : groupedSvgs

  // Filter and sort SVGs - search all collections when query is entered
  const filteredAndSortedSvgs = useMemo(() => {
    let svgs: ExtractedSvg[] = []

    // When searching, search across all collections (excluding archived SVGs)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      for (const collection of allCollections) {
        if (!collection.archivedAt) {
          const matching = collection.svgs.filter(svg =>
            !svg.archivedAt && svg.name.toLowerCase().includes(query)
          )
          svgs.push(...matching)
        }
      }
    } else {
      svgs = activeGroupedSvgs.map(g => g.svg)
    }

    // Apply sort
    if (sortBy === 'none') return svgs
    const sorted = [...svgs]
    switch (sortBy) {
      case 'alpha-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name))
      case 'alpha-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name))
      case 'size-asc':
        return sorted.sort((a, b) => new Blob([a.svg]).size - new Blob([b.svg]).size)
      case 'size-desc':
        return sorted.sort((a, b) => new Blob([b.svg]).size - new Blob([a.svg]).size)
      default:
        return svgs
    }
  }, [activeGroupedSvgs, allCollections, searchQuery, sortBy])

  // Clear selection when changing collections, view, or search
  useEffect(() => {
    setSelectedSvgIds(new Set())
  }, [activeCollectionId, activeView, searchQuery])

  // Selection handlers
  const toggleSvgSelection = useCallback((id: string) => {
    setSelectedSvgIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAllSvgs = useCallback(() => {
    const allIds = filteredAndSortedSvgs.map(svg => svg.id)
    setSelectedSvgIds(new Set(allIds))
  }, [filteredAndSortedSvgs])

  const clearSelection = useCallback(() => {
    setSelectedSvgIds(new Set())
  }, [])

  const isAllSelected = filteredAndSortedSvgs.length > 0 &&
    filteredAndSortedSvgs.every(svg => selectedSvgIds.has(svg.id))

  // Collection management
  const openCreateModal = (initialName = '', svgs: ExtractedSvg[] = []) => {
    setPendingCollectionName(initialName)
    setPendingSvgs(svgs)
    setShowCreateModal(true)
  }

  const handleCreateCollection = async (name: string, svgs: ExtractedSvg[]) => {
    try {
      const allSvgs = [...pendingSvgs, ...svgs]
      const collection = await createCollection({ name })
      if (allSvgs.length > 0) {
        await addSvgs(collection.id, allSvgs.map(s => ({ name: s.name, svg: s.svg, type: s.type })))
      }
      setActiveCollectionId(collection.id)
      setPendingSvgs([])
      setPendingCollectionName('')
    } catch (error) {
      console.error('Failed to create collection:', error)
    }
  }

  const handleDeleteCollection = useCallback(async (id: string) => {
    try {
      await deleteCollection(id)
      if (activeCollectionId === id) {
        const remaining = allCollections.filter((c) => c.id !== id)
        setActiveCollectionId(remaining.length > 0 ? remaining[0].id : null)
      }
    } catch (error) {
      console.error('Failed to delete collection:', error)
    }
  }, [activeCollectionId, allCollections, deleteCollection, setActiveCollectionId])

  const handleRenameCollection = useCallback(async (id: string, name: string) => {
    try {
      await updateCollection(id, { name })
    } catch (error) {
      console.error('Failed to rename collection:', error)
    }
  }, [updateCollection])

  const handleArchiveCollection = useCallback(async (id: string) => {
    try {
      await archiveCollection(id)
      if (activeCollectionId === id) {
        const remaining = allCollections.filter((c) => c.id !== id && !c.archivedAt)
        setActiveCollectionId(remaining.length > 0 ? remaining[0].id : null)
      }
    } catch (error) {
      console.error('Failed to archive collection:', error)
    }
  }, [activeCollectionId, allCollections, archiveCollection, setActiveCollectionId])

  const handleRestoreCollection = useCallback(async (id: string) => {
    try {
      await restoreCollection(id)
    } catch (error) {
      console.error('Failed to restore collection:', error)
    }
  }, [restoreCollection])

  // Inline name editing
  const startEditingName = () => {
    if (activeCollection && !activeCollection.isDefault) {
      setEditedName(activeCollection.name)
      setIsEditingName(true)
    }
  }

  const saveEditedName = async () => {
    if (activeCollection && editedName.trim() && editedName !== activeCollection.name) {
      await handleRenameCollection(activeCollection.id, editedName.trim())
    }
    setIsEditingName(false)
  }

  const cancelEditingName = () => {
    setIsEditingName(false)
    setEditedName('')
  }

  // Check for duplicates and upload SVGs
  const checkAndUploadSvgs = useCallback(async (svgs: ExtractedSvg[]) => {
    if (!activeCollectionId) {
      openCreateModal('New collection', svgs)
      return
    }

    try {
      // Check for duplicates
      const results = await svgsApi.checkDuplicates(
        svgs.map(s => s.svg),
        activeCollectionId
      )

      const hasDuplicates = results.some(r => r.isDuplicate)

      if (hasDuplicates) {
        setPendingUploadSvgs(svgs)
        setDuplicateResults(results)
        setShowDuplicateModal(true)
      } else {
        // No duplicates, upload directly
        await addSvgs(activeCollectionId, svgs.map(s => ({ name: s.name, svg: s.svg, type: s.type })))
      }
    } catch (error) {
      console.error('Failed to check duplicates:', error)
      // On error, upload anyway
      await addSvgs(activeCollectionId, svgs.map(s => ({ name: s.name, svg: s.svg, type: s.type })))
    }
  }, [activeCollectionId, addSvgs])

  const handleDuplicateAction = useCallback(async (action: 'skip' | 'add' | 'cancel') => {
    setShowDuplicateModal(false)

    if (action === 'cancel' || !activeCollectionId) {
      setPendingUploadSvgs([])
      setDuplicateResults([])
      return
    }

    const svgsToAdd = action === 'skip'
      ? pendingUploadSvgs.filter((_, i) => !duplicateResults[i]?.isDuplicate)
      : pendingUploadSvgs

    if (svgsToAdd.length > 0) {
      await addSvgs(activeCollectionId, svgsToAdd.map(s => ({ name: s.name, svg: s.svg, type: s.type })))
    }

    setPendingUploadSvgs([])
    setDuplicateResults([])
  }, [activeCollectionId, pendingUploadSvgs, duplicateResults, addSvgs])

  // SVG management
  const handleUpload = (svgs: ExtractedSvg[]) => {
    checkAndUploadSvgs(svgs)
  }

  const handleEditSvg = (svg: ExtractedSvg) => {
    setEditingSvg(svg)
  }

  const handleSaveEditedSvg = async (svg: ExtractedSvg) => {
    try {
      await updateSvg(svg.id, { name: svg.name, svg: svg.svg })
      setEditingSvg(null)
    } catch (error) {
      console.error('Failed to save SVG:', error)
    }
  }

  const handleSaveAsCopy = async (svg: ExtractedSvg) => {
    if (!activeCollectionId) return
    try {
      await addSvgs(activeCollectionId, [{ name: `${svg.name}-optimized`, svg: svg.svg, type: svg.type }])
      setEditingSvg(null)
    } catch (error) {
      console.error('Failed to save copy:', error)
    }
  }

  const handleDeleteSvg = useCallback(async (svgId: string) => {
    try {
      await deleteSvg(svgId)
    } catch (error) {
      console.error('Failed to delete SVG:', error)
    }
  }, [deleteSvg])

  const handleDuplicateSvg = useCallback(async (svg: ExtractedSvg) => {
    try {
      await duplicateSvg(svg.id)
    } catch (error) {
      console.error('Failed to duplicate SVG:', error)
    }
  }, [duplicateSvg])

  const handleMoveCollection = useCallback(async (collectionId: string, parentId: string | null) => {
    try {
      await updateCollection(collectionId, { parentId })
    } catch (error) {
      console.error('Failed to move collection:', error)
    }
  }, [updateCollection])

  const handleCreateSubCollection = useCallback(async (parentId: string) => {
    setPendingCollectionName('')
    setPendingSvgs([])
    // Set a flag to create as sub-collection
    const name = prompt('Enter sub-collection name:')
    if (name) {
      try {
        const collection = await createCollection({ name, parentId })
        setActiveCollectionId(collection.id)
      } catch (error) {
        console.error('Failed to create sub-collection:', error)
      }
    }
  }, [createCollection, setActiveCollectionId])

  // Get selected SVGs
  const selectedSvgs = useMemo(() => {
    return filteredAndSortedSvgs.filter(svg => selectedSvgIds.has(svg.id))
  }, [filteredAndSortedSvgs, selectedSvgIds])

  // Bulk operations for selected SVGs
  const copySelectedSvgs = useCallback(async () => {
    const svgContents = selectedSvgs.map(svg => svg.svg).join('\n\n')
    try {
      await navigator.clipboard.writeText(svgContents)
    } catch (error) {
      console.error('Failed to copy SVGs:', error)
    }
  }, [selectedSvgs])

  const downloadSelectedSvgs = useCallback(() => {
    selectedSvgs.forEach(svg => {
      const blob = new Blob([svg.svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${svg.name}.svg`
      a.click()
      URL.revokeObjectURL(url)
    })
  }, [selectedSvgs])

  const duplicateSelectedSvgs = useCallback(async () => {
    for (const svg of selectedSvgs) {
      try {
        await duplicateSvg(svg.id)
      } catch (error) {
        console.error('Failed to duplicate SVG:', error)
      }
    }
    clearSelection()
  }, [selectedSvgs, duplicateSvg, clearSelection])

  const archiveSelectedSvgs = useCallback(async () => {
    for (const svg of selectedSvgs) {
      try {
        await archiveSvg(svg.id)
      } catch (error) {
        console.error('Failed to archive SVG:', error)
      }
    }
    clearSelection()
  }, [selectedSvgs, archiveSvg, clearSelection])

  const moveSelectedSvgs = useCallback(async (toCollectionId: string) => {
    const svgIds = selectedSvgs.map(svg => svg.id)
    try {
      await moveSvgs(svgIds, toCollectionId)
      clearSelection()
    } catch (error) {
      console.error('Failed to move SVGs:', error)
    }
  }, [selectedSvgs, moveSvgs, clearSelection])

  // State for move dropdown in selection panel
  const [showMoveDropdown, setShowMoveDropdown] = useState(false)

  const closeAllMenus = () => {
    setViewMenuOpen(false)
    setSortMenuOpen(false)
    setSizeMenuOpen(false)
  }

  // Count total SVGs across all collections for search
  const totalSvgCount = useMemo(() => {
    return allCollections.reduce((sum, c) => sum + (c.archivedAt ? 0 : c.svgs.length), 0)
  }, [allCollections])
  const svgCount = searchQuery.trim() ? totalSvgCount : (activeCollection?.svgs.length || 0)
  const filteredCount = filteredAndSortedSvgs.length
  const currentSizeOption = CARD_SIZE_OPTIONS.find(o => o.value === cardSize) || CARD_SIZE_OPTIONS[2]

  if (collectionsLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <Sidebar
        collections={collections}
        activeCollectionId={activeCollectionId}
        onSelectCollection={(id) => {
          setActiveCollectionId(id)
          setActiveView('collection')
          setSidebarOpen(false) // Close on mobile after selecting
        }}
        onCreateCollection={() => openCreateModal()}
        onDeleteCollection={handleDeleteCollection}
        onRenameCollection={handleRenameCollection}
        onArchiveCollection={handleArchiveCollection}
        onRestoreCollection={handleRestoreCollection}
        onMoveCollection={handleMoveCollection}
        onCreateSubCollection={handleCreateSubCollection}
        onMoveSvgToCollection={async (svgId, collectionId) => {
          try {
            await moveSvg(svgId, collectionId)
          } catch (error) {
            console.error('Failed to move SVG:', error)
          }
        }}
        onOpenSettings={() => setShowSettingsModal(true)}
        archiveRetentionDays={settings.archiveRetentionDays}
        width={sidebarWidth}
        onWidthChange={setSidebarWidth}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onSelectAllView={() => {
          setActiveView('all-svgs')
          setSidebarOpen(false)
        }}
        isAllViewActive={activeView === 'all-svgs'}
        totalSvgCount={totalSvgCount}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Header */}
        <header className="flex-shrink-0 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-4 lg:px-6 py-3">
            {/* Mobile menu button + Collection Name */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {searchQuery.trim() ? (
                <h1 className="text-lg font-semibold text-gray-900">
                  Search Results
                </h1>
              ) : activeView === 'all-svgs' ? (
                <h1 className="text-lg font-semibold text-gray-900">All SVGs</h1>
              ) : (
                <>
                  {activeCollection?.isDefault && (
                    <span className="text-yellow-500" title="Default collection">&#9733;</span>
                  )}
                  {isEditingName ? (
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onBlur={saveEditedName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEditedName()
                        if (e.key === 'Escape') cancelEditingName()
                      }}
                      autoFocus
                      className="text-lg font-semibold text-gray-900 bg-transparent border-b-2 border-red-500 outline-none px-1"
                    />
                  ) : (
                    <h1
                      className={clsx(
                        'text-lg font-semibold text-gray-900',
                        activeCollection && !activeCollection.isDefault && 'cursor-pointer hover:text-red-600'
                      )}
                      onClick={startEditingName}
                      title={activeCollection && !activeCollection.isDefault ? 'Click to rename' : undefined}
                    >
                      {activeCollection?.name || 'No collection selected'}
                    </h1>
                  )}
                </>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 lg:gap-4">
              {/* Size dropdown - hidden on small screens */}
              <div className="relative hidden sm:block">
                <button
                  onClick={() => {
                    setSizeMenuOpen(!sizeMenuOpen)
                    setViewMenuOpen(false)
                    setSortMenuOpen(false)
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Size: {currentSizeOption.label.split(' ')[0]}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {sizeMenuOpen && (
                  <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50">
                    {CARD_SIZE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setCardSize(option.value)
                          setSizeMenuOpen(false)
                        }}
                        className={clsx(
                          'w-full text-left px-3 py-2 text-sm transition-colors',
                          cardSize === option.value
                            ? 'text-gray-900 font-medium bg-gray-50'
                            : 'text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* View dropdown - hidden on mobile */}
              <div className="relative hidden md:block">
                <button
                  onClick={() => {
                    setViewMenuOpen(!viewMenuOpen)
                    setSortMenuOpen(false)
                    setSizeMenuOpen(false)
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  View
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {viewMenuOpen && (
                  <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-2 z-50">
                    <label htmlFor="view-sizes" className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        id="view-sizes"
                        name="view-sizes"
                        checked={showSizes}
                        onChange={(e) => setShowSizes(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
                      />
                      <span className="text-sm text-gray-700">View SVG file sizes</span>
                    </label>
                    <label htmlFor="view-names" className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        id="view-names"
                        name="view-names"
                        checked={showNames}
                        onChange={(e) => setShowNames(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
                      />
                      <span className="text-sm text-gray-700">View SVG names</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Sort dropdown - hidden on mobile */}
              <div className="relative hidden md:block">
                <button
                  onClick={() => {
                    setSortMenuOpen(!sortMenuOpen)
                    setViewMenuOpen(false)
                    setSizeMenuOpen(false)
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Sort
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {sortMenuOpen && (
                  <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50">
                    {[
                      { value: 'none', label: 'None' },
                      { value: 'alpha-asc', label: 'Alphabetical: A to Z' },
                      { value: 'alpha-desc', label: 'Alphabetical: Z to A' },
                      { value: 'size-asc', label: 'File size: low to high' },
                      { value: 'size-desc', label: 'File size: high to low' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSortBy(option.value as SortOption)
                          setSortMenuOpen(false)
                        }}
                        className={clsx(
                          'w-full text-left px-3 py-2 text-sm transition-colors',
                          sortBy === option.value
                            ? 'text-gray-900 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Upload button */}
              <label
                htmlFor="header-upload"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                Upload +
                <input
                  type="file"
                  id="header-upload"
                  accept=".svg,image/svg+xml"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      const files = Array.from(e.target.files)
                      Promise.all(
                        files
                          .filter((f) => f.type === 'image/svg+xml' || f.name.endsWith('.svg'))
                          .map((file) =>
                            new Promise<ExtractedSvg | null>((resolve) => {
                              const reader = new FileReader()
                              reader.onload = (e) => {
                                const content = e.target?.result as string
                                if (content?.includes('<svg')) {
                                  resolve({
                                    id: Math.random().toString(36).substring(2, 15),
                                    name: file.name.replace(/\.svg$/i, ''),
                                    svg: content,
                                    type: 'uploaded',
                                  })
                                } else {
                                  resolve(null)
                                }
                              }
                              reader.readAsText(file)
                            })
                          )
                      ).then((results) => {
                        const validSvgs = results.filter((s): s is ExtractedSvg => s !== null)
                        if (validSvgs.length > 0) {
                          handleUpload(validSvgs)
                        }
                      })
                    }
                    e.target.value = ''
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Sub-header */}
          <div className="flex items-center justify-between px-6 py-2 border-t border-gray-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="select-all-svgs"
                name="select-all-svgs"
                checked={isAllSelected}
                onChange={(e) => {
                  if (e.target.checked) {
                    selectAllSvgs()
                  } else {
                    clearSelection()
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
              />
              <span className="text-sm text-gray-600">
                {selectedSvgIds.size > 0 ? `${selectedSvgIds.size} selected` : 'Select all'}
              </span>
            </label>
            <div className="flex items-center gap-4">
              {/* Search */}
              <div className="flex items-center">
                {searchOpen ? (
                  <div className="flex items-center gap-2">
                    <label htmlFor="search-svgs" className="sr-only">Search SVGs</label>
                    <input
                      type="text"
                      id="search-svgs"
                      name="search-svgs"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search SVGs..."
                      autoFocus
                      className="w-48 px-3 py-1 text-sm border border-gray-200 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <button
                      onClick={() => {
                        setSearchOpen(false)
                        setSearchQuery('')
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSearchOpen(true)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                )}
              </div>
              <span className="text-sm text-gray-500">
                {searchQuery.trim()
                  ? `Found ${filteredCount} results across all collections`
                  : `Showing ${filteredCount} of ${svgCount} results`}
              </span>
            </div>
          </div>
        </header>

        {/* Main Area */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          {/* Empty state - full screen drop zone (collection view only) */}
          {activeView !== 'all-svgs' && activeCollection && activeGroupedSvgs.length === 0 && (
            <UploadZone onUpload={handleUpload} fullScreen />
          )}

          {/* Compact drop zone when collection has SVGs (collection view only) */}
          {activeView !== 'all-svgs' && activeCollection && activeGroupedSvgs.length > 0 && (
            <UploadZone onUpload={handleUpload} compact />
          )}

          {/* SVG Grid */}
          {activeGroupedSvgs.length > 0 && (
            <SvgGrid
              svgs={filteredAndSortedSvgs}
              groupedSvgs={!searchQuery.trim() ? activeGroupedSvgs : undefined}
              collections={allCollections}
              currentCollectionId={activeCollectionId}
              onDeleteSvg={handleDeleteSvg}
              onArchiveSvg={async (id) => {
                try {
                  await archiveSvg(id)
                } catch (error) {
                  console.error('Failed to archive SVG:', error)
                }
              }}
              onEditSvg={handleEditSvg}
              onDuplicateSvg={handleDuplicateSvg}
              onRenameSvg={async (id, name) => {
                try {
                  await updateSvg(id, { name })
                } catch (error) {
                  console.error('Failed to rename SVG:', error)
                }
              }}
              onMoveSvg={async (svgId, toCollectionId) => {
                try {
                  await moveSvg(svgId, toCollectionId)
                } catch (error) {
                  console.error('Failed to move SVG:', error)
                }
              }}
              showSizes={showSizes}
              showNames={showNames}
              cardSize={cardSize}
              selectedIds={selectedSvgIds}
              onToggleSelect={toggleSvgSelection}
            />
          )}

          {/* No collection selected */}
          {!activeCollection && (
            <UploadZone onUpload={handleUpload} fullScreen />
          )}
        </main>

        {/* Selection Action Panel */}
        {selectedSvgIds.size > 0 && (
          <aside className="w-64 border-l border-gray-200 bg-white flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  {selectedSvgIds.size} Selected
                </h3>
                <button
                  onClick={clearSelection}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Selected SVGs preview */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 gap-2 mb-4">
                {selectedSvgs.slice(0, 9).map(svg => (
                  <div
                    key={svg.id}
                    className="aspect-square border border-gray-200 rounded-lg p-1 bg-white overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: svg.svg }}
                  />
                ))}
                {selectedSvgs.length > 9 && (
                  <div className="aspect-square border border-gray-200 rounded-lg flex items-center justify-center bg-gray-50 text-sm text-gray-500">
                    +{selectedSvgs.length - 9}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-gray-200 space-y-2">
              <button
                onClick={copySelectedSvgs}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy All
              </button>
              <button
                onClick={downloadSelectedSvgs}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download All
              </button>
              <button
                onClick={duplicateSelectedSvgs}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                </svg>
                Duplicate All
              </button>
              <button
                onClick={archiveSelectedSvgs}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Archive All
              </button>
              {/* Move to dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowMoveDropdown(!showMoveDropdown)}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    Move to
                  </span>
                  <svg className={clsx('w-4 h-4 transition-transform', showMoveDropdown && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showMoveDropdown && (
                  <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto">
                    {allCollections
                      .filter(c => !c.archivedAt && c.id !== activeCollectionId)
                      .map((coll) => (
                        <button
                          key={coll.id}
                          onClick={() => {
                            moveSelectedSvgs(coll.id)
                            setShowMoveDropdown(false)
                          }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          {coll.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Create Collection Modal */}
      <CreateCollectionModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setPendingSvgs([])
          setPendingCollectionName('')
        }}
        onCreate={handleCreateCollection}
        initialName={pendingCollectionName}
        initialSvgs={pendingSvgs}
      />

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsPage
          settings={settings}
          collections={allCollections}
          onUpdateSettings={updateSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Duplicate Warning Modal */}
      <DuplicateWarningModal
        isOpen={showDuplicateModal}
        duplicates={duplicateResults}
        svgs={pendingUploadSvgs}
        onAction={handleDuplicateAction}
      />

      {/* SVG Editor */}
      {editingSvg && (
        <SvgEditor
          svg={editingSvg}
          onSave={handleSaveEditedSvg}
          onSaveAsCopy={handleSaveAsCopy}
          onClose={() => setEditingSvg(null)}
        />
      )}

      {/* Click outside to close dropdowns */}
      {(viewMenuOpen || sortMenuOpen || sizeMenuOpen) && (
        <div
          className="fixed inset-0 z-40"
          onClick={closeAllMenus}
        />
      )}
    </div>
  )
}

export default App
