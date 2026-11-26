# Apartment 3D Showcase & Furniture Planner

An interactive 3D apartment showcase and drag-and-drop floor-plan planner built with **TypeScript**, **React**, **Vite**, and **Three.js** (`@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` with `N8AO` ambient occlusion).

Residence A4 at Loden, Brooklyn (1 bed / 1 bath, 546 SF) is included as a complete reference model—derived from brochure room measurements and walkthrough finishes—with typed specs so additional apartments can be added cleanly.

![The planner in 3D with see-through walls](docs/screenshot.png)

## Quick start

```bash
pnpm install
pnpm run dev      # http://127.0.0.1:8765/
```

### Scripts

- `pnpm run dev` — Start the Vite development server with instant HMR
- `pnpm run build` — Type-check (`tsc -b`) and build the production bundle to `dist/`
- `pnpm test` — Run the Vitest circulation, geometry, and layout test suite
- `pnpm run typecheck` — Run strict TypeScript validation

## Features

- **Realistic 3D architecture & PBR materials:** Procedural albedo, bump, and roughness textures for European white-oak planks, concrete-look porcelain floor and wall tiles with recessed matte grout, veined Calacatta quartz countertops, rift-oak cabinetry, brushed stainless appliances, woven bouclé/linen upholstery, flatweave wool rugs, rattan cane webbing, clearcoat glazed porcelain, honed stone window sills, black aluminum mullions, door casings/headers, and `N8AO` ambient occlusion.
- **Interactive layout planning:**
  - Drag pieces in from the sidebar (each with an offscreen-rendered 3D thumbnail); drag on the floor to move, `R` / `Shift+R` to rotate, `F` or double-click to lift/lower two-state pieces (lift-top coffee table), `Delete` to remove, and `Cmd/Ctrl+Z` to undo.
  - Focus the stage and press `Enter` to cycle furniture selection, or use arrow keys (`Shift` for 6″ steps) when unlocked.
  - **Plan / 3D** toggles between a crisp orthographic architectural plan and the 3D view.
  - **4′ walls / Full** switches between a 4-foot cutaway and full 7′6″ walls (with upper cabinetry, lighting, mirror cabinet, shower glass, and doorway headers).
  - **See-through** ghosts exterior and interior walls so every room remains visible from any angle.
  - **Lock** freezes furniture so dragging orbits/pans freely without accidental edits.
- **Real-time clearance & circulation checks:** Red highlights wall/piece overlaps; amber warns on door swings and tight clearances. Built-in layouts are verified by `WalkCheck` for 30″ walking paths and 24″ furniture access.
- **Layouts & sharing:** Switch between **Standard**, **With guest**, and curated **Layout ideas**, save custom layouts in `localStorage`, or share portable `A4:...` text codes.

## Project structure

| Path | Purpose |
|---|---|
| `src/apartments/lodenA4.ts` | Typed apartment measurements, brochure coordinate solver, walls, openings, fixtures, and preset layouts |
| `src/furniture/catalog.ts` | Furniture dimensions, collision footprints, two-state variants, and PBR color/material palettes |
| `src/geometry/plan2d.ts` | 2D `clipper2-js` polygon booleans, offsets, SAT overlap math, and outward-normal 3D plan extrusions |
| `src/layout/walkCheck.ts` | 30″ circulation path and 24″ furniture-access validator |
| `src/layout/collision.ts` | Real-time overlap, door-swing, and N/E/S/W clearance engine |
| `src/scene/textures.ts` | Procedural canvas PBR textures (albedo, bump, and roughness maps) |
| `src/scene/materials.ts` | `MeshPhysicalMaterial` / `MeshStandardMaterial` presets for architecture and furniture |
| `src/scene/apartmentGeometries.ts` | 3D apartment shell, doors/casings/headers, windows, and multi-material kitchen/bath/laundry built-ins |
| `src/scene/furnitureGeometries.ts` | Sculpted Three.js builders for all 20 furniture pieces, contact shadows, and 3D library thumbnails |
| `src/scene/ApartmentScene.tsx` | On-demand R3F renderer, static shadow caching, `N8AO` post-processing, and zero-re-render ref overlays |
| `src/__tests__/planner.test.ts` | Vitest regression tests for floor-plan dimensions, circulation rules, and 3D mesh integrity |

## License

MIT — see `LICENSE`.

