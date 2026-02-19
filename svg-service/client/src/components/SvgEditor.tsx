import { useState, useCallback, useMemo } from 'react'
import { xml } from '@codemirror/lang-xml'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { optimize } from 'svgo'
import clsx from 'clsx'
import type { ExtractedSvg } from '../types'

interface SvgEditorProps {
  svg: ExtractedSvg
  onSave: (svg: ExtractedSvg) => void
  onSaveAsCopy: (svg: ExtractedSvg) => void
  onClose: () => void
}

interface SvgoPlugin {
  name: string
  label: string
  description: string
  active: boolean
}

const DEFAULT_PLUGINS: SvgoPlugin[] = [
  { name: 'cleanupAttrs', label: 'Cleanup Attributes', description: 'Remove whitespace from attributes', active: true },
  { name: 'removeDoctype', label: 'Remove Doctype', description: 'Remove doctype declaration', active: true },
  { name: 'removeXMLProcInst', label: 'Remove XML Instructions', description: 'Remove XML processing instructions', active: true },
  { name: 'removeComments', label: 'Remove Comments', description: 'Remove comments', active: true },
  { name: 'removeMetadata', label: 'Remove Metadata', description: 'Remove <metadata>', active: true },
  { name: 'removeTitle', label: 'Remove Title', description: 'Remove <title>', active: false },
  { name: 'removeDesc', label: 'Remove Description', description: 'Remove <desc>', active: true },
  { name: 'removeUselessDefs', label: 'Remove Useless Defs', description: 'Remove unused definitions', active: true },
  { name: 'removeEditorsNSData', label: 'Remove Editor Data', description: 'Remove editor namespaces and data', active: true },
  { name: 'removeEmptyAttrs', label: 'Remove Empty Attributes', description: 'Remove empty attributes', active: true },
  { name: 'removeEmptyContainers', label: 'Remove Empty Containers', description: 'Remove empty container elements', active: true },
  { name: 'cleanupIds', label: 'Cleanup IDs', description: 'Minify and remove unused IDs', active: true },
  { name: 'convertColors', label: 'Convert Colors', description: 'Convert color values to shorter form', active: true },
  { name: 'convertPathData', label: 'Convert Path Data', description: 'Optimize path data', active: true },
  { name: 'convertTransform', label: 'Convert Transforms', description: 'Collapse multiple transforms', active: true },
  { name: 'removeUnknownsAndDefaults', label: 'Remove Unknowns', description: 'Remove unknown elements and defaults', active: true },
  { name: 'removeNonInheritableGroupAttrs', label: 'Remove Non-Inheritable Attrs', description: 'Remove non-inheritable group attributes', active: true },
  { name: 'removeUselessStrokeAndFill', label: 'Remove Useless Stroke/Fill', description: 'Remove useless stroke and fill attributes', active: true },
  { name: 'removeUnusedNS', label: 'Remove Unused Namespaces', description: 'Remove unused namespaces', active: true },
  { name: 'mergePaths', label: 'Merge Paths', description: 'Merge multiple paths into one', active: false },
  { name: 'sortAttrs', label: 'Sort Attributes', description: 'Sort element attributes', active: false },
  { name: 'removeDimensions', label: 'Remove Dimensions', description: 'Remove width/height, add viewBox', active: false },
  { name: 'removeViewBox', label: 'Remove ViewBox', description: 'Remove viewBox attribute', active: false },
]

export function SvgEditor({ svg, onSave, onSaveAsCopy, onClose }: SvgEditorProps) {
  const [name, setName] = useState(svg.name)
  const [code, setCode] = useState(svg.svg)
  const [originalCode] = useState(svg.svg)
  const [plugins, setPlugins] = useState<SvgoPlugin[]>(DEFAULT_PLUGINS)
  const [prettify, setPrettify] = useState(true)
  const [previewBg, setPreviewBg] = useState<'checkerboard' | 'white' | 'black'>('checkerboard')

  // Zoom
  const [zoom, setZoom] = useState(100)

  // Copy feedback
  const [copiedReact, setCopiedReact] = useState(false)
  const [copiedDataUri, setCopiedDataUri] = useState(false)

  const getOriginalSize = () => new Blob([originalCode]).size
  const getCurrentSize = () => new Blob([code]).size
  const getSavingsPercent = () => {
    const original = getOriginalSize()
    const current = getCurrentSize()
    if (original === 0) return 0
    return Math.round(((original - current) / original) * 100)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(2)} KB`
  }

  const optimizeSvg = useCallback(() => {
    const activePlugins = plugins.filter((p) => p.active).map((p) => p.name) as string[]

    try {
      const result = optimize(code, {
        multipass: true,
        plugins: activePlugins as any,
        js2svg: {
          indent: 2,
          pretty: prettify,
        },
      })

      if (result.data) {
        setCode(result.data)
      }
    } catch (error) {
      console.error('SVGO optimization failed:', error)
    }
  }, [code, plugins, prettify])

  const resetCode = () => {
    setCode(originalCode)
  }

  const togglePlugin = (name: string) => {
    setPlugins((prev) =>
      prev.map((p) => (p.name === name ? { ...p, active: !p.active } : p))
    )
  }

  const handleSave = () => {
    onSave({
      ...svg,
      name,
      svg: code,
    })
  }

  const handleSaveAsCopy = () => {
    onSaveAsCopy({
      ...svg,
      name,
      svg: code,
    })
  }

  // Check if there are unsaved changes
  const hasChanges = code !== originalCode || name !== svg.name

  const handleClose = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close without saving?')) {
        onClose()
      }
    } else {
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose()
    }
    if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  // Generate React component code
  const reactCode = useMemo(() => {
    const componentName = name
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')

    // Extract SVG content and convert attributes
    let svgContent = code
      .replace(/class=/g, 'className=')
      .replace(/stroke-width=/g, 'strokeWidth=')
      .replace(/stroke-linecap=/g, 'strokeLinecap=')
      .replace(/stroke-linejoin=/g, 'strokeLinejoin=')
      .replace(/fill-rule=/g, 'fillRule=')
      .replace(/clip-rule=/g, 'clipRule=')
      .replace(/clip-path=/g, 'clipPath=')
      .replace(/font-size=/g, 'fontSize=')
      .replace(/font-family=/g, 'fontFamily=')
      .replace(/font-weight=/g, 'fontWeight=')
      .replace(/text-anchor=/g, 'textAnchor=')
      .replace(/stop-color=/g, 'stopColor=')
      .replace(/stop-opacity=/g, 'stopOpacity=')

    return `import React from 'react';

interface ${componentName}Props extends React.SVGProps<SVGSVGElement> {}

export const ${componentName}: React.FC<${componentName}Props> = (props) => (
  ${svgContent.replace(/<svg/, '<svg {...props}').trim()}
);

export default ${componentName};`
  }, [code, name])

  // Generate Data URI
  const dataUri = useMemo(() => {
    const encoded = btoa(unescape(encodeURIComponent(code)))
    return `data:image/svg+xml;base64,${encoded}`
  }, [code])

  const copyReactCode = async () => {
    try {
      await navigator.clipboard.writeText(reactCode)
      setCopiedReact(true)
      setTimeout(() => setCopiedReact(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const copyDataUri = async () => {
    try {
      await navigator.clipboard.writeText(dataUri)
      setCopiedDataUri(true)
      setTimeout(() => setCopiedDataUri(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  // Zoom controls
  const zoomIn = () => setZoom((z) => Math.min(400, z + 25))
  const zoomOut = () => setZoom((z) => Math.max(25, z - 25))
  const resetZoom = () => setZoom(100)

  return (
    <div
      className="fixed inset-0 z-50 flex bg-gray-50"
      onKeyDown={handleKeyDown}
    >
      {/* Left Sidebar - Optimize Settings */}
      <aside className="w-72 border-r border-gray-200 flex flex-col bg-white">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-lg text-gray-900">Edit SVG</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Name */}
          <div className="mb-6">
            <label htmlFor="svg-name" className="block text-sm text-gray-600 mb-2">Name</label>
            <input
              type="text"
              id="svg-name"
              name="svg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900
                focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          {/* Size Info */}
          <div className="mb-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">Original</span>
              <span className="text-gray-900">{formatBytes(getOriginalSize())}</span>
            </div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-500">Current</span>
              <span className="text-gray-900">{formatBytes(getCurrentSize())}</span>
            </div>
            {getSavingsPercent() > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Savings</span>
                <span>{getSavingsPercent()}%</span>
              </div>
            )}
          </div>

          {/* Prettify */}
          <div className="mb-6">
            <label htmlFor="prettify-output" className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                id="prettify-output"
                name="prettify-output"
                checked={prettify}
                onChange={(e) => setPrettify(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
              />
              <span className="text-sm text-gray-700">Prettify output</span>
            </label>
          </div>

          {/* Optimize Button */}
          <button
            onClick={optimizeSvg}
            className="w-full mb-4 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg font-medium text-sm text-white transition-colors"
          >
            Optimize SVG
          </button>

          <button
            onClick={resetCode}
            className="w-full mb-6 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
          >
            Reset to Original
          </button>

          {/* SVGO Plugins */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Optimization Plugins</h3>
            <div className="space-y-2">
              {plugins.map((plugin) => (
                <label
                  key={plugin.name}
                  className="flex items-start gap-2 cursor-pointer group"
                  title={plugin.description}
                >
                  <input
                    type="checkbox"
                    checked={plugin.active}
                    onChange={() => togglePlugin(plugin.name)}
                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-500"
                  />
                  <span className="text-sm text-gray-600 group-hover:text-gray-900">
                    {plugin.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-200 space-y-2">
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg font-medium text-sm text-white transition-colors"
            >
              Save
            </button>
          </div>
          <button
            onClick={handleSaveAsCopy}
            className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
          >
            Save as Copy
          </button>
        </div>
      </aside>

      {/* Main Content - Combined View */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
        {/* Header with close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900">Preview &amp; Export</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-50">
          {/* Preview Section */}
          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">Preview</h4>
              <div className="flex items-center gap-4">
                {/* Background selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Background:</span>
                  {(['checkerboard', 'white', 'black'] as const).map((bg) => (
                    <button
                      key={bg}
                      onClick={() => setPreviewBg(bg)}
                      className={clsx(
                        'px-2 py-1 text-xs rounded transition-colors capitalize',
                        previewBg === bg
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      )}
                    >
                      {bg}
                    </button>
                  ))}
                </div>

                {/* Zoom controls */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={zoomOut}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Zoom out"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </button>
                  <button
                    onClick={resetZoom}
                    className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors min-w-12 text-center text-gray-700"
                  >
                    {zoom}%
                  </button>
                  <button
                    onClick={zoomIn}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Zoom in"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <div
              className={clsx(
                'flex items-center justify-center p-8 rounded-lg h-64 border border-gray-200',
                previewBg === 'checkerboard' && 'checkerboard',
                previewBg === 'white' && 'bg-white',
                previewBg === 'black' && 'bg-black'
              )}
            >
              <div
                className="svg-container"
                style={{
                  width: `${zoom}%`,
                  height: `${zoom}%`,
                  maxWidth: 'none',
                  maxHeight: 'none',
                }}
                dangerouslySetInnerHTML={{ __html: code }}
              />
            </div>
          </section>

          {/* SVG Code Section */}
          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">SVG Code</h4>
            </div>
            <div className="rounded-lg overflow-hidden border border-gray-200">
              <CodeMirror
                value={code}
                onChange={setCode}
                extensions={[xml(), EditorView.lineWrapping]}
                className="max-h-64"
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLine: true,
                  foldGutter: true,
                }}
              />
            </div>
          </section>

          {/* React Component Section */}
          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">React Component</h4>
              <button
                onClick={copyReactCode}
                className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors text-gray-700"
              >
                {copiedReact ? (
                  <>
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="rounded-lg overflow-hidden border border-gray-200">
              <CodeMirror
                value={reactCode}
                extensions={[EditorView.lineWrapping]}
                className="max-h-64"
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLine: false,
                  foldGutter: true,
                }}
                editable={false}
              />
            </div>
          </section>

          {/* Data URI Section */}
          <section className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">Data URI (Base64)</h4>
              <button
                onClick={copyDataUri}
                className="flex items-center gap-2 px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors text-gray-700"
              >
                {copiedDataUri ? (
                  <>
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Preview */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center">
                <img src={dataUri} alt={name} className="max-w-full max-h-32" />
              </div>
              {/* Data URI String */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                <code className="text-xs text-gray-600 break-all line-clamp-6">{dataUri}</code>
              </div>
            </div>
            {/* Usage Examples */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">HTML img tag:</p>
                <code className="text-xs text-gray-700 break-all">{`<img src="${dataUri.substring(0, 40)}..." alt="${name}" />`}</code>
              </div>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-xs text-gray-500 mb-1">CSS background:</p>
                <code className="text-xs text-gray-700 break-all">{`background-image: url('${dataUri.substring(0, 40)}...');`}</code>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
