import { mkdir, copyFile, readdir } from 'node:fs/promises';
await mkdir('public/ort', { recursive: true });
for (const name of await readdir('node_modules/onnxruntime-web/dist')) {
  if (name.startsWith('ort-wasm-simd-threaded.') && (name.endsWith('.mjs') || name.endsWith('.wasm'))) await copyFile(`node_modules/onnxruntime-web/dist/${name}`, `public/ort/${name}`);
}
