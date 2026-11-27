import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from '../components/AppShell/AppShell';

describe('AppShell Responsive 3-Pane Primitive', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it('supports collapsible desktop LHN (w-64 expanded -> w-14 collapsed icon rail)', () => {
    render(
      <AppShell
        headerTitle="Workspace"
        sidebar={({ collapsed }) => (
          <nav data-testid="nav-content">{collapsed ? 'Rail' : 'Expanded Nav'}</nav>
        )}
      >
        <div>Main Canvas</div>
      </AppShell>
    );

    const desktopSidebar = screen.getByTestId('canopy-app-shell-desktop-sidebar');
    expect(desktopSidebar.className).toContain('w-64');
    expect(desktopSidebar.getAttribute('data-collapsed')).toBe('false');
    expect(screen.getByText('Expanded Nav')).toBeDefined();

    const collapseBtn = screen.getByTestId('canopy-app-shell-sidebar-collapse-toggle');
    fireEvent.click(collapseBtn);

    expect(desktopSidebar.className).toContain('w-14');
    expect(desktopSidebar.getAttribute('data-collapsed')).toBe('true');
    expect(screen.getByText('Rail')).toBeDefined();
  });

  it('renders mandatory md:hidden mobile drawer toggle below 768px and opens fixed inset-y-0 left-0 z-50 slide-over LHN', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    });

    render(
      <AppShell
        headerTitle="Mobile App"
        sidebar={<div>Mobile Links</div>}
      >
        <div>Canvas Content</div>
      </AppShell>
    );

    const mobileToggle = screen.getByTestId('canopy-app-shell-mobile-nav-toggle');
    expect(mobileToggle).toBeDefined();
    expect(mobileToggle.className).toContain('md:hidden');
    expect(mobileToggle.className).toContain('min-w-[40px]');
    expect(mobileToggle.className).toContain('min-h-[40px]');

    expect(screen.queryByTestId('canopy-app-shell-mobile-drawer')).toBeNull();

    fireEvent.click(mobileToggle);

    const drawer = screen.getByTestId('canopy-app-shell-mobile-drawer');
    expect(drawer).toBeDefined();
    expect(drawer.className).toContain('fixed inset-y-0 left-0 z-50');

    // Dismiss via Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('canopy-app-shell-mobile-drawer')).toBeNull();
  });

  it('renders non-blocking desktop RHN inspector with pointer-events-auto without blocking main canvas', () => {
    const handleCanvasClick = vi.fn();

    render(
      <AppShell
        headerTitle="Inspector Workspace"
        sidebar={<div>Nav</div>}
        inspector={<div>Inspector Details</div>}
      >
        <button data-testid="canvas-action" onClick={handleCanvasClick}>
          Canvas Action
        </button>
      </AppShell>
    );

    const inspector = screen.getByTestId('canopy-app-shell-inspector');
    expect(inspector).toBeDefined();
    expect(inspector.className).toContain('pointer-events-auto');

    // No modal backdrop dims or blocks the main canvas when desktop inspector is open
    expect(screen.queryByTestId('canopy-app-shell-mobile-backdrop')).toBeNull();

    fireEvent.click(screen.getByTestId('canvas-action'));
    expect(handleCanvasClick).toHaveBeenCalledTimes(1);
  });
});
