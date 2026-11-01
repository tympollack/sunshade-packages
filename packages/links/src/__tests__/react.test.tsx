// @vitest-environment jsdom
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinksClient } from '../client';
import { SafeAnchor, TrustBadge, useTrackedLink } from '../react';

describe('React Integration (useTrackedLink, SafeAnchor, TrustBadge)', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let client: LinksClient;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new LinksClient({
      fetch: mockFetch as unknown as typeof fetch,
      enableFallback: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('useTrackedLink Hook', () => {
    it('shortens outbound links when telemetry is enabled', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'test_lnk',
          short_url: 'https://links.sunshade.icu/xyz/bsky',
          destination_url: 'https://sunshade.icu/announcement',
          channel: 'bsky',
          trust_score: 95,
        }),
      });

      const { result } = renderHook(() =>
        useTrackedLink('https://sunshade.icu/announcement?fbclid=bad', {
          client,
          channel: 'bsky',
          enabled: true,
        })
      );

      // Loading initially
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.href).toBe('https://links.sunshade.icu/xyz/bsky');
      expect(result.current.isShortened).toBe(true);
      expect(result.current.trustScore).toBe(95);
      expect(result.current.error).toBeNull();
    });

    it('returns sanitized raw destination immediately when enabled is false and no trust lookup', () => {
      const { result } = renderHook(() =>
        useTrackedLink('https://sunshade.icu/page?fbclid=strip_me&doc=2', {
          client,
          enabled: false,
        })
      );

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isShortened).toBe(false);
      expect(result.current.href).toBe('https://sunshade.icu/page?doc=2');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('resolves trust score when autoResolveTrust is true even if shortening enabled is false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          url: 'https://sunshade.icu/post',
          score: 88,
        }),
      });

      const { result } = renderHook(() =>
        useTrackedLink('https://sunshade.icu/post', {
          client,
          enabled: false,
          autoResolveTrust: true,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isShortened).toBe(false);
      expect(result.current.href).toBe('https://sunshade.icu/post');
      expect(result.current.trustScore).toBe(88);
      expect(result.current.trustReport?.score).toBe(88);
    });

    it('retains successful short link even if independent trust resolution rejects', async () => {
      // Shortener succeeds
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/api/v1/links')) {
          return {
            ok: true,
            json: async () => ({
              short_url: 'https://links.sunshade.icu/success/direct',
              trust_score: 90,
            }),
          };
        }
        // Trust API fails
        throw new Error('Audit engine 503');
      });

      const clientNoFallback = new LinksClient({
        fetch: mockFetch as unknown as typeof fetch,
        enableFallback: false,
      });

      const { result } = renderHook(() =>
        useTrackedLink('https://sunshade.icu/article', {
          client: clientNoFallback,
          enabled: true,
          autoResolveTrust: true,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Retained short link!
      expect(result.current.href).toBe('https://links.sunshade.icu/success/direct');
      expect(result.current.isShortened).toBe(true);
    });

    it('falls back gracefully on network failure without breaking the link', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network offline'));

      const { result } = renderHook(() =>
        useTrackedLink('https://sunshade.icu/docs?fbclid=bad', {
          client,
          enabled: true,
        })
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.href).toBe('https://sunshade.icu/docs');
      expect(result.current.isShortened).toBe(false);
    });
  });

  describe('SafeAnchor Component', () => {
    it('renders external link with target="_blank" and rel="noopener noreferrer"', () => {
      render(
        <SafeAnchor href="https://external-domain.com/post" trustScore={90}>
          External Post
        </SafeAnchor>
      );

      const anchor = screen.getByRole('link', { name: /External Post/i });
      expect(anchor).toBeDefined();
      expect(anchor.getAttribute('target')).toBe('_blank');
      expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
      expect(anchor.getAttribute('href')).toBe('https://external-domain.com/post');
    });

    it('handles protocol-relative URLs as external links', () => {
      render(
        <SafeAnchor href="//cdn.external.com/asset" trustScore={85}>
          CDN Asset
        </SafeAnchor>
      );

      const anchor = screen.getByRole('link', { name: /CDN Asset/i });
      expect(anchor.getAttribute('target')).toBe('_blank');
      expect(anchor.getAttribute('rel')).toBe('noopener noreferrer');
      expect(screen.getByTestId('trust-badge')).toBeDefined();
    });

    it('displays miniature TrustBadge alongside external links when showBadge is true', () => {
      render(
        <SafeAnchor
          href="https://sunshade.icu"
          showBadge={true}
          trustScore={95}
        >
          SunShade Ecosystem
        </SafeAnchor>
      );

      const badge = screen.getByTestId('trust-badge');
      expect(badge).toBeDefined();
      expect(badge.getAttribute('data-status')).toBe('trusted');
      expect(badge.textContent).toContain('95');
    });

    it('hides TrustBadge for internal relative links', () => {
      render(
        <SafeAnchor href="/dashboard/settings" showBadge={true}>
          Internal Settings
        </SafeAnchor>
      );

      expect(screen.queryByTestId('trust-badge')).toBeNull();
      const anchor = screen.getByRole('link', { name: /Internal Settings/i });
      expect(anchor.getAttribute('target')).toBeNull();
    });

    it('sanitizes tracking parameters in the href attribute', () => {
      render(
        <SafeAnchor href="https://sunshade.icu/article?fbclid=strip_me&tab=1">
          Article Link
        </SafeAnchor>
      );

      const anchor = screen.getByRole('link', { name: /Article Link/i });
      expect(anchor.getAttribute('href')).toBe('https://sunshade.icu/article?tab=1');
    });
  });

  describe('TrustBadge Component', () => {
    it('renders emerald theme for trusted tier (>= 85)', () => {
      render(<TrustBadge score={92} />);
      const badge = screen.getByTestId('trust-badge');
      expect(badge.getAttribute('data-status')).toBe('trusted');
      expect(badge.textContent).toBe('92');
    });

    it('renders amber theme for warning tier (60–84)', () => {
      render(<TrustBadge score={72} />);
      const badge = screen.getByTestId('trust-badge');
      expect(badge.getAttribute('data-status')).toBe('warning');
      expect(badge.textContent).toBe('72');
    });

    it('renders crimson theme for danger tier (< 60)', () => {
      render(<TrustBadge score={42} />);
      const badge = screen.getByTestId('trust-badge');
      expect(badge.getAttribute('data-status')).toBe('danger');
      expect(badge.textContent).toBe('42');
    });

    it('renders unverified badge when score is not provided', () => {
      render(<TrustBadge />);
      const badge = screen.getByTestId('trust-badge');
      expect(badge.getAttribute('data-status')).toBe('unknown');
    });
  });
});
