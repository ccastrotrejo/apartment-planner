import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LODEN_A4_SPEC, migrateLegacyLayoutItems, solveApartmentPlan } from './apartments/lodenA4';
import { LayoutsDialog } from './components/LayoutsDialog';
import { SelectionCard } from './components/SelectionCard';
import { FURNITURE_CATALOG } from './furniture/catalog';
import { computeClearances, evaluateLayout } from './layout/collision';
import { ApartmentScene, type StageHandle } from './scene/ApartmentScene';
import type { PhotoModeApi } from './scene/PathTracedPhoto';
import { renderFurnitureThumbnails } from './scene/furnitureGeometries';
import { createEmptyOverlayRefs } from './scene/overlayRefs';
import type { Compass, PlacedItem, PlacementTuple, SavedLayout } from './types';
import {
  fmtFtIn,
  fmtInch,
  normAngle,
  sameLayoutItems,
  sanitizePlacementTuples,
  sanitizeSavedLayouts,
} from './utils/units';
import styles from './App.module.css';

const LS_WORK = 'a4-planner-work-v1';
const LS_SAVED = 'a4-planner-saved-v1';
const LS_LIB_COLLAPSED = 'a4-planner-lib-collapsed';

const isCatalogPiece = (key: string): boolean => Boolean(FURNITURE_CATALOG[key]);

/** Parses a localStorage entry; the result is untrusted and must be sanitized by the caller. */
function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable
  }
}

function tuplesToPlacedItems(tuples: ReadonlyArray<PlacementTuple>): PlacedItem[] {
  return migrateLegacyLayoutItems(tuples).map(([k, x, z, r], idx) => ({
    id: idx + 1,
    k,
    x,
    z,
    r,
  }));
}

function placedItemsToTuples(items: ReadonlyArray<PlacedItem>): PlacementTuple[] {
  return items.map((it) => [it.k, Math.round(it.x * 100) / 100, Math.round(it.z * 100) / 100, normAngle(it.r)]);
}

export function App() {
  const plan = useMemo(() => solveApartmentPlan(LODEN_A4_SPEC), []);

  const [items, setItems] = useState<PlacedItem[]>(() => {
    // `null` means first visit (or corrupt data); an empty array is a deliberately cleared room and is kept.
    const stored = sanitizePlacementTuples(readJson(LS_WORK), isCatalogPiece);
    return tuplesToPlacedItems(stored ?? plan.mainLayout);
  });
  const [history, setHistory] = useState<PlacementTuple[][]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<'3d' | 'plan'>('3d');
  const [fullWalls, setFullWalls] = useState(true);
  const [seeThrough, setSeeThrough] = useState(true);
  const [locked, setLocked] = useState(true);
  const [photoMode, setPhotoMode] = useState(false);
  const photoStatusRef = useRef<HTMLSpanElement | null>(null);
  const photoApiRef = useRef<PhotoModeApi | null>(null);
  const [libCollapsed, setLibCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_LIB_COLLAPSED) === '1';
    } catch {
      return false;
    }
  });
  const [libDrawerOpen, setLibDrawerOpen] = useState(false);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(() =>
    sanitizeSavedLayouts(readJson(LS_SAVED), isCatalogPiece),
  );
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [darkTheme, setDarkTheme] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false,
  );

  const stageRef = useRef<StageHandle>(null);
  const layoutsBtnRef = useRef<HTMLButtonElement>(null);
  const closeLayouts = useCallback(() => {
    setLayoutsOpen(false);
    layoutsBtnRef.current?.focus();
  }, []);
  const overlayRefs = useMemo(() => createEmptyOverlayRefs(), []);
  const nextIdRef = useRef(100);

  useEffect(() => {
    const maxExisting = items.reduce((m, it) => Math.max(m, it.id), 0);
    if (maxExisting >= nextIdRef.current) nextIdRef.current = maxExisting + 1;
  }, [items]);

  // Persist working layout
  useEffect(() => {
    writeJson(LS_WORK, placedItemsToTuples(items));
  }, [items]);

  // Persist saved layouts dictionary
  useEffect(() => {
    const map: Record<string, Omit<SavedLayout, 'id'>> = {};
    for (const s of savedLayouts) {
      map[s.id] = { name: s.name, at: s.at, items: s.items };
    }
    writeJson(LS_SAVED, map);
  }, [savedLayouts]);

  // System dark mode listener
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setDarkTheme(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Offscreen 3D furniture thumbnails
  useEffect(() => {
    const visibleKeys = Object.values(FURNITURE_CATALOG)
      .filter((d) => !d.hidden)
      .map((d) => d.key);
    const timer = window.setTimeout(() => {
      renderFurnitureThumbnails(visibleKeys)
        .then(setThumbnails)
        .catch(() => {});
    }, 40);
    return () => window.clearTimeout(timer);
  }, []);

  const layoutEval = useMemo(() => evaluateLayout(plan, items), [plan, items]);
  const clearances = useMemo(
    () => (selectedId !== null ? computeClearances(plan, layoutEval.evaluated, selectedId) : {}),
    [plan, layoutEval.evaluated, selectedId],
  );
  const selectedItem = useMemo(
    () => (selectedId !== null ? layoutEval.evaluated.find((i) => i.id === selectedId) ?? null : null),
    [layoutEval.evaluated, selectedId],
  );

  const pushSnapshot = useCallback((snap: PlacementTuple[]) => {
    setHistory((prev) => [...prev.slice(-39), snap]);
  }, []);

  const currentTuples = useMemo(() => placedItemsToTuples(items), [items]);
  const isStandardActive = sameLayoutItems(currentTuples, plan.mainLayout);
  const isGuestActive = sameLayoutItems(currentTuples, plan.guestLayout);

  const loadLayoutTuples = useCallback(
    (tuples: PlacementTuple[], savedId: string | null = null) => {
      pushSnapshot(placedItemsToTuples(items));
      setItems(tuplesToPlacedItems(tuples));
      setSelectedId(null);
      setActiveSavedId(savedId);
    },
    [items, pushSnapshot],
  );

  const undo = useCallback(() => {
    if (locked || history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setItems(tuplesToPlacedItems(last));
    setSelectedId(null);
  }, [locked, history]);

  const addPieceAt = useCallback(
    (pieceKey: string, x: number, z: number) => {
      if (locked || !FURNITURE_CATALOG[pieceKey]) return;
      pushSnapshot(placedItemsToTuples(items));
      const newId = nextIdRef.current++;
      setItems((prev) => [...prev, { id: newId, k: pieceKey, x: Math.round(x), z: Math.round(z), r: 0 }]);
      setSelectedId(newId);
    },
    [locked, items, pushSnapshot],
  );

  const moveItem = useCallback(
    (id: number, x: number, z: number, dragStartSnapshot?: boolean) => {
      if (locked) return;
      if (dragStartSnapshot) {
        pushSnapshot(placedItemsToTuples(items));
      }
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, x, z } : it)));
    },
    [locked, items, pushSnapshot],
  );

  const rotateSelected = useCallback(
    (deg: number) => {
      if (locked || selectedId === null) return;
      pushSnapshot(placedItemsToTuples(items));
      setItems((prev) =>
        prev.map((it) => (it.id === selectedId ? { ...it, r: normAngle(it.r + deg) } : it)),
      );
    },
    [locked, selectedId, items, pushSnapshot],
  );

  const duplicateSelected = useCallback(() => {
    if (locked || selectedId === null) return;
    const src = items.find((i) => i.id === selectedId);
    if (!src) return;
    pushSnapshot(placedItemsToTuples(items));
    const newId = nextIdRef.current++;
    setItems((prev) => [...prev, { id: newId, k: src.k, x: src.x + 12, z: src.z + 12, r: src.r }]);
    setSelectedId(newId);
  }, [locked, selectedId, items, pushSnapshot]);

  const removeSelected = useCallback(() => {
    if (locked || selectedId === null) return;
    pushSnapshot(placedItemsToTuples(items));
    setItems((prev) => prev.filter((i) => i.id !== selectedId));
    setSelectedId(null);
  }, [locked, selectedId, items, pushSnapshot]);

  const transformItem = useCallback(
    (id: number) => {
      if (locked) return;
      const target = items.find((i) => i.id === id);
      if (!target) return;
      const spec = FURNITURE_CATALOG[target.k];
      if (!spec?.alt) return;
      const nextSpec = FURNITURE_CATALOG[spec.alt];
      if (!nextSpec) return;

      pushSnapshot(placedItemsToTuples(items));
      let nx = target.x;
      let nz = target.z;
      if (spec.anchor === 'back') {
        const rad = (target.r * Math.PI) / 180;
        const shift = (nextSpec.size[1] - spec.size[1]) / 2;
        nx = Math.round((nx + Math.sin(rad) * shift) * 10) / 10;
        nz = Math.round((nz + Math.cos(rad) * shift) * 10) / 10;
      }
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, k: nextSpec.key, x: nx, z: nz } : i)));
      setSelectedId(id);
    },
    [locked, items, pushSnapshot],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (layoutsOpen) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea')) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        return;
      }
      if (locked || selectedId === null) return;

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        rotateSelected(e.shiftKey ? -15 : 15);
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        transformItem(selectedId);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelected();
      } else if (e.key.startsWith('Arrow')) {
        const step = e.shiftKey ? 6 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dz = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        if (dx !== 0 || dz !== 0) {
          e.preventDefault();
          pushSnapshot(placedItemsToTuples(items));
          setItems((prev) =>
            prev.map((it) => (it.id === selectedId ? { ...it, x: it.x + dx, z: it.z + dz } : it)),
          );
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [layoutsOpen, locked, selectedId, undo, rotateSelected, transformItem, removeSelected, items, pushSnapshot]);

  const handleCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' && items.length > 0) {
        e.preventDefault();
        const ids = items.map((i) => i.id);
        const curIdx = selectedId !== null ? ids.indexOf(selectedId) : -1;
        setSelectedId(ids[(curIdx + 1) % ids.length]);
      }
    },
    [items, selectedId],
  );

  // Piece counts & grouped catalog
  const pieceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of items) {
      const spec = FURNITURE_CATALOG[it.k];
      if (!spec) continue;
      const baseKey = spec.hidden && spec.alt ? spec.alt : it.k;
      counts[baseKey] = (counts[baseKey] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const groupedCatalog = useMemo(() => {
    const groups = new Map<string, Array<(typeof FURNITURE_CATALOG)[string]>>();
    for (const spec of Object.values(FURNITURE_CATALOG)) {
      if (spec.hidden) continue;
      if (!groups.has(spec.group)) groups.set(spec.group, []);
      groups.get(spec.group)!.push(spec);
    }
    return [...groups.entries()];
  }, []);

  const hintText = locked
    ? view === 'plan'
      ? 'Furniture is locked · drag anywhere to pan · scroll to zoom · click a piece to inspect'
      : 'Furniture is locked · drag anywhere to orbit, right-drag to pan · scroll to zoom'
    : view === 'plan'
      ? 'Drag a piece to move · R rotates · Delete removes · scroll to zoom, drag floor to pan'
      : 'Drag a piece to move · drag floor to orbit, right-drag to pan · scroll to zoom';

  const toggleLibCollapsed = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 899) {
      setLibDrawerOpen(false);
      return;
    }
    const next = !libCollapsed;
    setLibCollapsed(next);
    try {
      localStorage.setItem(LS_LIB_COLLAPSED, next ? '1' : '0');
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div
        className={styles.app}
        data-lib={libCollapsed ? 'collapsed' : 'open'}
        data-locked={locked ? 'true' : 'false'}
        inert={layoutsOpen}
      >
        <header className={styles.bar}>
          <div className={styles.brand}>
            <h1>{plan.spec.title}</h1>
            <span>{plan.spec.subtitle}</span>
          </div>

          <button
            className={`${styles.btn} ${styles.onlyNarrow}`}
            type="button"
            aria-controls="furniture-lib"
            aria-expanded={libDrawerOpen}
            onClick={() => setLibDrawerOpen((v) => !v)}
          >
            Add furniture
          </button>

          <div className={styles.seg} role="group" aria-label="Preset layout">
            <button
              type="button"
              aria-pressed={isStandardActive}
              onClick={() => loadLayoutTuples(plan.mainLayout, null)}
            >
              Standard
            </button>
            <button
              type="button"
              aria-pressed={isGuestActive}
              onClick={() => loadLayoutTuples(plan.guestLayout, null)}
            >
              With guest
            </button>
          </div>

          <div className={styles.seg} role="group" aria-label="Camera view">
            <button type="button" aria-pressed={view === 'plan'} onClick={() => setView('plan')}>
              Plan
            </button>
            <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
              3D
            </button>
          </div>

          <div className={styles.seg} role="group" aria-label="Wall height">
            <button
              type="button"
              aria-pressed={!fullWalls}
              title="Cutaway 4 ft walls"
              onClick={() => setFullWalls(false)}
            >
              4′ walls
            </button>
            <button
              type="button"
              aria-pressed={fullWalls}
              title="Full 7′6″ apartment walls"
              onClick={() => setFullWalls(true)}
            >
              Full
            </button>
          </div>

          <button
            className={styles.btn}
            type="button"
            aria-pressed={seeThrough}
            title="Ghost exterior and interior walls so every room stays visible from any angle"
            onClick={() => setSeeThrough((v) => !v)}
          >
            See-through
          </button>

          <button
            className={styles.btn}
            type="button"
            aria-pressed={locked}
            title={
              locked
                ? 'Furniture is locked: dragging orbits or pans the view. Click to unlock.'
                : 'Lock furniture so dragging only moves the camera'
            }
            onClick={() => setLocked((v) => !v)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" />
              <path
                d={locked ? 'M5 7V5a3 3 0 0 1 6 0v2' : 'M5 7V5a3 3 0 0 1 5.8-1.1'}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
            {locked ? 'Locked' : 'Lock'}
          </button>

          <button
            className={`${styles.chip} ${
              layoutEval.statusKind === 'bad'
                ? styles.chipBad
                : layoutEval.statusKind === 'warn'
                  ? styles.chipWarn
                  : styles.chipOk
            }`}
            type="button"
            onClick={() => {
              const target =
                layoutEval.evaluated.find((i) => i.bad) ?? layoutEval.evaluated.find((i) => i.warn);
              if (target) setSelectedId(target.id);
            }}
          >
            {layoutEval.statusKind === 'bad' ? '✕ ' : layoutEval.statusKind === 'warn' ? '⚠ ' : '✓ '}
            {layoutEval.statusText}
          </button>

          <button
            className={styles.btn}
            type="button"
            disabled={locked || history.length === 0}
            onClick={undo}
          >
            Undo
          </button>

          <button ref={layoutsBtnRef} className={styles.btn} type="button" onClick={() => setLayoutsOpen(true)}>
            Layouts
          </button>
        </header>

        <aside
          id="furniture-lib"
          className={styles.lib}
          data-open={libDrawerOpen ? 'true' : 'false'}
          aria-label="Furniture library"
        >
          <div className={styles.libHead}>
            <div className={styles.libIntro}>
              <h2>Furniture</h2>
              <p>
                {locked
                  ? 'Furniture is locked. Unlock it to add or rearrange pieces.'
                  : 'Drag a piece onto the apartment, or press + to place it in the center of the view.'}
              </p>
            </div>
            <button
              className={styles.libToggle}
              type="button"
              aria-expanded={!libCollapsed}
              aria-label={libCollapsed ? 'Expand furniture panel' : 'Collapse furniture panel'}
              title={libCollapsed ? 'Expand panel' : 'Collapse panel'}
              onClick={toggleLibCollapsed}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M10 3.5 5.5 8l4.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className={styles.libRail}>Furniture</span>
            </button>
          </div>

          <div className={styles.libList}>
            {groupedCatalog.map(([groupName, specs]) => (
              <React.Fragment key={groupName}>
                <div className={styles.grp}>{groupName}</div>
                {specs.map((spec) => {
                  const count = pieceCounts[spec.key] ?? 0;
                  const thumbUrl = thumbnails[spec.key];
                  return (
                    <div
                      key={spec.key}
                      className={styles.row}
                      draggable={!locked}
                      onDragStart={(e) => {
                        if (locked) return;
                        e.dataTransfer.setData('text/plain', spec.key);
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                    >
                      <span className={styles.thumb}>
                        {thumbUrl ? (
                          <img src={thumbUrl} alt="" />
                        ) : (
                          <span className={styles.swatch} style={{ background: spec.swatch }} />
                        )}
                      </span>
                      <div>
                        <div className={styles.rowName}>
                          {spec.name}
                          {count > 0 && <span className={styles.rowCount}>×{count}</span>}
                        </div>
                        <div className={styles.rowDim}>
                          {fmtInch(spec.size[0])} × {fmtInch(spec.size[1])}
                          {spec.libNote ? ` · ${spec.libNote}` : ''}
                        </div>
                      </div>
                      <button
                        className={styles.addBtn}
                        type="button"
                        disabled={locked}
                        aria-label={`Add ${spec.name}`}
                        onClick={() => {
                          const center = stageRef.current?.getViewCenterFloorPoint() ?? [57, 96];
                          addPieceAt(spec.key, center[0], center[1]);
                          if (typeof window !== 'undefined' && window.innerWidth <= 899) {
                            setLibDrawerOpen(false);
                          }
                        }}
                      >
                        +
                      </button>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </aside>

        <main
          ref={(node) => {
            overlayRefs.current = { ...overlayRefs.current, stageBox: node };
          }}
          className={styles.stage}
        >
          <ApartmentScene
            plan={plan}
            items={layoutEval.evaluated}
            selectedId={selectedId}
            clearances={clearances}
            view={view}
            fullWalls={fullWalls}
            seeThrough={seeThrough}
            locked={locked}
            darkTheme={darkTheme}
            compactClass={styles.labelsCompact}
            tinyClass={styles.labelsTiny}
            overlayRefs={overlayRefs}
            stageRef={stageRef}
            onSelect={setSelectedId}
            onMoveItem={moveItem}
            onEndMoveItem={() => {}}
            onTransformItem={transformItem}
            onDropPieceAt={addPieceAt}
            onCanvasKeyDown={handleCanvasKeyDown}
            photoMode={photoMode}
            photoStatusRef={photoStatusRef}
            photoApiRef={photoApiRef}
          />

          {/* Projected room labels, clearance callouts, and selection tag (GPU translate3d via direct refs) */}
          <div
            ref={(node) => {
              overlayRefs.current = { ...overlayRefs.current, container: node };
            }}
            className={styles.labels}
          >
            {plan.rooms.map((r, idx) => (
              <div
                key={`rm-${idx}`}
                ref={(node) => {
                  overlayRefs.current.rooms[idx] = node;
                }}
                hidden
                className={styles.roomLabel}
              >
                <b>{r.name}</b>
                {r.size && (
                  <i>
                    {r.measured ? '' : 'est. '}
                    {fmtFtIn(r.size[0])} × {fmtFtIn(r.size[1])}
                  </i>
                )}
              </div>
            ))}
            {(['N', 'E', 'S', 'W'] as Compass[]).map((dir) => (
              <div
                key={`dim-${dir}`}
                ref={(node) => {
                  overlayRefs.current.dims[dir] = node;
                }}
                hidden
                className={styles.dimBadge}
              />
            ))}
            <div
              ref={(node) => {
                overlayRefs.current = { ...overlayRefs.current, tag: node };
              }}
              hidden
              className={styles.pieceTag}
            />
          </div>

          <div className={styles.zoomStack}>
            <button
              className={styles.btn}
              type="button"
              aria-label="Zoom in"
              onClick={() => stageRef.current?.zoomBy(1.25)}
            >
              +
            </button>
            <button
              className={styles.btn}
              type="button"
              aria-label="Zoom out"
              onClick={() => stageRef.current?.zoomBy(0.8)}
            >
              −
            </button>
            <button
              className={styles.btn}
              type="button"
              aria-label="Fit apartment in view"
              title="Fit apartment"
              onClick={() => stageRef.current?.fitView()}
            >
              ⤢
            </button>
            {view === '3d' && (
              <button
                className={styles.btn}
                type="button"
                aria-label={photoMode ? 'Exit path-traced photo mode' : 'Render path-traced photo'}
                aria-pressed={photoMode}
                title="Path-traced photo"
                onClick={() => {
                  setSelectedId(null);
                  setPhotoMode((on) => !on);
                }}
              >
                ◉
              </button>
            )}
          </div>

          {photoMode && view === '3d' && (
            <div className={styles.photoBar} role="status">
              <span ref={photoStatusRef}>Path tracing…</span>
              <button
                className={styles.btn}
                type="button"
                onClick={() => {
                  const url = photoApiRef.current?.capture();
                  if (!url) return;
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'apartment-photo.png';
                  a.click();
                }}
              >
                Save PNG
              </button>
              <button className={styles.btn} type="button" onClick={() => setPhotoMode(false)}>
                Exit
              </button>
            </div>
          )}

          {!selectedItem && !(photoMode && view === '3d') && <div className={styles.hint}>{hintText}</div>}

          {selectedItem && (
            <SelectionCard
              item={selectedItem}
              clearances={clearances}
              locked={locked}
              positionSlot="br"
              cardRef={(node) => {
                overlayRefs.current = { ...overlayRefs.current, card: node };
              }}
              onDeselect={() => setSelectedId(null)}
              onTransform={() => transformItem(selectedItem.id)}
              onRotate={rotateSelected}
              onDuplicate={duplicateSelected}
              onRemove={removeSelected}
            />
          )}
        </main>
      </div>

      <LayoutsDialog
        open={layoutsOpen}
        currentItems={currentTuples}
        mainLayout={plan.mainLayout}
        ideas={plan.ideas}
        savedLayouts={savedLayouts}
        activeSavedId={activeSavedId}
        onClose={closeLayouts}
        onLoadLayout={loadLayoutTuples}
        onSaveNew={(name) => {
          const id = `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          const entry: SavedLayout = { id, name, at: Date.now(), items: currentTuples };
          setSavedLayouts((prev) => [entry, ...prev]);
          setActiveSavedId(id);
        }}
        onSaveCurrent={() => {
          if (!activeSavedId) return;
          setSavedLayouts((prev) =>
            prev.map((l) => (l.id === activeSavedId ? { ...l, at: Date.now(), items: currentTuples } : l)),
          );
        }}
        onDeleteSaved={(id) => {
          setSavedLayouts((prev) => prev.filter((l) => l.id !== id));
          if (activeSavedId === id) setActiveSavedId(null);
        }}
      />
    </>
  );
}
