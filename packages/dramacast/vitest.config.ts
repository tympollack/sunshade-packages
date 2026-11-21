import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@digitalcanopy/reels-engine': path.resolve(__dirname, '../reels-engine/src/index.ts'),
      '@digitalcanopy/cadence/core': path.resolve(__dirname, '../cadence/src/core/index.ts'),
      '@digitalcanopy/cadence': path.resolve(__dirname, '../cadence/src/core/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
