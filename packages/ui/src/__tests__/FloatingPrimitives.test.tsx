import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Popover } from '../components/Popover/Popover';
import { Tooltip } from '../components/Tooltip/Tooltip';
import { DropdownMenu } from '../components/Dropdown/DropdownMenu';

describe('Floating Primitives (Popover, Tooltip, DropdownMenu)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('Popover Primitive', () => {
    it('opens on trigger click and renders content in portal', () => {
      render(
        <Popover trigger={<button>Open Popover</button>}>
          <div data-testid="popover-content">Popover Body</div>
        </Popover>
      );

      expect(screen.queryByTestId('popover-content')).toBeNull();

      const trigger = screen.getByText('Open Popover');
      fireEvent.click(trigger);

      expect(screen.getByTestId('popover-content')).toBeDefined();
      expect(screen.getByText('Popover Body')).toBeDefined();
    });

    it('dismisses on outside click', () => {
      render(
        <div>
          <button data-testid="outside-button">Outside</button>
          <Popover trigger={<button>Open Popover</button>}>
            <div data-testid="popover-content">Popover Body</div>
          </Popover>
        </div>
      );

      const trigger = screen.getByText('Open Popover');
      fireEvent.click(trigger);
      expect(screen.getByTestId('popover-content')).toBeDefined();

      const outside = screen.getByTestId('outside-button');
      fireEvent.pointerDown(outside);

      expect(screen.queryByTestId('popover-content')).toBeNull();
    });

    it('dismisses on Escape key and restores focus to trigger', () => {
      render(
        <Popover trigger={<button data-testid="pop-trigger">Open Popover</button>}>
          <div data-testid="popover-content">Popover Body</div>
        </Popover>
      );

      const trigger = screen.getByTestId('pop-trigger');
      trigger.focus();
      fireEvent.click(trigger);
      expect(screen.getByTestId('popover-content')).toBeDefined();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('popover-content')).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });

  describe('Tooltip Primitive', () => {
    it('shows tooltip content on hover after delay', () => {
      render(
        <Tooltip content="Helper message" openDelay={100} closeDelay={50} testID="test-tooltip">
          <button>Hover Me</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Hover Me');
      expect(screen.queryByTestId('test-tooltip')).toBeNull();

      fireEvent.mouseEnter(trigger);
      // Before delay
      expect(screen.queryByTestId('test-tooltip')).toBeNull();

      // Advance time past openDelay
      act(() => {
        vi.advanceTimersByTime(110);
      });

      expect(screen.getByTestId('test-tooltip')).toBeDefined();
      expect(screen.getByText('Helper message')).toBeDefined();

      // Mouse leave
      fireEvent.mouseLeave(trigger);
      act(() => {
        vi.advanceTimersByTime(60);
      });

      expect(screen.queryByTestId('test-tooltip')).toBeNull();
    });

    it('shows tooltip immediately on keyboard focus', () => {
      render(
        <Tooltip content="Focused info" testID="test-tooltip">
          <button>Focus Me</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Focus Me');
      fireEvent.focus(trigger);

      expect(screen.getByTestId('test-tooltip')).toBeDefined();

      fireEvent.blur(trigger);
      expect(screen.queryByTestId('test-tooltip')).toBeNull();
    });
  });

  describe('DropdownMenu Primitive', () => {
    it('renders trigger and opens menu on click', () => {
      const items = [
        { label: 'Edit Profile', onClick: vi.fn() },
        { label: 'Account Settings', onClick: vi.fn() },
      ];

      render(
        <DropdownMenu items={items} trigger={<button>Actions</button>} />
      );

      expect(screen.queryByRole('menu')).toBeNull();

      const trigger = screen.getByText('Actions');
      fireEvent.click(trigger);

      expect(screen.getByRole('menu')).toBeDefined();
      expect(screen.getByText('Edit Profile')).toBeDefined();
      expect(screen.getByText('Account Settings')).toBeDefined();
    });

    it('handles keyboard arrow navigation and Enter selection', () => {
      const handleEdit = vi.fn();
      const handleDelete = vi.fn();

      const items = [
        { label: 'Edit', onClick: handleEdit },
        { label: 'Disabled Item', disabled: true },
        { label: 'Delete', danger: true, onClick: handleDelete },
      ];

      render(
        <DropdownMenu items={items} trigger={<button data-testid="menu-btn">Actions</button>} />
      );

      const trigger = screen.getByTestId('menu-btn');
      fireEvent.click(trigger);
      expect(screen.getByRole('menu')).toBeDefined();

      // Press ArrowDown to select first item (Edit)
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      const editItem = screen.getByTestId('canopy-dropdown-item-0');
      expect(editItem.getAttribute('data-active')).toBe('true');

      // Press ArrowDown to skip disabled item and select third item (Delete)
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      const deleteItem = screen.getByTestId('canopy-dropdown-item-2');
      expect(deleteItem.getAttribute('data-active')).toBe('true');

      // Press Enter to activate
      fireEvent.keyDown(window, { key: 'Enter' });

      expect(handleDelete).toHaveBeenCalledTimes(1);
      expect(handleEdit).not.toHaveBeenCalled();
      // Closes menu on selection
      expect(screen.queryByRole('menu')).toBeNull();
    });

    it('closes on outside click and Escape', () => {
      const items = [{ label: 'Item 1' }];

      render(
        <div>
          <button data-testid="outside-area">Outside</button>
          <DropdownMenu items={items} trigger={<button>Open</button>} />
        </div>
      );

      fireEvent.click(screen.getByText('Open'));
      expect(screen.getByRole('menu')).toBeDefined();

      fireEvent.pointerDown(screen.getByTestId('outside-area'));
      expect(screen.queryByRole('menu')).toBeNull();

      // Re-open and close with Escape
      fireEvent.click(screen.getByText('Open'));
      expect(screen.getByRole('menu')).toBeDefined();

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('menu')).toBeNull();
    });
  });
});
