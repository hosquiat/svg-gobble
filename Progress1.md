# Domino Jig Generator — Session Progress

## Feature Status
All 6 phases of `JIG_PLAN.md` are **complete** (implementation done).

---

## Bugs Fixed This Session

### Bug 1 — 0 slot candidates detected
**Symptom**: Footer showed "0 slot candidates detected" (amber warning) after uploading `.lbrn2`.

**Root cause**: The bare-path filter in `orderedSlots` useMemo was `s.type === 'Path'` only. The `default-jig.lbrn2` has 56 top-level `Path` shapes — but the filter was too narrow in the initial code.

**Fix** (`client/src/components/JigTemplateEditor.tsx`):
- Widened the bare-path filter: now accepts any shape with `bounds.w > 0 && bounds.h > 0`
- Added `console.log` debug output to `orderedSlots` useMemo (browser DevTools → Console)
- Footer shows amber warning + "check browser console for details" when 0 candidates

---

### Bug 2 — Randomize produces a repeating pattern
**Symptom**: Clicking Randomize produced the same cyclic sequence (e.g. A B C A B C A B C…).

**Root cause**: Old `buildAssignment` shuffled the SVG pool once, then used `i % shuffled.length` to fill slots — cycling the same shuffled order.

**Fix** (`client/src/components/JigGeneratorModal.tsx`):
- Deleted `shuffle()` helper entirely
- Each slot independently picks `svgs[Math.floor(Math.random() * svgs.length)]`
- Repeats are allowed; every call to Randomize produces a truly independent random assignment

---

### Bug 3 — Full jig mode: designs missing. Designs-only mode: distorted
**Symptom** (from screenshot `data/design-output.png`):
- "Full" mode: only jig geometry appears, SVG designs invisible
- "Designs only" mode: SVG designs show but are in wrong orientation/position

**Root cause A — Full jig missing designs**:
`default-jig.lbrn2` has only `CutSetting index=4` (NOKERF cut layer). The generator injects shapes with `CutIndex="0"` but there was no corresponding `CutSetting` for index 0 in the file → LightBurn ignores those shapes.

**Root cause B — Designs-only distorted**:
The minimal skeleton was hardcoded `MirrorX="False" MirrorY="False"`. The template uses `MirrorX="True" MirrorY="True"`. Slot center coordinates and vertex Y-negation are computed in MirrorY=True space — placing them in a False-mirror skeleton misaligns everything.

**Fix** (`src/services/lightburnGenerator.ts`, `src/routes/jig.ts`):
- Added `mirrorX: boolean` to `GeneratorOptions` interface
- `buildMinimalSkeleton(mirrorX, mirrorY)` now uses template's actual mirror flags
- Added `ENGRAVE_CUT_SETTING` constant (type="Scan", index=0, C00, doOutput=1)
- `injectShapesIntoXml` now:
  1. If `<index Value="0"` already exists → try to flip `doOutput=0→1`
  2. If absent → inject `ENGRAVE_CUT_SETTING` before first `<Shape>` (or before closing tag)
- `jig.ts` route: detects `mirrorX` from `template.originalFile` alongside `mirrorY`, passes both to `generateLightBurnFile`

---

## Files Changed This Session

| File | Change |
|------|--------|
| `client/src/components/JigTemplateEditor.tsx` | Widened slot filter, added debug log, amber warning |
| `client/src/components/JigGeneratorModal.tsx` | Fixed random assignment (removed shuffle+modulo) |
| `src/services/lightburnGenerator.ts` | MirrorX/Y propagation, CutSetting injection |
| `src/routes/jig.ts` | Detect + pass mirrorX to generator |

---

## Pending / Next Steps

- [ ] **Restart server** (`npm run dev`) to hot-reload `lightburnGenerator.ts` and `jig.ts` changes
- [ ] **Test in LightBurn**: generate both "full" and "designs only" modes, confirm designs appear correctly positioned and oriented
- [ ] User note: "keep the original svg without updating it" — this is already the case (SVGs are read from DB, never modified). If there's a separate issue observed, investigate after confirming coordinate fixes work.
- [ ] Commit all changes once verified working

---

## Key Architecture Notes

- `default-jig.lbrn2`: 17KB, `MirrorX="True" MirrorY="True"`, 56 `Path` shapes, `CutIndex=4` only (no index 0)
- Vertex Y coords are negated in the converter when `mirrorY=True` (see `svgToLightburn.ts`)
- Slot center coords (`cx`, `cy`) are stored in LightBurn coordinate space (MirrorY applied)
- All 6 phases complete; feature is fully wired end-to-end
