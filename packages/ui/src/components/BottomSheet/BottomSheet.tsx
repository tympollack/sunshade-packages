import React, { useEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import {
  registerModal,
  unregisterModal,
  isTopmostModal,
  trapTabFocus,
} from '../Modal/modalManager';

export interface BottomSheetProps {
  /** Whether the bottom sheet is open */
  isOpen: boolean;
  /** Callback triggered when user requests closing */
  onClose: () => void;
  /** Sheet title rendered in header */
  title?: React.ReactNode;
  /** Subtitle copy rendered under title */
  subtitle?: React.ReactNode;
  /** Sheet body content */
  children: React.ReactNode;
  /** Height / size tier ('sm' | 'md' | 'lg' | 'full') */
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** Available snap points */
  snapPoints?: ('sm' | 'md' | 'lg' | 'full')[];
  /** Footer content pinned at the bottom */
  footer?: React.ReactNode;
  /** Additional container styling */
  className?: string;
  /** Additional backdrop styling */
  backdropClassName?: string;
  /** Additional content body styling */
  bodyClassName?: string;
  /** Additional header styling */
  headerClassName?: string;
  /** Whether to hide the drag handle bar */
  hideDragHandle?: boolean;
  /** Whether to hide the close button */
  hideCloseButton?: boolean;
  /** Accessibility label for close button */
  closeAriaLabel?: string;
  /** Testing identifier */
  testID?: string;
}

const HEIGHT_CLASSES: Record<'sm' | 'md' | 'lg' | 'full', string> = {
  sm: 'max-h-[35vh] h-[35vh]',
  md: 'max-h-[55vh] h-[55vh]',
  lg: 'max-h-[75vh] h-[75vh]',
  full: 'max-h-[94vh] h-[94vh]',
};

/**
 * BottomSheet - Composable mobile bottom sheet primitive for @digitalcanopy/ui.
 * Supports touch drag-to-dismiss gesture with 40% threshold, snap points,
 * safe-area bottom insets, focus trapping, Escape dismissal, and body scroll locking.
 */
export function BottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
  snapPoints,
  footer,
  className,
  backdropClassName,
  bodyClassName,
  headerClassName,
  hideDragHandle = false,
  hideCloseButton = false,
  closeAriaLabel = 'Close bottom sheet',
  testID = 'canopy-bottom-sheet',
}: BottomSheetProps) {
  const sheetId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const [currentSize, setCurrentSize] = useState<'sm' | 'md' | 'lg' | 'full'>(size);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef(0);
  const currentDragYRef = useRef(0);

  // Sync initial size prop
  useEffect(() => {
    setCurrentSize(size);
  }, [size]);

  // Modal manager registration (Escape key stack, scroll lock, focus restoration)
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const previousFocusedElement = (document.activeElement as HTMLElement) || null;
    const sheetNode = sheetRef.current;

    registerModal({
      id: sheetId,
      onClose,
      dialogRef: sheetRef,
      previousFocusedElement,
    });

    const timer = setTimeout(() => {
      if (sheetNode) {
        const firstFocusable = sheetNode.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          sheetNode.focus();
        }
      }
    }, 10);

    return () => {
      clearTimeout(timer);
      unregisterModal(sheetId);
    };
  }, [isOpen, sheetId, onClose]);

  // Global keydown handler
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isTopmostModal(sheetId)) {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }
      } else if (e.key === 'Tab' && sheetRef.current && isTopmostModal(sheetId)) {
        trapTabFocus(sheetRef.current, e);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, sheetId, onClose]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const SNAP_ORDER: ('sm' | 'md' | 'lg' | 'full')[] = ['sm', 'md', 'lg', 'full'];

  // Touch gesture handling for drag-to-dismiss & snap points
  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    currentDragYRef.current = 0;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaY = e.touches[0].clientY - startYRef.current;
    currentDragYRef.current = deltaY;
    if (deltaY > 0) {
      // Dragging downwards
      setDragY(deltaY);
    } else {
      // Slight resistance when dragging upwards
      setDragY(Math.max(-40, deltaY * 0.3));
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    const sheetHeight = sheetRef.current?.offsetHeight || 300;
    const threshold = sheetHeight * 0.4; // 40% threshold

    if (currentDragYRef.current > threshold) {
      onClose();
    } else {
      if (snapPoints && snapPoints.length > 0) {
        const sortedConfigured = SNAP_ORDER.filter((s) => snapPoints.includes(s));
        const currentIndex = sortedConfigured.indexOf(currentSize);

        if (currentDragYRef.current < -30 && currentIndex < sortedConfigured.length - 1) {
          // Dragged up: advance to next larger snap point
          setCurrentSize(sortedConfigured[currentIndex + 1]);
        } else if (currentDragYRef.current > 30 && currentIndex > 0) {
          // Dragged down moderately: snap to smaller snap point
          setCurrentSize(sortedConfigured[currentIndex - 1]);
        }
      }
      setDragY(0);
      currentDragYRef.current = 0;
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      e.stopPropagation();
      onClose();
    }
  };

  const titleId = `${sheetId}-title`;

  const content = (
    <div
      ref={backdropRef}
      role="presentation"
      onClick={handleBackdropClick}
      data-testid={`${testID}-backdrop`}
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center',
        'bg-black/60 backdrop-blur-sm',
        'transition-opacity duration-200 ease-out',
        backdropClassName
      )}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        data-testid={testID}
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1)',
          paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom, 20px))',
        }}
        className={cn(
          'w-full max-w-2xl flex flex-col outline-none overflow-hidden',
          'bg-stone-900/95 border-t border-x border-stone-800 shadow-2xl rounded-t-3xl text-stone-100',
          HEIGHT_CLASSES[currentSize] || HEIGHT_CLASSES.md,
          className
        )}
      >
        {/* Drag Handle Bar Header */}
        <div
          role="separator"
          aria-orientation="horizontal"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="w-full pt-3 pb-1 flex flex-col items-center cursor-grab active:cursor-grabbing select-none shrink-0"
        >
          {!hideDragHandle && (
            <div
              data-testid={`${testID}-handle`}
              className="w-12 h-1.5 bg-stone-700 hover:bg-stone-600 rounded-full transition-colors"
            />
          )}
        </div>

        {/* Pinned Title Header */}
        {(title || !hideCloseButton) && (
          <div
            className={cn(
              'flex items-center justify-between px-6 py-2.5 border-b border-stone-800/80 shrink-0 gap-3',
              headerClassName
            )}
          >
            <div className="min-w-0">
              {title && (
                <h2 id={titleId} className="text-base font-semibold text-stone-100 truncate">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-xs text-stone-400 truncate mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>

            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label={closeAriaLabel}
                data-testid={`${testID}-close-btn`}
                className={cn(
                  'p-1 text-stone-400 hover:text-stone-100 hover:bg-stone-800/70',
                  'rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50'
                )}
              >
                <svg
                  aria-hidden="true"
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Scrollable Content Body */}
        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto px-6 py-4 text-stone-300 text-sm leading-relaxed',
            bodyClassName
          )}
        >
          {children}
        </div>

        {/* Pinned Footer */}
        {footer && (
          <div className="px-6 py-3 border-t border-stone-800/80 shrink-0 bg-stone-900/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default BottomSheet;
