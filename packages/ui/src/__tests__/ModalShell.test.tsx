import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalShell } from '../components/Modal';

describe('ModalShell Layout & Containment Primitive', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders modal dialog frame with strict max-h-[85dvh] container geometry and dark backdrop', () => {
    render(
      <ModalShell isOpen={true} onClose={vi.fn()} title="Test Modal" testID="test-modal">
        <p>Modal body content</p>
      </ModalShell>
    );

    const backdrop = screen.getByTestId('test-modal-backdrop');
    expect(backdrop).toBeTruthy();
    expect(backdrop.className).toContain('fixed inset-0 z-50 flex items-center justify-center');
    expect(backdrop.className).toContain('bg-black/70 backdrop-blur-sm');

    const frame = screen.getByTestId('test-modal');
    expect(frame).toBeTruthy();
    expect(frame.className).toContain('relative w-full max-w-md max-h-[85dvh] flex flex-col rounded-3xl bg-[#1A1A1A]');
    expect(frame.className).toContain('border border-stone-800 shadow-2xl overflow-hidden');
  });

  it('renders three-zone flex layout: pinned header, scrollable body with min-h-0, and pinned footer', () => {
    render(
      <ModalShell
        isOpen={true}
        onClose={vi.fn()}
        title="Pinned Title"
        subtitle="Pinned Subtitle"
        icon={<span data-testid="header-icon">✨</span>}
        footer={<button data-testid="submit-btn">Save</button>}
      >
        <div data-testid="scrollable-content">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} data-testid={`item-${i}`}>
              Item #{i + 1}
            </div>
          ))}
        </div>
      </ModalShell>
    );

    // Pinned Header
    const header = screen.getByTestId('modal-header');
    expect(header).toBeTruthy();
    expect(header.className).toContain('shrink-0');
    expect(header.className).toContain('border-b border-white/5');
    expect(screen.getByText('Pinned Title')).toBeTruthy();
    expect(screen.getByText('Pinned Subtitle')).toBeTruthy();
    expect(screen.getByTestId('header-icon')).toBeTruthy();

    // Scrollable Body with flex-1 and min-h-0
    const body = screen.getByTestId('modal-body');
    expect(body).toBeTruthy();
    expect(body.className).toContain('flex-1 min-h-0 overflow-y-auto overscroll-contain');
    expect(body.className).toContain('scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent');
    expect(screen.getByTestId('item-0')).toBeTruthy();
    expect(screen.getByTestId('item-14')).toBeTruthy();

    // Pinned Footer
    const footer = screen.getByTestId('modal-footer');
    expect(footer).toBeTruthy();
    expect(footer.className).toContain('shrink-0');
    expect(footer.className).toContain('p-4');
    expect(footer.className).toContain('border-t border-white/5');
    expect(screen.getByTestId('submit-btn')).toBeTruthy();
  });

  it('renders accessible high-contrast text on the fixed dark frame without light-theme drift', () => {
    render(
      <ModalShell
        isOpen={true}
        onClose={vi.fn()}
        title="High Contrast Header"
        subtitle="Accessible subtitle text"
      >
        <p>Body copy</p>
      </ModalShell>
    );

    const subtitleEl = screen.getByText('Accessible subtitle text');
    expect(subtitleEl.className).toContain('text-stone-400');
    expect(subtitleEl.className).not.toContain('text-stone-600');

    const closeBtn = screen.getByRole('button', { name: /Close dialog/i });
    expect(closeBtn.className).toContain('text-stone-400');
    expect(closeBtn.className).not.toContain('text-stone-700');
  });

  it('manages body scroll locking with reference counting across multiple overlapping modals', () => {
    const handleCloseA = vi.fn();
    const handleCloseB = vi.fn();

    const { rerender } = render(
      <>
        <ModalShell isOpen={true} onClose={handleCloseA} title="Modal A" testID="modal-a">
          <p>Modal A</p>
        </ModalShell>
        <ModalShell isOpen={true} onClose={handleCloseB} title="Modal B" testID="modal-b">
          <p>Modal B</p>
        </ModalShell>
      </>
    );

    expect(document.body.style.overflow).toBe('hidden');

    // Close Modal A first; Modal B remains open
    rerender(
      <>
        <ModalShell isOpen={false} onClose={handleCloseA} title="Modal A" testID="modal-a">
          <p>Modal A</p>
        </ModalShell>
        <ModalShell isOpen={true} onClose={handleCloseB} title="Modal B" testID="modal-b">
          <p>Modal B</p>
        </ModalShell>
      </>
    );

    // Body scroll must STILL be locked because Modal B is still open
    expect(document.body.style.overflow).toBe('hidden');

    // Close Modal B; now all modals are closed
    rerender(
      <>
        <ModalShell isOpen={false} onClose={handleCloseA} title="Modal A" testID="modal-a">
          <p>Modal A</p>
        </ModalShell>
        <ModalShell isOpen={false} onClose={handleCloseB} title="Modal B" testID="modal-b">
          <p>Modal B</p>
        </ModalShell>
      </>
    );

    // Body scroll lock is restored once all modals are closed
    expect(document.body.style.overflow).toBe('');
  });

  it('dismisses only the topmost modal when Escape is pressed on stacked dialogs', () => {
    const handleCloseA = vi.fn();
    const handleCloseB = vi.fn();

    render(
      <>
        <ModalShell isOpen={true} onClose={handleCloseA} title="Modal A" testID="modal-a">
          <p>Modal A</p>
        </ModalShell>
        <ModalShell isOpen={true} onClose={handleCloseB} title="Modal B" testID="modal-b">
          <p>Modal B</p>
        </ModalShell>
      </>
    );

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });

    // ONLY Modal B (top of stack) receives the dismiss event; Modal A remains open
    expect(handleCloseB).toHaveBeenCalledTimes(1);
    expect(handleCloseA).not.toHaveBeenCalled();
  });

  it('traps Tab focus inside the active modal container', () => {
    render(
      <ModalShell isOpen={true} onClose={vi.fn()} title="Focus Trap" testID="trap-modal">
        <button data-testid="btn-first">First Action</button>
        <button data-testid="btn-second">Second Action</button>
      </ModalShell>
    );

    const closeBtn = screen.getByRole('button', { name: /Close dialog/i });
    const firstBtn = screen.getByTestId('btn-first');
    const secondBtn = screen.getByTestId('btn-second');

    // Focus last element and press Tab
    secondBtn.focus();
    expect(document.activeElement).toBe(secondBtn);

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: false });
    // Focus wraps to the first focusable element (closeBtn)
    expect(document.activeElement).toBe(closeBtn);

    // Shift + Tab on the first element wraps to the last element
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(secondBtn);
  });

  it('behaviorally isolates scroll wheel events to prevent outer page scroll bleed', () => {
    render(
      <ModalShell isOpen={true} onClose={vi.fn()} title="Scroll Isolation">
        <div style={{ height: 1000 }}>Long content</div>
      </ModalShell>
    );

    const body = screen.getByTestId('modal-body');
    Object.defineProperty(body, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(body, 'scrollHeight', { value: 1000, writable: true });
    Object.defineProperty(body, 'clientHeight', { value: 300, writable: true });

    // Wheel up at top of container (deltaY < 0) should be prevented to stop page bleed
    const wheelUpEvent = new WheelEvent('wheel', { deltaY: -50, bubbles: true, cancelable: true });
    body.dispatchEvent(wheelUpEvent);
    expect(wheelUpEvent.defaultPrevented).toBe(true);

    // Set scroll position to bottom
    body.scrollTop = 700;
    // Wheel down at bottom of container (deltaY > 0) should be prevented
    const wheelDownEvent = new WheelEvent('wheel', { deltaY: 50, bubbles: true, cancelable: true });
    body.dispatchEvent(wheelDownEvent);
    expect(wheelDownEvent.defaultPrevented).toBe(true);
  });

  it('triggers onClose when backdrop is clicked, but prevents close when clicking inside frame', () => {
    const handleClose = vi.fn();
    render(
      <ModalShell isOpen={true} onClose={handleClose} title="Click Test" testID="click-modal">
        <p>Inside content</p>
      </ModalShell>
    );

    const frame = screen.getByTestId('click-modal');
    fireEvent.click(frame);
    expect(handleClose).not.toHaveBeenCalled();

    const backdrop = screen.getByTestId('click-modal-backdrop');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not render when isOpen is false', () => {
    render(
      <ModalShell isOpen={false} onClose={vi.fn()} title="Hidden">
        <p>Invisible</p>
      </ModalShell>
    );

    expect(screen.queryByText('Hidden')).toBeNull();
  });
});
