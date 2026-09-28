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

  it('locks body scrolling while open and restores on unmount or close', () => {
    const { unmount } = render(
      <ModalShell isOpen={true} onClose={vi.fn()} title="Scroll Lock Test">
        <p>Body</p>
      </ModalShell>
    );

    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('');
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

  it('triggers onClose when dismiss close button or Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <ModalShell isOpen={true} onClose={handleClose} title="Escape Test">
        <p>Inside content</p>
      </ModalShell>
    );

    const closeBtn = screen.getByRole('button', { name: /Close modal/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);
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
