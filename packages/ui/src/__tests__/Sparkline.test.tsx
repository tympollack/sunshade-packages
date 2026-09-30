import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sparkline } from '../components/Sparkline/Sparkline';

describe('Sparkline Primitive Component Suite', () => {
  const telemetryData = [10, 25, 18, 42, 35, 60, 52];
  const timestamps = ['10:00', '10:05', '10:10', '10:15', '10:20', '10:25', '10:30'];

  it('generates cubic Bézier path and gradient area fill from telemetry data', () => {
    render(
      <Sparkline
        data={telemetryData}
        timestamps={timestamps}
        strokeColor="#38bdf8"
        testID="telemetry-sparkline"
      />
    );

    const svg = screen.getByTestId('telemetry-sparkline-svg');
    expect(svg).toBeDefined();

    const curve = screen.getByTestId('telemetry-sparkline-curve');
    expect(curve).toBeDefined();
    const d = curve.getAttribute('d') || '';
    expect(d.startsWith('M')).toBe(true);
    expect(d.includes('C')).toBe(true);

    const area = screen.getByTestId('telemetry-sparkline-area');
    expect(area).toBeDefined();
    expect(area.getAttribute('d')?.includes('Z')).toBe(true);
  });

  it('renders hover cursor tracking indicator and floating value bubble with timestamp', () => {
    render(
      <Sparkline
        data={telemetryData}
        timestamps={timestamps}
        interactive={true}
        testID="telemetry-sparkline"
      />
    );

    const container = screen.getByTestId('telemetry-sparkline');
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 300, height: 80 }),
      configurable: true,
    });

    // Move mouse near the middle (clientX = 150) -> index ~3 (val = 42, timestamp = '10:15')
    fireEvent.mouseMove(container, { clientX: 150 });

    const tooltip = screen.getByTestId('telemetry-sparkline-tooltip');
    expect(tooltip).toBeDefined();
    expect(tooltip.textContent).toContain('42');
    expect(tooltip.textContent).toContain('10:15');

    const point = screen.getByTestId('telemetry-sparkline-point');
    expect(point).toBeDefined();

    // Move pointer out
    fireEvent.mouseLeave(container);
    expect(screen.queryByTestId('telemetry-sparkline-tooltip')).toBeNull();
  });

  it('handles empty and single-point edge cases gracefully without throwing errors', () => {
    const { unmount } = render(<Sparkline data={[]} testID="empty-sparkline" />);
    expect(screen.queryByTestId('empty-sparkline-curve')).toBeNull();

    unmount();

    render(<Sparkline data={[50]} testID="single-sparkline" />);
    const singleCurve = screen.getByTestId('single-sparkline-curve');
    expect(singleCurve.getAttribute('d')).toContain('M');
  });
});
