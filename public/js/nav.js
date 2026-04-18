// Shared bottom-nav + starfield + NFC card capture for all pages.
(function () {
  // ── NFC card capture: if the URL has ?card=... stash it for later pages ──
  const url = new URL(window.location.href);
  const paramCard = url.searchParams.get('card');
  if (paramCard) {
    try { localStorage.setItem('me_card_id', paramCard); } catch (e) {}
  }

  // ── Starfield background ─────────────────────────────────────────────────
  function buildStars() {
    const el = document.getElementById('stars');
    if (!el) return;
    const N = window.innerWidth < 600 ? 60 : 120;
    for (let i = 0; i < N; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      s.style.cssText =
        `top:${Math.random() * 100}%;left:${Math.random() * 100}%;` +
        `width:${Math.random() * 2 + 1}px;height:${Math.random() * 2 + 1}px;` +
        `--dur:${Math.random() * 3 + 2}s;--delay:${Math.random() * 3}s;` +
        `--max-opacity:${Math.random() * 0.6 + 0.3};`;
      el.appendChild(s);
    }
  }

  // ── Bottom navigation ────────────────────────────────────────────────────
  const NAV = [
    { href: 'index.html',   label: 'Home',    icon: '✦' },
    { href: 'map.html',     label: 'Map',     icon: '◉' },
    { href: 'card.html',    label: 'Card',    icon: '◈' },
    { href: 'awards.html',  label: 'Awards',  icon: '★' },
    { href: 'story.html',   label: 'Story',   icon: '☍' },
    { href: 'photos.html',  label: 'Photos',  icon: '❖' },
  ];

  function buildNav() {
    const mount = document.getElementById('bottom-nav');
    if (!mount) return;
    const path = window.location.pathname.replace(/^\/+/, '').split('/').pop() || 'index.html';
    const normalized = path === '' ? 'index.html' : path;
    const html = NAV.map(item => {
      const active = (normalized === item.href) ? ' is-active' : '';
      return `<a class="nav-item${active}" href="${item.href}">
        <span class="nav-icon">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
      </a>`;
    }).join('');
    mount.innerHTML = html;
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildStars();
    buildNav();
  });
})();
