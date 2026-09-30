import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import {
  registerModal,
  unregisterModal,
  isTopmostModal,
  trapTabFocus,
} from './modalManager';

export interface ModalProps {
  /** Whether the modal dialog is open and visible */
  isOpen: boolean;
  /** Callback triggered when user requests closing */
  onClose: () => void;
  /** Dialog title rendered in the pinned header */
  title?: React.ReactNode;
  /** Secondary subtitle copy rendered under the title */
  subtitle?: React.ReactNode;
  /** Leading icon or badge rendered next to the title */
  icon?: React.ReactNode;
  /** Modal content body */
  children: React.ReactNode;
  /** Dialog max width size tier ('sm' | 'md' | 'lg' | 'full') */
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** Optional actions or content pinned to the bottom of the modal */
  footer?: React.ReactNode;
  /** Additional classes applied to dialog container */
  className?: string;
  /** Additional classes applied to backdrop overlay */
  backdropClassName?: string;
  /** Additional classes applied to content body */
  bodyClassName?: string;
  /** Additional classes applied to header */
  headerClassName?: string;
  /** Additional classes applied to footer */
  footerClassName?: string;
  /** Whether to hide the default close button */
  hideCloseButton?: boolean;
  /** Close button accessibility label */
  closeAriaLabel?: string;
  /** Whether clicking the backdrop closes the modal (default true) */
  closeOnBackdropClick?: boolean;
  /** Whether pressing Escape closes the modal (default true) */
  closeOnEscape?: boolean;
  /** Extra element placed in header actions row */
  headerExtra?: React.ReactNode;
  /** Testing identifier */
  testID?: string;
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg' | 'full', string> = {
  sm: 'max-w-md w-full',
  md: 'max-w-lg w-full',
  lg: 'max-w-2xl w-full',
  full: 'max-w-5xl w-[95vw] h-[88vh]',
};

/**
 * Modal - Composable, accessible modal dialog primitive for @digitalcanopy/ui.
 * Renders in a React Portal targeting document.body with focus-trapping,
 * Escape key listener, backdrop dismissal, body scroll lock, and spring physics styling.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  size = 'md',
  footer,
  className,
  backdropClassName,
  bodyClassName,
  headerClassName,
  footerClassName,
  hideCloseButton = false,
  closeAriaLabel = 'Close modal',
  closeOnBackdropClick = true,
  closeOnEscape = true,
  headerExtra,
  testID = 'canopy-modal',
}: ModalProps) {
  const modalId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Focus tracking, Escape stack, and body scroll lock via modalManager
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

    const timer = setTimeout(() => {
      if (dialogNode) {
        const firstFocusable = dialogNode.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  // Escape key and Tab focus trap listener
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        if (isTopmostModal(modalId)) {
          e.stopPropagation();
          e.preventDefault();
          onClose();
        }
      } else if (e.key === 'Tab' && dialogRef.current && isTopmostModal(modalId)) {
        trapTabFocus(dialogRef.current, e);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, modalId, onClose, closeOnEscape]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdropClick) return;
    if (e.target === backdropRef.current) {
      e.stopPropagation();
      onClose();
    }
  };

  const titleId = `${modalId}-title`;
  const descId = subtitle ? `${modalId}-desc` : undefined;

  const content = (
    <div
      ref={backdropRef}
      role="presentation"
      onClick={handleBackdropClick}
      data-testid={`${testID}-backdrop`}
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto',
        'bg-black/60 backdrop-blur-sm',
        'transition-opacity duration-200 ease-out',
        backdropClassName
      )}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={descId}
        tabIndex={-1}
        data-testid={testID}
        style={{
          transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-out',
        }}
        className={cn(
          'relative flex flex-col max-h-[88vh] outline-none',
          'bg-stone-900/95 border border-stone-800 shadow-2xl rounded-2xl text-stone-100',
          'transform scale-100 opacity-100',
          SIZE_CLASSES[size] || SIZE_CLASSES.md,
          className
        )}
      >
        {/* Header */}
        {(title || !hideCloseButton || headerExtra) && (
          <div
            className={cn(
              'flex items-center justify-between px-6 py-4 border-b border-stone-800/80 shrink-0 gap-3',
              headerClassName
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              {icon && <span className="shrink-0 text-xl">{icon}</span>}
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-lg font-semibold text-stone-100 truncate">
                    {title}
                  </h2>
                )}
                {subtitle && (
                  <p id={descId} className="text-xs text-stone-400 truncate mt-0.5">
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
                  data-testid={`${testID}-close-btn`}
                  className={cn(
                    'p-1.5 text-stone-400 hover:text-stone-100 hover:bg-stone-800/70',
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
          </div>
        )}

        {/* Scrollable Body */}
        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto px-6 py-4 text-stone-300 text-sm leading-relaxed',
            bodyClassName
          )}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className={cn(
              'flex items-center justify-end gap-3 px-6 py-4 border-t border-stone-800/80 shrink-0 bg-stone-900/50 rounded-b-2xl',
              footerClassName
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default Modal;
