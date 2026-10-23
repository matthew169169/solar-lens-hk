import * as ort from 'onnxruntime-web';
import { decode } from './postprocess.js';
let session;
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'load') {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = data.base + 'ort/';
      session = await ort.InferenceSession.create(data.base + 'models/solar.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      self.postMessage({ id, result: { loaded: true } });
    } else {
      if (!session) throw new Error('The solar detector is not loaded.');
      const rgba = new Uint8ClampedArray(data.pixels), size = 640 * 640;
      const rgb = new Float32Array(size * 3);
      for (let i = 0; i < size; i++) { rgb[i] = rgba[i * 4] / 255; rgb[size + i] = rgba[i * 4 + 1] / 255; rgb[size * 2 + i] = rgba[i * 4 + 2] / 255; }
      const input = new ort.Tensor('float32', rgb, [1, 3, 640, 640]);
      const raw = await session.run({ [session.inputNames[0]]: input });
      const result = decode(Object.values(raw), data.threshold);
      for (const tensor of Object.values(raw)) tensor.dispose();
      input.dispose();
      self.postMessage({ id, result });
    }
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
