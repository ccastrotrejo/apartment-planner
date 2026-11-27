export type QualityPreset = 'low' | 'high';

export const HDRI_OPTIONS = ['kloofendal_48d_partly_cloudy_puresky', 'lebombo'] as const;
export type HdriName = (typeof HDRI_OPTIONS)[number];

export type ToneMapName = 'neutral' | 'agx' | 'aces';

export interface RenderSettings {
  readonly preset: QualityPreset;
  readonly hdri: HdriName;
  readonly toneMap: ToneMapName;
}

const DEFAULT_HDRI: HdriName = 'kloofendal_48d_partly_cloudy_puresky';

/** Parse `?preset=low|high`, `?hdri=<name>` and `?tm=neutral|agx|aces` (used by the visual QA harness for A/B renders). */
export function renderSettingsFromQuery(search: string): RenderSettings {
  const params = new URLSearchParams(search);
  const preset: QualityPreset = params.get('preset') === 'low' ? 'low' : 'high';
  const h = params.get('hdri');
  const hdri = (HDRI_OPTIONS as readonly string[]).includes(h ?? '') ? (h as HdriName) : DEFAULT_HDRI;
  const tm = params.get('tm');
  const toneMap: ToneMapName = tm === 'agx' || tm === 'aces' ? tm : 'neutral';
  return { preset, hdri, toneMap };
}

/** CC0 HDRIs from Poly Haven live in public/hdri; resolve against Vite's base for GitHub Pages. */
export function hdriUrl(name: HdriName): string {
  return `${import.meta.env.BASE_URL}hdri/${name}_1k.hdr`;
}
