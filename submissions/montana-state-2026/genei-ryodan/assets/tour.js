/* ============================================================
   Mathub — first-visit tour
   Five coach marks on the landing page: Today, your classes, search,
   the Focus room and the account menu. A spotlight cuts a hole in a
   dim overlay around each target; Next, Back, Skip, arrow keys and
   Escape all work. Runs once (settings.tourDone, synced), and again
   from Settings → "Show the tour again".
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, $$, esc, icon, settings, setSetting } = App;
  const STEPS = [
    { sel: '.today-card, .hero-today', title: 'Start with Today', text: 'One plan across every class: flashcards that are due, a lesson on your weakest topic, the daily challenge and what is due soon. Ten minutes here every day is the whole trick.' },
    { sel: '.course-grid', title: 'Your classes', text: 'Every card is a class: topic notes, endless practice, flashcards, the syllabus calendar, tools and a board with your classmates. Pick the classes you take in Settings so only yours show.' },
    { sel: '.hero-actions [data-action="search"]', title: 'Search everything', text: 'Press Ctrl K (⌘ K on a Mac) anywhere to jump to any topic, formula, flashcard, resource or page across all classes.' },
    { sel: '.hero-focus', title: 'The Focus room', text: 'A timer with one task and no phone. Minutes are logged, count toward your streak and quests, and the sound bubble is one tap away.' },
    { sel: '#landing-account', title: 'Your account', text: 'Sign up with a montana.edu email and your progress, flashcards, GPA and preferences follow you to every device. Appearance, reminders and notifications live in Settings.' }
  ];
  const T = { i: 0, el: null, on: false };
  const target = step => { for (const s of step.sel.split(',')) { const el = $(s.trim()); if (el && el.offsetParent !== null) return el; } return null; };
  function layout() {
    if (!T.on || !T.el) return; const step = STEPS[T.i]; const t = target(step); const spot = $('.tour-spot', T.el); const card = $('.tour-card', T.el);
    if (!t) { spot.style.display = 'none'; card.style.top = '20vh'; card.style.left = '50%'; card.style.transform = 'translateX(-50%)'; return; }
    t.scrollIntoView({ block: 'center', behavior: 'auto' });
    setTimeout(() => {
      const r = t.getBoundingClientRect(); const pad = 8; spot.style.display = 'block'; spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px'; spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
      const cw = Math.min(360, global.innerWidth - 24); const below = r.bottom + 14 + 200 < global.innerHeight; card.style.transform = 'none'; card.style.width = cw + 'px';
      card.style.top = (below ? r.bottom + 14 : Math.max(12, r.top - 14 - card.offsetHeight)) + 'px'; card.style.left = Math.max(12, Math.min(global.innerWidth - cw - 12, r.left + r.width / 2 - cw / 2)) + 'px';
      card.classList.toggle('above', !below);
    }, 30);
  }
  let scrollT = null; function onScroll() { if (!T.on) return; clearTimeout(scrollT); scrollT = setTimeout(() => { const step = STEPS[T.i]; const t = target(step); const spot = $('.tour-spot', T.el); if (!t || !spot) return; const r = t.getBoundingClientRect(); spot.style.left = (r.left - 8) + 'px'; spot.style.top = (r.top - 8) + 'px'; }, 60); }
  function paint() {
    const step = STEPS[T.i]; const card = $('.tour-card', T.el);
    card.innerHTML = `<div class="tour-step">${T.i + 1} of ${STEPS.length}</div><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p><div class="tour-btns"><button class="btn xs ghost" data-action="tour-skip">Skip</button><span style="flex:1"></span>${T.i > 0 ? `<button class="btn xs" data-action="tour-back">${icon('left', 12)} Back</button>` : ''}<button class="btn xs primary" data-action="tour-next">${T.i === STEPS.length - 1 ? 'Done' : 'Next'} ${T.i === STEPS.length - 1 ? icon('check', 12) : icon('right', 12)}</button></div>`;
    $$('.tour-dots i', T.el).forEach((d, i) => d.classList.toggle('on', i <= T.i)); layout();
  }
  function stop(done) { if (!T.on) return; T.on = false; if (T.el) T.el.remove(); T.el = null; document.removeEventListener('keydown', keys); global.removeEventListener('resize', layout); global.removeEventListener('scroll', onScroll); setSetting('tourDone', true); if (done && App.toast) App.toast(`${icon('check', 14)} That is the tour. Bo will be around if you need a hint.`, 3200); }
  function keys(e) { if (e.key === 'Escape') { e.preventDefault(); stop(false); } else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); } }
  function next() { if (T.i >= STEPS.length - 1) return stop(true); T.i++; paint(); }
  function back() { if (T.i === 0) return; T.i--; paint(); }
  function start(force) {
    if (T.on) return false; if (!force && (settings().tourDone || sessionStorage.getItem('mh-tour'))) return false;
    if (!location.hash.startsWith('#/') || location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]) return false;   // landing page only
    if ($('.modal-backdrop, .celebrate, #install-banner, #report-modal, #welcome')) return false;
    try { sessionStorage.setItem('mh-tour', '1'); } catch (e) {}
    T.i = 0; T.on = true; const el = document.createElement('div'); el.className = 'tour'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Quick tour'); el.innerHTML = `<div class="tour-spot"></div><div class="tour-card"></div><div class="tour-dots">${STEPS.map(() => '<i></i>').join('')}</div>`; document.body.appendChild(el); T.el = el;
    el.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) { if (e.target === el) stop(false); return; } const a = b.dataset.action; if (a === 'tour-next') next(); else if (a === 'tour-back') back(); else if (a === 'tour-skip') stop(false); });
    document.addEventListener('keydown', keys); global.addEventListener('resize', layout); global.addEventListener('scroll', onScroll, { passive: true }); paint(); return true;
  }
  App.tour = { start, stop, steps: STEPS };
  global.addEventListener('hashchange', () => { if (T.on) stop(false); });
  document.addEventListener('DOMContentLoaded', () => { setTimeout(() => start(false), 1800); });
})(window);
