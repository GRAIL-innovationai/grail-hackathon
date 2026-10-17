/* ============================================================
   Mathub — Code playground (Python in the browser)
   A W3Schools-style "try it" editor for CSCI 127: an editor with line
   numbers, tab and auto-indent, a program-input box for input(), a
   streamed output console that also shows turtle drawings and
   matplotlib charts, an examples menu (course examples plus the code
   blocks in the topic notes), saved snippets, share links and XP for
   successful runs. Python itself runs in assets/pyworker.js (Pyodide,
   loaded from the jsDelivr CDN on first use). View: playground.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, store, toast, settings, setSetting } = App;
  const CDN = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
  const indexURL = () => new URL(global.PYODIDE_URL || settings().pyodideUrl || CDN, location.href).href;
  const W = { worker: null, ready: false, loading: false, running: false, pending: null, timer: 0, draft: 0, root: null, version: '' };
  const b64e = s => btoa(unescape(encodeURIComponent(s))); const b64d = s => { try { return decodeURIComponent(escape(atob(s))); } catch { return ''; } };
  const examples = () => (App.D && App.D.PY_EXAMPLES) || [];
  function findExample(id) {
    if (!id) return null; const e = examples().find(x => x.id === id); if (e) return e;
    const m = id.match(/^sec:([^:]+):(\d+)$/); if (m && App.D) { const s = (App.D.SECTIONS || []).find(x => x.id === m[1]); const c = s && s.code && s.code[+m[2]]; if (c) return { id, title: `${s.label} ${s.title} · ${c.t}`, code: c.c, stdin: c.stdin || '' }; }
    return null;
  }
  const fmtMs = ms => ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
  function setStatus(text, cls) { const el = W.root && $('#py-status', W.root); if (el) { el.textContent = text; el.className = 'chip py-status ' + (cls || ''); } }
  function out(kind, text) {
    const o = W.root && $('#py-out', W.root); if (!o) return; const ph = $('.py-placeholder', o); if (ph) ph.remove();
    if (kind === 'stdout' || kind === 'stderr' || kind === 'note') { const last = o.lastElementChild; if (last && last.dataset.kind === kind && kind !== 'note') last.textContent += text; else { const s = document.createElement('pre'); s.className = 'py-' + kind; s.dataset.kind = kind; s.textContent = text; o.appendChild(s); } }
    else if (kind === 'svg') { const d = document.createElement('div'); d.className = 'py-fig'; d.innerHTML = text; o.appendChild(d); }
    else if (kind === 'png') { const d = document.createElement('div'); d.className = 'py-fig'; const img = document.createElement('img'); img.src = 'data:image/png;base64,' + text; img.alt = 'matplotlib figure'; d.appendChild(img); o.appendChild(d); }
    o.scrollTop = o.scrollHeight;
  }
  function ensureWorker() {
    if (W.worker) return W.worker;
    const w = new Worker('assets/pyworker.js?v=' + encodeURIComponent(global.MATHUB_BUILD || '')); W.worker = w; W.ready = false; W.loading = true; setStatus('Loading Python… (about 12 MB, once)', 'load');
    w.onmessage = e => handle(e.data);
    w.onerror = e => { W.loading = false; W.running = false; setStatus('Python failed to load', 'bad'); out('stderr', 'Could not start Python: ' + (e.message || 'worker error') + '\nCheck your connection; the first load downloads Python from the jsDelivr CDN.\n'); paintButtons(); };
    w.postMessage({ type: 'init', indexURL: indexURL() });
    return w;
  }
  function handle(m) {
    if (m.type === 'ready') { W.ready = true; W.loading = false; W.version = m.version || ''; setStatus('Ready' + (W.version ? ' · Pyodide ' + W.version : ''), 'ok'); paintButtons(); if (W.pending) { const p = W.pending; W.pending = null; send(p); } }
    else if (m.type === 'loading') setStatus(String(m.text).slice(0, 70), 'load');
    else if (m.type === 'stdout' || m.type === 'stderr') out(m.type, m.text);
    else if (m.type === 'image') out(m.kind, m.data);
    else if (m.type === 'done') { W.running = false; clearTimeout(W.timer); setStatus(m.ok ? `Done in ${fmtMs(m.ms)}` : `Stopped by an error after ${fmtMs(m.ms)}`, m.ok ? 'ok' : 'bad'); const o = W.root && $('#py-out', W.root); if (o && !o.children.length) out('note', '(no output)'); paintButtons(); if (m.ok) reward(); }
    else if (m.type === 'error') { W.running = false; W.loading = false; W.pending = null; setStatus('Error', 'bad'); out('stderr', m.text + '\n'); paintButtons(); }
  }
  function send(p) { W.running = true; setStatus('Running…', 'run'); paintButtons(); W.worker.postMessage({ type: 'run', code: p.code, stdin: p.stdin }); clearTimeout(W.timer); W.timer = setTimeout(() => { if (W.running) setStatus('Still running… press Stop if it is stuck', 'run'); }, 15000); }
  function run() {
    if (!W.root || W.running) return; const code = $('#py-code', W.root).value; const stdin = $('#py-stdin', W.root).value; clearOut();
    if (!code.trim()) { out('note', 'Type some Python first.'); return; }
    ensureWorker(); if (!W.ready) { W.pending = { code, stdin }; setStatus('Loading Python… your code runs as soon as it is ready', 'load'); paintButtons(); return; }
    send({ code, stdin });
  }
  function stop() { if (W.worker) { W.worker.terminate(); W.worker = null; } W.ready = false; W.loading = false; W.running = false; W.pending = null; clearTimeout(W.timer); setStatus('Stopped · Python reloads on the next run', ''); out('note', '[stopped]'); paintButtons(); }
  function clearOut() { const o = W.root && $('#py-out', W.root); if (o) o.innerHTML = ''; }
  function paintButtons() { if (!W.root) return; const r = $('#py-run', W.root), s = $('#py-stop', W.root); if (r) r.disabled = W.running; if (s) s.disabled = !W.running && !W.loading; }
  function reward() { const t = new Date().toISOString().slice(0, 10); const s = settings().pyRuns || {}; const n = s.d === t ? s.n : 0; if (n < 10 && App.addXP) { App.addXP(2); setSetting('pyRuns', { d: t, n: n + 1 }); } if (App.markActivity) App.markActivity(); }
  function editorKeys(e) {
    const ta = e.target;
    if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart, en = ta.selectionEnd; if (e.shiftKey) { const ls = ta.value.lastIndexOf('\n', s - 1) + 1; if (ta.value.slice(ls, ls + 4) === '    ') { ta.value = ta.value.slice(0, ls) + ta.value.slice(ls + 4); ta.selectionStart = ta.selectionEnd = Math.max(ls, s - 4); } } else { ta.value = ta.value.slice(0, s) + '    ' + ta.value.slice(en); ta.selectionStart = ta.selectionEnd = s + 4; } ta.dispatchEvent(new Event('input', { bubbles: true })); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    else if (e.key === 'Enter') { e.preventDefault(); const s = ta.selectionStart; const ls = ta.value.lastIndexOf('\n', s - 1) + 1; const line = ta.value.slice(ls, s); const ind = (line.match(/^ */) || [''])[0]; const extra = /:\s*(#.*)?$/.test(line) ? '    ' : ''; const ins = '\n' + ind + extra; ta.value = ta.value.slice(0, s) + ins + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = s + ins.length; ta.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  function paintGutter() { const ta = $('#py-code', W.root), g = $('#py-gutter', W.root); if (!ta || !g) return; const n = ta.value.split('\n').length; if (+g.dataset.n !== n) { g.dataset.n = n; g.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); } g.scrollTop = ta.scrollTop; }
  function loadCode(code, stdin, title) { const ta = $('#py-code', W.root); ta.value = code; $('#py-stdin', W.root).value = stdin || ''; const t = $('#py-title', W.root); if (t) t.textContent = title || ''; paintGutter(); store.set('pyDraft', code); clearOut(); const o = $('#py-out', W.root); if (o) o.innerHTML = '<div class="py-placeholder muted small">Press Run (or Ctrl+Enter). Output, drawings and charts appear here.</div>'; ta.focus(); }

  App.views.playground = {
    title: 'Code playground',
    render(root, param, query) {
      W.root = root; const exs = examples(); const q = query || {}; let code = null, stdin = '', title = '';
      if (q.code) { code = b64d(q.code); title = 'Shared code'; } else if (q.ex) { const e = findExample(q.ex); if (e) { code = e.code; stdin = e.stdin || ''; title = e.title; } }
      if (code === null) { code = store.get('pyDraft', null); if (code === null) { const e = exs[0]; code = e ? e.code : 'print("Hello, world!")'; title = e ? e.title : ''; stdin = e ? e.stdin || '' : ''; } }
      const snippets = store.get('snippets', []); const groups = [...new Set(exs.map(e => e.group))];
      root.innerHTML = App.pageHead('Code playground', 'Write Python and run it right here, like in the labs. Turtle drawings and matplotlib charts show up in the output. Nothing is uploaded: Python runs inside your browser.', `<span class="chip py-status${W.ready ? ' ok' : ''}" id="py-status">${W.ready ? 'Ready' : 'Python loads on the first run (about 12 MB, once)'}</span>`) + `
        <div class="py-lab">
          <div class="panel py-editor-panel">
            <div class="py-toolbar"><select class="select sm" id="py-example" aria-label="Load an example"><option value="">Examples…</option>${groups.map(g => `<optgroup label="${esc(g)}">${exs.filter(e => e.group === g).map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('')}</optgroup>`).join('')}</select>
              <span class="py-actions"><button class="btn primary sm" id="py-run" data-action="py-run" title="Run (Ctrl+Enter)">${icon('play', 13)} Run</button><button class="btn sm" id="py-stop" data-action="py-stop" disabled>${icon('pause', 13)} Stop</button><button class="btn sm ghost" data-action="py-save" title="Save as a snippet">${icon('download', 13)} Save</button><button class="btn sm ghost" data-action="py-share" title="Copy a link to this code">${icon('link', 13)} Share</button><button class="btn sm ghost" data-action="py-new" title="Empty editor">${icon('file', 13)} New</button></span></div>
            <div class="small muted py-title" id="py-title">${esc(title)}</div>
            <div class="py-editor"><pre class="py-gutter" id="py-gutter" aria-hidden="true"></pre><textarea id="py-code" class="py-code" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" aria-label="Python code" placeholder="print('Hello, Bobcats!')">${esc(code)}</textarea></div>
            <details class="py-stdin-wrap"${stdin ? ' open' : ''}><summary class="small">Program input <span class="muted">· one line per input()</span></summary><textarea id="py-stdin" class="input mono" rows="3" placeholder="Lines that input() will read, in order">${esc(stdin)}</textarea></details>
            ${snippets.length ? `<div class="py-snips"><span class="eyebrow">My snippets</span>${snippets.map(s => `<span class="chip py-snip"><button class="py-snip-load" data-action="py-load" data-id="${esc(s.id)}">${esc(s.name)}</button><button class="py-snip-x" data-action="py-del" data-id="${esc(s.id)}" title="Delete snippet">${icon('x', 10)}</button></span>`).join('')}</div>` : ''}
          </div>
          <div class="panel py-out-panel"><div class="panel-h"><div class="panel-title">${icon('list')} Output</div><button class="btn xs ghost" data-action="py-clear">Clear</button></div><div class="py-out" id="py-out"><div class="py-placeholder muted small">Press Run (or Ctrl+Enter). Output, drawings and charts appear here.</div></div></div>
        </div>
        <p class="small muted mt-2">${icon('info', 12)} Runs on your device with Pyodide (CPython compiled for browsers), downloaded from the jsDelivr CDN the first time. NumPy, pandas and matplotlib load the first time you import them. Turtle programs are drawn as a finished picture; key and mouse events need a real window. Files you write exist only during the run. 2 XP for every successful run, up to 10 a day.</p>`;
      paintGutter(); paintButtons();
      const ta = $('#py-code', root); ta.addEventListener('keydown', editorKeys); ta.addEventListener('input', () => { paintGutter(); clearTimeout(W.draft); W.draft = setTimeout(() => store.set('pyDraft', ta.value), 400); }); ta.addEventListener('scroll', () => { $('#py-gutter', root).scrollTop = ta.scrollTop; });
      $('#py-example', root).addEventListener('change', e => { const v = e.target.value; if (!v) return; const ex2 = findExample(v); if (ex2) loadCode(ex2.code, ex2.stdin || '', ex2.title); e.target.value = ''; });
      bind(root, {
        'py-run': run, 'py-stop': stop, 'py-clear': clearOut,
        'py-save': () => { const name = prompt('Name this snippet:'); if (!name) return; const list = store.get('snippets', []); list.push({ id: 's' + Date.now().toString(36), name: name.trim().slice(0, 40) || 'Snippet', code: ta.value, t: Date.now() }); store.set('snippets', list.slice(-30)); toast('Snippet saved'); this.render(root, param, {}); },
        'py-load': b => { const s = store.get('snippets', []).find(x => x.id === b.dataset.id); if (s) loadCode(s.code, '', s.name); },
        'py-del': b => { store.set('snippets', store.get('snippets', []).filter(x => x.id !== b.dataset.id)); this.render(root, param, {}); },
        'py-share': async () => { const url = App.siteBase() + App.link('playground', null, { code: b64e(ta.value) }); try { await navigator.clipboard.writeText(url); toast('Link copied. Anyone who opens it sees this code in the playground.'); } catch { prompt('Copy this link:', url); } },
        'py-new': () => loadCode('', '', '')
      });
      if (q.run) run();
    },
    unmount() { W.root = null; clearTimeout(W.timer); clearTimeout(W.draft); }
  };
  App.playground = { run, stop, ready: () => W.ready };
})(window);
