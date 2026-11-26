import React from 'react';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import type { Clearances, Compass, EvaluatedItem } from '../types';
import { facingLabel, fmtFtIn, fmtInch } from '../utils/units';
import styles from '../App.module.css';

export interface SelectionCardProps {
  readonly item: EvaluatedItem;
  readonly clearances: Clearances;
  readonly locked: boolean;
  readonly positionSlot: 'br' | 'bl' | 'tl' | 'b' | 't';
  readonly cardRef: React.Ref<HTMLElement>;
  readonly onDeselect: () => void;
  readonly onTransform: () => void;
  readonly onRotate: (deg: number) => void;
  readonly onDuplicate: () => void;
  readonly onRemove: () => void;
}

const COMPASS_LABELS: ReadonlyArray<readonly [Compass, string]> = [
  ['N', 'North'],
  ['E', 'East'],
  ['S', 'South'],
  ['W', 'West'],
];

export function SelectionCard({
  item,
  clearances,
  locked,
  positionSlot,
  cardRef,
  onDeselect,
  onTransform,
  onRotate,
  onDuplicate,
  onRemove,
}: SelectionCardProps) {
  const spec = FURNITURE_CATALOG[item.k];
  if (!spec) return null;

  return (
    <section
      ref={cardRef}
      className={styles.card}
      data-pos={positionSlot}
      aria-live="polite"
      aria-label={`Selected piece: ${spec.name}`}
    >
      <div className={styles.cardTop}>
        <span className={styles.swatch} style={{ background: spec.swatch }} aria-hidden="true" />
        <div>
          <h3>{spec.name}</h3>
          <div className={styles.meta}>
            {fmtInch(spec.size[0])} × {fmtInch(spec.size[1])} · {fmtInch(spec.size[2])} tall · faces{' '}
            {facingLabel(item.r)}
          </div>
        </div>
        <button className={styles.closeBtn} type="button" aria-label="Deselect piece" onClick={onDeselect}>
          ×
        </button>
      </div>

      {locked ? (
        <p className={styles.caption}>Furniture is locked. Unlock it to move or adjust this piece.</p>
      ) : (
        <div className={styles.tools}>
          {spec.alt && spec.altVerb && (
            <button
              className={`${styles.btn} ${styles.primary}`}
              type="button"
              title="Press F or double-click the piece"
              onClick={onTransform}
            >
              {spec.altVerb}
            </button>
          )}
          <button
            className={styles.btn}
            type="button"
            title="Rotate counterclockwise (Shift+R)"
            onClick={() => onRotate(-15)}
          >
            ⟲ 15°
          </button>
          <button
            className={styles.btn}
            type="button"
            title="Rotate clockwise (R)"
            onClick={() => onRotate(15)}
          >
            ⟳ 15°
          </button>
          <button className={styles.btn} type="button" onClick={() => onRotate(90)}>
            Turn 90°
          </button>
          <button className={styles.btn} type="button" onClick={onDuplicate}>
            Duplicate
          </button>
          <button className={styles.btn} type="button" title="Delete" onClick={onRemove}>
            Remove
          </button>
        </div>
      )}

      <div className={styles.clearGrid}>
        {COMPASS_LABELS.map(([dir, label]) => {
          const entry = clearances[dir];
          const isTight = Boolean(entry && entry.gap < 24 && entry.gap > 0.5);
          return (
            <div key={dir} className={isTight ? styles.tight : undefined}>
              <small>{label}</small>
              <span>{entry ? fmtFtIn(entry.gap) : '—'}</span>
            </div>
          );
        })}
      </div>
      <p className={styles.caption}>Clear space to the nearest wall or piece. Under 2′ is highlighted in amber.</p>

      {item.msgs.length > 0 && (
        <div className={styles.warns}>
          {item.msgs.map((m, idx) => (
            <div key={idx} className={m.level === 'bad' ? styles.msgBad : styles.msgWarn}>
              <span aria-hidden="true">{m.level === 'bad' ? '✕ ' : '⚠ '}</span>
              {m.text}
            </div>
          ))}
        </div>
      )}

      {spec.note && <div className={styles.note}>{spec.note}</div>}
    </section>
  );
}
