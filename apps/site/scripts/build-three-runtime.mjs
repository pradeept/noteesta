import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));

await build({
  entryPoints: [fileURLToPath(new URL('../src/three-artifact-runtime.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('../public/three-artifact-runtime.js', import.meta.url)),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  minify: true,
  absWorkingDir: root,
});
