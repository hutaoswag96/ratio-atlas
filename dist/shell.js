'use strict';
/* 视图切换：三个 Tab 常驻 DOM，只切显隐，保证既有渲染逻辑与 localStorage 不受影响 */
(function () {
  const views = [...document.querySelectorAll('.view')];
  if (!views.length) return;
  const tabs = [...document.querySelectorAll('.tabs [data-view]')];
  const bar = document.querySelector('.app-bar');
  const names = views.map(view => view.dataset.view);
  const owner = new Map();
  for (const view of views) {
    for (const el of view.querySelectorAll('[id]')) owner.set(el.id, view.dataset.view);
  }
  let current = names[0];

  function paint() {
    for (const view of views) view.setAttribute('data-active', view.dataset.view === current ? 'true' : 'false');
    for (const tab of tabs) {
      const on = tab.dataset.view === current;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    }
  }

  function wakeCharts() {
    if (current !== 'charts') return;
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      for (const id of ['plot', 'index-plot', 'linked-return-plot']) {
        const el = document.getElementById(id);
        if (el && el.parentElement) el.parentElement.style.minHeight = el.parentElement.style.minHeight || '';
      }
    });
  }

  function show(name, opts) {
    if (!names.includes(name)) return;
    const changed = name !== current;
    current = name;
    paint();
    if (!opts || opts.hash !== false) {
      const target = '#/' + name;
      if (location.hash !== target) location.hash = target;
    }
    if (changed) {
      const y = bar ? bar.getBoundingClientRect().bottom + window.scrollY : 0;
      if (window.scrollY > y - 4) window.scrollTo({ top: 0 });
    }
    wakeCharts();
  }

  function jump(hash) {
    const raw = hash.replace(/^#\/?/, '').replace(/^#/, '');
    if (!raw) return false;
    if (names.includes(raw)) { show(raw); return true; }
    const el = document.getElementById(raw);
    if (!el) return false;
    const target = owner.get(raw);
    if (target && target !== current) show(target);
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return true;
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => show(tab.dataset.view));
    tab.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const i = tabs.indexOf(tab);
      const next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus();
      show(next.dataset.view);
    });
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    if (!hash || hash === '#') return;
    const raw = hash.slice(1);
    if (raw.startsWith('/')) { event.preventDefault(); show(raw.slice(1)); return; }
    if (!document.getElementById(raw)) return;
    event.preventDefault();
    jump(hash);
  });

  const reset = document.getElementById('chart-reset');
  if (reset) {
    reset.addEventListener('click', () => {
      const all = document.querySelector('#ranges button[data-n="0"]');
      if (all) all.click();
    });
  }

  const more = document.getElementById('chart-more');
  if (more) {
    document.addEventListener('click', event => {
      if (more.open && !more.contains(event.target)) more.open = false;
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && more.open) more.open = false;
    });
  }

  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#\/(\w+)$/);
    if (m) show(m[1], { hash: false });
  });

  const initial = (location.hash.match(/^#\/(\w+)$/) || [])[1];
  paint();
  show(names.includes(initial) ? initial : names[0]);
  window.__showView = show;
})();
