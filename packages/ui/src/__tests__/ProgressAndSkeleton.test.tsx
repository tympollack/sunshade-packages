import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgressBar } from '../components/ProgressBar/ProgressBar';
import { Skeleton } from '../components/Skeleton/Skeleton';

describe('ProgressBar Primitive Component Suite', () => {
  it('calculates segment percentage widths dynamically totalling 100%', () => {
    const segments = [
      { label: 'Completed', value: 50, color: 'bg-emerald-500' },
      { label: 'In Progress', value: 30, color: 'bg-amber-500' },
      { label: 'Remaining', value: 20, color: 'bg-stone-600' },
    ];

    render(<ProgressBar segments={segments} testID="test-bar" />);

    const bar = screen.getByTestId('test-bar');
    expect(bar).toBeDefined();

    const seg0 = screen.getByTestId('test-bar-segment-0');
    const seg1 = screen.getByTestId('test-bar-segment-1');
    const seg2 = screen.getByTestId('test-bar-segment-2');

    expect(seg0.style.width).toBe('50%');
    expect(seg1.style.width).toBe('30%');
    expect(seg2.style.width).toBe('20%');

    const totalWidth =
      parseFloat(seg0.style.width) +
      parseFloat(seg1.style.width) +
      parseFloat(seg2.style.width);
    expect(totalWidth).toBe(100);
  });

  it('handles segments with zero values without subpixel gaps or rendering 0% segments', () => {
    const segments = [
      { label: 'Active', value: 10, color: '#38bdf8' },
      { label: 'Empty', value: 0, color: '#f43f5e' },
      { label: 'Done', value: 10, color: '#22c55e' },
    ];

    render(<ProgressBar segments={segments} testID="test-bar" />);

    expect(screen.queryByTestId('test-bar-segment-1')).toBeNull();
    const seg0 = screen.getByTestId('test-bar-segment-0');
    const seg2 = screen.getByTestId('test-bar-segment-2');

    expect(seg0.style.width).toBe('50%');
    expect(seg2.style.width).toBe('50%');
  });

  it('renders hover tooltips showing label, value, and percentage', () => {
    const segments = [
      { label: 'Done', value: 75, color: 'bg-emerald-500' },
      { label: 'Todo', value: 25, color: 'bg-stone-700' },
    ];

    render(<ProgressBar segments={segments} showTooltips testID="test-bar" />);

    const seg0 = screen.getByTestId('test-bar-segment-0');
    expect(screen.queryByTestId('test-bar-tooltip-0')).toBeNull();

    fireEvent.mouseEnter(seg0);
    const tooltip = screen.getByTestId('test-bar-tooltip-0');
    expect(tooltip).toBeDefined();
    expect(tooltip.textContent).toContain('Done');
    expect(tooltip.textContent).toContain('75 (75.0%)');

    fireEvent.mouseLeave(seg0);
    expect(screen.queryByTestId('test-bar-tooltip-0')).toBeNull();
  });

  it('renders legend when showLegend is true', () => {
    const segments = [
      { label: 'High', value: 12, color: '#ef4444' },
      { label: 'Low', value: 8, color: '#3b82f6' },
    ];

    render(<ProgressBar segments={segments} showLegend />);

    expect(screen.getByText('High:')).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('Low:')).toBeDefined();
    expect(screen.getByText('8')).toBeDefined();
  });
});

describe('Skeleton Primitive Component Suite', () => {
  it('renders polymorphic variants with exact requested dimensions', () => {
    const { unmount } = render(
      <Skeleton variant="text" width={200} height={16} testID="skel-text" />
    );

    const textSkel = screen.getByTestId('skel-text');
    expect(textSkel).toBeDefined();
    expect(textSkel.style.width).toBe('200px');
    expect(textSkel.style.height).toBe('16px');
    expect(textSkel.className).toContain('rounded-md');

    unmount();

    render(<Skeleton variant="circular" width={48} height={48} testID="skel-circle" />);
    const circleSkel = screen.getByTestId('skel-circle');
    expect(circleSkel.style.width).toBe('48px');
    expect(circleSkel.style.height).toBe('48px');
    expect(circleSkel.className).toContain('rounded-full');
  });

  it('supports disabling shimmer animation while preserving dimensions to avoid layout shift', () => {
    render(<Skeleton variant="rectangular" width="100%" height={120} animate={false} testID="skel-rect" />);

    const rectSkel = screen.getByTestId('skel-rect');
    expect(rectSkel.style.width).toBe('100%');
    expect(rectSkel.style.height).toBe('120px');
    expect(rectSkel.className).not.toContain('canopy-shimmer-active');
  });
});
