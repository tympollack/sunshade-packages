import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectableTile } from '../components/SelectableTile';
import {
  type SelectableTileVariant,
  VARIANT_CONTRAST_TOKENS,
  CONTRAST_TYPOGRAPHY,
  calculateContrastRatio,
  parseHexToRgb,
  getVariantEffectiveSurface,
} from '../tokens/contrast';

describe('SelectableTile WCAG AA Contrast Ratios (All 6 Variants)', () => {
  const variants: SelectableTileVariant[] = ['amber', 'sky', 'purple', 'stone', 'slate', 'indigo'];

  it('verifies contrast ratio between high-contrast title (#F9F9F9) and effective tinted surface exceeds WCAG AAA (7:1)', () => {
    const titleRgb = parseHexToRgb(CONTRAST_TYPOGRAPHY.title.color);

    for (const variant of variants) {
      const effectiveSurface = getVariantEffectiveSurface(variant);
      const ratio = calculateContrastRatio(titleRgb, effectiveSurface);

      expect(ratio).toBeGreaterThanOrEqual(CONTRAST_TYPOGRAPHY.title.minContrastRatio);
      expect(ratio).toBeGreaterThanOrEqual(7.0);
    }
  });

  it('verifies contrast ratio between secondary body copy (#A8A29E) and effective tinted surface exceeds WCAG AA (4.5:1)', () => {
    const descRgb = parseHexToRgb(CONTRAST_TYPOGRAPHY.description.color);

    for (const variant of variants) {
      const effectiveSurface = getVariantEffectiveSurface(variant);
      const ratio = calculateContrastRatio(descRgb, effectiveSurface);

      expect(ratio).toBeGreaterThanOrEqual(CONTRAST_TYPOGRAPHY.description.minContrastRatio);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('verifies base surface contrast without tint exceeds WCAG AA for both typography tiers', () => {
    const titleRgb = parseHexToRgb(CONTRAST_TYPOGRAPHY.title.color);
    const descRgb = parseHexToRgb(CONTRAST_TYPOGRAPHY.description.color);
    const baseRgb = parseHexToRgb(CONTRAST_TYPOGRAPHY.baseSurface);

    const titleRatio = calculateContrastRatio(titleRgb, baseRgb);
    const descRatio = calculateContrastRatio(descRgb, baseRgb);

    expect(titleRatio).toBeGreaterThan(14.0);
    expect(descRatio).toBeGreaterThan(5.5);
  });
});

describe('SelectableTile Component Behavior & Accessibility', () => {
  it('renders title, description, and icon badge with semantic button element by default', () => {
    render(
      <SelectableTile
        selected={false}
        variant="amber"
        icon={<span data-testid="icon">☀️</span>}
        title="Sunshine"
        description="Energized, clean, thriving space"
        onClick={vi.fn()}
      />
    );

    const tile = screen.getByRole('button');
    expect(tile).toBeTruthy();
    expect(tile.getAttribute('type')).toBe('button');
    expect(tile.getAttribute('aria-pressed')).toBe('false');

    const titleEl = screen.getByText('Sunshine');
    expect(titleEl).toBeTruthy();
    expect(titleEl.className).toContain('text-stone-100');

    const descEl = screen.getByText('Energized, clean, thriving space');
    expect(descEl).toBeTruthy();
    expect(descEl.className).toContain('text-stone-400');

    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('applies tactile classes, active selection outline, and keyboard focus styles', () => {
    const { rerender } = render(
      <SelectableTile
        selected={false}
        variant="sky"
        icon={<span>🌬️</span>}
        title="Breezy"
        description="Fresh breeze"
        onClick={vi.fn()}
      />
    );

    let tile = screen.getByRole('button');
    expect(tile.className).toContain('active:scale-[0.98]');
    expect(tile.className).toContain('hover:border-sky-400/60');
    expect(tile.className).toContain('focus-visible:ring-amber-400');
    expect(tile.className).toContain('border-sky-500/30');

    rerender(
      <SelectableTile
        selected={true}
        variant="sky"
        icon={<span>🌬️</span>}
        title="Breezy"
        description="Fresh breeze"
        onClick={vi.fn()}
      />
    );

    tile = screen.getByRole('button');
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    expect(tile.className).toContain('ring-2 ring-sky-400/80');
  });

  it('triggers onClick when clicked or when Enter / Space key is pressed', () => {
    const handleClick = vi.fn();
    render(
      <SelectableTile
        selected={false}
        variant="purple"
        icon={<span>✨</span>}
        title="Starlight"
        description="Calm night"
        onClick={handleClick}
      />
    );

    const tile = screen.getByRole('button');
    fireEvent.click(tile);
    expect(handleClick).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(tile, { key: 'Enter' });
    expect(handleClick).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(tile, { key: ' ' });
    expect(handleClick).toHaveBeenCalledTimes(3);
  });

  it('renders semantic div with role="button" when as="div" is requested', () => {
    const handleClick = vi.fn();
    render(
      <SelectableTile
        as="div"
        selected={false}
        variant="slate"
        icon={<span>🌫️</span>}
        title="Foggy"
        description="Low energy"
        onClick={handleClick}
      />
    );

    const tile = screen.getByRole('button');
    expect(tile.tagName.toLowerCase()).toBe('div');
    expect(tile.getAttribute('tabindex')).toBe('0');

    fireEvent.click(tile);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('respects disabled state and prevents click / key interactions', () => {
    const handleClick = vi.fn();
    render(
      <SelectableTile
        disabled={true}
        selected={false}
        variant="indigo"
        icon={<span>🌧️</span>}
        title="Raincloud"
        description="Overwhelmed"
        onClick={handleClick}
      />
    );

    const tile = screen.getByRole('button');
    expect((tile as HTMLButtonElement).disabled).toBe(true);
    expect(tile.getAttribute('aria-disabled')).toBe('true');
    expect(tile.className).toContain('opacity-50');

    fireEvent.click(tile);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
