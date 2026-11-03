export class History {
  constructor(limit = 20) { this.limit = limit; this.clear(); }
  clear() { this.past = []; this.future = []; }
  add(command) {
    this.past.push(command);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }
  undo() {
    const command = this.past.pop();
    if (!command) return false;
    command.undo(); this.future.push(command); return true;
  }
  redo() {
    const command = this.future.pop();
    if (!command) return false;
    command.redo(); this.past.push(command); return true;
  }
}

export function changeFeatures(image, ids, patch) {
  const selected = new Set(ids);
  return image.features.map(feature => selected.has(feature.id) ? { ...feature, ...patch } : feature);
}
