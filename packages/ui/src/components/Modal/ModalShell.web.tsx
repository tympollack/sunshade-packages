import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import {
  registerModal,
  unregisterModal,
  isTopmostModal,
  trapTabFocus,
  handleScrollContainment,
} from './modalManager';

export interface ModalShellProps {
  /** Whether the modal dialog is rendered and visible */
  isOpen: boolean;
  /** Callback triggered when user dismisses the modal */
  onClose: () => void;
  /** Dialog title rendered in the pinned header */
  title?: React.ReactNode;
  /** Secondary subtitle copy rendered under the title */
  subtitle?: React.ReactNode;
  /** Leading icon or emoji badge rendered next to the title */
  icon?: React.ReactNode;
  /** Children elements rendered inside the scrollable body */
  children: React.ReactNode;
  /** Optional actions or content pinned to the bottom of the modal */
  footer?: React.ReactNode;
  /** Additional classes applied to the backdrop overlay */
  backdropClassName?: string;
  /** Additional classes applied to the rigid modal frame */
  className?: string;
  /** Additional classes applied to the scrollable body */
  bodyClassName?: string;
  /** Additional classes applied to the pinned header */
  headerClassName?: string;
  /** Additional classes applied to the pinned footer */
  footerClassName?: string;
  /** Hides the default accessible close button */
  hideCloseButton?: boolean;
  /** Custom close button class name extensions */
  closeButtonClassName?: string;
  /** Accessibility label for the close button */
  closeAriaLabel?: string;
  /** Testing identifier */
  testID?: string;
  /** Extra element placed in header actions row */
  headerExtra?: React.ReactNode;
}

/**
 * ModalShell - Viewport-constrained modal shell primitive for web.
 * Enforces strict 85dvh max height, pinned header, scrollable body with min-h-0,
 * reference-counted body scroll lock, focus trap, and topmost-only Escape dismissal.
 */
export function ModalShell({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  backdropClassName,
  className,
  bodyClassName,
  headerClassName,
  footerClassName,
  hideCloseButton = false,
  closeButtonClassName,
  closeAriaLabel = 'Close dialog',
  testID = 'modal-shell',
  headerExtra,
}: ModalShellProps) {
  const modalId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);

  // Register in modal manager for scroll locking, escape stack, and focus tracking
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const previousFocusedElement = (document.activeElement as HTMLElement) || null;
    const dialogNode = dialogRef.current;

    registerModal({
      id: modalId,
      onClose,
      dialogRef,
      previousFocusedElement,
    });

    // Move initial focus into the dialog
    const timer = setTimeout(() => {
      if (dialogNode) {
        const firstFocusable = dialogNode.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          dialogNode.focus();
        }
      }
    }, 10);

    return () => {
      clearTimeout(timer);
      unregisterModal(modalId);
    };
  }, [isOpen, modalId, onClose]);

  // Global keydown handler for Escape and Tab trapping
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isTopmostModal(modalId)) {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        trapTabFocus(dialogRef.current, e);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, modalId, onClose]);

  // Handle outside click dismissal
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === backdropRef.current) {
      e.stopPropagation();
      onClose();
    }
  };

  // Behavioral wheel containment listener to prevent background scroll bleed
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollBodyRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      handleScrollContainment(
        el,
        e.deltaY,
        () => e.preventDefault(),
        () => e.stopPropagation()
      );
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [isOpen]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollBodyRef.current) {
      handleScrollContainment(
        scrollBodyRef.current,
        e.deltaY,
        () => e.preventDefault(),
        () => e.stopPropagation()
      );
    }
  };

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const modalTree = (
    <div
      ref={backdropRef}
      data-testid={`${testID}-backdrop`}
      onClick={handleBackdropClick}
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm',
        backdropClassName
      )}
      role="presentation"
    >
      <div
        ref={dialogRef}
        data-testid={testID}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Modal Dialog'}
        tabIndex={-1}
        className={cn(
          'relative w-full max-w-md max-h-[85dvh] flex flex-col rounded-3xl bg-[#1A1A1A] border border-stone-800 shadow-2xl overflow-hidden focus:outline-none',
          className
        )}
      >
        {/* Pinned Header */}
        {(title || icon || !hideCloseButton) && (
          <div
            className={cn(
              'shrink-0 p-5 pb-3 border-b border-white/5 flex items-center justify-between gap-3',
              headerClassName
            )}
            data-testid="modal-header"
          >
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div
                  className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center border border-amber-500/30 shrink-0 text-amber-400"
                  aria-hidden="true"
                >
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {title && (
                  <h2 className="text-lg font-bold text-stone-100 leading-tight truncate">
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p className="text-xs font-medium text-stone-400 mt-0.5 line-clamp-1">
                    {subtitle}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {headerExtra}
              {!hideCloseButton && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={closeAriaLabel}
                  className={cn(
                    'w-11 h-11 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-100 hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                    closeButtonClassName
                  )}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Body */}
        <div
          ref={scrollBodyRef}
          onWheel={handleWheel}
          data-testid="modal-body"
          className={cn(
            'flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4',
            'scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent',
            bodyClassName
          )}
        >
          {children}
        </div>

        {/* Optional Pinned Footer */}
        {footer && (
          <div
            data-testid="modal-footer"
            className={cn('shrink-0 p-4 border-t border-white/5 bg-[#1A1A1A]', footerClassName)}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalTree, document.body);
}

export default ModalShell;
