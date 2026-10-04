import { describe, it, expect, vi } from 'vitest';
import {
  validateTaxonomyPath,
  runSync,
  verifyCdnEndpoint,
} from '../../../../scripts/sync-kenney-r2.mjs';

describe('Cloudflare R2 Taxonomy Validation', () => {
  it('accepts valid modular character paths', () => {
    const res = validateTaxonomyPath('assets/kenney/modular-characters/base_01.png');
    expect(res.valid).toBe(true);
  });

  it('accepts valid playing card paths', () => {
    const res = validateTaxonomyPath('assets/kenney/cards/spades_10.png');
    expect(res.valid).toBe(true);
  });

  it('accepts valid UI audio paths', () => {
    const res = validateTaxonomyPath('assets/kenney/ui-pack/sounds/click-a.ogg');
    expect(res.valid).toBe(true);
  });

  it('rejects keys without assets/kenney/ prefix', () => {
    const res = validateTaxonomyPath('other/path/image.png');
    expect(res.valid).toBe(false);
  });

  it('handles dry-run mode without invoking remote uploader', async () => {
    const mockUploader = vi.fn();
    const res = await runSync({ dryRun: true, uploader: mockUploader });
    expect(mockUploader).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('invokes uploader for each validated file in active mode', async () => {
    const uploadedKeys: string[] = [];
    const mockUploader = vi.fn((bucket, key) => {
      uploadedKeys.push(key);
    });

    const res = await runSync({ dryRun: false, uploader: mockUploader });
    expect(res.success).toBe(true);
    expect(mockUploader).toHaveBeenCalled();
    expect(uploadedKeys.length).toBeGreaterThan(0);
    expect(uploadedKeys[0]).toMatch(/^assets\/kenney\//);
  });

  it('propagates errors and aborts when uploader fails', async () => {
    const failingUploader = vi.fn(() => {
      throw new Error('R2 write permission denied');
    });

    await expect(
      runSync({ dryRun: false, uploader: failingUploader })
    ).rejects.toThrow('R2 write permission denied');
  });
});
