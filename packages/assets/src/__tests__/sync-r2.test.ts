import { describe, it, expect } from 'vitest';
import { validateTaxonomyPath } from '../../../../scripts/sync-kenney-r2.mjs';

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
});
