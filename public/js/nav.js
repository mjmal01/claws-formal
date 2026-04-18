// Shared bottom-nav + starfield + NFC card capture for all pages.
(function () {
  // ── NFC card capture ──────────────────────────────────────────────────────
  const url = new URL(window.location.href);
  const paramCard = url.searchParams.get('card');
  if (paramCard) {
    let existingId = null;
    try { existingId = localStorage.getItem('me_card_id'); } catch (e) {}

    const onNodePage = window.location.pathname.includes('node.html');

    if (!existingId) {
      try { localStorage.setItem('me_card_id', paramCard); } catch (e) {}
      if (!onNodePage) {
        window.location.replace('node.html?id=' + paramCard);
      }
    } else if (existingId === paramCard) {
      if (!onNodePage) {
        window.location.replace('node.html?id=' + paramCard);
      }
    } else {
      if (!onNodePage) {
        window.location.replace('node.html?id=' + existingId + '&scan=' + paramCard);
      }
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

  // ── Award sync socket ────────────────────────────────────────────────────
  // Anonymous observer socket — does NOT call guest_join, so guest counts
  // are never inflated. The server uses io.emit() for all award/voting
  // broadcasts, which reaches every connected socket including this one.
  // This keeps sessionStorage current on every page the guest visits so
  // awards.html always shows the correct state the moment it loads.
  function loadA(key, fb) {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null') || fb; } catch { return fb; }
  }
  function saveA(key, val) {
    try { sessionStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
  function notifyAwardsPage() {
    window.dispatchEvent(new CustomEvent('awardsUpdated'));
  }

  function setupAwardSync() {
    const cfg = window.MIDNIGHT_ECLIPSE_CONFIG || {};
    let socket;
    try {
      socket = io(cfg.BACKEND_URL || undefined, { transports: ['websocket', 'polling'] });
    } catch (e) { return; }

    socket.on('preset_award_result', function (res) {
      var list = loadA('claws_preset_awards', []);
      list = list.filter(function (a) { return a.awardKey !== res.awardKey; });
      list.push(res);
      saveA('claws_preset_awards', list);
      notifyAwardsPage();
    });

    socket.on('preset_award_unreveal', function (data) {
      var list = loadA('claws_preset_awards', []);
      list = list.filter(function (a) { return a.awardKey !== data.awardKey; });
      saveA('claws_preset_awards', list);
      notifyAwardsPage();
    });

    socket.on('award_result', function (res) {
      if (!res.broadcastedAt) return; // admin-only tally, not visible to guests yet
      var list = loadA('claws_superlative_awards', []);
      list = list.filter(function (a) { return a.id !== res.id; });
      list.push(res);
      saveA('claws_superlative_awards', list);
      notifyAwardsPage();
    });

    socket.on('award_unreveal', function (data) {
      var list = loadA('claws_superlative_awards', []);
      list = list.filter(function (a) { return a.id !== data.voteId; });
      saveA('claws_superlative_awards', list);
      notifyAwardsPage();
    });

    socket.on('voting_opened', function (round) {
      var rounds = loadA('claws_active_rounds', {});
      rounds[round.id] = round;
      saveA('claws_active_rounds', rounds);
      notifyAwardsPage();
    });

    socket.on('voting_closed', function (data) {
      var rounds = loadA('claws_active_rounds', {});
      var id = data && data.voteId;
      if (id && rounds[id]) rounds[id].status = 'closed';
      saveA('claws_active_rounds', rounds);
      notifyAwardsPage();
    });
  }

  function initSocketIO(callback) {
    if (typeof io !== 'undefined') { callback(); return; }
    // Dynamically load socket.io on pages that don't already include it
    var s = document.createElement('script');
    s.src = 'https://cdn.socket.io/4.6.1/socket.io.min.js';
    s.onload = callback;
    s.onerror = function () {};
    document.head.appendChild(s);
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildStars();
    buildNav();
    initSocketIO(setupAwardSync);
  });
})();