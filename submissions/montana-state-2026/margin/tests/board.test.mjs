import test from 'node:test';
import assert from 'node:assert/strict';
import { groupStrokesIntoLines, getExportSize, Whiteboard } from '../static/board.js';

const stroke = (id, x, y, width = 20, height = 30) => ({id, kind: 'stroke', points: [{x,y},{x:x+width,y:y+height}]});

test('groups separate handwritten symbols into correctly positioned lines', () => {
  const lines = groupStrokesIntoLines([stroke('a', 60, 100), stroke('b', 100, 102), stroke('c', 70, 200), stroke('d',110,205)]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].id,'a');
  assert.equal(lines[1].id,'c');
  assert.ok(lines[0].bbox.y < lines[1].bbox.y);
  assert.ok(lines[0].bbox.height > 0 && lines[0].bbox.height < .1);
});

test('line identity survives adding a later stroke to an earlier line', () => {
  const existing = [stroke('a',60,100),stroke('b',60,200)];
  assert.deepEqual(groupStrokesIntoLines([...existing,stroke('c',100,103)]).map(l=>l.id),['a','b']);
});

test('typed text cannot masquerade as all the content of a mixed handwritten line', () => {
  const text = {id:'t',kind:'text',text:'2x = 10',x:70,y:150,width:150};
  assert.equal(groupStrokesIntoLines([text])[0].text,'2x = 10');
  assert.equal(groupStrokesIntoLines([text,stroke('a',230,112)])[0].text,undefined);
});

test('empty board produces no lines', () => assert.deepEqual(groupStrokesIntoLines([]), []));

function mockCanvas(width = 1200, height = 900) {
  const captures = new Set();
  const listeners = new Map();
  const attributes = new Map();
  const context = {
    calls: [], clearRect() {}, beginPath() {}, arc() {}, fill() {},
    moveTo(...args) { this.calls.push(['moveTo', ...args]); },
    quadraticCurveTo(...args) { this.calls.push(['quadraticCurveTo', ...args]); },
    lineTo(...args) { this.calls.push(['lineTo', ...args]); },
    stroke() { this.calls.push(['stroke', this.lineWidth]); },
    fillText(...args) { this.calls.push(['fillText', this.font, ...args]); },
    fillRect(...args) { this.calls.push(['fillRect', this.fillStyle, ...args]); },
    measureText(text) { return {width: text.length * (parseFloat(this.font) || 27) * .5}; },
  };
  return {
    style: {},
    getContext() { return context; },
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    dispatchEvent(event) { listeners.get(event.type)?.(event); return true; },
    getBoundingClientRect() { return {left: 0, top: 0, width, height}; },
    setPointerCapture(pointerId) { captures.add(pointerId); },
    hasPointerCapture(pointerId) { return captures.has(pointerId); },
    releasePointerCapture(pointerId) {
      captures.delete(pointerId);
      listeners.get('lostpointercapture')?.({pointerId});
    },
  };
}
const pointer = (pointerId, pointerType, x = 100, y = 100) => ({
  pointerId, pointerType, clientX: x, clientY: y, pressure: .5, button: 0, buttons: 1,
  preventDefault() {},
});

test('row fingerprints change only when that row content changes', () => {
  const rows = [stroke('first', 60, 100), stroke('second', 60, 250)];
  const before = groupStrokesIntoLines(rows);
  const after = groupStrokesIntoLines([...rows, stroke('third', 60, 400)]);
  assert.equal(before[0].fingerprint, after[0].fingerprint);
  assert.equal(before[1].fingerprint, after[1].fingerprint);
  assert.equal(before[0].fingerprint, groupStrokesIntoLines(JSON.parse(JSON.stringify(rows)))[0].fingerprint);
  const edited = JSON.parse(JSON.stringify(rows));
  edited[0].points[1].y += 2;
  assert.notEqual(before[0].fingerprint, groupStrokesIntoLines(edited)[0].fingerprint);
  assert.equal(before[1].fingerprint, groupStrokesIntoLines(edited)[1].fingerprint);
});

test('equals and minus strokes stay with their equation without merging the next row', () => {
  const rows = [stroke('x', 60, 100, 25, 32), stroke('minus', 110, 118, 20, 0),
    stroke('top-equals', 155, 110, 22, 0), stroke('bottom-equals', 155, 121, 22, 0),
    stroke('number', 200, 102, 24, 30), stroke('next-line', 60, 220, 25, 32)];
  const grouped = groupStrokesIntoLines(rows);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].id, 'x');
  assert.equal(grouped[1].id, 'next-line');
});

test('a compact handwritten fraction stays in one row', () => {
  const grouped = groupStrokesIntoLines([stroke('numerator', 100, 100, 25, 20),
    stroke('bar', 90, 127, 45, 0), stroke('denominator', 100, 135, 25, 20),
    stroke('equals', 160, 125, 25, 9), stroke('value', 210, 115, 24, 30)]);
  assert.equal(grouped.length, 1);
});

test('export dimensions preserve portrait and wide display ratios within resolution caps', () => {
  for (const [width, height] of [[305, 600], [1200, 450], [2000, 3000], [3000, 600]]) {
    const output = getExportSize(width, height);
    assert.ok(output.width <= 1400 && output.height <= 1600);
    assert.ok(Math.abs(output.width / output.height - width / height) < .004);
  }
});

test('portrait handwriting stays square, readable, and on a white export', () => {
  const canvas = mockCanvas(300, 600);
  const board = new Whiteboard(canvas);
  board.start(pointer(1, 'pen', 50, 70));
  board.move(pointer(1, 'pen', 90, 70));
  board.move(pointer(1, 'pen', 90, 110));
  board.end(pointer(1, 'pen', 90, 110));
  assert.equal(canvas.width, 300);
  assert.equal(canvas.height, 600);
  const screenStroke = canvas.getContext().calls.filter(call => call[0] === 'stroke').at(-1);
  assert.ok(screenStroke[1] >= 2.3 && screenStroke[1] <= 4);

  const exported = mockCanvas();
  exported.toDataURL = () => 'data:image/png;base64,test';
  const previousDocument = globalThis.document;
  globalThis.document = {createElement: () => exported};
  try {
    board.toDataURL();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
  assert.equal(exported.width, 600);
  assert.equal(exported.height, 1200);
  const calls = exported.getContext().calls;
  assert.deepEqual(calls.find(call => call[0] === 'fillRect'), ['fillRect', '#ffffff', 0, 0, 600, 1200]);
  const start = calls.find(call => call[0] === 'moveTo');
  const end = calls.find(call => call[0] === 'lineTo');
  assert.equal(end[1] - start[1], 80);
  assert.equal(end[2] - start[2], 80, 'the same screen distance must export to the same distance on either axis');
  assert.ok(calls.find(call => call[0] === 'stroke')[1] >= 2.5);
});

test('typed steps stay readable on a narrow board and editing preserves later work and undo', () => {
  const canvas = mockCanvas(305, 600);
  let changes = 0;
  const board = new Whiteboard(canvas, {onChange: () => changes++});
  board.addText('2x - 3 = 10');
  board.addText('2x = 13');
  const original = board.getState();
  const rowId = board.getLines()[0].id;
  const fingerprint = board.getLines()[0].fingerprint;
  const rendered = canvas.getContext().calls.filter(call => call[0] === 'fillText').at(-1);
  assert.ok(parseFloat(rendered[1]) >= 24, 'typed math should not shrink with the old1200px bitmap');
  assert.ok(rendered[1].includes('Cambria Math'));
  assert.equal(rendered.length, 5, 'text is rendered uniformly, without a horizontal maxWidth squeeze');
  assert.equal(board.updateText(rowId, '2x - 6 = 10'), true);
  assert.equal(board.strokes[0].text, '2x - 6 = 10');
  assert.deepEqual(board.strokes[1], original[1]);
  assert.notEqual(board.getLines()[0].fingerprint, fingerprint);
  assert.equal(changes, 3);
  board.undo();
  assert.deepEqual(board.getState(), original);
  assert.equal(board.updateText('missing', 'x = 8'), false);
});

test('pen replaces an unfinished palm stroke and preserves one undo step', () => {
  const canvas = mockCanvas();
  let changes = 0;
  const board = new Whiteboard(canvas, {onChange: () => changes++});
  const original = [stroke('existing', 200, 200)];
  board.setState(original);
  board.start(pointer(1, 'touch', 400, 400));
  board.move(pointer(1, 'touch', 440, 420));
  assert.equal(board.strokes.length, 2);

  board.start(pointer(2, 'pen', 100, 100));
  assert.equal(board.pointer, 2);
  assert.equal(canvas.hasPointerCapture(1), false);
  assert.equal(canvas.hasPointerCapture(2), true);
  assert.equal(board.history.length, 1);
  assert.equal(changes, 0, 'preempting touch must not submit an intermediate board');
  assert.equal(board.strokes.length, 2, 'the palm mark was discarded');
  assert.equal(board.strokes[1].points[0].x, 100);

  board.end(pointer(1, 'touch'));
  assert.equal(board.isDrawing, true, 'the late palm release cannot end the pen stroke');
  board.move(pointer(2, 'pen', 140, 120));
  board.end(pointer(2, 'pen', 140, 120));
  assert.equal(changes, 1);
  board.undo();
  assert.deepEqual(board.getState(), original);
  assert.equal(board.history.length, 0);
});

test('secondary touch cannot change or end an active pen stroke', () => {
  const canvas = mockCanvas();
  let changes = 0;
  const board = new Whiteboard(canvas, {onChange: () => changes++});
  board.start(pointer(10, 'pen'));
  board.start(pointer(11, 'touch', 400, 400));
  board.move(pointer(11, 'touch', 450, 450));
  board.end(pointer(11, 'touch'));
  assert.equal(board.pointer, 10);
  assert.equal(board.isDrawing, true);
  assert.equal(board.strokes.length, 1);
  assert.equal(board.history.length, 1);
  assert.equal(canvas.hasPointerCapture(11), false);
  assert.equal(changes, 0);
  board.move(pointer(10, 'pen', 130, 120));
  board.end(pointer(10, 'pen', 130, 120));
  assert.equal(changes, 1);
  assert.equal(board.strokes[0].points.length, 2);
  board.undo();
  assert.equal(board.isEmpty(), true);
});

test('pen preemption restores work accidentally erased by a palm', () => {
  const board = new Whiteboard(mockCanvas());
  const original = [stroke('existing', 200, 200)];
  board.setState(original);
  board.setTool('eraser');
  board.start(pointer(1, 'touch', 210, 210));
  assert.equal(board.isEmpty(), true);
  board.setTool('pen');
  board.start(pointer(2, 'pen', 100, 100));
  board.end(pointer(2, 'pen', 100, 100));
  assert.equal(board.strokes.length, 2);
  assert.deepEqual(board.strokes[0], original[0]);
  board.undo();
  assert.deepEqual(board.getState(), original);
});

test('problem and solution boards keep tools, pointer events, undo, and changes independent', () => {
  const problemCanvas = mockCanvas(800, 110), solutionCanvas = mockCanvas(800, 550);
  let problemChanges = 0, solutionChanges = 0;
  const problem = new Whiteboard(problemCanvas, {onChange: () => problemChanges++, ariaLabel: 'Problem whiteboard'});
  const solution = new Whiteboard(solutionCanvas, {onChange: () => solutionChanges++, ariaLabel: 'Solution whiteboard'});
  problem.start(pointer(1, 'pen', 100, 40));
  problem.move(pointer(1, 'pen', 180, 60));
  problem.end(pointer(1, 'pen', 180, 60));
  solution.addText('2x - 6 = 10');
  const solutionState = solution.getState();
  problem.setTool('eraser');
  assert.equal(solution.tool, 'pen');
  assert.equal(problemCanvas.height, 110);
  assert.equal(solutionCanvas.height, 550);
  assert.equal(problemCanvas.getAttribute('aria-label'), 'Problem whiteboard');
  problem.undo();
  assert.equal(problem.isEmpty(), true);
  assert.deepEqual(solution.getState(), solutionState);
  assert.equal(problemChanges, 2);
  assert.equal(solutionChanges, 1);
  problem.destroy();
  solutionCanvas.dispatchEvent({type: 'pointerdown', ...pointer(3, 'pen', 50, 200)});
  solutionCanvas.dispatchEvent({type: 'pointerup', ...pointer(3, 'pen', 50, 200)});
  assert.equal(solution.strokes.length, 2, 'destroying the problem instance must not remove solution event handlers');
});

test('shallow problem board eraser reaches the same screen distance vertically and horizontally', () => {
  const board = new Whiteboard(mockCanvas(800, 110));
  const draw = () => {
    board.start(pointer(1, 'pen', 100, 40));
    board.move(pointer(1, 'pen', 180, 40));
    board.end(pointer(1, 'pen', 180, 40));
  };
  draw();
  board.setTool('eraser');
  board.start(pointer(2, 'pen', 140, 52));
  board.end(pointer(2, 'pen', 140, 52));
  assert.equal(board.isEmpty(), true, '12screenpixels vertically is within the eraser');
  board.undo();
  board.start(pointer(3, 'pen', 140, 62));
  board.end(pointer(3, 'pen', 140, 62));
  assert.equal(board.strokes.length, 1, '22screenpixels vertically is outside the eraser');
  board.start(pointer(4, 'pen', 192, 40));
  board.end(pointer(4, 'pen', 192, 40));
  assert.equal(board.isEmpty(), true, '12screenpixels horizontally is also within the eraser');
});

test('typed problem text fits a compact board with readable glyphs and valid normalized bounds', () => {
  const canvas = mockCanvas(800, 110);
  const board = new Whiteboard(canvas);
  assert.equal(board.addText('2(x - 3) = 10'), true);
  const box = board.getLines()[0].bbox;
  assert.ok(box.y > 0 && box.y + box.height <= 1);
  const text = canvas.getContext().calls.filter(call => call[0] === 'fillText').at(-1);
  assert.equal(parseFloat(text[1]), 27);
  assert.ok(text[4] > 27 && text[4] < 110);
  assert.deepEqual(getExportSize(800, 110), {width: 1400, height: 193});
});
