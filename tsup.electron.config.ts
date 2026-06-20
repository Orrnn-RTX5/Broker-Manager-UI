import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['electron/main.ts'],
  outDir: 'dist-electron',
  clean: true,
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  minify: false,
  splitting: false,
  bundle: true,
  external: ['electron'],
  outExtension: () => ({ js: '.cjs' }),
});
