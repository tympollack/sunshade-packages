export type Placement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-start'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-end';

export interface FloatingPositionOptions {
  placement?: Placement;
  offset?: number;
  viewportPadding?: number;
}

export interface FloatingPositionResult {
  top: number;
  left: number;
  actualPlacement: Placement;
}

/**
 * Calculates portal coordinates relative to viewport and window scroll,
 * with edge collision flip (top <-> bottom) and shift within viewport boundaries.
 */
export function calculateFloatingPosition(
  triggerRect: DOMRect,
  floatingSize: { width: number; height: number },
  options: FloatingPositionOptions = {}
): FloatingPositionResult {
  const { placement = 'bottom', offset = 8, viewportPadding = 8 } = options;

  const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
  const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768;

  let chosenPlacement = placement;

  // Collision flip checks
  if (chosenPlacement.startsWith('bottom')) {
    const bottomEdge = triggerRect.bottom + offset + floatingSize.height;
    if (bottomEdge > viewportHeight - viewportPadding && triggerRect.top - offset - floatingSize.height >= viewportPadding) {
      chosenPlacement = chosenPlacement.replace('bottom', 'top') as Placement;
    }
  } else if (chosenPlacement.startsWith('top')) {
    const topEdge = triggerRect.top - offset - floatingSize.height;
    if (topEdge < viewportPadding && triggerRect.bottom + offset + floatingSize.height <= viewportHeight - viewportPadding) {
      chosenPlacement = chosenPlacement.replace('top', 'bottom') as Placement;
    }
  }

  let top = 0;
  let left = 0;

  // Calculate base coordinates relative to document
  switch (chosenPlacement) {
    case 'top':
      top = triggerRect.top + scrollY - floatingSize.height - offset;
      left = triggerRect.left + scrollX + (triggerRect.width - floatingSize.width) / 2;
      break;
    case 'top-start':
      top = triggerRect.top + scrollY - floatingSize.height - offset;
      left = triggerRect.left + scrollX;
      break;
    case 'top-end':
      top = triggerRect.top + scrollY - floatingSize.height - offset;
      left = triggerRect.right + scrollX - floatingSize.width;
      break;
    case 'bottom':
      top = triggerRect.bottom + scrollY + offset;
      left = triggerRect.left + scrollX + (triggerRect.width - floatingSize.width) / 2;
      break;
    case 'bottom-start':
      top = triggerRect.bottom + scrollY + offset;
      left = triggerRect.left + scrollX;
      break;
    case 'bottom-end':
      top = triggerRect.bottom + scrollY + offset;
      left = triggerRect.right + scrollX - floatingSize.width;
      break;
    case 'left':
      top = triggerRect.top + scrollY + (triggerRect.height - floatingSize.height) / 2;
      left = triggerRect.left + scrollX - floatingSize.width - offset;
      break;
    case 'right':
      top = triggerRect.top + scrollY + (triggerRect.height - floatingSize.height) / 2;
      left = triggerRect.right + scrollX + offset;
      break;
  }

  // Horizontal collision shift to keep within viewport
  const minLeft = scrollX + viewportPadding;
  const maxLeft = scrollX + viewportWidth - floatingSize.width - viewportPadding;
  left = Math.max(minLeft, Math.min(left, Math.max(minLeft, maxLeft)));

  // Vertical collision shift within viewport
  const minTop = scrollY + viewportPadding;
  const maxTop = scrollY + viewportHeight - floatingSize.height - viewportPadding;
  top = Math.max(minTop, Math.min(top, Math.max(minTop, maxTop)));

  return { top, left, actualPlacement: chosenPlacement };
}
