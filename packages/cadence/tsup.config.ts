import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/core/index.ts',
    'src/widgets/index.ts',
    'src/adapters/index.ts',
  ],
  dts: true,
  format: ['cjs', 'esm'],
  minify: true,
  external: ['react', 'react-dom'],
  noExternal: ['@digitalcanopy/ui', /^@digitalcanopy\/ui\//],
});
