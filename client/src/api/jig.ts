// ---------------------------------------------------------------------------
// Types (mirroring server-side ParsedShape / LightBurnParseResult)
// ---------------------------------------------------------------------------

export interface ShapeBounds {
  x: number   // min X in mm
  y: number   // min Y in mm
  w: number   // width in mm
  h: number   // height in mm
  cx: number  // center X in mm
  cy: number  // center Y in mm
}

export interface ParsedShape {
  id: string
  type: string
  cutIndex: number
  bounds: ShapeBounds
  children?: ParsedShape[]
  label?: string
  hasPathChildren: boolean
}

export interface ParsedCutSetting {
  index: number
  name: string
  type: string
}

export interface LightBurnParseResult {
  appVersion: string
  mirrorX: boolean
  mirrorY: boolean
  cutSettings: ParsedCutSetting[]
  shapes: ParsedShape[]
  canvasBounds: ShapeBounds
  stats: { total: number; groups: number; paths: number; ellipses: number; text: number }
}

export interface JigSlot {
  id: string
  templateId: string
  slotIndex: number
  cx: number
  cy: number
  width: number
  height: number
  label: string | null
}

export interface JigTemplate {
  id: string
  name: string
  slotCount: number
  createdAt: string
  updatedAt: string
  slots: JigSlot[]
  // originalFile is only present when fetched individually (GET /:id)
  originalFile?: string
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

const BASE = '/api/jig-templates'

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Request failed')
  return data as T
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Request failed')
  return data as T
}

async function del(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE' })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Request failed')
}

async function put<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Request failed')
  return data as T
}

export const jigApi = {
  /** Parse a .lbrn2 file content and return the shape tree */
  async parseFile(content: string): Promise<LightBurnParseResult> {
    const data = await post<LightBurnParseResult & { success: boolean }>(`${BASE}/parse`, { content })
    return data
  },

  /** Save a new jig template */
  async create(payload: {
    name: string
    originalFile: string
    slots: Array<{ slotIndex: number; cx: number; cy: number; width: number; height: number; label?: string }>
  }): Promise<{ template: JigTemplate }> {
    return post(`${BASE}`, payload)
  },

  /** List all templates (without originalFile) */
  async list(): Promise<{ templates: JigTemplate[] }> {
    return get(`${BASE}`)
  },

  /** Get a single template (includes originalFile) */
  async getById(id: string): Promise<{ template: JigTemplate }> {
    return get(`${BASE}/${id}`)
  },

  /** Rename a template */
  async rename(id: string, name: string): Promise<{ template: JigTemplate }> {
    return put(`${BASE}/${id}`, { name })
  },

  /** Delete a template */
  async delete(id: string): Promise<void> {
    return del(`${BASE}/${id}`)
  },

  /** Generate a .lbrn2 file and return it as a Blob for download */
  async generate(payload: {
    templateId: string
    assignments: Array<{ slotIndex: number; svgId: string }>
    mode: 'full' | 'designs-only'
  }): Promise<Blob> {
    const res = await fetch('/api/jig/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as { error?: string }).error || 'Generation failed')
    }
    return res.blob()
  },
}
