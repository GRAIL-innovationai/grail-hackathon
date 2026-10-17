const WIDTH = 1200;
const HEIGHT = 900;
const INK = '#1a2a6c';
const PEN_CSS_WIDTH = 2.7;
const MATH_FONT = '"Cambria Math", "Segoe UI", Georgia, serif';

const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
const id = () => globalThis.crypto?.randomUUID?.() || `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Export the shape the student actually sees, not a stretched 4:3 bitmap.
export function getExportSize(displayWidth, displayHeight) {
  const width = Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : WIDTH;
  const height = Number.isFinite(displayHeight) && displayHeight > 0 ? displayHeight : HEIGHT;
  const scale = Math.min(2, 1400 / width, 1600 / height);
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

function rowFingerprint(entries) {
  // A pair of independent 32-bit hashes is sufficient for local change detection.
  // Hash visible content, not the row number or other rows' state.
  const content = JSON.stringify([...entries].sort((a, b) => a.index - b.index).map(({s}) =>
    s.kind === 'text' ? ['text', s.id, s.text, s.x, s.y] :
      ['stroke', s.id, s.inkWidth ?? null, s.points.map(p => [p.x, p.y])]
  ));
  let first = 2166136261, second = 2246822519;
  for (let i = 0; i < content.length; i++) {
    const value = content.charCodeAt(i);
    first = Math.imul(first ^ value, 16777619);
    second = Math.imul(second ^ value, 3266489917);
  }
  return `row-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function bounds(stroke) {
  if (stroke.kind === 'text') {
    const size = Number.isFinite(stroke.fontSize) ? stroke.fontSize : 48;
    return { x: stroke.x, y: stroke.y - size * .96, width: stroke.width, height: size * 1.2 };
  }
  const xs = stroke.points.map(p => p.x), ys = stroke.points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

// Geometry stays in board coordinates. The same normalized boxes are sent to
// the reader and used by the UI, so model guesses never position underlines.
export function groupStrokesIntoLines(strokes, {height = HEIGHT} = {}) {
  const entries = strokes.filter(s => s.kind === 'text' || s.points?.length).map((s, index) => ({s, index, b: bounds(s)}));
  entries.sort((a, b) => a.b.y + a.b.height / 2 - b.b.y - b.b.height / 2);
  const groups = [];
  for (const entry of entries) {
    const center = entry.b.y + entry.b.height / 2;
    let match = null, best = Infinity;
    for (const group of groups) {
      const gap = Math.max(group.top - entry.b.y - entry.b.height, entry.b.y - group.bottom, 0);
      const distance = Math.abs(center - (group.top + group.bottom) / 2);
      const tall = Math.max(group.bottom - group.top, entry.b.height);
      if (gap <= 19 && distance <= Math.max(37, tall * .67) && distance < best) { match = group; best = distance; }
    }
    if (!match) {
      match = { items: [], top: entry.b.y, bottom: entry.b.y + entry.b.height, left: entry.b.x, right: entry.b.x + entry.b.width };
      groups.push(match);
    }
    match.items.push(entry);
    match.top = Math.min(match.top, entry.b.y);
    match.bottom = Math.max(match.bottom, entry.b.y + entry.b.height);
    match.left = Math.min(match.left, entry.b.x);
    match.right = Math.max(match.right, entry.b.x + entry.b.width);
  }
  return groups.sort((a, b) => a.top - b.top).map((group, index) => {
    const oldest = [...group.items].sort((a, b) => a.index - b.index)[0].s;
    const onlyText = group.items.every(item => item.s.kind === 'text');
    const box = {
      x: clamp((group.left - 6) / WIDTH, 0, 1),
      y: clamp((group.top - 6) / height, 0, 1),
      width: clamp((group.right - group.left + 12) / WIDTH, .015, 1),
      height: clamp((group.bottom - group.top + 12) / height, .018, 1),
    };
    return { id: oldest.id, fingerprint: rowFingerprint(group.items), number: index + 1, ...(onlyText ? {text: group.items.sort((a,b) => a.b.x - b.b.x).map(item => item.s.text).join(' ')} : {}), bbox: box, y: (group.top + group.bottom) / 2 / height };
  });
}

// Explicit step rows use the entire canvas as one math statement. Fractions,
// long division, and nested work must never be split by their vertical layout.
export function summarizeStrokes(strokes, {id: rowId, height = HEIGHT} = {}) {
  const entries = strokes.filter(s => s.kind === 'text' || s.points?.length).map((s, index) => ({s, index, b: bounds(s)}));
  if (!entries.length) return null;
  const left = Math.min(...entries.map(item => item.b.x));
  const top = Math.min(...entries.map(item => item.b.y));
  const right = Math.max(...entries.map(item => item.b.x + item.b.width));
  const bottom = Math.max(...entries.map(item => item.b.y + item.b.height));
  const x = clamp((left - 8) / WIDTH, 0, 1), y = clamp((top - 8) / height, 0, 1);
  const onlyText = entries.every(item => item.s.kind === 'text');
  return {
    id: rowId || entries[0].s.id,
    fingerprint: rowFingerprint(entries),
    ...(onlyText ? {text: [...entries].sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x).map(item => item.s.text).join(' ')} : {}),
    bbox: {x, y, width: Math.max(.001, clamp((right + 8) / WIDTH, 0, 1) - x), height: Math.max(.001, clamp((bottom + 8) / height, 0, 1) - y)},
    bounds: {left, top, right, bottom},
  };
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export class Whiteboard {
  constructor(canvas, {onChange = () => {}, ariaLabel, logicalHeight = HEIGHT} = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = onChange;
    this.logicalHeight = Number.isFinite(logicalHeight) && logicalHeight > 0 ? logicalHeight : HEIGHT;
    this.strokes = [];
    this.history = [];
    this.tool = 'pen';
    this.active = null;
    this.pointer = null;
    this.pointerType = null;
    this._drawing = false;
    canvas.width = WIDTH;
    canvas.height = this.height;
    canvas.style.touchAction = 'none';
    canvas.setAttribute('aria-label', ariaLabel || canvas.getAttribute?.('aria-label') || 'Math whiteboard. Draw with a pen, finger, or mouse. Use Type a step for keyboard input.');
    this.handlers = {
      pointerdown: e => this.start(e), pointermove: e => this.move(e),
      pointerup: e => this.end(e), pointercancel: e => this.end(e),
      lostpointercapture: e => this.end(e),
      contextmenu: e => e.preventDefault(),
    };
    for (const [name, fn] of Object.entries(this.handlers)) canvas.addEventListener(name, fn);
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.render());
      this.resizeObserver.observe(canvas);
    }
    this.render();
  }
  get isDrawing() { return this._drawing; }
  get width() { return WIDTH; }
  get height() { return this.logicalHeight; }
  setLogicalHeight(height) {
    if (!Number.isFinite(height) || height <= 0) return false;
    this.logicalHeight = height;
    this.render();
    return true;
  }
  isEmpty() { return this.strokes.length === 0; }
  getState() { return JSON.parse(JSON.stringify(this.strokes)); }
  setState(state) {
    const input = Array.isArray(state) ? state : state?.strokes;
    if (!Array.isArray(input)) return;
    this.strokes = input.slice(0, 2000).filter(s => s && typeof s.id === 'string' &&
      (s.kind === 'text' ? typeof s.text === 'string' && [s.x,s.y,s.width].every(Number.isFinite) :
      Array.isArray(s.points) && s.points.length && s.points.length < 15000 && s.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
    this.strokes = JSON.parse(JSON.stringify(this.strokes));
    this.history = [];
    this.render();
  }
  snapshot() {
    this.history.push(this.getState());
    if (this.history.length > 60) this.history.shift();
  }
  setTool(tool) {
    this.tool = tool === 'eraser' ? 'eraser' : 'pen';
    this.canvas.style.cursor = this.tool === 'eraser' ? 'cell' : 'crosshair';
  }
  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width * WIDTH, 0, WIDTH), y: clamp((e.clientY - r.top) / r.height * this.height, 0, this.height), p: e.pointerType === 'pen' ? clamp(e.pressure || .5, .15, 1) : .5 };
  }
  start(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this._drawing) {
      if (e.pointerType !== 'pen' || this.pointerType !== 'touch') return;
      // A palm may land before the stylus. Roll back that whole touch
      // interaction, including accidental erasing, before giving the pen control.
      this.strokes = this.history.pop() || [];
      const touchPointer = this.pointer;
      this._drawing = false;
      this.active = null;
      this.pointer = null;
      this.pointerType = null;
      if (this.canvas.hasPointerCapture(touchPointer)) this.canvas.releasePointerCapture(touchPointer);
    }
    e.preventDefault();
    this.pointer = e.pointerId;
    this.pointerType = e.pointerType;
    this._drawing = true;
    this.snapshot();
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.dispatchEvent(new CustomEvent('boardactivity', {detail: {drawing: true}}));
    const p = this.point(e);
    // Pen barrel erasers are recognized without changing the selected toolbar tool.
    this.erasing = this.tool === 'eraser' || e.button === 5 || (e.buttons & 32) !== 0;
    if (this.erasing) this.erase(p);
    else {
      const displayWidth = this.canvas.getBoundingClientRect().width || WIDTH;
      this.active = {id: id(), kind: 'stroke', inkWidth: PEN_CSS_WIDTH * WIDTH / displayWidth, points: [p]};
      this.strokes.push(this.active);
    }
    this.render();
  }
  move(e) {
    if (!this._drawing || e.pointerId !== this.pointer) return;
    e.preventDefault();
    const events = e.getCoalescedEvents?.() || [e];
    for (const event of events.length ? events : [e]) {
      const p = this.point(event);
      if (this.erasing) this.erase(p);
      else if (this.active) {
        const last = this.active.points.at(-1);
        if (Math.hypot(last.x - p.x, last.y - p.y) > .7) this.active.points.push(p);
      }
    }
    this.render();
  }
  end(e) {
    if (!this._drawing || e.pointerId !== this.pointer) return;
    this._drawing = false;
    this.active = null;
    this.pointer = null;
    this.pointerType = null;
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    this.render();
    this.canvas.dispatchEvent(new CustomEvent('boardactivity', {detail: {drawing: false}}));
    this.onChange(this.getState());
  }
  erase(p) {
    // Hit-test in screen pixels: a compact problem board must not have an
    // eraser that reaches sideways but misses strokes a few pixels above it.
    const rect = this.canvas.getBoundingClientRect();
    const sx = (rect.width || WIDTH) / WIDTH, sy = (rect.height || this.height) / this.height;
    const radius = 16, rx = radius / sx, ry = radius / sy;
    const screenPoint = {x: p.x * sx, y: p.y * sy};
    this.strokes = this.strokes.filter(stroke => {
      const b = bounds(stroke);
      if (p.x < b.x - rx || p.x > b.x + b.width + rx || p.y < b.y - ry || p.y > b.y + b.height + ry) return true;
      if (stroke.kind === 'text') return false;
      if (stroke.points.length === 1) return Math.hypot(screenPoint.x - stroke.points[0].x * sx, screenPoint.y - stroke.points[0].y * sy) > radius;
      return !stroke.points.some((point, index) => index && distanceToSegment(screenPoint,
        {x: stroke.points[index - 1].x * sx, y: stroke.points[index - 1].y * sy},
        {x: point.x * sx, y: point.y * sy}) < radius);
    });
  }
  undo() {
    if (this._drawing) return;
    const previous = this.history.pop();
    if (!previous) return;
    this.strokes = previous;
    this.render();
    this.onChange(this.getState());
  }
  clear() {
    if (this._drawing) return;
    this.snapshot();
    this.strokes = [];
    this.render();
    this.onChange(this.getState());
  }
  addText(value) {
    const text = String(value).trim().slice(0, 180);
    if (!text || this._drawing) return false;
    this.snapshot();
    const lines = this.getLines();
    const lastBottom = lines.length ? Math.max(...lines.map(line => (line.bbox.y + line.bbox.height) * this.height)) : 35;
    const metrics = this.textMetrics(text, 82);
    const y = Math.max(100, lastBottom + Math.max(80, metrics.fontSize * 1.5));
    if (y > this.height - 35) { this.history.pop(); return false; }
    this.strokes.push({id: id(), kind: 'text', text, x: 82, y, ...metrics});
    this.render();
    this.onChange(this.getState());
    return true;
  }
  textMetrics(text, x) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = (rect.width || WIDTH) / WIDTH, sy = (rect.height || this.height) / this.height;
    const available = Math.max(20, (WIDTH - x) * sx - 18);
    this.ctx.font = `27px ${MATH_FONT}`;
    const desiredWidth = this.ctx.measureText(text).width;
    const pixels = 27 * Math.min(1, available / Math.max(1, desiredWidth));
    this.ctx.font = `${pixels}px ${MATH_FONT}`;
    return {width: this.ctx.measureText(text).width / sx, fontSize: pixels / sy};
  }
  layoutText() {
    for (const stroke of this.strokes) {
      if (stroke.kind === 'text') Object.assign(stroke, this.textMetrics(stroke.text, stroke.x));
    }
  }
  updateText(id, value) {
    const text = String(value).trim().slice(0, 180);
    const stroke = this.strokes.find(item => item.id === id && item.kind === 'text');
    if (!text || !stroke || this._drawing) return false;
    if (stroke.text === text) return true;
    this.snapshot();
    stroke.text = text;
    Object.assign(stroke, this.textMetrics(text, stroke.x));
    this.render();
    this.onChange(this.getState());
    return true;
  }
  getLines() { this.layoutText(); return groupStrokesIntoLines(this.strokes, {height: this.height}); }
  draw(context, {width = WIDTH, height = this.height, displayWidth = WIDTH, minLineWidth = 0} = {}) {
    const sx = width / WIDTH, sy = height / this.height;
    context.strokeStyle = INK;
    context.fillStyle = INK;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const stroke of this.strokes) {
      if (stroke.kind === 'text') {
        context.font = `${(stroke.fontSize || 48) * sy}px ${MATH_FONT}`;
        context.fillText(stroke.text, stroke.x * sx, stroke.y * sy);
        continue;
      }
      const points = stroke.points;
      const inkWidth = Number.isFinite(stroke.inkWidth) && stroke.inkWidth > 0 ? stroke.inkWidth * sx : PEN_CSS_WIDTH * width / displayWidth;
      const screenScale = width / displayWidth;
      context.lineWidth = Math.max(minLineWidth, 2.3 * screenScale, Math.min(inkWidth, 4 * screenScale));
      if (points.length === 1) {
        context.beginPath(); context.arc(points[0].x * sx, points[0].y * sy, context.lineWidth / 2, 0, Math.PI * 2); context.fill(); continue;
      }
      context.beginPath();
      context.moveTo(points[0].x * sx, points[0].y * sy);
      for (let i = 1; i < points.length - 1; i++) {
        const next = points[i + 1];
        context.quadraticCurveTo(points[i].x * sx, points[i].y * sy, (points[i].x + next.x) / 2 * sx, (points[i].y + next.y) / 2 * sy);
      }
      context.lineTo(points.at(-1).x * sx, points.at(-1).y * sy);
      context.stroke();
    }
  }
  render() {
    const rect = this.canvas.getBoundingClientRect();
    const displayWidth = rect.width || WIDTH, displayHeight = rect.height || this.height;
    const scale = Math.min(globalThis.devicePixelRatio || 1, 2, 2400 / displayWidth, 2400 / displayHeight);
    const width = Math.max(1, Math.round(displayWidth * scale));
    const height = Math.max(1, Math.round(displayHeight * scale));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.layoutText();
    this.ctx.clearRect(0, 0, width, height);
    this.draw(this.ctx, {width, height, displayWidth});
  }
  toDataURL() {
    this.layoutText();
    const output = document.createElement('canvas');
    const rect = this.canvas.getBoundingClientRect();
    const {width, height} = getExportSize(rect.width, rect.height);
    output.width = width; output.height = height;
    const context = output.getContext('2d');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
    this.draw(context, {width, height, displayWidth: rect.width || WIDTH, minLineWidth: 2.5});
    return output.toDataURL('image/png');
  }
  destroy() {
    this.resizeObserver?.disconnect();
    for (const [name, fn] of Object.entries(this.handlers)) this.canvas.removeEventListener(name, fn);
  }
}
