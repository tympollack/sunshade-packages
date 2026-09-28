import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';

export interface ModalShellProps {
  /** Controls open visibility */
  isOpen: boolean;
  /** Close callback invoked via backdrop click, Escape key, or close button */
  onClose: () => void;
  /** Primary title rendered in the pinned header */
  title?: React.ReactNode;
  /** Optional subtitle or description in the pinned header */
  subtitle?: React.ReactNode;
  /** Optional leading icon badge in the pinned header */
  icon?: React.ReactNode;
  /** Optional additional elements in header (e.g. status indicators) */
  headerExtra?: React.ReactNode;
  /** Pinned header container class extension */
  headerClassName?: string;
  /** Main scrollable body content */
  children: React.ReactNode;
  /** Scrollable body container class extension */
  bodyClassName?: string;
  /** Optional pinned footer (e.g. Submit, Cancel action buttons) */
  footer?: React.ReactNode;
  /** Optional pinned footer container class extension */
  footerClassName?: string;
  /** Modal frame class extensions (e.g. custom max-width) */
  className?: string;
  /** Backdrop container class extensions */
  backdropClassName?: string;
  /** Accessible label for the header dismiss button */
  closeAriaLabel?: string;
  /** Class name override for the header dismiss button */
  closeButtonClassName?: string;
  /** If true, hides the default header dismiss button */
  hideCloseButton?: boolean;
  /** Testing identifier */
  testID?: string;
}

/**
 * ModalShell - Viewport-constrained modal shell primitive in @digitalcanopy/ui.
 * Guarantees rigid 85dvh layout limits, pinned header/footer, and internal
 * touch/wheel scroll containment with body scroll locking and Escape dismissal.
 */
export function ModalShell({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  headerExtra,
  headerClassName,
  children,
  bodyClassName,
  footer,
  footerClassName,
  className,
  backdropClassName,
  closeAriaLabel = 'Close modal',
  closeButtonClassName,
  hideCloseButton = false,
  testID,
}: ModalShellProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while modal is mounted & open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  // Bind Escape key listener
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  if (!mounted && typeof document === 'undefined') return null;

  const modalNode = (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm',
        backdropClassName
      )}
      onClick={onClose}
      data-testid={testID ? `${testID}-backdrop` : 'modal-backdrop'}
    >
      <div
        className={cn(
          'relative w-full max-w-md max-h-[85dvh] flex flex-col rounded-3xl bg-[#1A1A1A] border border-stone-800 shadow-2xl overflow-hidden text-stone-100',
          className
        )}
        onClick={(e) => e.stopPropagation()}
        data-testid={testID || 'modal-frame'}
      >
        {/* Pinned Header: Never scrolls out of view */}
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
                  <p className="text-xs font-medium text-stone-600 dark:text-stone-400 mt-0.5 line-clamp-1">
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
                    'w-11 h-11 rounded-full flex items-center justify-center text-stone-700 hover:text-stone-900 dark:text-stone-300 dark:hover:text-stone-100 hover:bg-stone-200/50 dark:hover:bg-stone-800 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
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

        {/* Scrollable Body: Houses arbitrary list content with strict min-h-0 container flex lock */}
        <div
          className={cn(
            'flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4',
            'scrollbar-thin scrollbar-thumb-stone-700 scrollbar-track-transparent',
            bodyClassName
          )}
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#44403c transparent',
          }}
          data-testid="modal-body"
        >
          {children}
        </div>

        {/* Optional Pinned Footer: Houses action controls */}
        {footer && (
          <div
            className={cn(
              'shrink-0 p-4 border-t border-white/5 bg-[#1A1A1A]',
              footerClassName
            )}
            data-testid="modal-footer"
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }

  return modalNode;
}

export default ModalShell;
