import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '../../utils/cn';
import { trapTabFocus } from '../Modal/modalManager';

export interface AppShellSidebarContext {
  collapsed: boolean;
  isMobileDrawerOpen: boolean;
  closeMobileDrawer: () => void;
}

export interface AppShellProps {
  /** Left-hand navigation content or render function receiving sidebar state */
  sidebar?: React.ReactNode | ((ctx: AppShellSidebarContext) => React.ReactNode);
  /** Optional non-blocking right-hand inspector content */
  inspector?: React.ReactNode;
  /** Controls visibility of the desktop RHN inspector (defaults to true when inspector is provided) */
  isInspectorOpen?: boolean;
  /** Header title or brand mark */
  headerTitle?: React.ReactNode;
  /** Leading header actions rendered beside the mobile menu & collapse buttons */
  headerLeft?: React.ReactNode;
  /** Trailing header actions */
  headerRight?: React.ReactNode;
  /** Main canvas content */
  children: React.ReactNode;
  /** Controlled desktop sidebar collapsed state */
  sidebarCollapsed?: boolean;
  /** Initial desktop sidebar collapsed state when uncontrolled */
  defaultSidebarCollapsed?: boolean;
  /** Callback invoked when desktop sidebar collapsed state toggles */
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  /** Controlled mobile drawer open state */
  mobileDrawerOpen?: boolean;
  /** Callback invoked when mobile drawer open state changes */
  onMobileDrawerOpenChange?: (open: boolean) => void;
  /** Accessible label for the mandatory mobile drawer toggle button */
  mobileMenuAriaLabel?: string;
  /** Accessible label for the desktop sidebar collapse toggle button */
  collapseAriaLabel?: string;
  /** Outer shell container class overrides */
  className?: string;
  /** Top header bar class overrides */
  headerClassName?: string;
  /** Main canvas class overrides */
  mainClassName?: string;
  /** Sidebar container class overrides */
  sidebarClassName?: string;
  /** Inspector container class overrides */
  inspectorClassName?: string;
  /** Testing identifier prefix */
  testID?: string;
}

/**
 * AppShell - Responsive 3-pane workspace shell for @digitalcanopy/ui.
 * Supports:
 * (a) Collapsible desktop LHN (`w-14` icon rail when collapsed, `w-64` expanded)
 * (b) Mandatory mobile drawer toggle (`md:hidden`) opening a `fixed inset-y-0 left-0 z-50` slide-over LHN
 * (c) Non-blocking desktop RHN inspector (`pointer-events-auto` without dimming/blocking the main canvas)
 */
export function AppShell({
  sidebar,
  inspector,
  isInspectorOpen,
  headerTitle,
  headerLeft,
  headerRight,
  children,
  sidebarCollapsed: controlledCollapsed,
  defaultSidebarCollapsed = false,
  onSidebarCollapsedChange,
  mobileDrawerOpen: controlledMobileOpen,
  onMobileDrawerOpenChange,
  mobileMenuAriaLabel = 'Open navigation menu',
  collapseAriaLabel = 'Toggle navigation rail',
  className,
  headerClassName,
  mainClassName,
  sidebarClassName,
  inspectorClassName,
  testID = 'canopy-app-shell',
}: AppShellProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultSidebarCollapsed);
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);

  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const desktopSidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const wasMobileOpenRef = useRef(false);

  const isCollapsedControlled = controlledCollapsed !== undefined;
  const collapsed = isCollapsedControlled ? controlledCollapsed : internalCollapsed;

  const isMobileControlled = controlledMobileOpen !== undefined;
  const mobileOpen = isMobileControlled ? controlledMobileOpen : internalMobileOpen;

  const setCollapsed = useCallback(
    (next: boolean) => {
      if (!isCollapsedControlled) {
        setInternalCollapsed(next);
      }
      onSidebarCollapsedChange?.(next);
    },
    [isCollapsedControlled, onSidebarCollapsedChange]
  );

  const setMobileOpen = useCallback(
    (next: boolean) => {
      if (!isMobileControlled) {
        setInternalMobileOpen(next);
      }
      onMobileDrawerOpenChange?.(next);
    },
    [isMobileControlled, onMobileDrawerOpenChange]
  );

  const closeMobileDrawer = useCallback(() => setMobileOpen(false), [setMobileOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isMobileViewport = () =>
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 767px)').matches || window.innerWidth < 768
        : window.innerWidth < 768;

    const coveredRegions = [
      headerRef.current,
      desktopSidebarRef.current,
      mainRef.current,
      inspectorRef.current,
    ].filter((el): el is HTMLElement => Boolean(el));

    if (!mobileOpen) {
      for (const region of coveredRegions) {
        region.removeAttribute('inert');
      }
      if (wasMobileOpenRef.current) {
        wasMobileOpenRef.current = false;
        mobileToggleRef.current?.focus();
      }
      return;
    }

    wasMobileOpenRef.current = true;
    const mobileActive = isMobileViewport();

    if (mobileActive) {
      for (const region of coveredRegions) {
        region.setAttribute('inert', '');
      }
      const drawerNode = drawerRef.current;
      if (drawerNode) {
        const firstFocusable = drawerNode.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          drawerNode.focus();
        }
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMobileOpen(false);
      } else if (e.key === 'Tab' && mobileActive && drawerRef.current) {
        trapTabFocus(drawerRef.current, e);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      for (const region of coveredRegions) {
        region.removeAttribute('inert');
      }
    };
  }, [mobileOpen, setMobileOpen]);

  const showInspector = Boolean(inspector) && (isInspectorOpen ?? true);

  const renderSidebarContent = (isCollapsedRail: boolean) => {
    if (typeof sidebar === 'function') {
      return sidebar({
        collapsed: isCollapsedRail,
        isMobileDrawerOpen: mobileOpen,
        closeMobileDrawer,
      });
    }
    return sidebar;
  };

  const drawerId = `${testID}-mobile-drawer`;

  return (
    <div
      data-testid={testID}
      className={cn(
        'min-h-screen w-full flex flex-col bg-[#1A1A1A] text-stone-100 overflow-x-hidden',
        className
      )}
    >
      {/* Top Header */}
      <header
        ref={headerRef}
        data-testid={`${testID}-header`}
        className={cn(
          'h-14 shrink-0 flex items-center justify-between gap-3 px-4 border-b border-stone-800/80 bg-[#1A1A1A]/95 backdrop-blur-md z-30',
          headerClassName
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mandatory mobile drawer toggle button */}
          {sidebar && (
            <button
              ref={mobileToggleRef}
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileMenuAriaLabel}
              aria-expanded={mobileOpen}
              aria-controls={drawerId}
              data-testid={`${testID}-mobile-nav-toggle`}
              className={cn(
                'md:hidden inline-flex items-center justify-center w-10 h-10 min-w-[40px] min-h-[40px]',
                'rounded-lg text-stone-300 hover:text-stone-100 hover:bg-stone-800/70',
                'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'
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
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          )}

          {/* Desktop sidebar collapse toggle */}
          {sidebar && (
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapseAriaLabel}
              aria-expanded={!collapsed}
              data-testid={`${testID}-sidebar-collapse-toggle`}
              className={cn(
                'hidden md:inline-flex items-center justify-center w-9 h-9 rounded-lg',
                'text-stone-400 hover:text-stone-100 hover:bg-stone-800/70',
                'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400'
              )}
            >
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={collapsed ? 'M13 5l7 7-7 7M5 5l7 7-7 7' : 'M11 19l-7-7 7-7M19 19l-7-7 7-7'}
                />
              </svg>
            </button>
          )}

          {headerTitle && (
            <div className="font-semibold text-sm sm:text-base text-stone-100 truncate">
              {headerTitle}
            </div>
          )}

          {headerLeft}
        </div>

        {headerRight && (
          <div className="flex items-center gap-2 shrink-0">{headerRight}</div>
        )}
      </header>

      {/* 3-Pane Body */}
      <div className="flex-1 min-h-0 flex relative">
        {/* Desktop Collapsible LHN */}
        {sidebar && (
          <aside
            ref={desktopSidebarRef}
            aria-label="Primary navigation"
            data-testid={`${testID}-desktop-sidebar`}
            data-collapsed={collapsed ? 'true' : 'false'}
            className={cn(
              'hidden md:flex flex-col shrink-0 border-r border-stone-800/80 bg-[#141414] transition-all duration-200 overflow-y-auto overscroll-contain',
              collapsed ? 'w-14' : 'w-64',
              sidebarClassName
            )}
          >
            {renderSidebarContent(collapsed)}
          </aside>
        )}

        {/* Mobile Slide-Over LHN */}
        {sidebar && mobileOpen && (
          <>
            <div
              role="presentation"
              data-testid={`${testID}-mobile-backdrop`}
              onClick={closeMobileDrawer}
              className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <aside
              ref={drawerRef}
              id={drawerId}
              role="dialog"
              aria-modal="true"
              aria-label="Mobile navigation"
              tabIndex={-1}
              data-testid={`${testID}-mobile-drawer`}
              className={cn(
                'fixed inset-y-0 left-0 z-50 w-64 max-w-[82vw] flex flex-col bg-[#141414] border-r border-stone-800 shadow-2xl md:hidden overflow-y-auto overscroll-contain',
                sidebarClassName
              )}
            >
              <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-stone-800/80">
                <span className="text-sm font-semibold text-stone-100 truncate">
                  {headerTitle || 'Navigation'}
                </span>
                <button
                  type="button"
                  onClick={closeMobileDrawer}
                  aria-label="Close navigation menu"
                  data-testid={`${testID}-mobile-nav-close`}
                  className="inline-flex items-center justify-center w-10 h-10 min-w-[40px] min-h-[40px] rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                {renderSidebarContent(false)}
              </div>
            </aside>
          </>
        )}

        {/* Main Canvas */}
        <main
          ref={mainRef}
          data-testid={`${testID}-main`}
          className={cn('flex-1 min-w-0 min-h-0 overflow-y-auto', mainClassName)}
        >
          {children}
        </main>

        {/* Non-blocking Desktop RHN Inspector */}
        {showInspector && (
          <aside
            ref={inspectorRef}
            aria-label="Inspector"
            data-testid={`${testID}-inspector`}
            className={cn(
              'hidden lg:flex flex-col shrink-0 w-80 border-l border-stone-800/80 bg-[#141414] pointer-events-auto overflow-y-auto overscroll-contain',
              inspectorClassName
            )}
          >
            {inspector}
          </aside>
        )}
      </div>
    </div>
  );
}

export default AppShell;
