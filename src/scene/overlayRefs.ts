import React from 'react';
import type { Compass } from '../types';

export interface OverlayDomRefs {
  readonly container: HTMLDivElement | null;
  readonly rooms: Array<HTMLDivElement | null>;
  readonly dims: Record<Compass, HTMLDivElement | null>;
  readonly tag: HTMLDivElement | null;
  readonly stageBox: HTMLElement | null;
  readonly card: HTMLElement | null;
}

export function createEmptyOverlayRefs(): React.MutableRefObject<OverlayDomRefs> {
  return {
    current: {
      container: null,
      rooms: [],
      dims: { N: null, E: null, S: null, W: null },
      tag: null,
      stageBox: null,
      card: null,
    },
  };
}
