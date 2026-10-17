import test from 'node:test';
import assert from 'node:assert/strict';
import {SolutionBoard} from '../static/solution-board.js';
import {summarizeStrokes} from '../static/board.js';

const stroke = (id, points) => ({id, kind: 'stroke', points: points.map(([x, y]) => ({x, y}))});

class MockElement {
  constructor(tag, document) {
    this.tagName = tag;
    this.ownerDocument = document;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.captures = new Set();
    this.className = '';
    this.classList = {toggle: (name, enabled) => {
      const classes = new Set(this.className.split(' ').filter(Boolean));
      if (enabled) classes.add(name); else classes.delete(name);
      this.className = [...classes].join(' ');
    }};
    this.context = {
      calls: [], clearRect() {}, beginPath() {}, fill() {},
      arc(...values) { this.calls.push(['arc', ...values]); },
      moveTo(...values) { this.calls.push(['moveTo', ...values]); },
      lineTo(...values) { this.calls.push(['lineTo', ...values]); },
      quadraticCurveTo(...values) { this.calls.push(['quadraticCurveTo', ...values]); },
      stroke() { this.calls.push(['stroke', this.lineWidth]); },
      fillText(...values) { this.calls.push(['fillText', this.font, ...values]); },
      fillRect(...values) { this.calls.push(['fillRect', this.fillStyle, ...values]); },
      save() {}, restore() {}, translate(...values) { this.calls.push(['translate', ...values]); },
      measureText(value) { return {width: value.length * (parseFloat(this.font) || 27) * .5}; },
    };
  }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(key, value) { this.attributes.set(key, value); }
  getAttribute(key) { return this.attributes.get(key); }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) || []), listener]); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener)); }
  dispatchEvent(event) { for (const listener of this.listeners.get(event.type) || []) { listener(event); if (event._stopped) break; } return true; }
  focus() { this.dispatchEvent({type: 'focus'}); }
  scrollIntoView() {}
  get clientWidth() { return this.getBoundingClientRect().width; }
  get clientHeight() { return this._height; }
  getBoundingClientRect() {
    const width = this._width || this.parentElement?.getBoundingClientRect().width || 800;
    let height = this._height || parseFloat(this.style.height) || (this.tagName === 'canvas' ? 160 : 600);
    let top = 0;
    if (this.className.split(' ').includes('solution-step') && this.parentElement?._height) {
      const siblings = this.parentElement.children;
      top = siblings.slice(0, siblings.indexOf(this)).reduce((sum, sibling) => sum + parseFloat(sibling.children.find(child => child.tagName === 'canvas').style.height) + 3, 0);
      height = parseFloat(this.children.find(child => child.tagName === 'canvas').style.height) + 3;
    } else if (this.tagName === 'canvas' && this.parentElement?.parentElement?._height) {
      top = this.parentElement.getBoundingClientRect().top;
    }
    return {left: 0, top, width, height, bottom: top + height, right: width};
  }
  getContext() { return this.context; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.dispatchEvent({type: 'lostpointercapture', pointerId: id}); }
  toDataURL() { return 'data:image/png;base64,test'; }
}

function setup(run, width = 800, viewportHeight) {
  const oldDocument = globalThis.document;
  const document = {created: [], createElement(tag) { const node = new MockElement(tag, this); this.created.push(node); return node; }};
  globalThis.document = document;
  const container = document.createElement('div');
  container._width = width;
  container._height = viewportHeight;
  let changes = 0;
  const board = new SolutionBoard(container, {onChange: () => changes++});
  try { run({board, container, document, changes: () => changes}); }
  finally {
    board.destroy();
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
  }
}

const pointer = (type, x, y, pointerId = 1) => ({
  type, clientX: x, clientY: y, pointerId, pointerType: 'pen', button: 0, buttons: 1, pressure: .5,
  preventDefault() {}, stopImmediatePropagation() { this._stopped = true; },
});

test('all nested fraction and long division strokes stay in their explicit row', () => setup(({board}) => {
  const row = board.rows[0];
  row.board.setState([
    stroke('numerator', [[100, 30], [120, 55]]),
    stroke('outer-bar', [[70, 95], [230, 95]]),
    stroke('inner-top', [[110, 140], [130, 160]]),
    stroke('inner-bar', [[90, 190], [160, 190]]),
    stroke('denominator', [[110, 230], [130, 260]]),
    stroke('division-bracket', [[320, 25], [300, 270], [460, 270]]),
    stroke('working-far-below', [[350, 340], [420, 365]]),
  ]);
  board.expandActiveRow();
  const lines = board.getLines();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].id, row.id);
  assert.equal(lines[0].text, undefined);
  assert.ok(lines[0].bbox.height > .7);
  assert.equal(summarizeStrokes(row.board.strokes, {height: row.board.height}).bounds.bottom, 365);
}));

test('division dots and bar form one API line without any geometric grouping', () => setup(({board}) => {
  board.rows[0].board.setState([
    stroke('top-dot', [[200, 20]]), stroke('division-bar', [[170, 100], [240, 100]]),
    stroke('bottom-dot', [[200, 200]]), stroke('left-number', [[50, 80], [75, 120]]),
  ]);
  assert.equal(board.getLines().length, 1);
  board.addRow();
  assert.equal(board.getLines().length, 1, 'empty rows are not sent to the provider');
  board.activeRow.board.setState([stroke('next', [[100, 30], [130, 60]])]);
  assert.equal(board.getLines().length, 2);
  assert.deepEqual(board.getLines().map(row => row.number), [1, 2]);
}));

test('More space and next row preserve the earlier fingerprint and physical ink position', () => setup(({board}) => {
  const row = board.rows[0];
  row.board.setState([stroke('ink', [[100, 60], [180, 120]])]);
  const before = board.getLines()[0];
  const points = row.board.getState()[0].points;
  const screenY = points[1].y * row.canvas.getBoundingClientRect().height / row.board.height;
  board.expandActiveRow();
  const grown = board.getLines()[0];
  assert.equal(grown.id, before.id);
  assert.equal(grown.fingerprint, before.fingerprint);
  assert.deepEqual(row.board.getState()[0].points, points);
  assert.ok(Math.abs(points[1].y * row.canvas.getBoundingClientRect().height / row.board.height - screenY) < 1e-8);
  board.addRow();
  board.addText('x = 8');
  assert.equal(board.getLines()[0].fingerprint, before.fingerprint);
}));

test('growing while drawing preserves the continuous stroke and one undo action', () => setup(({board, container, changes}) => {
  const row = board.rows[0];
  const activity = [];
  container.addEventListener('boardactivity', event => activity.push(event.detail.drawing));
  row.canvas.dispatchEvent(pointer('pointerdown', 100, 80));
  const initial = row.board.strokes[0].points[0];
  const oldHeight = row.canvas.getBoundingClientRect().height;
  row.canvas.dispatchEvent(pointer('pointermove', 120, 145));
  assert.ok(row.canvas.getBoundingClientRect().height > oldHeight);
  const current = row.board.strokes[0].points.at(-1);
  assert.ok(Math.abs(initial.y * row.canvas.getBoundingClientRect().height / row.board.height - 80) < 1e-8);
  assert.ok(Math.abs(current.y * row.canvas.getBoundingClientRect().height / row.board.height - 145) < 1e-8);
  row.canvas.dispatchEvent(pointer('pointerup', 120, 145));
  assert.equal(changes(), 1);
  assert.deepEqual(activity, [true, false]);
  board.undo();
  assert.equal(board.isEmpty(), true);
  assert.equal(board.rows[0].canvas.getBoundingClientRect().height, oldHeight);
}));

test('editing an earlier typed row preserves later rows and can be undone', () => setup(({board}) => {
  board.addText('2x - 3 = 10');
  board.addText('2x = 13');
  const before = board.getLines();
  assert.equal(board.updateText(before[0].id, '2x - 6 = 10'), true);
  const after = board.getLines();
  assert.equal(after[0].text, '2x - 6 = 10');
  assert.notEqual(after[0].fingerprint, before[0].fingerprint);
  assert.equal(after[1].fingerprint, before[1].fingerprint);
  board.undo();
  assert.deepEqual(board.getLines().map(row => row.text), ['2x - 3 = 10', '2x = 13']);
}));

test('row creation and manual growth have independent undo actions', () => setup(({board}) => {
  board.addText('x/2 = 3');
  const initialHeight = board.rows[0].board.height;
  board.expandActiveRow();
  board.addRow();
  assert.equal(board.rows.length, 2);
  board.undo();
  assert.equal(board.rows.length, 1);
  assert.ok(board.rows[0].board.height > initialHeight);
  board.undo();
  assert.equal(board.rows[0].board.height, initialHeight);
  assert.equal(board.getLines()[0].text, 'x/2 = 3');
}));

test('versioned row state round trips and a legacy flat board migrates once', () => setup(({board}) => {
  board.setState([
    {id: 'old-1', kind: 'text', text: 'x/2 = 3', x: 80, y: 110, width: 220},
    {id: 'old-2', kind: 'text', text: 'x = 6', x: 80, y: 300, width: 150},
  ]);
  assert.deepEqual(board.getLines().map(row => row.text), ['x/2 = 3', 'x = 6']);
  const state = board.getState();
  assert.equal(state.version, 2);
  board.setState(state);
  assert.deepEqual(board.getState(), state);
  assert.deepEqual(board.getLines().map(row => row.id), ['old-1', 'old-2']);
}));

test('composite export contains both full rows and normalized boxes match image offsets', () => setup(({board, document}) => {
  board.addText('x/2 = 3');
  board.addText('x = 6');
  const lines = board.getLines();
  const layout = board._exportLayout();
  board.toDataURL();
  const image = document.created.at(-1);
  assert.ok(image.width <= 1400 && image.height <= 3200);
  assert.equal(image.context.calls.filter(call => call[0] === 'fillText').length, 2);
  assert.deepEqual(image.context.calls[0], ['fillRect', '#ffffff', 0, 0, image.width, image.height]);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index], row = layout.rows[index];
    assert.ok(line.bbox.x >= 0 && line.bbox.x + line.bbox.width <= 1);
    assert.ok(line.bbox.y >= 0 && line.bbox.y + line.bbox.height <= 1);
    assert.ok(Math.abs(line.bbox.y - (row.y + row.summary.bbox.y * row.height) / layout.height) < 1e-9);
  }
  assert.ok(lines[1].bbox.y > lines[0].bbox.y + lines[0].bbox.height);
}));

test('a recognition crop draws only the selected row and keeps every fraction component', () => setup(({board, document}) => {
  board.addText('NEIGHBOR ABOVE');
  board.addRow();
  const selected = board.activeRow;
  selected.board.setState([
    stroke('numerator', [[350, 35], [390, 65]]),
    stroke('fraction-bar', [[300, 100], [600, 100]]),
    stroke('denominator', [[420, 150], [470, 215]]),
    stroke('division-dot', [[650, 55]]),
  ]);
  board.addRow();
  board.addText('NEIGHBOR BELOW');
  const before = board.getLines();
  assert.equal(board.getLineImage(selected.id), 'data:image/png;base64,test');
  const image = document.created.at(-1);
  const calls = image.context.calls;
  assert.deepEqual(calls[0], ['fillRect', '#ffffff', 0, 0, image.width, image.height]);
  assert.equal(calls.filter(call => call[0] === 'fillText').length, 0, 'neighboring text must never enter a row crop');
  assert.equal(calls.filter(call => call[0] === 'stroke').length, 3);
  assert.equal(calls.filter(call => call[0] === 'arc').length, 1, 'division dots are included');
  assert.equal(calls.filter(call => call[0] === 'moveTo').length, 3);
  const translate = calls.find(call => call[0] === 'translate');
  for (const call of calls.filter(call => ['moveTo', 'lineTo', 'arc'].includes(call[0]))) {
    const x = call[1] + translate[1], y = call[2] + translate[2];
    assert.ok(x >= 40 && x <= image.width - 40, 'ink keeps generous horizontal padding');
    assert.ok(y >= 40 && y <= image.height - 40, 'fraction numerator and denominator stay inside the crop');
  }
  assert.ok(image.width < 600 && image.height < 400, 'crop excludes unused full-row space');
  assert.deepEqual(board.getLines(), before, 'crop generation cannot invalidate confirmed reading fingerprints');
}));

test('row crop includes mixed typed and ink content but never another row drawing', () => setup(({board, document}) => {
  board.addText('FIRST ROW');
  board.addRow();
  const selected = board.activeRow;
  selected.board.setState([
    {id: 'typed-part', kind: 'text', text: 'x =', x: 100, y: 100, width: 140},
    stroke('handwritten-value', [[300, 55], [350, 100]]),
  ]);
  board.addRow();
  board.activeRow.board.setState([stroke('other-row', [[700, 45], [1000, 100]])]);
  board.getLineImage(selected.id);
  const calls = document.created.at(-1).context.calls;
  assert.deepEqual(calls.filter(call => call[0] === 'fillText').map(call => call[2]), ['x =']);
  assert.equal(calls.filter(call => call[0] === 'stroke').length, 1);
  assert.ok(calls.find(call => call[0] === 'moveTo')[1] < 500, 'other-row ink is absent');
}));

test('tall fraction crop preserves proportions under the image size cap', () => setup(({board, document}) => {
  const row = board.activeRow;
  for (let index = 0; index < 10; index++) board.expandActiveRow();
  row.board.setState([
    stroke('top', [[150, 20], [500, 80]]),
    stroke('middle', [[100, row.board.height / 2], [700, row.board.height / 2]]),
    stroke('bottom', [[180, row.board.height - 80], [650, row.board.height - 20]]),
  ]);
  board.getLineImage(row.id);
  const image = document.created.at(-1);
  assert.ok(image.width <= 1400 && image.height <= 1600);
  assert.equal(image.height, 1600);
  const calls = image.context.calls;
  const first = calls.find(call => call[0] === 'moveTo');
  const last = calls.filter(call => call[0] === 'lineTo').at(-1);
  const sx = (last[1] - first[1]) / (650 - 150);
  const sy = (last[2] - first[2]) / (row.board.height - 40);
  assert.ok(Math.abs(sx - sy) < 1e-9, 'tall handwriting is uniformly scaled instead of squeezed');
  assert.equal(calls.filter(call => call[0] === 'stroke').length, 3);
}, 305));

test('missing or empty row recognition image returns null without creating an image', () => setup(({board, document}) => {
  const count = document.created.length;
  assert.equal(board.getLineImage('missing'), null);
  assert.equal(board.getLineImage(board.activeRowId), null);
  assert.equal(document.created.length, count);
}));

test('clearing all rows is undoable and a narrow explicit row still fits typed math', () => setup(({board}) => {
  board.addText('2(x - 3) = 10');
  const fingerprint = board.getLines()[0].fingerprint;
  board.expandActiveRow();
  assert.equal(board.getLines()[0].fingerprint, fingerprint);
  board.clear();
  assert.equal(board.isEmpty(), true);
  assert.equal(board.rows.length, 1);
  board.undo();
  assert.equal(board.getLines()[0].text, '2(x - 3) = 10');
}, 305));

test('transient padding-only layout cannot inflate typed demo rows after reset or resize', () => setup(({board, container}) => {
  board.addText('2(x - 3) = 10');
  board.addText('2x - 3 = 10');
  const secondId = board.getLines()[1].id;
  container._width = 8;
  board.render();
  board.updateText(secondId, '2x - 6 = 10');
  board.addText('2x = 16');
  container._width = 850.667;
  board.render();
  board.addText('x = 8');
  for (let i = 0; i < 20; i++) board.render();
  assert.deepEqual(board.getLines().map(line => line.text), ['2(x - 3) = 10', '2x - 6 = 10', '2x = 16', 'x = 8']);
  for (const row of board.rows) {
    assert.ok(row.canvas.getBoundingClientRect().height >= 120);
    assert.ok(row.canvas.getBoundingClientRect().height < 200, 'typed rows must not grow from a transient8px layout measurement');
    assert.ok(row.board.height < 350);
  }
}));

test('initializing in an8px temporary container stays bounded when full layout arrives', () => setup(({board, container}) => {
  board.addText('x/2 = 3');
  container._width = 850.667;
  board.render();
  assert.ok(board.rows[0].canvas.getBoundingClientRect().height < 200);
  assert.equal(board.getLines()[0].text, 'x/2 = 3');
}, 8));

test('oversized saved typed rows recover readable height and text without deleting work', () => setup(({board}) => {
  const texts = ['2(x - 3) = 10', '2x - 6 = 10', '2x = 16', 'x = 8'];
  board.setState({version: 2, activeRowId: 'row-3', rows: texts.map((text, index) => ({
    id: `row-${index}`, height: 24000,
    strokes: [{id: `typed-${index}`, kind: 'text', text, x: 82, y: index % 2 ? 6110 : 115, width: 300}],
  }))});
  board.render();
  assert.deepEqual(board.getLines().map(line => line.text), texts);
  assert.deepEqual(board.getLines().map(line => line.id), ['row-0', 'row-1', 'row-2', 'row-3']);
  assert.equal(board.activeRowId, 'row-3');
  for (const row of board.rows) {
    assert.equal(row.canvas.getBoundingClientRect().height, 160);
    const textCall = row.canvas.context.calls.filter(call => call[0] === 'fillText').at(-1);
    assert.ok(textCall[4] > 30 && textCall[4] < 120, 'recovered text stays visibly inside the row');
  }
}, 850.667));

test('the initial bare paper is writable near the bottom of the visible viewport', () => setup(({board}) => {
  const row = board.activeRow;
  assert.equal(row.canvas.getBoundingClientRect().height, 720);
  row.canvas.dispatchEvent(pointer('pointerdown', 100, 675));
  row.canvas.dispatchEvent(pointer('pointermove', 160, 680));
  row.canvas.dispatchEvent(pointer('pointerup', 160, 680));
  const point = row.board.getState()[0].points.at(-1);
  assert.ok(Math.abs(point.y * row.canvas.getBoundingClientRect().height / row.board.height - 680) < 1e-8);
  assert.equal(board.getLines().length, 1);
  assert.equal(board.getLines()[0].id, row.id);
}, 800, 720));

test('Next line compacts prior ink without moving it and fills the remaining paper', () => setup(({board}) => {
  const first = board.activeRow;
  first.canvas.dispatchEvent(pointer('pointerdown', 100, 55));
  first.canvas.dispatchEvent(pointer('pointermove', 140, 80));
  first.canvas.dispatchEvent(pointer('pointerup', 140, 80));
  const before = board.getLines()[0];
  const points = first.board.getState()[0].points;
  assert.equal(board.addRow(), true);
  assert.equal(first.canvas.getBoundingClientRect().height, 120);
  assert.equal(board.activeRow.canvas.getBoundingClientRect().height, 597);
  assert.equal(board.getLines()[0].fingerprint, before.fingerprint);
  assert.deepEqual(first.board.getState()[0].points, points);
  assert.ok(Math.abs(points.at(-1).y * first.canvas.getBoundingClientRect().height / first.board.height - 80) < 1e-8);
  board.undo();
  assert.equal(board.rows.length, 1);
  assert.equal(board.activeRow.canvas.getBoundingClientRect().height, 720);
  assert.equal(board.getLines()[0].fingerprint, before.fingerprint);
}, 800, 720));

test('typed additions compact completed rows while preserving text and cache fingerprints', () => setup(({board}) => {
  board.addText('x + 2 = 5');
  const before = board.getLines()[0];
  board.addText('x = 3');
  assert.equal(board.rows[0].canvas.getBoundingClientRect().height, 120);
  assert.equal(board.rows[1].canvas.getBoundingClientRect().height, 597);
  assert.equal(board.getLines()[0].fingerprint, before.fingerprint);
  const state = board.getState();
  board.setState(state);
  assert.equal(board.rows[0].canvas.getBoundingClientRect().height, 120);
  assert.deepEqual(board.getLines().map(line => line.text), ['x + 2 = 5', 'x = 3']);
  assert.equal(board.getLines()[0].fingerprint, before.fingerprint);
}, 800, 720));

test('viewport resizing never compresses or clips existing lower-page handwriting', () => setup(({board, container}) => {
  const row = board.activeRow;
  row.canvas.dispatchEvent(pointer('pointerdown', 100, 660));
  row.canvas.dispatchEvent(pointer('pointermove', 140, 680));
  row.canvas.dispatchEvent(pointer('pointerup', 140, 680));
  const before = board.getLines()[0];
  const points = row.board.getState()[0].points;
  for (const height of [300, 900, 500]) {
    container._height = height;
    board.render();
    assert.ok(row.canvas.getBoundingClientRect().height >= 712);
    assert.ok(Math.abs(points.at(-1).y * row.canvas.getBoundingClientRect().height / row.board.height - 680) < 1e-8);
    assert.equal(board.getLines()[0].fingerprint, before.fingerprint);
    assert.deepEqual(row.board.getState()[0].points, points);
  }
}, 800, 720));
