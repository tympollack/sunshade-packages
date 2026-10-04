import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  validateTaxonomyPath,
  runSync,
  verifyCdnEndpoint,
} from '../../../../scripts/sync-kenney-r2.mjs';

describe('Cloudflare R2 Taxonomy Validation', () => {
  let tempFixtureDir: string;

  beforeAll(() => {
    tempFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kenney-test-fixtures-'));
    const cardsPack = path.join(tempFixtureDir, 'kenney_cards');
    const charPack = path.join(tempFixtureDir, 'kenney_modular-characters');

    fs.mkdirSync(cardsPack, { recursive: true });
    fs.mkdirSync(charPack, { recursive: true });

    fs.writeFileSync(path.join(cardsPack, 'spades_10.png'), 'fake-png-data');
    fs.writeFileSync(path.join(charPack, 'base_01.png'), 'fake-png-data');
  });

  afterAll(() => {
    if (tempFixtureDir && fs.existsSync(tempFixtureDir)) {
      fs.rmSync(tempFixtureDir, { recursive: true, force: true });
    }
  });

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
    const res = await runSync({ dryRun: true, sourceDir: tempFixtureDir, uploader: mockUploader });
    expect(mockUploader).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
  });

  it('invokes uploader for each validated file in active mode', async () => {
    const uploadedKeys: string[] = [];
    const mockUploader = vi.fn((bucket, key) => {
      uploadedKeys.push(key);
    });

    const res = await runSync({ dryRun: false, sourceDir: tempFixtureDir, uploader: mockUploader });
    expect(res.success).toBe(true);
    expect(mockUploader).toHaveBeenCalled();
    expect(uploadedKeys.length).toBe(2);
    expect(uploadedKeys).toContain('assets/kenney/cards/spades_10.png');
    expect(uploadedKeys).toContain('assets/kenney/modular-characters/base_01.png');
  });

  it('propagates errors and aborts when uploader fails', async () => {
    const failingUploader = vi.fn(() => {
      throw new Error('R2 write permission denied');
    });

    await expect(
      runSync({ dryRun: false, sourceDir: tempFixtureDir, uploader: failingUploader })
    ).rejects.toThrow('R2 write permission denied');
  });
});
