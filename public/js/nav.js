// Shared bottom-nav + starfield + NFC card capture for all pages.
(function () {
  // ── NFC card capture ──────────────────────────────────────────────────────
  // If the URL has ?card=... decide what to do:
  //   • First tap (no identity stored yet)  → store as identity, go to node page
  //   • Second tap (identity already known) → open comparison view
  const url = new URL(window.location.href);
  const paramCard = url.searchParams.get('card');
  if (paramCard) {
    let existingId = null;
    try { existingId = localStorage.getItem('me_card_id'); } catch (e) {}

    const onNodePage = window.location.pathname.includes('node.html');

    if (!existingId) {
      // First tap — store identity and redirect to node page
      try { localStorage.setItem('me_card_id', paramCard); } catch (e) {}
      if (!onNodePage) {
        window.location.replace('node.html?id=' + paramCard);
      }
    } else if (existingId === paramCard) {
      // Tapped own card — just go to your node page
      if (!onNodePage) {
        window.location.replace('node.html?id=' + paramCard);
      }
    } else {
      // Second tap — comparison mode
      if (!onNodePage) {
        window.location.replace('node.html?id=' + existingId + '&scan=' + paramCard);
      }
      // If already on node.html, node.html's own script handles the scan param
    }
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
