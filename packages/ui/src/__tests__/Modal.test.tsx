import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Modal, Dialog } from '../components/Modal/Modal';
import { BottomSheet } from '../components/BottomSheet/BottomSheet';
import { Select } from '../components/Dropdown/Select';

describe('Modal Primitive Component Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.style.overflow = '';
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.style.overflow = '';
  });

  it('renders nothing when isOpen is false', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={false} onClose={handleClose} title="Hidden Modal">
        <p>Modal body content</p>
      </Modal>
    );

    expect(screen.queryByTestId('canopy-modal')).toBeNull();
  });

  it('renders modal content in portal when isOpen is true', () => {
    const handleClose = vi.fn();
    render(
      <Modal
        isOpen={true}
        onClose={handleClose}
        title="Active Modal"
        subtitle="Test description"
        size="lg"
        footer={<button>Confirm</button>}
      >
        <p>Modal body content</p>
      </Modal>
    );

    expect(screen.getByTestId('canopy-modal')).toBeDefined();
    expect(screen.getByText('Active Modal')).toBeDefined();
    expect(screen.getByText('Test description')).toBeDefined();
    expect(screen.getByText('Modal body content')).toBeDefined();
    expect(screen.getByText('Confirm')).toBeDefined();
  });

  it('fires onClose callback when close button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Closable Modal">
        <p>Content</p>
      </Modal>
    );

    const closeBtn = screen.getByTestId('canopy-modal-close-btn');
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose callback when backdrop is clicked', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Backdrop Test">
        <p>Content</p>
      </Modal>
    );

    const backdrop = screen.getByTestId('canopy-modal-backdrop');
    fireEvent.click(backdrop);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('verifies Escape key fires onClose callback', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Escape Test">
        <p>Content</p>
      </Modal>
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('restores focus to trigger button upon close/unmount', () => {
    function TestHarness() {
      const [isOpen, setIsOpen] = useState(false);
      return (
        <div>
          <button data-testid="open-trigger" onClick={() => setIsOpen(true)}>
            Open
          </button>
          <Modal
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            title="Focus Test"
            hideCloseButton
          >
            <button data-testid="inside-btn">Inside</button>
          </Modal>
        </div>
      );
    }

    render(<TestHarness />);

    const trigger = screen.getByTestId('open-trigger');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    // Open modal
    fireEvent.click(trigger);
    act(() => {
      vi.advanceTimersByTime(20);
    });

    // Focus moved into modal's inside button
    const insideBtn = screen.getByTestId('inside-btn');
    expect(document.activeElement).toBe(insideBtn);

    // Close modal via Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(20);
    });

    // Focus restored to trigger button
    expect(document.activeElement).toBe(trigger);
  });

  it('only traps Tab focus in the topmost modal when modals are stacked', () => {
    function StackedModals() {
      return (
        <div>
          <Modal isOpen={true} onClose={() => {}} title="Modal A" testID="modal-a">
            <button data-testid="btn-a1">A1</button>
            <button data-testid="btn-a2">A2</button>
          </Modal>
          <Modal isOpen={true} onClose={() => {}} title="Modal B" testID="modal-b">
            <button data-testid="btn-b1">B1</button>
            <button data-testid="btn-b2">B2</button>
          </Modal>
        </div>
      );
    }

    render(<StackedModals />);
    act(() => {
      vi.advanceTimersByTime(20);
    });

    const btnB2 = screen.getByTestId('btn-b2');
    const btnA1 = screen.getByTestId('btn-a1');

    btnB2.focus();
    expect(document.activeElement).toBe(btnB2);

    // Press Tab while focused on btnB2
    fireEvent.keyDown(window, { key: 'Tab' });

    // Focus must NOT be hijacked to background Modal A
    expect(document.activeElement).not.toBe(btnA1);
  });

  it('enforces viewport-bounded 85dvh scrollable geometry and Dialog alias', () => {
    render(
      <Dialog
        isOpen={true}
        onClose={vi.fn()}
        title="Vibe Picker"
        footer={<button>Done</button>}
        testID="bounded-dialog"
      >
        <div style={{ height: 1200 }}>6+ tiles</div>
      </Dialog>
    );

    const dialog = screen.getByTestId('bounded-dialog');
    expect(dialog.className).toContain('max-h-[85dvh]');
    expect(dialog.className).toContain('flex');
    expect(dialog.className).toContain('flex-col');
    expect(dialog.className).toContain('overflow-hidden');

    const body = screen.getByTestId('bounded-dialog-body');
    expect(body.className).toContain('flex-1');
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('overscroll-contain');
  });

  it('allows nested scrollable textarea wheel events inside a fitting modal body', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Nested Scroll" testID="nested-modal">
        <textarea data-testid="nested-textarea" defaultValue="Line 1\nLine 2\nLine 3" />
      </Modal>
    );

    const body = screen.getByTestId('nested-modal-body');
    Object.defineProperty(body, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(body, 'scrollHeight', { value: 120, writable: true });
    Object.defineProperty(body, 'clientHeight', { value: 120, writable: true });

    const textarea = screen.getByTestId('nested-textarea');
    Object.defineProperty(textarea, 'scrollTop', { value: 0, writable: true });
    Object.defineProperty(textarea, 'scrollHeight', { value: 240, writable: true });
    Object.defineProperty(textarea, 'clientHeight', { value: 60, writable: true });

    const wheelDown = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true });
    textarea.dispatchEvent(wheelDown);
    expect(wheelDown.defaultPrevented).toBe(false);
  });

  it('closes an open Select inside Modal on first Escape and Modal on second Escape', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Select In Modal" testID="select-modal">
        <Select
          options={[
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
          ]}
          value="a"
          testID="modal-select"
        />
      </Modal>
    );

    fireEvent.click(screen.getByTestId('modal-select'));
    expect(screen.getByTestId('modal-select-menu')).toBeDefined();

    // First Escape closes Select only; Modal stays open
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('modal-select-menu')).toBeNull();
    expect(handleClose).not.toHaveBeenCalled();

    // Second Escape closes Modal
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});

describe('BottomSheet Primitive Component Suite', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.style.overflow = '';
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.style.overflow = '';
  });

  it('renders bottom sheet content with drag handle and safe area styling', () => {
    const handleClose = vi.fn();
    render(
      <BottomSheet
        isOpen={true}
        onClose={handleClose}
        title="Mobile Sheet"
        subtitle="Slide up action"
        footer={<button>Action</button>}
      >
        <p>Sheet body</p>
      </BottomSheet>
    );

    const sheet = screen.getByTestId('canopy-bottom-sheet');
    expect(sheet).toBeDefined();
    expect(screen.getByTestId('canopy-bottom-sheet-handle')).toBeDefined();
    expect(screen.getByText('Mobile Sheet')).toBeDefined();
    expect(screen.getByText('Slide up action')).toBeDefined();
  });

  it('fires onClose on Escape key in BottomSheet', () => {
    const handleClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={handleClose} title="Escape Sheet">
        <p>Sheet body</p>
      </BottomSheet>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('handles touch drag-to-dismiss when dragged past 40% threshold', () => {
    const handleClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={handleClose} title="Drag Sheet">
        <p>Drag content</p>
      </BottomSheet>
    );

    const sheet = screen.getByTestId('canopy-bottom-sheet');
    Object.defineProperty(sheet, 'offsetHeight', { value: 300, configurable: true });

    const handle = screen.getByRole('separator');

    // Touch start at Y = 100
    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    // Drag down to Y = 250 (deltaY = 150 > 300 * 0.4 = 120)
    fireEvent.touchMove(handle, { touches: [{ clientY: 250 }] });
    // Touch end
    fireEvent.touchEnd(handle);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('resets drag position when drag is below 40% threshold', () => {
    const handleClose = vi.fn();
    render(
      <BottomSheet isOpen={true} onClose={handleClose} title="Snap Back Sheet">
        <p>Snap content</p>
      </BottomSheet>
    );

    const sheet = screen.getByTestId('canopy-bottom-sheet');
    Object.defineProperty(sheet, 'offsetHeight', { value: 300, configurable: true });

    const handle = screen.getByRole('separator');

    // Drag down only 30px (< 120px)
    fireEvent.touchStart(handle, { touches: [{ clientY: 100 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 130 }] });
    fireEvent.touchEnd(handle);

    expect(handleClose).not.toHaveBeenCalled();
  });

  it('advances between intermediate snap points on upward and downward swipes', () => {
    render(
      <BottomSheet
        isOpen={true}
        onClose={() => {}}
        size="sm"
        snapPoints={['sm', 'md', 'lg']}
        title="Snap Points Sheet"
      >
        <p>Snap points body</p>
      </BottomSheet>
    );

    const sheet = screen.getByTestId('canopy-bottom-sheet');
    Object.defineProperty(sheet, 'offsetHeight', { value: 600, configurable: true });

    // Initial size is sm: max-h-[35vh]
    expect(sheet.className).toContain('max-h-[35vh]');

    const handle = screen.getByRole('separator');

    // Drag up by 40px (deltaY = -40)
    fireEvent.touchStart(handle, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 160 }] });
    fireEvent.touchEnd(handle);

    // Advances to md: max-h-[55vh]
    expect(sheet.className).toContain('max-h-[55vh]');

    // Drag up again by 40px
    fireEvent.touchStart(handle, { touches: [{ clientY: 200 }] });
    fireEvent.touchMove(handle, { touches: [{ clientY: 160 }] });
    fireEvent.touchEnd(handle);

    // Advances to lg: max-h-[75vh]
    expect(sheet.className).toContain('max-h-[75vh]');
  });
});
