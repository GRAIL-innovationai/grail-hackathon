/* ============================================================
   Mathub — install prompt
   Counts visits and, from the second visit on, offers to install the
   app: the native prompt on Chrome and Edge (Android, desktop), and
   step-by-step instructions on iPhone and iPad, where Safari has no
   prompt. Dismissing hides it for a month. "Install Mathub" also
   lives in the account menu whenever installing is possible.
   ============================================================ */
(function (global) {
  'use strict';
  const App = global.App; if (!App) return;
  const { $, esc, icon, settings, setSetting, toast } = App;
  let deferred = null;
  const standalone = () => global.matchMedia && global.matchMedia('(display-mode: standalone)').matches || global.navigator.standalone === true;
  const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = () => /Safari/i.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|Chrome/i.test(navigator.userAgent);
  App.installAvailable = () => !standalone() && (!!deferred || (isIOS() && isSafari()));
  function countVisit() { try { if (sessionStorage.getItem('mh-visit')) return; sessionStorage.setItem('mh-visit', '1'); } catch (e) {} setSetting('visits', (settings().visits || 0) + 1); }
  function shouldOffer() { const s = settings(); if (standalone()) return false; if (s.installDismissed && Date.now() - s.installDismissed < 30 * 86400000) return false; return (s.visits || 0) >= 2 && App.installAvailable(); }
  function banner() {
    if ($('#install-banner') || !shouldOffer()) return;
    const el = document.createElement('div'); el.id = 'install-banner'; el.className = 'install-banner'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Install Mathub');
    el.innerHTML = `<span class="install-ic">${App.logoSvg ? App.logoSvg(34, true) : ''}</span><div class="install-body"><b>Put Mathub on your home screen</b><small>${deferred ? 'Opens full screen, loads faster, works offline.' : 'Tap Share, then “Add to Home Screen”.'}</small></div><button class="btn sm primary" data-action="install">${deferred ? 'Install' : 'How'}</button><button class="icon-btn" data-action="dismiss" aria-label="Not now">${icon('x', 14)}</button>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { const a = e.target.closest('[data-action]'); if (!a) return; if (a.dataset.action === 'dismiss') { setSetting('installDismissed', Date.now()); el.remove(); } else App.installApp(); });
  }
  App.installApp = async function () {
    if (deferred) { const p = deferred; deferred = null; p.prompt(); try { const r = await p.userChoice; if (r && r.outcome === 'accepted') { const b = $('#install-banner'); if (b) b.remove(); } else setSetting('installDismissed', Date.now()); } catch (e) {} return; }
    if (isIOS()) { if ($('#ios-install')) return; const m = document.createElement('div'); m.className = 'modal-backdrop'; m.id = 'ios-install'; m.innerHTML = `<div class="modal ios-modal" role="dialog" aria-label="Add Mathub to your home screen"><div class="row between mb-1"><div class="panel-title">${icon('download')} Add Mathub to your home screen</div><button class="icon-btn" data-action="close" aria-label="Close">${icon('x', 14)}</button></div><ol class="ios-steps"><li>Open this page in <b>Safari</b> (other browsers on iPhone cannot install).</li><li>Tap the <b>Share</b> button <span class="ios-share">⎋</span> at the bottom of the screen.</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol><p class="small muted">Mathub then opens full screen like an app, keeps your login, and can send reminders once you turn them on in Settings.</p></div>`; document.body.appendChild(m); m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-action="close"]')) App.dismiss(m); }); setSetting('installDismissed', Date.now()); const b = $('#install-banner'); if (b) b.remove(); return; }
    toast('Use your browser menu and choose “Install app” or “Add to Home screen”.', 4000);
  };
  global.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; setTimeout(banner, 1500); });
  global.addEventListener('appinstalled', () => { deferred = null; const b = $('#install-banner'); if (b) b.remove(); toast(`${icon('check', 14)} Mathub is installed. Find it with your other apps.`, 4000); });
  document.addEventListener('DOMContentLoaded', () => { countVisit(); setTimeout(banner, 2500); });
})(window);
