/* ============================================================
   Mathub — personal notes and highlights
   Every topic page gets a "My notes" box (saved as you type) and a
   highlighter: select any text in the notes and tap Highlight. Both
   live in the class data (mynotes: {sec: text}, mynotesAt: {sec: ts},
   highlights: {sec: [text]}) so they sync with the account.
   #/<class>/mynotes lists everything you wrote, per topic.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, bind, toast, store } = App;
  const notesOf = () => store.get('mynotes', {}); const hlOf = () => store.get('highlights', {});
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function applyHighlights(root, sec) {
    const list = hlOf()[sec] || []; if (!list.length) return;
    $$('.note-block', root).forEach(block => { list.forEach(txt => { const needle = esc(txt); if (!needle || block.innerHTML.includes(`<mark class="hl">${needle}</mark>`)) return; const i = block.innerHTML.indexOf(needle); if (i < 0) return; block.innerHTML = block.innerHTML.slice(0, i) + `<mark class="hl" title="Click to remove this highlight">${needle}</mark>` + block.innerHTML.slice(i + needle.length); }); });
  }
  function saveHighlight(sec, txt) { const h = hlOf(); const arr = h[sec] || []; if (!arr.includes(txt)) arr.push(txt); h[sec] = arr.slice(-60); store.set('highlights', h); }
  function removeHighlight(sec, txt) { const h = hlOf(); h[sec] = (h[sec] || []).filter(x => x !== txt); if (!h[sec].length) delete h[sec]; store.set('highlights', h); }
  App.paintMyNotes = function (root, sec) {
    if (!sec || !root) return; const id = sec.id; const host = document.createElement('div'); host.className = 'panel mynotes'; host.id = 'mynotes';
    host.innerHTML = `<div class="panel-h"><div class="panel-title">${icon('pen')} My notes</div><span class="small muted" id="mn-state">${notesOf()[id] ? 'Saved' : 'Private to you, synced to your account'}</span></div><textarea class="input mn-text" id="mn-text" rows="4" placeholder="Your own words: what clicked, what to ask in office hours, the mistake you keep making.">${esc(notesOf()[id] || '')}</textarea><div class="row between mt-1"><span class="small muted">Select any text above and tap Highlight. Highlights show up in <a href="${App.link('mynotes')}">My notes</a>.</span><a class="btn xs" href="${App.link('mynotes')}">${icon('book', 12)} All my notes</a></div>`;
    const anchor = $('.notes-layout .stack', root) || root; anchor.appendChild(host);
    let t = null; $('#mn-text', host).addEventListener('input', e => { $('#mn-state', host).textContent = 'Saving…'; clearTimeout(t); t = setTimeout(() => { const n = notesOf(); const at = store.get('mynotesAt', {}); const v = e.target.value; if (v.trim()) { n[id] = v; at[id] = Date.now(); } else { delete n[id]; delete at[id]; } store.set('mynotes', n); store.set('mynotesAt', at); $('#mn-state', host).textContent = 'Saved'; }, 500); });
    applyHighlights(root, id);
    // highlighter: a floating button near the selection
    let btn = null; const hide = () => { if (btn) { btn.remove(); btn = null; } };
    root.addEventListener('mouseup', e => { setTimeout(() => { const s = global.getSelection(); const txt = s && String(s).trim(); hide(); if (!txt || txt.length < 3 || txt.length > 300 || !s.rangeCount) return; const range = s.getRangeAt(0); const block = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement; if (!block || !block.closest('.note-block') || block.closest('#mynotes')) return; const r = range.getBoundingClientRect(); btn = document.createElement('button'); btn.className = 'btn sm primary hl-btn'; btn.innerHTML = `${icon('pen', 12)} Highlight`; btn.style.top = (global.scrollY + r.top - 40) + 'px'; btn.style.left = (global.scrollX + r.left + r.width / 2) + 'px'; document.body.appendChild(btn); btn.addEventListener('mousedown', ev => { ev.preventDefault(); saveHighlight(id, txt); s.removeAllRanges(); hide(); applyHighlights(root, id); if (App.sfx) App.sfx.play('tap'); toast('Highlighted. It is saved with your notes.', 1600); }); }, 10); });
    root.addEventListener('click', e => { const m = e.target.closest('mark.hl'); if (!m) return; if (confirm('Remove this highlight?')) { removeHighlight(id, m.textContent); m.replaceWith(document.createTextNode(m.textContent)); } });
    document.addEventListener('scroll', hide, { passive: true, once: true });
  };
  App.views.mynotes = {
    title: 'My notes', blurb: 'Everything you wrote and highlighted in this class, by topic.',
    render(root) {
      const D = App.D; const n = notesOf(); const h = hlOf(); const secs = (D.SECTIONS || []).filter(s => n[s.id] || (h[s.id] && h[s.id].length));
      root.innerHTML = App.pageHead('My notes', this.blurb, secs.length ? `<button class="btn" data-action="mn-print">${icon('print', 14)} Print</button><button class="btn" data-action="mn-export">${icon('download', 14)} Export text</button>` : '') + (secs.length ? `<div class="stack">${secs.map(s => `<div class="panel"><div class="panel-h"><div class="panel-title"><a href="${App.link('notes', s.id)}">${esc(s.label)} ${esc(s.title)}</a></div><a class="btn xs" href="${App.link('notes', s.id)}">Open topic ${icon('right', 11)}</a></div>${n[s.id] ? `<div class="mn-body">${esc(n[s.id]).replace(/\n/g, '<br>')}</div>` : ''}${h[s.id] && h[s.id].length ? `<div class="eyebrow mt-2 mb-1">Highlights</div><ul class="list">${h[s.id].map(t => `<li><mark class="hl">${esc(t)}</mark></li>`).join('')}</ul>` : ''}</div>`).join('')}</div>` : `<div class="empty">Nothing yet. Open any topic under Section notes, write in the My notes box at the bottom, or select text and tap Highlight.</div>`);
      bind(root, { 'mn-print': () => global.print(), 'mn-export': () => { const txt = secs.map(s => `## ${s.label} ${s.title}\n${n[s.id] ? n[s.id] + '\n' : ''}${(h[s.id] || []).map(t => `> ${t}`).join('\n')}\n`).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = `${D.code.replace(/\s+/g, '-')}-my-notes.txt`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); } });
    }
  };
})(window);
