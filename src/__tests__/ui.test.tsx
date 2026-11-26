import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

// Mock the WebGL Canvas wrapper and offscreen WebGL thumbnail generator in jsdom
vi.mock('../scene/ApartmentScene', () => ({
  ApartmentScene: () => <div data-testid="mock-3d-stage" />,
}));
vi.mock('../scene/furnitureGeometries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scene/furnitureGeometries')>();
  return {
    ...actual,
    renderFurnitureThumbnails: vi.fn(async () => ({})),
  };
});

import { App } from '../App';

describe('Planner UI interactions', () => {
  it('toggles Lock state, switches Standard / With guest presets, and saves custom layouts', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    render(<App />);

    // Starts locked with Standard preset active
    const lockBtn = screen.getByRole('button', { name: /locked/i });
    expect(lockBtn.getAttribute('aria-pressed')).toBe('true');

    const stdBtn = screen.getByRole('button', { name: 'Standard' });
    const guestBtn = screen.getByRole('button', { name: 'With guest' });
    expect(stdBtn.getAttribute('aria-pressed')).toBe('true');

    // Switch to With guest preset
    await user.click(guestBtn);
    expect(guestBtn.getAttribute('aria-pressed')).toBe('true');

    // Unlock furniture and verify Undo becomes enabled
    await user.click(lockBtn);
    expect(screen.getByRole('button', { name: /^lock$/i }).getAttribute('aria-pressed')).toBe('false');
    const undoBtn = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(false);

    // Open Layouts dialog and save a named layout
    await user.click(screen.getByRole('button', { name: 'Layouts' }));
    expect(screen.getByRole('dialog', { name: 'Layouts' })).toBeTruthy();

    const nameInput = screen.getByLabelText('Layout name');
    await user.type(nameInput, 'Weekend hosting');
    await user.click(screen.getByRole('button', { name: 'Save as new' }));
    expect(screen.getByText(/Saved “Weekend hosting”/i)).toBeTruthy();
  });
});

describe('Planner persistence and dialog accessibility', () => {
  it('keeps an intentionally empty working layout across reloads', () => {
    localStorage.clear();
    localStorage.setItem('a4-planner-work-v1', '[]');
    render(<App />);
    expect(screen.getByRole('button', { name: 'Standard' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryAllByText(/^×\d+$/)).toHaveLength(0);
  });

  it('falls back to the Standard layout when stored data is corrupt', () => {
    localStorage.clear();
    localStorage.setItem('a4-planner-work-v1', '{"not":"a layout"}');
    localStorage.setItem('a4-planner-saved-v1', '"garbage"');
    render(<App />);
    expect(screen.getByRole('button', { name: 'Standard' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('makes the app inert while Layouts is open and returns focus to its trigger on close', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    render(<App />);
    const trigger = screen.getByRole('button', { name: 'Layouts' });
    await user.click(trigger);

    expect(trigger.closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('dialog', { name: 'Layouts' }).closest('[inert]')).toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Layouts' })).toBeNull();
    expect(trigger.closest('[inert]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
