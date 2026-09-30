/**
 * modalManager - Centralized manager for ModalShell instances.
 * Coordinates reference-counted body scroll locking, topmost modal Escape dismissal,
 * and keyboard focus trapping across stacked dialogs.
 */

export interface ModalInstance {
  id: string;
  onClose: () => void;
  dialogRef: React.RefObject<HTMLElement | null>;
  previousFocusedElement: HTMLElement | null;
}

let activeModalCount = 0;
let originalOverflow = '';
const modalStack: ModalInstance[] = [];

/**
 * Acquires a body scroll lock reference.
 * Locks `document.body` only on the first active modal.
 */
export function acquireScrollLock(): void {
  if (typeof document === 'undefined') return;
  if (activeModalCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  activeModalCount++;
}

/**
 * Releases a body scroll lock reference.
 * Restores original body overflow only when all modals have closed.
 */
export function releaseScrollLock(): void {
  if (typeof document === 'undefined') return;
  activeModalCount = Math.max(0, activeModalCount - 1);
  if (activeModalCount === 0) {
    document.body.style.overflow = originalOverflow;
  }
}

/**
 * Registers an active modal on the stack and acquires body scroll lock.
 */
export function registerModal(instance: ModalInstance): void {
  modalStack.push(instance);
  acquireScrollLock();
}

/**
 * Unregisters a modal by ID, releases scroll lock, and restores previous focus.
 */
export function unregisterModal(id: string): void {
  const index = modalStack.findIndex((m) => m.id === id);
  if (index !== -1) {
    const [removed] = modalStack.splice(index, 1);
    releaseScrollLock();
    if (removed.previousFocusedElement && typeof removed.previousFocusedElement.focus === 'function') {
      try {
        removed.previousFocusedElement.focus();
      } catch {}
    }
  }
}

/**
 * Returns true if the modal with the given ID is at the top of the stack.
 */
export function isTopmostModal(id: string): boolean {
  return modalStack.length > 0 && modalStack[modalStack.length - 1].id === id;
}

/**
 * Traps Tab focus inside the active modal container.
 */
export function trapTabFocus(container: HTMLElement, e: KeyboardEvent | React.KeyboardEvent): void {
  const focusableSelectors = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors)).filter((el) => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // In real browser DOM check offsetParent or visibility; in jsdom offsetParent is always null
    if (el.offsetParent === null && typeof navigator !== 'undefined' && !navigator.userAgent?.includes('jsdom')) {
      return false;
    }
    return true;
  });

  if (focusable.length === 0) {
    e.preventDefault();
    return;
  }

  const firstElement = focusable[0];
  const lastElement = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === firstElement || document.activeElement === container) {
      e.preventDefault();
      lastElement.focus();
    }
  } else {
    if (document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }
}

/**
 * Handles scroll wheel events on scrollable containers to prevent boundary bleed.
 */
export function handleScrollContainment(
  el: HTMLElement,
  deltaY: number,
  preventDefault: () => void,
  stopPropagation: () => void
): void {
  stopPropagation();
  const isAtTop = el.scrollTop <= 0 && deltaY < 0;
  const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 1 && deltaY > 0;
  if (isAtTop || isAtBottom) {
    preventDefault();
  }
}
