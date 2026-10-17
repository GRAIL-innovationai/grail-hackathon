import {Whiteboard, groupStrokesIntoLines, summarizeStrokes} from './board.js';

const WIDTH = 1200;
const INITIAL_HEIGHT = 160;
const COMPACT_HEIGHT = 120;
const GROW_BY = 100;
const MAX_ROW_HEIGHT = 1100;
const MIN_LAYOUT_WIDTH = 160;
const MAX_ROWS = 30;
const IMAGE_GAP = 18;
const makeId = () => globalThis.crypto?.randomUUID?.() || `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** One user-created step is one math statement, regardless of its vertical layout. */
export class SolutionBoard {
  constructor(container, {onChange = () => {}} = {}) {
    this.container = container;
    this.onChange = onChange;
    this.rows = [];
    this.activeRowId = null;
    this.tool = 'pen';
    this.history = [];
    this.pendingHistory = null;
    this.mutating = false;
    this.lastWidth = 800;
    this._createRow();
    this._fillLastRow();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.render());
      this.resizeObserver.observe(container);
    }
  }

  get isDrawing() { return this.rows.some(row => row.board.isDrawing); }
  get width() { return WIDTH; }
  get height() { return this._exportLayout().height; }
  get activeRow() { return this.rows.find(row => row.id === this.activeRowId) || this.rows.at(-1); }
  isEmpty() { return this.rows.every(row => row.board.isEmpty()); }
  getRowElement(id) { return this.rows.find(row => row.id === String(id))?.element || null; }
  _width() {
    // A resetting/hidden flex panel can briefly measure only its8px padding.
    // Never turn that transient width into a permanent logical canvas height.
    const measured = [this.rows[0]?.canvas.getBoundingClientRect().width,
      this.container.clientWidth, this.container.getBoundingClientRect().width]
      .find(width => Number.isFinite(width) && width >= MIN_LAYOUT_WIDTH);
    if (measured) this.lastWidth = measured;
    return this.lastWidth;
  }

  getState() {
    return {version: 2, activeRowId: this.activeRowId, rows: this.rows.map(row => ({id: row.id, height: row.board.height, strokes: row.board.getState()}))};
  }

  _remember(state = this.getState()) {
    this.history.push(clone(state));
    if (this.history.length > 60) this.history.shift();
  }

  _notify() { this.onChange(this.getState()); }

  _activate(row, scroll = false) {
    if (!row) return;
    this.activeRowId = row.id;
    for (const item of this.rows) {
      item.element.classList.toggle('is-active', item === row);
      item.element.setAttribute('aria-current', item === row ? 'step' : 'false');
    }
    if (scroll) row.element.scrollIntoView?.({block: 'nearest', behavior: 'smooth'});
  }

  _createRow(saved = {}) {
    if (this.rows.length >= MAX_ROWS) return null;
    const width = this._width();
    const minHeight = INITIAL_HEIGHT * WIDTH / width;
    const maximumHeight = MAX_ROW_HEIGHT * WIDTH / width;
    const requestedHeight = Number.isFinite(saved.height) && saved.height > 0 ? saved.height : minHeight;
    const minimumSavedHeight = Number.isFinite(saved.height) ? COMPACT_HEIGHT * WIDTH / width : minHeight;
    const oversized = requestedHeight > maximumHeight;
    const onlyText = Array.isArray(saved.strokes) && saved.strokes.every(stroke => stroke.kind === 'text');
    const height = oversized && onlyText ? minHeight : Math.max(minimumSavedHeight, Math.min(requestedHeight, maximumHeight));
    let savedStrokes = saved.strokes;
    if (oversized && Array.isArray(savedStrokes)) {
      savedStrokes = clone(savedStrokes);
      const ratio = height / requestedHeight;
      for (const [index, stroke] of savedStrokes.entries()) {
        if (stroke.kind === 'text') stroke.y = onlyText ? (64 + index * 38) * WIDTH / width : stroke.y * ratio;
        else for (const point of stroke.points || []) point.y *= ratio;
      }
    }
    const id = typeof saved.id === 'string' && saved.id.length <= 100 && !this.rows.some(row => row.id === saved.id) ? saved.id : makeId();
    const section = element('section', 'solution-step');
    section.dataset.rowId = id;
    const header = element('div', 'solution-step-header');
    const number = element('span', 'solution-step-number', `Step ${this.rows.length + 1}`);
    const more = element('button', 'solution-step-more', 'More space');
    more.type = 'button';
    more.setAttribute('aria-label', `Add space to step ${this.rows.length + 1}`);
    header.append(number, more);
    const canvas = element('canvas', 'solution-step-canvas');
    canvas.style.width = '100%';
    canvas.style.height = `${height * width / WIDTH}px`;
    canvas.style.display = 'block';
    canvas.tabIndex = 0;
    section.append(header, canvas);
    this.container.append(section);
    const row = {id, element: section, canvas, header, number, more, board: null};
    // Register before Whiteboard's handlers so growth changes the coordinate
    // extent before this pointer sample is converted to logical coordinates.
    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (this.isDrawing && !row.board.isDrawing) {
        event.preventDefault(); event.stopImmediatePropagation?.(); return;
      }
      if (!this.isDrawing) this.pendingHistory = this.getState();
      this._activate(row);
      this._growNearPointer(row, event);
    });
    canvas.addEventListener('pointermove', event => {
      if (row.board.isDrawing && event.pointerId === row.board.pointer) this._growNearPointer(row, event);
    });
    canvas.addEventListener('focus', () => this._activate(row));
    header.addEventListener('click', () => this._activate(row));
    more.addEventListener('click', event => {
      event.preventDefault();
      this._activate(row);
      this.expandActiveRow();
    });
    row.board = new Whiteboard(canvas, {
      logicalHeight: height,
      ariaLabel: `Solution step ${this.rows.length + 1}. Fractions and all work here belong to this step.`,
      onChange: () => {
        if (this.mutating) return;
        if (this.pendingHistory) this._remember(this.pendingHistory);
        this.pendingHistory = null;
        this._notify();
      },
    });
    row.board.setTool(this.tool);
    if (Array.isArray(savedStrokes)) row.board.setState(savedStrokes);
    canvas.addEventListener('boardactivity', event => {
      this.container.dispatchEvent(new CustomEvent('boardactivity', {detail: {...event.detail, rowId: row.id}}));
    });
    this.rows.push(row);
    this._activate(row);
    return row;
  }

  _growNearPointer(row, event) {
    if (row.board.tool === 'eraser') return;
    const rect = row.canvas.getBoundingClientRect();
    if (rect.height && event.clientY >= rect.top + rect.height - 28) this._grow(row, GROW_BY);
  }

  _grow(row, amount) {
    const rect = row.canvas.getBoundingClientRect();
    const previousHeight = rect.height || parseFloat(row.canvas.style.height) || INITIAL_HEIGHT;
    const nextHeight = Math.min(MAX_ROW_HEIGHT, previousHeight + amount);
    if (nextHeight <= previousHeight) return false;
    return this._setRowHeight(row, nextHeight);
  }

  _setRowHeight(row, nextHeight) {
    const previousHeight = row.canvas.getBoundingClientRect().height || parseFloat(row.canvas.style.height) || INITIAL_HEIGHT;
    if (!Number.isFinite(nextHeight) || nextHeight <= 0 || Math.abs(nextHeight - previousHeight) < .5) return false;
    // Increase the coordinate extent by the same ratio as the CSS canvas.
    // Existing points therefore stay at the exact same screen positions.
    row.canvas.style.height = `${nextHeight}px`;
    row.board.setLogicalHeight(row.board.height * nextHeight / previousHeight);
    return true;
  }

  _inkBottom(row) {
    row.board.layoutText();
    const summary = summarizeStrokes(row.board.strokes, {id: row.id, height: row.board.height});
    return summary ? summary.bounds.bottom * row.canvas.getBoundingClientRect().height / row.board.height : 0;
  }

  _compactRow(row) {
    if (!row || row.board.isEmpty()) return;
    const currentHeight = row.canvas.getBoundingClientRect().height;
    this._setRowHeight(row, Math.min(currentHeight, Math.max(COMPACT_HEIGHT, this._inkBottom(row) + 32)));
  }

  _fillLastRow() {
    const row = this.rows.at(-1);
    const viewportHeight = this.container.clientHeight;
    if (!row || !Number.isFinite(viewportHeight) || viewportHeight < INITIAL_HEIGHT) return;
    const top = row.canvas.getBoundingClientRect().top - this.container.getBoundingClientRect().top;
    const padding = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(this.container).paddingBottom) || 0 : 0;
    const available = viewportHeight - top - padding;
    // Fill the visible paper, but retain every existing point when the viewport shrinks.
    const nextHeight = Math.min(MAX_ROW_HEIGHT, Math.max(INITIAL_HEIGHT, available, this._inkBottom(row) + 32));
    this._setRowHeight(row, nextHeight);
  }

  expandActiveRow() {
    if (this.isDrawing || !this.activeRow) return false;
    const before = this.getState();
    if (!this._grow(this.activeRow, GROW_BY)) return false;
    this._remember(before);
    this._notify();
    return true;
  }

  growRow(id = this.activeRowId) {
    const row = this.rows.find(item => item.id === id);
    if (!row) return false;
    this._activate(row);
    return this.expandActiveRow();
  }

  addRow() {
    if (this.isDrawing) return false;
    const last = this.rows.at(-1);
    if (last?.board.isEmpty()) {
      this._fillLastRow();
      this._activate(last, true);
      last.canvas.focus?.({preventScroll: true});
      return true;
    }
    if (this.rows.length >= MAX_ROWS) return false;
    this._remember();
    this._compactRow(last);
    const row = this._createRow();
    this._fillLastRow();
    this._activate(row, true);
    row.canvas.focus?.({preventScroll: true});
    this._notify();
    return true;
  }
  addLine() { return this.addRow(); }

  addText(value) {
    const text = String(value).trim().slice(0, 180);
    if (!text || this.isDrawing) return false;
    const before = this.getState();
    let row = this.activeRow;
    if (!row || !row.board.isEmpty()) {
      if (this.rows.length >= MAX_ROWS) return false;
      this._compactRow(this.rows.at(-1));
      row = this._createRow();
      this._fillLastRow();
    }
    this.mutating = true;
    let success;
    try {
      success = row.board.addText(text);
      if (!success && this._grow(row, GROW_BY)) success = row.board.addText(text);
    } finally { this.mutating = false; }
    if (!success) return false;
    this._remember(before);
    this._activate(row, true);
    this._notify();
    return true;
  }

  updateText(id, value) {
    const row = this.rows.find(item => item.id === String(id) || item.board.strokes.some(stroke => stroke.id === String(id)));
    const text = String(value).trim().slice(0, 180);
    if (!row || !text || this.isDrawing || row.board.isEmpty() || row.board.strokes.some(stroke => stroke.kind !== 'text')) return false;
    this._remember();
    this.mutating = true;
    try {
      const first = clone(row.board.strokes[0]);
      first.text = text;
      row.board.setState([first]);
    } finally { this.mutating = false; }
    this._activate(row);
    this._notify();
    return true;
  }

  setTool(tool) {
    this.tool = tool === 'eraser' ? 'eraser' : 'pen';
    for (const row of this.rows) row.board.setTool(this.tool);
  }

  undo() {
    if (this.isDrawing || !this.history.length) return false;
    const previous = this.history.pop();
    const remaining = this.history;
    this.setState(previous);
    this.history = remaining;
    this._notify();
    return true;
  }

  clear() {
    if (this.isDrawing) return false;
    const previous = this.getState();
    const history = this.history;
    this.setState({version: 2, rows: []});
    this.history = history;
    this._remember(previous);
    this._notify();
    return true;
  }

  _legacyRows(input) {
    const safe = input.filter(stroke => stroke && typeof stroke.id === 'string' &&
      (stroke.kind === 'text' ? typeof stroke.text === 'string' && [stroke.x, stroke.y, stroke.width].every(Number.isFinite) :
        Array.isArray(stroke.points) && stroke.points.length && stroke.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));
    const groups = groupStrokesIntoLines(safe);
    const assigned = groups.map(() => []);
    for (const stroke of safe) {
      const content = summarizeStrokes([stroke]);
      const center = (content.bounds.top + content.bounds.bottom) / 2 / 900;
      let closest = 0;
      for (let i = 1; i < groups.length; i++) if (Math.abs(center - groups[i].y) < Math.abs(center - groups[closest].y)) closest = i;
      assigned[closest]?.push(clone(stroke));
    }
    return groups.map((group, index) => {
      const content = summarizeStrokes(assigned[index]);
      const top = content?.bounds.top || 0;
      const shift = 35 - top;
      const strokes = assigned[index].map(stroke => {
        if (stroke.kind === 'text') stroke.y += shift;
        else for (const point of stroke.points) point.y += shift;
        return stroke;
      });
      return {id: group.id, height: Math.max(INITIAL_HEIGHT * WIDTH / this._width(), (content?.bounds.bottom || top) - top + 80), strokes};
    });
  }

  setState(state) {
    if (this.isDrawing) return false;
    const saved = Array.isArray(state) ? {rows: this._legacyRows(state)} : state?.version === 2 && Array.isArray(state.rows) ? state : {rows: []};
    for (const row of this.rows) row.board.destroy();
    this.rows = [];
    this.container.replaceChildren();
    this.history = [];
    this.pendingHistory = null;
    this.mutating = true;
    try {
      for (const row of saved.rows.slice(0, MAX_ROWS)) this._createRow(row);
      if (!this.rows.length) this._createRow();
    } finally { this.mutating = false; }
    this._activate(this.rows.find(row => row.id === saved.activeRowId) || this.rows.at(-1));
    this._fillLastRow();
    return true;
  }

  render() {
    const width = this._width();
    for (const row of this.rows) {
      const minimumHeight = (row === this.rows.at(-1) ? INITIAL_HEIGHT : COMPACT_HEIGHT) * WIDTH / width;
      const maximumHeight = MAX_ROW_HEIGHT * WIDTH / width;
      let logicalHeight = Math.max(row.board.height, minimumHeight);
      if (logicalHeight > maximumHeight) {
        const onlyText = row.board.strokes.every(stroke => stroke.kind === 'text');
        const nextHeight = onlyText ? minimumHeight : maximumHeight;
        const ratio = nextHeight / logicalHeight;
        for (const [index, stroke] of row.board.strokes.entries()) {
          if (stroke.kind === 'text') stroke.y = onlyText ? (64 + index * 38) * WIDTH / width : stroke.y * ratio;
          else for (const point of stroke.points) point.y *= ratio;
        }
        logicalHeight = nextHeight;
      }
      row.canvas.style.height = `${logicalHeight * width / WIDTH}px`;
      row.board.setLogicalHeight(logicalHeight);
    }
    this._fillLastRow();
  }

  _exportLayout() {
    const width = this._width();
    const rows = [];
    let y = IMAGE_GAP;
    for (const [index, row] of this.rows.entries()) {
      if (row.board.isEmpty()) continue;
      row.board.layoutText();
      const height = row.canvas.getBoundingClientRect().height || row.board.height * width / WIDTH;
      const summary = summarizeStrokes(row.board.strokes, {id: row.id, height: row.board.height});
      rows.push({row, number: index + 1, y, height, summary});
      y += height + IMAGE_GAP;
    }
    return {width, height: Math.max(INITIAL_HEIGHT, y), rows};
  }

  getLines() {
    const layout = this._exportLayout();
    return layout.rows.map(({row, summary, number, y, height}) => {
      const box = summary.bbox;
      const bbox = {x: box.x, y: (y + box.y * height) / layout.height, width: box.width, height: box.height * height / layout.height};
      return {id: row.id, fingerprint: summary.fingerprint, number, ...(summary.text !== undefined ? {text: summary.text} : {}), bbox, y: bbox.y + bbox.height / 2};
    });
  }

  /** A recognition image contains exactly one explicit step, including all fraction levels. */
  getLineImage(id) {
    const row = this.rows.find(item => item.id === String(id));
    if (!row || row.board.isEmpty()) return null;
    row.board.layoutText();
    const summary = summarizeStrokes(row.board.strokes, {id: row.id, height: row.board.height});
    if (!summary) return null;
    const rect = row.canvas.getBoundingClientRect();
    const displayWidth = rect.width >= MIN_LAYOUT_WIDTH ? rect.width : this._width();
    const displayHeight = rect.height > 0 ? rect.height : row.board.height * displayWidth / WIDTH;
    const sx = displayWidth / WIDTH, sy = displayHeight / row.board.height;
    const {left, top, right, bottom} = summary.bounds;
    const inkWidth = Math.max(0, (right - left) * sx);
    const inkHeight = Math.max(0, (bottom - top) * sy);
    const padding = Math.max(24, Math.min(48, Math.max(inkWidth, inkHeight) * .08));
    // Allow the white margin to extend beyond the canvas edges: edge strokes,
    // division dots and descenders must not be clipped by the crop.
    const cropWidth = Math.max(80, inkWidth + padding * 2);
    const cropHeight = Math.max(72, inkHeight + padding * 2);
    const cropX = (left + right) * sx / 2 - cropWidth / 2;
    const cropY = (top + bottom) * sy / 2 - cropHeight / 2;
    const scale = Math.min(2, 1400 / cropWidth, 1600 / cropHeight);
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(cropWidth * scale));
    output.height = Math.max(1, Math.round(cropHeight * scale));
    const context = output.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, output.width, output.height);
    context.save();
    context.translate(-cropX * scale, -cropY * scale);
    row.board.draw(context, {width: displayWidth * scale, height: displayHeight * scale, displayWidth, minLineWidth: 2.5});
    context.restore();
    return output.toDataURL('image/png');
  }

  toDataURL() {
    const layout = this._exportLayout();
    const scale = Math.min(2, 1400 / layout.width, 3200 / layout.height);
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(layout.width * scale));
    output.height = Math.max(1, Math.round(layout.height * scale));
    const context = output.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, output.width, output.height);
    for (const {row, y, height} of layout.rows) {
      context.save();
      context.translate(0, y * scale);
      row.board.draw(context, {width: output.width, height: height * scale, displayWidth: layout.width, minLineWidth: 2.5});
      context.restore();
    }
    return output.toDataURL('image/png');
  }

  destroy() {
    this.resizeObserver?.disconnect();
    for (const row of this.rows) row.board.destroy();
  }
}
