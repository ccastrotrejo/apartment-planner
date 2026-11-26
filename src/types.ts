export type Axis = 'x' | 'y';
export type Compass = 'N' | 'E' | 'S' | 'W';

export type Vec2 = readonly [number, number];
/** Axis-aligned rectangle in plan inches: [x0, z0, x1, z1] with x0 <= x1 and z0 <= z1 */
export type Rect4 = readonly [number, number, number, number];
/** Local hit rectangle on furniture axes: [x0, x1, z0, z1] relative to center */
export type HitRect = readonly [number, number, number, number];

export interface MeasurementSpec {
  readonly axis: Axis;
  readonly a: string;
  readonly b: string;
  readonly inches: number;
  readonly use: 'used' | 'check';
  readonly note: string;
}

export interface WindowDef {
  readonly rect: readonly [string, string, string, string];
  readonly kind: 'sill' | 'full';
  readonly name: string;
}

export interface DoorDef {
  readonly name: string;
  readonly hinge: readonly [string, string];
  readonly tip: readonly [string, string];
  readonly swing: Vec2;
}

export interface SliderDef {
  readonly name: string;
  readonly x: readonly [string, string];
  readonly y: readonly [string, string];
}

export interface FixtureDef {
  readonly name: string;
  readonly rect: readonly [string | number, string | number, string | number, string | number];
  readonly frame?: readonly [string, string, string, string];
  readonly h: number;
  readonly kind?: 'cabinets' | 'range' | 'fridge' | 'peninsula' | 'vanity' | 'tub' | 'shower' | 'toilet' | 'appliance';
  readonly front?: Compass;
  readonly shape?: 'oval';
  readonly sink?: readonly [number, number, number, number];
  readonly overhang?: { readonly face: Compass; readonly inches: number };
  readonly glass?: Compass;
}

export interface RoomLabelDef {
  readonly name: string;
  readonly at: Vec2;
  readonly size: readonly [string, string, string, string] | null;
}

export type PlacementTuple = readonly [piece: string, x: number, z: number, r: number];

export interface LayoutIdea {
  readonly name: string;
  readonly note: string;
  readonly items: PlacementTuple[];
}

export interface ApartmentSpec {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly totalSf: number;
  readonly wallHeight: number;
  readonly sillHeight: number;
  readonly meas: Record<string, MeasurementSpec>;
  readonly pxX: Record<string, number>;
  readonly pxY: Record<string, number>;
  readonly origin: { readonly x: string; readonly y: string };
  readonly walls: ReadonlyArray<readonly [string, string, string, string]>;
  readonly windows: ReadonlyArray<WindowDef>;
  readonly entryOpening: readonly [string, string, string, string];
  readonly doors: ReadonlyArray<DoorDef>;
  readonly sliders: ReadonlyArray<SliderDef>;
  readonly fixtures: ReadonlyArray<FixtureDef>;
  readonly rooms: ReadonlyArray<RoomLabelDef>;
  readonly wetFloors: ReadonlyArray<readonly [string, string, string, string]>;
  readonly wetDoors: ReadonlyArray<string>;
  readonly bathTile: readonly [string, string, string, string];
  readonly example: ReadonlyArray<PlacementTuple>;
  readonly guestMoves: Record<string, ReadonlyArray< readonly [number, number, number] >>;
  readonly ideas: ReadonlyArray<{
    readonly name: string;
    readonly note: string;
    readonly moves: Record<string, ReadonlyArray<readonly [number, number, number]>>;
  }>;
}

export interface SolvedWindow {
  readonly name: string;
  readonly kind: 'sill' | 'full';
  readonly r: Rect4;
}

export interface SolvedDoor {
  readonly name: string;
  readonly hinge: Vec2;
  readonly closed: Vec2;
  readonly open: Vec2;
  readonly r: number;
  readonly poly: Vec2[];
}

export interface SolvedFixture {
  readonly def: FixtureDef;
  readonly bounds: Rect4;
  readonly sinkBounds?: Rect4;
}

export interface Obstacle {
  readonly kind: 'wall' | 'window' | 'glass' | 'fixture';
  readonly name?: string;
  readonly r: Rect4;
  readonly low?: Rect4;
}

export interface SolvedRoom {
  readonly name: string;
  readonly at: Vec2;
  readonly size: readonly [number, number] | null;
  readonly measured: boolean;
}

export interface SolvedPlan {
  readonly spec: ApartmentSpec;
  readonly X: Record<string, number>;
  readonly Y: Record<string, number>;
  readonly bounds: Rect4;
  readonly footprint: Vec2[];
  readonly walls: Rect4[];
  readonly windows: SolvedWindow[];
  readonly entryBounds: Rect4;
  readonly doors: SolvedDoor[];
  readonly sliders: Vec2[][];
  readonly fixtures: SolvedFixture[];
  readonly obstacles: Obstacle[];
  readonly rooms: SolvedRoom[];
  readonly mainLayout: PlacementTuple[];
  readonly guestLayout: PlacementTuple[];
  readonly ideas: LayoutIdea[];
}

export type MaterialRole =
  | 'wood'
  | 'walnut'
  | 'oak'
  | 'fabric'
  | 'velvet'
  | 'linen'
  | 'knit'
  | 'leather'
  | 'metal'
  | 'darkMetal'
  | 'chrome'
  | 'brass'
  | 'paint'
  | 'screen'
  | 'bezel'
  | 'mirror'
  | 'ceramic'
  | 'terracotta'
  | 'soil'
  | 'plant'
  | 'plastic'
  | 'rubber'
  | 'rattan'
  | 'rug'
  | 'shade'
  | 'bulb'
  | 'mesh';

export interface FurnitureSpec {
  readonly key: string;
  readonly name: string;
  readonly group: string;
  readonly swatch: string;
  /** [width, depth, height] in real inches */
  readonly size: readonly [number, number, number];
  /** Primary local collision rectangle [x0, x1, z0, z1] */
  readonly hit: HitRect;
  /** Multi-rectangle collision footprint (e.g. L-sectional) */
  readonly hits?: ReadonlyArray<HitRect>;
  readonly minY?: number;
  readonly flat?: boolean;
  readonly seat?: boolean;
  readonly tuck?: boolean;
  readonly stack?: ReadonlyArray<string>;
  readonly deck?: number;
  readonly alt?: string;
  readonly altVerb?: string;
  readonly anchor?: 'back' | 'center';
  readonly hidden?: boolean;
  readonly libNote?: string;
  readonly note: string;
  readonly colors: Record<string, string>;
}

export interface ItemMessage {
  readonly text: string;
  readonly level: 'bad' | 'warn';
}

export interface PlacedItem {
  readonly id: number;
  readonly k: string;
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

export interface EvaluatedItem extends PlacedItem {
  readonly y: number;
  readonly on: number | null;
  readonly bad: boolean;
  readonly warn: boolean;
  readonly msgs: ItemMessage[];
  readonly hits: Vec2[][];
}

export interface ClearanceEntry {
  readonly gap: number;
  readonly mid: number;
  readonly at: number;
}

export type Clearances = Partial<Record<Compass, ClearanceEntry>>;

export interface SavedLayout {
  readonly id: string;
  readonly name: string;
  readonly at: number;
  readonly items: PlacementTuple[];
}
