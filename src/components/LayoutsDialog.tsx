import React, { useEffect, useRef, useState } from 'react';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import type { LayoutIdea, PlacementTuple, SavedLayout } from '../types';
import { decodeLayoutCode, encodeLayoutCode, sameLayoutItems } from '../utils/units';
import styles from '../App.module.css';

export interface LayoutsDialogProps {
  readonly open: boolean;
  readonly currentItems: ReadonlyArray<PlacementTuple>;
  readonly mainLayout: ReadonlyArray<PlacementTuple>;
  readonly ideas: ReadonlyArray<LayoutIdea>;
  readonly savedLayouts: ReadonlyArray<SavedLayout>;
  readonly activeSavedId: string | null;
  readonly onClose: () => void;
  readonly onLoadLayout: (items: PlacementTuple[], savedId?: string | null) => void;
  readonly onSaveNew: (name: string) => void;
  readonly onSaveCurrent: () => void;
  readonly onDeleteSaved: (id: string) => void;
}

export function LayoutsDialog({
  open,
  currentItems,
  mainLayout,
  ideas,
  savedLayouts,
  activeSavedId,
  onClose,
  onLoadLayout,
  onSaveNew,
  onSaveCurrent,
  onDeleteSaved,
}: LayoutsDialogProps) {
  const [nameInput, setNameInput] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [codeMessage, setCodeMessage] = useState('');
  const [copiedConfirm, setCopiedConfirm] = useState(false);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setSaveMessage('');
      setCodeMessage('');
      setArmedDeleteId(null);
      closeBtnRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const activeSaved = activeSavedId ? savedLayouts.find((l) => l.id === activeSavedId) : undefined;
  const hasUnsavedChanges = Boolean(activeSaved && !sameLayoutItems(activeSaved.items, currentItems));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'Tab' && sheetRef.current) {
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleSaveNew = (e: React.FormEvent) => {
    e.preventDefault();
    const fallback = `Layout ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
    const trimmed = nameInput.trim() || fallback;
    onSaveNew(trimmed);
    setNameInput('');
    setSaveMessage(`Saved “${trimmed}” in this browser.`);
  };

  const handleCopyCode = () => {
    const code = encodeLayoutCode(currentItems);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(
        () => {
          setCopiedConfirm(true);
          setCodeMessage('Copied layout code. Paste it anywhere to share.');
          setTimeout(() => setCopiedConfirm(false), 1600);
        },
        () => {
          setCodeInput(code);
          setCodeMessage('Copy the layout code from the field below.');
        },
      );
    } else {
      setCodeInput(code);
      setCodeMessage('Copy the layout code from the field below.');
    }
  };

  const handleOpenCode = () => {
    const decoded = decodeLayoutCode(codeInput, (k) => Boolean(FURNITURE_CATALOG[k]));
    if (!decoded) {
      setCodeMessage('Invalid layout code — copy the full text starting with A4: and try again.');
      return;
    }
    onLoadLayout(decoded, null);
    setCodeMessage('');
    onClose();
  };

  return (
    <div
      className={styles.sheetBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div ref={sheetRef} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="layouts-title">
        <div className={styles.sheetHeader}>
          <h2 id="layouts-title">Layouts</h2>
          <button ref={closeBtnRef} className={styles.closeBtn} type="button" aria-label="Close layouts dialog" onClick={onClose}>
            ×
          </button>
        </div>

        <div className={styles.mainBox}>
          <h4>Standard layout</h4>
          <p>
            Circulation-verified baseline layout with a 30″ walking path from the entry to every room, door, and
            appliance.
          </p>
          {!sameLayoutItems(mainLayout, currentItems) && (
            <div className={styles.rowBtns}>
              <button
                className={styles.btn}
                type="button"
                onClick={() => {
                  onLoadLayout([...mainLayout], null);
                  onClose();
                }}
              >
                Open Standard layout
              </button>
            </div>
          )}
        </div>

        <div>
          <h4>Layout ideas</h4>
          {ideas.map((idea) => {
            const isCurrent = sameLayoutItems(idea.items, currentItems);
            return (
              <div key={idea.name} className={styles.layRow}>
                <div>
                  <b>
                    {idea.name}
                    {isCurrent && <span className={styles.pill}>On screen</span>}
                  </b>
                  <small>{idea.note}</small>
                </div>
                <div className={styles.layActs}>
                  <button
                    className={styles.btn}
                    type="button"
                    aria-label={`Open ${idea.name} layout`}
                    onClick={() => {
                      onLoadLayout([...idea.items], null);
                      onClose();
                    }}
                  >
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div>
          <h4>Save current layout</h4>
          {hasUnsavedChanges && activeSaved && (
            <div className={styles.rowBtns} style={{ marginBottom: 8 }}>
              <button
                className={`${styles.btn} ${styles.primary}`}
                type="button"
                onClick={() => {
                  onSaveCurrent();
                  setSaveMessage(`Saved changes to “${activeSaved.name}”.`);
                }}
              >
                Save changes to “{activeSaved.name}”
              </button>
            </div>
          )}
          <form className={styles.saveForm} onSubmit={handleSaveNew}>
            <label className={styles.srOnly} htmlFor="layout-save-name">
              Layout name
            </label>
            <input
              id="layout-save-name"
              value={nameInput}
              maxLength={60}
              placeholder="Desk by corner window, open lounge…"
              onChange={(e) => setNameInput(e.target.value)}
            />
            <button className={styles.btn} type="submit">
              Save as new
            </button>
          </form>
          <p style={{ marginTop: 6 }}>Saved in this browser. Share any layout with a text code below.</p>
          {saveMessage && <div className={styles.statusMsg}>{saveMessage}</div>}
        </div>

        <div>
          <h4>Saved layouts</h4>
          {savedLayouts.length === 0 ? (
            <div className={styles.emptyState}>
              You haven’t saved a custom layout yet — enter a name above and choose “Save as new”.
            </div>
          ) : (
            savedLayouts.map((saved) => {
              const dateLabel = new Date(saved.at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
              const isArmed = armedDeleteId === saved.id;
              return (
                <div key={saved.id} className={styles.layRow}>
                  <div>
                    <b>
                      {saved.name}
                      {sameLayoutItems(saved.items, currentItems) && <span className={styles.pill}>On screen</span>}
                    </b>
                    <small>
                      {saved.items.length} pieces · saved {dateLabel}
                    </small>
                  </div>
                  <div className={styles.layActs}>
                    <button
                      className={styles.btn}
                      type="button"
                      onClick={() => {
                        onLoadLayout([...saved.items], saved.id);
                        onClose();
                      }}
                    >
                      Open
                    </button>
                    <button
                      className={styles.btn}
                      type="button"
                      onClick={() => {
                        if (!isArmed) {
                          setArmedDeleteId(saved.id);
                        } else {
                          onDeleteSaved(saved.id);
                          setArmedDeleteId(null);
                        }
                      }}
                    >
                      {isArmed ? 'Confirm delete' : 'Delete'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div>
          <h4>Start over</h4>
          <div className={styles.rowBtns}>
            <button
              className={styles.btn}
              type="button"
              onClick={() => {
                onLoadLayout([...mainLayout], null);
                onClose();
              }}
            >
              Reset to example layout
            </button>
            <button
              className={styles.btn}
              type="button"
              onClick={() => {
                onLoadLayout([], null);
                onClose();
              }}
            >
              Clear all furniture
            </button>
          </div>
          <p style={{ marginTop: 6 }}>Both actions can be undone with Cmd/Ctrl+Z.</p>
        </div>

        <div>
          <h4>Share as text code</h4>
          <p style={{ marginBottom: 8 }}>
            Copy a portable code for this layout and send it to anyone; paste a code below to open it.
          </p>
          <div className={styles.rowBtns} style={{ marginBottom: 8 }}>
            <button className={styles.btn} type="button" onClick={handleCopyCode}>
              {copiedConfirm ? '✓ Copied layout code' : 'Copy layout code'}
            </button>
          </div>
          <label className={styles.formLabel} htmlFor="layout-code-textarea">
            Paste layout code
          </label>
          <textarea
            id="layout-code-textarea"
            className={styles.codeArea}
            value={codeInput}
            placeholder="A4:..."
            onChange={(e) => setCodeInput(e.target.value)}
          />
          <div className={styles.rowBtns} style={{ marginTop: 8 }}>
            <button className={styles.btn} type="button" onClick={handleOpenCode}>
              Open pasted code
            </button>
          </div>
          {codeMessage && <div className={styles.statusMsg}>{codeMessage}</div>}
        </div>
      </div>
    </div>
  );
}
