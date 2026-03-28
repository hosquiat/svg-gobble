# Domino Jig Generator — Feature Plan

## Overview

A workflow inside SVG Gobble that allows:
1. Defining **reusable jig templates** from a `.lbrn2` file (marking engravable slot positions visually)
2. **Auto-filling** those slots with randomly selected SVGs from a collection
3. **Exporting** a ready-to-engrave `.lbrn2` file (full with jig geometry, or designs only)

---

## User Answers / Decisions Made

| Question | Decision |
|---|---|
| Slot model | Full domino = **one SVG per full tile** (both halves share one design) |
| Recess selection | **Click on them visually** in a rendered canvas |
| SVG repetition | **Yes — repeat from pool** (random, same SVG can fill multiple slots) |
| UI entry point | **Triggered from SVG multi-selection** → "Generate Jig File" button in selection panel |
| Template persistence | **Persistent in database** (named, reusable) |
| Output options | **Both**: (a) full file with jig geometry + designs, (b) designs only |

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│  CLIENT                                             │
│                                                     │
│  [SVG Collection] → select SVGs → [Generate Jig]   │
│                                         │           │
│                              ┌──────────▼──────────┐│
│                              │  Jig Generator UI   ││
│                              │  - pick template    ││
│                              │  - preview slots    ││
│                              │  - randomize        ││
│                              │  - export options   ││
│                              └──────────┬──────────┘│
│                                         │           │
│  [Template Editor] (sidebar section)    │           │
│  - upload .lbrn2                        │           │
│  - visual canvas (click slots)          │           │
│  - save template                        │           │
└──────────────────────┬──────────────────┼───────────┘
                       │                  │
┌──────────────────────▼──────────────────▼───────────┐
│  SERVER (Express / TypeScript)                      │
│                                                     │
│  POST /api/jig-templates/parse   ← .lbrn2 upload   │
│  POST /api/jig-templates         ← save template    │
│  GET  /api/jig-templates         ← list templates   │
│  GET  /api/jig-templates/:id     ← get template     │
│  DELETE /api/jig-templates/:id                      │
│  POST /api/jig/generate          ← produce file     │
│                                                     │
│  [LightBurn Parser]  → shape data → [Client]        │
│  [LightBurn Generator] ← SVG paths + slot defs      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  DATABASE (SQLite / Prisma)                         │
│                                                     │
│  JigTemplate { id, name, originalFile, slots[] }   │
│  JigSlot { id, templateId, index, x, y, w, h }     │
└─────────────────────────────────────────────────────┘
```

---

## LightBurn Format Notes

File: `data/domino-jig.lbrn2` (674KB XML)

### Shape inventory
- 808 total shapes
- 548 `Path` — boundary geometry (recess outlines, cut lines)
- 86 `Group` — containers for domino positions (candidate slots)
- 113 `Text` — variable-offset labels (e.g. `"0/6"`, `"0/7"` — domino pip counts)
- 61 `Ellipse` — decorative/reference shapes

### Key attributes
- **`XForm`**: affine matrix `a b c d tx ty`. All domino positions use `1 0 0 1 tx ty` (pure translation in mm)
- **`CutIndex`**: references a `CutSetting` layer. C00 (index 0) = engrave layer (currently hidden, `doOutput=0`)
- **`VertID` / `PrimID`**: reference global vertex/primitive pools — the primary technical challenge
- **`VariableOffset`**: on Text shapes (6–40+), used for domino pip labeling

### Coordinate system
- Units: millimeters
- File header: `MirrorX="True" MirrorY="True"` — coordinate flip must be accounted for
- X positions of domino slots step by ~31.34mm (regular grid)

### CutSettings in the file
| Index | Name | Type | Purpose |
|---|---|---|---|
| 0 | C00 | Scan | **Engrave layer** — where SVG designs go |
| 1 | TEXT | Scan | Text labels |
| 4 | NOKERF | Cut | Template jig cut |
| 10 | 2KERF | Cut | 2mm kerf cut |
| 27 | C27 | Cut | Template jig cut |

### Path encoding (VertList/PrimList)
- LightBurn uses its own bezier vertex format, NOT standard SVG path data
- VertList example: `V-8.3066406 -2.7949219c0x1c1x1V-8.199707 ...`
- Appears to encode: vertex position + control point handle types (smooth=1 vs explicit coordinates)
- Path shapes reference global VertList/PrimList by ID (`VertID`, `PrimID` attributes)
- BackupPath shapes have inline VertList (simpler to parse as reference)
- **This format must be fully decoded before SVG→LightBurn conversion can be built**

---

## Implementation Phases

### Phase 1 — LightBurn Parser (server-side) ⬅ START HERE
**Goal**: Parse `.lbrn2` → return simplified JSON shape data to client

Tasks:
- Parse XML using `fast-xml-parser` or `xml2js`
- Extract all shapes with their types and XForms
- Compute bounding boxes from XForm translations (sufficient for slot selection)
- Identify Group shapes as candidate domino slots
- Return payload: `{ shapes: [{ id, type, bounds: {x,y,w,h}, cutIndex, children[] }] }`

Files to create:
- `src/services/lightburnParser.ts`
- `src/routes/jig.ts` (handles `/api/jig-templates/parse` and `/api/jig-templates`)

**Note**: Do NOT need to decode VertList for this phase — XForm bounding boxes are sufficient for the visual editor.

---

### Phase 2 — Database Schema (Prisma)

Add to `prisma/schema.prisma`:

```prisma
model JigTemplate {
  id              String    @id @default(uuid())
  name            String
  originalFile    String    // full .lbrn2 XML content stored as text
  slotCount       Int
  slots           JigSlot[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model JigSlot {
  id          String      @id @default(uuid())
  templateId  String
  template    JigTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  slotIndex   Int         // order (0-based)
  cx          Float       // center X in mm (LightBurn coordinates)
  cy          Float       // center Y in mm (LightBurn coordinates)
  width       Float       // slot width in mm
  height      Float       // slot height in mm
  label       String?     // optional label from original file (e.g. "0/6")

  @@index([templateId])
}
```

Run: `npx prisma db push` after schema changes.

---

### Phase 3 — Template Editor UI (client-side)

**Entry point**: New "Jig Templates" section in sidebar (below collections)

**Page layout**:
- Left panel: list of saved templates (name, slot count, created date) + "New Template" button
- Right panel: template editor canvas

**Template creation flow**:
1. Upload `.lbrn2` → POST `/api/jig-templates/parse` → receive shape data
2. Canvas renders shapes as scaled bounding boxes (coordinate system: LightBurn mm → canvas px)
3. User clicks Group shapes to mark as slots (highlighted on click, toggle off to unmark)
4. Slot count shown live ("12 slots marked")
5. Name the template → "Save Template" → POST `/api/jig-templates`

**Canvas rendering**:
- Scale factor: fit the bounding box of all shapes into the canvas dimensions
- Render Paths/Groups as outlined rectangles (no need for exact bezier rendering)
- Groups = clickable slot candidates (show in blue, turn green when selected as slot)
- Other shapes (Text, Ellipse, non-group Paths) = grey/dim (not selectable)

**Files to create**:
- `client/src/components/JigTemplateEditor.tsx`
- `client/src/components/JigCanvas.tsx` (the visual canvas component)
- `client/src/api/jig.ts` (API client for jig endpoints)
- `client/src/hooks/useJigTemplates.ts`

---

### Phase 4 — SVG → LightBurn Path Converter (server-side) ⬅ CRITICAL RESEARCH

**Goal**: Convert an SVG's path data into LightBurn's VertList/PrimList format

**Research spike needed first**:
- Decode the VertList format fully using the existing `domino-jig.lbrn2` paths as reference
- Look at known open-source tools: `lightburn-tools`, any Python/JS parsers that handle `.lbrn`
- Alternatively: prototype with a simple shape (rectangle) and verify it opens correctly in LightBurn

**Conversion pipeline**:
1. Parse SVG `<path d="...">` elements (use `svgpath` npm package)
2. Normalize all commands to absolute cubic bezier segments (`M`, `C`, `Z`)
3. Handle SVG transforms (`translate`, `scale`, `matrix`)
4. Compute SVG bounding box → scale/translate to fit slot bounding box (maintain aspect ratio, center)
5. Encode normalized beziers into LightBurn VertList/PrimList format
6. Wrap in `<Shape Type="Path" CutIndex="0">` with computed XForm

**SVG complexity handling**:
- Only support path-based SVGs (no `<image>`, `<use>`, CSS fills)
- Use SVGO (already in the stack) to normalize before conversion
- Handle `<circle>`, `<rect>`, `<ellipse>` → convert to path first
- Skip `<text>` elements (not suitable for laser engraving as paths)

**File to create**:
- `src/services/svgToLightburn.ts`

---

### Phase 5 — Production Generator UI (client-side)

**Entry point**: "Generate Jig File" button in the SVG selection panel (appears when ≥1 SVG selected)

**Modal/Page layout**:
1. **Template picker**: dropdown of saved templates (name, slot count)
2. **Assignment preview**: grid showing each slot with its assigned SVG thumbnail
   - Slots without enough SVGs repeat from the pool (random)
   - Unfilled slots shown as empty (if fewer SVGs than slots and repeat is off — N/A here since repeat is on)
3. **Controls**:
   - "Randomize" button → reshuffle all assignments
   - Per-slot override: click a slot → pick a specific SVG (later feature)
4. **Output options** (radio):
   - "Full file (jig + designs)"
   - "Designs only"
5. **Generate button** → POST `/api/jig/generate` → auto-download `.lbrn2`

**Files to create**:
- `client/src/components/JigGeneratorModal.tsx`
- `client/src/components/JigSlotPreview.tsx`

---

### Phase 6 — LightBurn File Generator (server-side)

**Goal**: Produce a valid `.lbrn2` file from template + SVG assignments

**"Full file" mode**:
1. Clone original `.lbrn2` XML from `JigTemplate.originalFile`
2. For each slot assignment, create a new `<Shape Type="Path" CutIndex="0">` from the converted SVG
3. Wrap all new shapes in a top-level `<Shape Type="Group">` (so LightBurn engraves them together)
4. Set `doOutput="1"` on C00 CutSetting in the output (override the hidden state)
5. Insert the Group into the XML → serialize back to `.lbrn2`

**"Designs only" mode**:
1. Create a minimal `.lbrn2` skeleton (AppVersion, FormatVersion, one CutSetting for engrave)
2. Add only the SVG path Groups at their correct positions
3. No jig geometry included

**Grouping strategy**:
- Each domino slot → one `<Shape Type="Group">` containing the SVG paths for that slot
- All slots → wrapped in one parent `<Shape Type="Group">` → LightBurn sees it as one job

**File to create**:
- `src/services/lightburnGenerator.ts`

---

## Risks & Open Questions

| Risk | Severity | Mitigation |
|---|---|---|
| VertList encoding unknown | HIGH | Research spike in Phase 4 before any UI is built |
| SVG complexity (non-path elements) | MEDIUM | SVGO normalization + whitelist of supported element types |
| Coordinate system flip (MirrorX/Y) | MEDIUM | Test with a known shape, verify position in LightBurn |
| Large originalFile storage in SQLite | LOW | File is ~674KB — acceptable for SQLite text field; if needed, move to filesystem |
| LightBurn version compatibility | LOW | Target format version "1" (as seen in the file header) |

---

## Build Order (recommended)

1. **Phase 1**: LightBurn parser + `/api/jig-templates/parse` endpoint
2. **Phase 2**: Prisma schema + migrations
3. **Phase 3**: Template Editor UI (canvas + save)
4. **Phase 4**: VertList research spike → SVG→LightBurn converter
5. **Phase 5**: Production Generator UI
6. **Phase 6**: LightBurn file generator + `/api/jig/generate` endpoint

---

## Files To Create (full list)

### Server
- `src/services/lightburnParser.ts`
- `src/services/svgToLightburn.ts`
- `src/services/lightburnGenerator.ts`
- `src/routes/jig.ts`

### Client
- `client/src/components/JigTemplateEditor.tsx`
- `client/src/components/JigCanvas.tsx`
- `client/src/components/JigGeneratorModal.tsx`
- `client/src/components/JigSlotPreview.tsx`
- `client/src/api/jig.ts`
- `client/src/hooks/useJigTemplates.ts`

### Database
- Schema additions to `prisma/schema.prisma` (JigTemplate, JigSlot models)

---

## Status

- [x] Planning complete
- [x] Phase 1: LightBurn parser — `src/services/lightburnParser.ts`, `src/routes/jig.ts`, mounted at `/api/jig-templates`
- [x] Phase 2: Database schema — `JigTemplate` + `JigSlot` models added to `prisma/schema.prisma`, `npx prisma db push` applied
- [x] Phase 3: Template Editor UI — `client/src/components/JigTemplateEditor.tsx`, `JigCanvas.tsx`, `client/src/api/jig.ts`, `client/src/hooks/useJigTemplates.ts`. Sidebar + App.tsx updated.
- [x] Phase 4: SVG → LightBurn converter — `src/services/svgToLightburn.ts`. Decodes VertList format (V x y c0x... c1x...), encodes SVG paths as LightBurn VertList/PrimList.
- [x] Phase 5: Production Generator UI — `client/src/components/JigGeneratorModal.tsx`, `JigSlotPreview.tsx`. "Generate Jig File" button in selection panel.
- [x] Phase 6: LightBurn file generator — `src/services/lightburnGenerator.ts`, `POST /api/jig/generate` endpoint (also accessible at `/api/jig-templates/generate`).

## VertList/PrimList Format (decoded from domino-jig.lbrn2)
- `V{x} {y}` = anchor vertex at (x, y)
- `c0x{val}` / `c0y{val}` = incoming bezier handle. Value `1` alone means smooth/auto. Explicit coords: `c0x{hx}c0y{hy}`
- `c1x{val}` / `c1y{val}` = outgoing bezier handle. Same encoding.
- `L{i} {j}` in PrimList = straight line from vertex i to j
- `B{i} {j}` in PrimList = cubic bezier from vertex i to j (vertex i's c1 = cp1, vertex j's c0 = cp2)
- Multiple sub-paths in one Shape: vertices are flat-indexed, PrimList entries can reference any index
- Closed path: last PrimList entry connects back to the first vertex of the sub-path (e.g. `L5 0`)
- MirrorY=True in template: negate Y coords of all design vertices before encoding

## Parser Notes (from real file testing)
- 808 shapes total (86 groups, 548 paths, 61 ellipses, 113 text) — matches grep count exactly
- VertCache (VertID:PrimID → LocalBounds) fixes shared-geometry paths that have no inline VertList
- Depth-1 Groups are the individual domino slot candidates (~20×20mm each)
- Depth-0 Groups are row/column containers (can be up to 396mm wide — users skip these)
- jig has 32 depth-1 group candidates; actual domino count TBD by user selection in template editor
- Canvas bounds: x=-16.9 y=-274 w=553 h=568 mm
