/* ============================================================
   Mathub — Python worker for the Code playground
   Loads Pyodide (CPython compiled to WebAssembly) inside a Web Worker
   so long loops cannot freeze the page and Stop can kill them. Streams
   stdout/stderr back as they happen, feeds input() from a list of
   lines, and after each run ships drawings: a turtle module written
   here that records moves and renders an SVG, and matplotlib figures
   as PNGs (Agg backend).
   ============================================================ */
'use strict';
let pyodide = null; let stdinLines = []; const dec = new TextDecoder();
const post = (type, data) => self.postMessage(Object.assign({ type }, data || {}));

const SETUP_PY = String.raw`
import sys, math, os as _os, types as _types, warnings as _warnings, html as _html
_os.environ['MPLBACKEND'] = 'Agg'
_warnings.filterwarnings('ignore', message='.*non-GUI backend.*')
_warnings.filterwarnings('ignore', message='.*non-interactive.*')
_warnings.filterwarnings('ignore', message='.*FigureCanvasAgg.*')

class _TState:
    def __init__(self): self.reset()
    def reset(self):
        self.items = []; self.turtles = []; self.bg = 'white'; self.w = 400; self.h = 300; self.cm = 1.0
        self.minx = self.maxx = self.miny = self.maxy = 0.0; self.events = set(); self.title = ''
_TS = _TState()
def _fmt(v):
    if isinstance(v, float):
        s = '%.2f' % v
        return s.rstrip('0').rstrip('.') if '.' in s else s
    return str(v)
def _col(c):
    if isinstance(c, (tuple, list)):
        m = 255.0 if _TS.cm == 255 else 1.0
        vals = [max(0, min(255, int(round(float(x) * (255.0 / m))))) for x in list(c)[:3]]
        while len(vals) < 3: vals.append(0)
        return '#%02x%02x%02x' % tuple(vals)
    return _html.escape(str(c).strip().lower().replace(' ', ''), quote=True)
def _bump(x, y):
    _TS.minx = min(_TS.minx, x); _TS.maxx = max(_TS.maxx, x); _TS.miny = min(_TS.miny, y); _TS.maxy = max(_TS.maxy, y)
def _arrow(x, y, h, color, scale=1.0):
    r = math.radians(h); c, s = math.cos(r), math.sin(r); L = 12 * scale; Wd = 6 * scale
    pts = [(L, 0), (-L * 0.6, Wd), (-L * 0.3, 0), (-L * 0.6, -Wd)]
    rot = ['%s,%s' % (_fmt(x + px * c - py * s), _fmt(-(y + px * s + py * c))) for px, py in pts]
    return '<polygon points="%s" fill="%s" stroke="black" stroke-width="0.8" opacity="0.9"/>' % (' '.join(rot), color)

class Turtle:
    def __init__(self, shape='classic', undobuffersize=1000, visible=True):
        self._init_state(visible); _TS.turtles.append(self)
    def _init_state(self, visible=True):
        self._x = 0.0; self._y = 0.0; self._h = 0.0; self._pen = True; self._pc = 'black'; self._fc = 'black'
        self._w = 1; self._vis = visible; self._fill = None; self._fill_at = 0; self._speed = 3
    def position(self): return (self._x, self._y)
    pos = position
    def xcor(self): return self._x
    def ycor(self): return self._y
    def heading(self): return self._h % 360
    def isdown(self): return self._pen
    def isvisible(self): return self._vis
    def filling(self): return self._fill is not None
    def _xy(self, x, y):
        if y is None: x, y = (x.position() if hasattr(x, 'position') else x)
        return float(x), float(y)
    def distance(self, x, y=None):
        x, y = self._xy(x, y); return math.hypot(self._x - x, self._y - y)
    def towards(self, x, y=None):
        x, y = self._xy(x, y); return math.degrees(math.atan2(y - self._y, x - self._x)) % 360
    def penup(self): self._pen = False
    pu = up = penup
    def pendown(self): self._pen = True
    pd = down = pendown
    def pensize(self, w=None):
        if w is None: return self._w
        self._w = w
    width = pensize
    def pencolor(self, *a):
        if not a: return self._pc
        self._pc = _col(a[0] if len(a) == 1 else a)
    def fillcolor(self, *a):
        if not a: return self._fc
        self._fc = _col(a[0] if len(a) == 1 else a)
    def color(self, *a):
        if not a: return (self._pc, self._fc)
        if len(a) == 1: self._pc = self._fc = _col(a[0])
        elif len(a) == 2: self._pc = _col(a[0]); self._fc = _col(a[1])
        else: self._pc = self._fc = _col(a)
    def speed(self, s=None):
        if s is None: return self._speed
        self._speed = s
    def shape(self, *a, **k): pass
    def shapesize(self, *a, **k): pass
    turtlesize = shapesize
    def resizemode(self, *a): pass
    def hideturtle(self): self._vis = False
    ht = hideturtle
    def showturtle(self): self._vis = True
    st = showturtle
    def _line(self, x0, y0, x1, y1):
        if self._pen:
            _TS.items.append('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="%s" stroke-linecap="round"/>' % (_fmt(x0), _fmt(-y0), _fmt(x1), _fmt(-y1), self._pc, _fmt(self._w)))
        if self._fill is not None: self._fill.append((x1, y1))
        _bump(x1, y1)
    def _go(self, d):
        r = math.radians(self._h); nx, ny = self._x + d * math.cos(r), self._y + d * math.sin(r)
        self._line(self._x, self._y, nx, ny); self._x, self._y = nx, ny
    def forward(self, d): self._go(d)
    fd = forward
    def backward(self, d): self._go(-d)
    bk = back = backward
    def left(self, a): self._h = (self._h + a) % 360
    lt = left
    def right(self, a): self._h = (self._h - a) % 360
    rt = right
    def setheading(self, a): self._h = a % 360
    seth = setheading
    def goto(self, x, y=None):
        x, y = self._xy(x, y); self._line(self._x, self._y, x, y); self._x, self._y = x, y
    setpos = setposition = goto
    def setx(self, x): self.goto(x, self._y)
    def sety(self, y): self.goto(self._x, y)
    def home(self): self.goto(0, 0); self._h = 0.0
    def circle(self, radius, extent=None, steps=None):
        if extent is None: extent = 360
        if steps is None:
            frac = abs(extent) / 360.0; steps = 1 + int(min(11 + abs(radius) / 6.0, 59.0) * frac)
        w = 1.0 * extent / steps; w2 = 0.5 * w; l = 2.0 * radius * math.sin(math.radians(w2))
        if radius < 0: l, w, w2 = -l, -w, -w2
        self.left(w2)
        for _ in range(steps):
            self._go(l); self.left(w)
        self.left(-w2)
    def dot(self, size=None, *color):
        if size is None: size = max(self._w + 4, 2 * self._w)
        c = _col(color[0] if len(color) == 1 else color) if color else self._pc
        _TS.items.append('<circle cx="%s" cy="%s" r="%s" fill="%s"/>' % (_fmt(self._x), _fmt(-self._y), _fmt(size / 2.0), c)); _bump(self._x, self._y)
    def stamp(self):
        _TS.items.append(_arrow(self._x, self._y, self._h, self._fc, 0.8)); return len(_TS.items)
    def clearstamp(self, *a): pass
    def clearstamps(self, *a): pass
    def begin_fill(self): self._fill = [(self._x, self._y)]; self._fill_at = len(_TS.items)
    def end_fill(self):
        pts = self._fill or []; at = self._fill_at; self._fill = None
        if len(pts) >= 3:
            _TS.items.insert(at, '<polygon points="%s" fill="%s" stroke="none"/>' % (' '.join('%s,%s' % (_fmt(x), _fmt(-y)) for x, y in pts), self._fc))
    def write(self, arg, move=False, align='left', font=('Arial', 8, 'normal')):
        fam = font[0] if isinstance(font, (tuple, list)) and font else 'Arial'
        size = font[1] if isinstance(font, (tuple, list)) and len(font) > 1 else 8
        weight = 'bold' if isinstance(font, (tuple, list)) and len(font) > 2 and 'bold' in str(font[2]) else 'normal'
        anchor = {'left': 'start', 'center': 'middle', 'right': 'end'}.get(align, 'start')
        _TS.items.append('<text x="%s" y="%s" fill="%s" font-family="%s" font-size="%s" font-weight="%s" text-anchor="%s">%s</text>' % (_fmt(self._x), _fmt(-self._y), self._pc, _html.escape(str(fam), quote=True), _fmt(size * 1.33), weight, anchor, _html.escape(str(arg))))
        _bump(self._x + len(str(arg)) * size * 0.65, self._y + size * 1.4)
        if move: self._x += len(str(arg)) * size * 0.65
    def clear(self): _TS.items = []
    def reset(self): self.clear(); self._init_state(self._vis)
    def undo(self):
        if _TS.items: _TS.items.pop()
    def onclick(self, *a, **k): _TS.events.add('click')
    def onrelease(self, *a, **k): _TS.events.add('release')
    def ondrag(self, *a, **k): _TS.events.add('drag')
    def getscreen(self): return _screen
    def getturtle(self): return self
    getpen = getturtle
    def __repr__(self): return '<Turtle at (%s, %s) heading %s>' % (_fmt(self._x), _fmt(self._y), _fmt(self._h))
Pen = RawTurtle = RawPen = Turtle

class _Screen:
    def bgcolor(self, *a):
        if not a: return _TS.bg
        _TS.bg = _col(a[0] if len(a) == 1 else a)
    def title(self, t): _TS.title = str(t)
    def setup(self, width=400, height=300, startx=None, starty=None):
        if isinstance(width, float) and width <= 1: width = 400
        if isinstance(height, float) and height <= 1: height = 300
        _TS.w, _TS.h = int(width), int(height)
    def screensize(self, w=None, h=None, bg=None):
        if w: _TS.w = int(w)
        if h: _TS.h = int(h)
        if bg: _TS.bg = _col(bg)
        return (_TS.w, _TS.h)
    def window_width(self): return _TS.w
    def window_height(self): return _TS.h
    def colormode(self, m=None):
        if m is None: return _TS.cm
        _TS.cm = m
    def tracer(self, *a, **k): pass
    def update(self): pass
    def delay(self, *a): pass
    def listen(self, *a, **k): pass
    def onkey(self, fun, key): _TS.events.add('key "%s"' % key)
    onkeypress = onkeyrelease = onkey
    def onclick(self, *a, **k): _TS.events.add('click')
    onscreenclick = onclick
    def ontimer(self, fun, t=0): _TS.events.add('timer')
    def mainloop(self): pass
    done = mainloop
    def exitonclick(self): pass
    def bye(self): pass
    def clear(self): _TS.items = []; _TS.bg = 'white'
    clearscreen = clear
    def reset(self):
        _TS.items = []
        for t in _TS.turtles: t._init_state(t._vis)
    resetscreen = reset
    def turtles(self): return list(_TS.turtles)
    def register_shape(self, *a, **k): pass
    addshape = register_shape
    def textinput(self, title, prompt): return input(str(prompt) + ' ')
    def numinput(self, title, prompt, default=None, minval=None, maxval=None):
        try: return float(input(str(prompt) + ' '))
        except Exception: return default
    def getcanvas(self): return None
    def mode(self, *a): return 'standard'
_screen = _Screen()
def Screen(): return _screen
TurtleScreen = _Screen

_turtle = _types.ModuleType('turtle')
_turtle.__doc__ = 'Mathub turtle: records the drawing and shows the finished picture in the playground.'
_default = None
def _dt():
    global _default
    if _default is None or _default not in _TS.turtles: _default = Turtle()
    return _default
_TURTLE_FUNCS = ['forward', 'fd', 'backward', 'bk', 'back', 'left', 'lt', 'right', 'rt', 'goto', 'setpos', 'setposition', 'setx', 'sety', 'setheading', 'seth', 'home', 'circle', 'dot', 'stamp', 'clearstamp', 'clearstamps', 'undo', 'speed', 'position', 'pos', 'towards', 'xcor', 'ycor', 'heading', 'distance', 'pendown', 'pd', 'down', 'penup', 'pu', 'up', 'pensize', 'width', 'isdown', 'color', 'pencolor', 'fillcolor', 'filling', 'begin_fill', 'end_fill', 'reset', 'clear', 'write', 'showturtle', 'st', 'hideturtle', 'ht', 'isvisible', 'shape', 'shapesize', 'turtlesize', 'resizemode', 'onclick', 'onrelease', 'ondrag', 'getscreen', 'getturtle', 'getpen']
_SCREEN_FUNCS = ['bgcolor', 'title', 'setup', 'screensize', 'window_width', 'window_height', 'colormode', 'tracer', 'update', 'delay', 'listen', 'onkey', 'onkeypress', 'onkeyrelease', 'onscreenclick', 'ontimer', 'mainloop', 'done', 'exitonclick', 'bye', 'clearscreen', 'resetscreen', 'turtles', 'register_shape', 'addshape', 'textinput', 'numinput', 'getcanvas', 'mode']
def _mk_t(name):
    def f(*a, **k): return getattr(_dt(), name)(*a, **k)
    f.__name__ = name; return f
def _mk_s(name):
    def f(*a, **k): return getattr(_screen, name)(*a, **k)
    f.__name__ = name; return f
for _n in _TURTLE_FUNCS: setattr(_turtle, _n, _mk_t(_n))
for _n in _SCREEN_FUNCS: setattr(_turtle, _n, _mk_s(_n))
for _n, _v in [('Turtle', Turtle), ('Pen', Turtle), ('RawTurtle', Turtle), ('RawPen', Turtle), ('Screen', Screen), ('TurtleScreen', _Screen), ('getscreen', lambda: _screen)]: setattr(_turtle, _n, _v)
_turtle.__all__ = _TURTLE_FUNCS + _SCREEN_FUNCS + ['Turtle', 'Pen', 'RawTurtle', 'RawPen', 'Screen', 'TurtleScreen']
sys.modules['turtle'] = _turtle

def _mathub_flush():
    out = []
    if _TS.items or _TS.turtles:
        pad = 24.0
        bw = (_TS.maxx - _TS.minx) + 2 * pad; bh = (_TS.maxy - _TS.miny) + 2 * pad
        if bw <= _TS.w and bh <= _TS.h and abs(_TS.minx) + pad <= _TS.w / 2 and abs(_TS.maxx) + pad <= _TS.w / 2 and abs(_TS.miny) + pad <= _TS.h / 2 and abs(_TS.maxy) + pad <= _TS.h / 2:
            w, h, cx, cy = float(_TS.w), float(_TS.h), 0.0, 0.0
        else:
            w = max(float(_TS.w), bw); h = max(float(_TS.h), bh); cx = (_TS.minx + _TS.maxx) / 2.0; cy = (_TS.miny + _TS.maxy) / 2.0
        body = ''.join(_TS.items)
        for t in _TS.turtles:
            if t._vis: body += _arrow(t._x, t._y, t._h, t._pc, 1.0)
        x0, y0 = cx - w / 2.0, -cy - h / 2.0
        svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" width="%s" height="%s" role="img" aria-label="turtle drawing"><rect x="%s" y="%s" width="%s" height="%s" fill="%s"/>%s</svg>' % (_fmt(x0), _fmt(y0), _fmt(w), _fmt(h), _fmt(w), _fmt(h), _fmt(x0), _fmt(y0), _fmt(w), _fmt(h), _TS.bg, body)
        out.append(('svg', svg))
        if _TS.events:
            out.append(('note', 'This program registered turtle events (' + ', '.join(sorted(_TS.events)) + '). The playground shows the finished picture; key, mouse and timer events need a real window, so run it in IDLE or VS Code to interact with it.'))
        _TS.reset()
    if 'matplotlib.pyplot' in sys.modules:
        import matplotlib.pyplot as plt, io, base64
        for n in plt.get_fignums():
            b = io.BytesIO(); plt.figure(n).savefig(b, format='png', dpi=100, bbox_inches='tight')
            out.append(('png', base64.b64encode(b.getvalue()).decode('ascii')))
        plt.close('all')
    return out
`;

function cleanTraceback(err) {
  let msg = String(err && err.message || err); if (msg.startsWith('PythonError: ')) msg = msg.slice(13);
  const lines = msg.split('\n'); let out = [];
  const first = lines.findIndex(l => /^\s*File "main\.py"/.test(l));
  if (/^Traceback/.test(lines[0]) && first > 0) out = [lines[0]].concat(lines.slice(first));
  else { let skipNext = false; for (const line of lines) { if (skipNext) { skipNext = false; if (/^\s+\S/.test(line) && !/^\s*File /.test(line)) continue; } if (/_pyodide\/|\/pyodide\/|<\d+ lines>|run_async\(globals, locals\)/.test(line) || /^\s*File "<exec>"/.test(line)) { skipNext = true; continue; } out.push(line); } }
  let text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (/EOF when reading a line/.test(text)) text += '\n\nHint: this program calls input() but ran out of input. Type the answers in the "Program input" box, one per line, and run again.';
  return text + '\n';
}
function flushGraphics() {
  if (!pyodide) return;
  try { const r = pyodide.runPython('_mathub_flush()'); const items = r.toJs(); r.destroy(); for (const it of items) { const kind = it[0], data = it[1]; if (kind === 'note') post('stderr', { text: data + '\n' }); else post('image', { kind, data }); } } catch (e) { post('stderr', { text: 'Could not render the drawing: ' + (e && e.message || e) + '\n' }); }
}

self.onmessage = async e => {
  const m = e.data || {};
  if (m.type === 'init') {
    try {
      self.importScripts(m.indexURL + 'pyodide.js');
      pyodide = await self.loadPyodide({ indexURL: m.indexURL });
      pyodide.setStdout({ write: buf => { post('stdout', { text: dec.decode(buf) }); return buf.length; }, isatty: false });
      pyodide.setStderr({ write: buf => { post('stderr', { text: dec.decode(buf) }); return buf.length; }, isatty: false });
      pyodide.setStdin({ stdin: () => (stdinLines.length ? stdinLines.shift() : null), isatty: false });
      pyodide.runPython(SETUP_PY);
      post('ready', { version: pyodide.version });
    } catch (err) { post('error', { text: 'Python could not start: ' + (err && err.message || err) }); }
    return;
  }
  if (m.type === 'run') {
    if (!pyodide) { post('error', { text: 'Python is not ready yet.' }); return; }
    stdinLines = m.stdin ? String(m.stdin).replace(/\r/g, '').split('\n') : []; if (stdinLines.length && stdinLines[stdinLines.length - 1] === '') stdinLines.pop();
    const t0 = performance.now(); let ok = true;
    try {
      try { await pyodide.loadPackagesFromImports(m.code, { messageCallback: t => post('loading', { text: String(t) }) }); } catch (err) { post('stderr', { text: 'Could not load a package: ' + (err && err.message || err) + '\n' }); }
      const ns = pyodide.globals.get('dict')();
      try { await pyodide.runPythonAsync(m.code, { globals: ns, filename: 'main.py' }); }
      finally { flushGraphics(); try { ns.destroy(); } catch (e2) {} }
    } catch (err) { ok = false; post('stderr', { text: cleanTraceback(err) }); }
    post('done', { ok, ms: Math.round(performance.now() - t0) });
  }
};
