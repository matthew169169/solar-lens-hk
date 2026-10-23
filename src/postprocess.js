import { contours } from 'd3-contour';

export function iou(a, b) {
  const w = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const h = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const intersection = w * h;
  return intersection / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - intersection || 1);
}
export function decode(outputs, threshold = .35, maskThreshold = .5) {
  const detection = outputs.find(t => t.dims.length === 3);
  const proto = outputs.find(t => t.dims.length === 4);
  if (!detection || !proto) throw new Error('Expected YOLO segmentation outputs (detections and mask prototypes).');
  const [, channels, count] = detection.dims;
  const [, masks, mh, mw] = proto.dims;
  const classes = channels - 4 - masks;
  if (classes < 1 || count < channels) throw new Error('Unsupported model output layout.');
  const d = detection.data, p = proto.data, boxes = [];
  for (let i = 0; i < count; i++) {
    let score = 0;
    for (let c = 0; c < classes; c++) score = Math.max(score, d[(4 + c) * count + i]);
    if (score < threshold) continue;
    const x = d[i], y = d[count + i], w = d[2 * count + i], h = d[3 * count + i];
    boxes.push({ i, score, x1: Math.max(0, x - w / 2), y1: Math.max(0, y - h / 2), x2: Math.min(640, x + w / 2), y2: Math.min(640, y + h / 2) });
  }
  boxes.sort((a, b) => b.score - a.score);
  const keep = [];
  for (const box of boxes) { if (keep.every(k => iou(k, box) < .45)) keep.push(box); if (keep.length >= 300) break; }
  const binary = new Uint8Array(mw * mh);
  const logit = Math.log(maskThreshold / (1 - maskThreshold));
  let maxScore = 0;
  for (const box of keep) {
    maxScore = Math.max(maxScore, box.score);
    const x1 = Math.max(0, Math.floor(box.x1 / 640 * mw)), x2 = Math.min(mw, Math.ceil(box.x2 / 640 * mw));
    const y1 = Math.max(0, Math.floor(box.y1 / 640 * mh)), y2 = Math.min(mh, Math.ceil(box.y2 / 640 * mh));
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) {
      const at = y * mw + x;
      if (binary[at]) continue;
      let value = 0;
      for (let k = 0; k < masks; k++) value += d[(4 + classes + k) * count + box.i] * p[k * mw * mh + at];
      if (value > logit) binary[at] = 1;
    }
  }
  const result = contours().size([mw, mh]).smooth(false).thresholds([.5])(binary)[0];
  return { polygons: result.coordinates.map(poly => poly.map(ring => ring.map(([x, y]) => [x / mw * 640, y / mh * 640]))), score: maxScore, rawInstances: keep.length };
}
