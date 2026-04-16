/* ─── CLAWS Formal — Guest Client ─────────────────────────────────────────── */

const socket = io();

/* ─── Direction helpers ──────────────────────────────────────────────────── */
const OPPOSITE  = { N: 'S', S: 'N', E: 'W', W: 'E' };
const ADJACENT  = { N: ['E', 'W'], E: ['N', 'S'], S: ['E', 'W'], W: ['N', 'S'] };
const DIR_LABEL = { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' };

/* ─── State ──────────────────────────────────────────────────────────────── */
let guestState = {
  name:          null,
  cardId:        null,
  phase:         'LOBBY',
  speechIndex:   -1,
  currentSpeech: null,
  broadcast:     null,
  voting:        null,
  myVote:        null,
  hasJoined:     false,
  card:          null,
  constellations: {},
  terminalLines: [],
};

let timerInterval       = null;
let timerRaf            = null;
let resultDismissTimer  = null;
let broadcastDismissTimer = null;

/* ─── DOM refs ───────────────────────────────────────────────────────────── */
const screenJoin      = document.getElementById('screen-join');
const screenMain      = document.getElementById('screen-main');
const screenScanning  = document.getElementById('screen-scanning');
const joinForm        = document.getElementById('join-form');
const nameInput       = document.getElementById('name-input');
const cardIdInput     = document.getElementById('card-id-input');
const guestNameDisp   = document.getElementById('guest-name-display');
const phaseBadge      = document.getElementById('phase-badge');
const phaseContent    = document.getElementById('phase-content');
const broadcastBanner = document.getElementById('broadcast-banner');
const connStatus      = document.getElementById('connection-status');
const overlayVoting   = document.getElementById('overlay-voting');
const overlayPending  = document.getElementById('overlay-pending');
const overlayResult   = document.getElementById('overlay-result');
const resultContainer = document.getElementById('result-container');
const votingTeamEl    = document.getElementById('voting-team');
const votingTitleEl   = document.getElementById('voting-title');
const votingDescEl    = document.getElementById('voting-description');
const votingOptions   = document.getElementById('voting-options');
const timerBar        = document.getElementById('timer-bar');
const timerText       = document.getElementById('timer-text');

/* ─── LocalStorage persistence ───────────────────────────────────────────── */
function saveIdentity(name, cardId) {
  try { localStorage.setItem('claws_identity', JSON.stringify({ name, cardId })); } catch (_) {}
}
function loadIdentity() {
  try { return JSON.parse(localStorage.getItem('claws_identity') || 'null'); } catch (_) { return null; }
}
function clearIdentity() {
  try { localStorage.removeItem('claws_identity'); } catch (_) {}
}

/* ─── Init ───────────────────────────────────────────────────────────────── */
function init() {
  const params    = new URLSearchParams(window.location.search);
  const cardParam = params.get('card');

  generateStars();

  // If there's a card param in the URL, check if we're already logged in
  if (cardParam) {
    const saved = loadIdentity();

    if (saved && saved.cardId && saved.cardId !== cardParam) {
      // Already logged in as someone else — treat this as an NFC interaction scan
      handleNfcInteractionScan(saved, cardParam);
      return;
    }

    // Not logged in yet — show the card reveal / join screen
    fetch(`/api/card/${encodeURIComponent(cardParam)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && data.card) {
          showCardReveal(data.card, data.constellation);
        } else {
          cardIdInput.value = cardParam;
        }
      })
      .catch(() => { cardIdInput.value = cardParam; });
    return;
  }

  // No card param — check for saved identity to auto-rejoin
  const saved = loadIdentity();
  if (saved && saved.name) {
    guestState.name   = saved.name;
    guestState.cardId = saved.cardId;
    socket.emit('guest_join', { name: saved.name, cardId: saved.cardId });
  }
}

/* ─── NFC Interaction Scan ───────────────────────────────────────────────── */
function handleNfcInteractionScan(myIdentity, targetCardId) {
  // Show scanning screen while we set up
  screenJoin.hidden     = true;
  screenMain.hidden     = true;
  screenScanning.hidden = false;

  document.getElementById('scanning-name').textContent         = '...';
  document.getElementById('scanning-constellation').textContent = '';

  // Fetch target card info to show in UI
  fetch(`/api/card/${encodeURIComponent(targetCardId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data && data.card) {
        document.getElementById('scanning-name').textContent         = data.card.name;
        document.getElementById('scanning-constellation').textContent = data.card.constellation;
      }
    })
    .catch(() => {});

  // Re-join as ourselves, then emit the interaction
  guestState.name   = myIdentity.name;
  guestState.cardId = myIdentity.cardId;

  socket.once('joined', (serverState) => {
    guestState.hasJoined = true;
    syncState(serverState);

    // Emit the interaction
    socket.emit('register_interaction', { targetCardId });

    // Brief scan animation then back to main screen
    setTimeout(() => {
      screenScanning.hidden = true;
      screenMain.hidden     = false;
    }, 1200);
  });

  socket.emit('guest_join', { name: myIdentity.name, cardId: myIdentity.cardId });

  // Listen for result and pop overlay
  socket.once('interaction_result', ({ interaction, cardB, error }) => {
    if (error) { showBroadcast({ message: error, type: 'alert' }); return; }
    setTimeout(() => showInteractionResult(interaction, cardB), 1400);
  });
}

/* ─── Star field ─────────────────────────────────────────────────────────── */
function generateStars() {
  const container = document.getElementById('stars');
  const count = 120;
  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    const size  = Math.random() * 2.5 + 0.5;
    const x     = Math.random() * 100;
    const y     = Math.random() * 100;
    const dur   = (Math.random() * 4 + 2).toFixed(1);
    const delay = (Math.random() * 6).toFixed(1);
    const maxOp = (Math.random() * 0.5 + 0.3).toFixed(2);
    star.style.cssText = `width:${size}px;height:${size}px;left:${x}%;top:${y}%;--dur:${dur}s;--delay:${delay}s;--max-opacity:${maxOp};`;
    container.appendChild(star);
  }
}

/* ─── Card Reveal (NFC join) ─────────────────────────────────────────────── */
function showCardReveal(card, constData) {
  guestState.cardId = card.id;
  guestState.card   = card;

  document.getElementById('reveal-constellation').textContent = card.constellation;
  document.getElementById('reveal-constellation').style.color = constData.color || 'var(--accent)';
  document.getElementById('reveal-symbol').textContent        = constData.symbol || '✦';
  document.getElementById('reveal-symbol').style.color        = constData.color || 'var(--accent)';
  document.getElementById('reveal-name').textContent          = card.name;
  document.getElementById('reveal-title').textContent         = card.title || '';
  document.getElementById('reveal-direction').textContent     = DIR_LABEL[card.direction] || card.direction;
  document.getElementById('reveal-number').textContent        = card.number;
  document.getElementById('reveal-polaris').hidden            = !card.isPolaris;
  document.getElementById('reveal-confirm-name').textContent  = card.name;
  cardIdInput.value = card.id;
  nameInput.value   = card.name;

  document.getElementById('join-default').hidden      = true;
  document.getElementById('join-card-reveal').hidden  = false;

  document.getElementById('reveal-confirm-btn').addEventListener('click', () => {
    guestState.name = card.name;
    saveIdentity(card.name, card.id);
    socket.emit('guest_join', { name: card.name, cardId: card.id });
  }, { once: true });
}

/* ─── Rules Panel ────────────────────────────────────────────────────────── */
function buildRulesPanel(card, constData) {
  const panel = document.getElementById('rules-panel');
  const body  = document.getElementById('rules-body');
  if (!panel || !body || !card) return;

  const opp = OPPOSITE[card.direction];
  const adj = ADJACENT[card.direction];
  const constColor = constData?.color || 'var(--accent)';

  const ruleRows = [
    {
      strength: 'rare',
      icon: '◎',
      title: `POLAR PAIR`,
      desc: `Find someone bearing <strong>${DIR_LABEL[opp]}</strong> — your magnetic opposite. Triggers a rare interaction.`,
    },
    {
      strength: 'mid',
      icon: '◈',
      title: `ALIGNED PAIR`,
      desc: `Find someone bearing <strong>${DIR_LABEL[card.direction]}</strong> — same as you. Mid-tier resonance.`,
    },
    {
      strength: 'low',
      icon: '◇',
      title: `ADJACENT PAIR`,
      desc: `Meet someone bearing <strong>${DIR_LABEL[adj[0]]}</strong> or <strong>${DIR_LABEL[adj[1]]}</strong>. Base interaction.`,
    },
    {
      strength: 'rare',
      icon: '✦',
      title: `NODE ${card.number} SYNC`,
      desc: `Find another <strong>Node ${card.number}</strong> bearing ${DIR_LABEL[card.direction]} or ${DIR_LABEL[opp]} — rare synchronic pair.`,
    },
    {
      strength: 'mid',
      icon: '△',
      title: `NODE ${card.number} RESONANCE`,
      desc: `Find another <strong>Node ${card.number}</strong> bearing ${DIR_LABEL[adj[0]]} or ${DIR_LABEL[adj[1]]} — mid resonant pair.`,
    },
    {
      strength: 'group',
      icon: '⬡',
      title: `${card.constellation} GROUPING`,
      desc: `Gather your constellation: <strong>2–3</strong> members for a small clue, <strong>4–5</strong> for mid, <strong>full team</strong> for a major unlock.`,
    },
    ...(card.isPolaris ? [{
      strength: 'upgrade',
      icon: '◉',
      title: `POLARIS NODE`,
      desc: `You are an anchor. Your presence <strong>clarifies clues</strong> and <strong>upgrades</strong> nearby interactions.`,
    }] : []),
  ];

  body.innerHTML = ruleRows.map(r => `
    <div class="rule-row rule-row--${r.strength}">
      <div class="rule-icon">${r.icon}</div>
      <div class="rule-text">
        <div class="rule-title">${r.title}</div>
        <div class="rule-desc">${r.desc}</div>
      </div>
      <div class="rule-badge rule-badge--${r.strength}">${r.strength.toUpperCase()}</div>
    </div>
  `).join('');

  panel.style.setProperty('--const-color', constColor);
  panel.hidden = false;

  // Toggle logic
  const toggle = document.getElementById('rules-toggle');
  toggle.addEventListener('click', () => {
    const open = body.hidden;
    body.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.rules-arrow').textContent = open ? '▴' : '▾';
  });
}

/* ─── Phase content templates ────────────────────────────────────────────── */
function phaseTemplate(phase, speech) {
  switch (phase) {
    case 'LOBBY':
      return `
        <div class="phase-lobby">
          <div class="phase-icon">✦</div>
          <div class="phase-title glow-text">Welcome</div>
          <div class="phase-sub">The evening is about to begin.<br>Find your seat and enjoy the atmosphere.</div>
        </div>`;

    case 'DINNER': {
      const cardHint = guestState.card
        ? `<div class="dinner-hint">
             <span class="dinner-hint-const" style="color:var(--const-color)">${escHtml(guestState.card.constellation)}</span>
             — Node ${guestState.card.number} — Bearing ${escHtml(guestState.card.direction)}
           </div>`
        : '';
      return `
        <div class="phase-dinner">
          <div class="phase-icon">◈</div>
          <div class="phase-title">Dinner Phase</div>
          ${cardHint}
          <div class="phase-sub">Scan someone else's NFC card to register an interaction, or enter their card ID below.</div>
          ${guestState.card ? `
          <div class="interact-row">
            <input type="text" id="interact-card-input" placeholder="card_001" class="name-input interact-input"
              autocomplete="off" autocapitalize="none" spellcheck="false">
            <button class="btn btn--ghost" id="interact-submit-btn">↗ Scan</button>
          </div>` : ''}
        </div>`;
    }

    case 'SPEECHES':
      return `
        <div class="phase-speeches">
          <div class="speech-now-label">NOW PRESENTING</div>
          <div class="speech-team" id="speech-team-display">${speech ? escHtml(speech.team) : '—'}</div>
          <div class="speech-role" id="speech-role-display">${speech ? escHtml(speech.role) : 'Stand by...'}</div>
        </div>`;

    case 'MINGLING':
      return `
        <div class="phase-mingling">
          <div class="phase-icon">✦</div>
          <div class="phase-title">Mingling</div>
          <div class="phase-sub">Move freely. Explore connections. The system is watching.</div>
          ${guestState.card ? `
          <div class="interact-row" style="margin-top:20px">
            <input type="text" id="interact-card-input" placeholder="card_001" class="name-input interact-input"
              autocomplete="off" autocapitalize="none" spellcheck="false">
            <button class="btn btn--ghost" id="interact-submit-btn">↗ Scan</button>
          </div>` : ''}
        </div>`;

    case 'AFTERPARTY':
      return `
        <div class="phase-afterparty">
          <div class="phase-icon">▶</div>
          <div class="phase-title glow-text">Midnight Eclipse</div>
          <div class="phase-sub">Full system activated. The terminal is live.</div>
          <button class="btn btn--primary terminal-open-btn" onclick="openTerminal()">Open Terminal</button>
        </div>`;

    default:
      return `<div class="phase-lobby"><div class="phase-title">Stand by...</div></div>`;
  }
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ─── State sync ─────────────────────────────────────────────────────────── */
function syncState(serverState) {
  guestState.phase        = serverState.phase || 'LOBBY';
  guestState.speechIndex  = serverState.speechIndex;
  guestState.currentSpeech = serverState.currentSpeech || null;
  guestState.broadcast    = serverState.broadcast || null;
  guestState.voting       = serverState.voting || null;

  updatePhaseBadge(guestState.phase);
  updatePhaseContent(guestState.phase, guestState.currentSpeech);
  if (guestState.broadcast) showBroadcast(guestState.broadcast);
  else hideBroadcast();

  if (serverState.card) {
    guestState.card         = serverState.card;
    guestState.constellations = serverState.constellations || {};
    showCardIdentity(guestState.card, guestState.constellations);
    buildRulesPanel(guestState.card, guestState.constellations[guestState.card.constellation]);
  }

  if (guestState.voting && guestState.voting.status === 'open') {
    guestState.voting.myVote ? showOverlay('pending') : openVotingOverlay(guestState.voting);
  } else if (guestState.voting?.status === 'closed' && guestState.voting?.myVote) {
    showOverlay('pending');
  }
}

function updatePhaseBadge(phase) {
  phaseBadge.textContent  = phase;
  phaseBadge.dataset.phase = phase;
}

function updatePhaseContent(phase, speech) {
  phaseContent.innerHTML = phaseTemplate(phase, speech);
  const interactBtn = document.getElementById('interact-submit-btn');
  if (interactBtn) {
    interactBtn.addEventListener('click', () => {
      const targetId = document.getElementById('interact-card-input').value.trim();
      if (!targetId) return;
      socket.emit('register_interaction', { targetCardId: targetId });
      document.getElementById('interact-card-input').value = '';
    });
  }
  // Apply constellation color to phase content
  if (guestState.card && guestState.constellations) {
    const constData = guestState.constellations[guestState.card.constellation];
    if (constData?.color) phaseContent.style.setProperty('--const-color', constData.color);
  }
}

function updateSpeechUI(speech) {
  const teamEl = document.getElementById('speech-team-display');
  const roleEl = document.getElementById('speech-role-display');
  if (teamEl) teamEl.textContent = speech ? speech.team : '—';
  if (roleEl) roleEl.textContent = speech ? speech.role : 'Stand by...';
}

/* ─── Overlay helpers ────────────────────────────────────────────────────── */
function showOverlay(name) {
  overlayVoting.hidden  = name !== 'voting';
  overlayPending.hidden = name !== 'pending';
  overlayResult.hidden  = name !== 'result';
}
function hideAllOverlays() {
  overlayVoting.hidden = overlayPending.hidden = overlayResult.hidden = true;
}

/* ─── Voting overlay ─────────────────────────────────────────────────────── */
function openVotingOverlay(round) {
  stopTimer();
  votingTeamEl.textContent  = round.team || '';
  votingTitleEl.textContent = round.title || '';
  votingDescEl.textContent  = round.description || '';

  votingOptions.innerHTML = '';
  for (const opt of round.options) {
    const btn = document.createElement('button');
    btn.className = 'vote-option';
    btn.dataset.optionId = opt.id;
    btn.innerHTML = `<span class="vote-option-check"></span><span class="vote-option-label">${escHtml(opt.name)}</span>`;
    btn.addEventListener('click', () => handleVote(opt.id));
    votingOptions.appendChild(btn);
  }

  showOverlay('voting');
  const elapsed   = round.elapsed || 0;
  const remaining = Math.max(0, round.timeLimit - elapsed);
  startTimer(remaining, round.timeLimit);
}

function handleVote(optionId) {
  if (guestState.myVote) return;
  guestState.myVote = optionId;
  socket.emit('submit_vote', { optionId });
  votingOptions.querySelectorAll('.vote-option').forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.optionId === optionId) btn.classList.add('selected');
  });
}

/* ─── Timer ──────────────────────────────────────────────────────────────── */
function startTimer(remaining, total) {
  stopTimer();
  requestAnimationFrame(() => requestAnimationFrame(() => setTimerDisplay(remaining, total)));
  timerInterval = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    setTimerDisplay(remaining, total);
    if (remaining <= 0) stopTimer();
  }, 1000);
}
function setTimerDisplay(remaining, total) {
  const pct    = total > 0 ? (remaining / total) * 100 : 0;
  timerBar.style.width = pct + '%';
  const danger = remaining <= 5;
  timerBar.classList.toggle('danger', danger);
  timerText.classList.toggle('danger', danger);
  timerText.textContent = remaining + 's';
}
function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (timerRaf)      { cancelAnimationFrame(timerRaf); timerRaf = null; }
}

/* ─── Broadcast ──────────────────────────────────────────────────────────── */
function showBroadcast(msg) {
  if (broadcastDismissTimer) clearTimeout(broadcastDismissTimer);
  broadcastBanner.textContent    = msg.message;
  broadcastBanner.dataset.type   = msg.type || 'info';
  broadcastBanner.hidden         = false;
  broadcastDismissTimer = setTimeout(hideBroadcast, 10000);
}
function hideBroadcast() { broadcastBanner.hidden = true; }

/* ─── Card Identity ──────────────────────────────────────────────────────── */
function showCardIdentity(card, constellations) {
  if (!card) return;
  const panel     = document.getElementById('card-identity');
  const constData = constellations[card.constellation] || {};

  document.getElementById('card-constellation-name').textContent = card.constellation;
  document.getElementById('card-title-text').textContent         = card.title || '';
  document.getElementById('card-symbol').textContent             = constData.symbol || card.symbol || '✦';
  document.getElementById('card-direction').textContent          = DIR_LABEL[card.direction] || card.direction;
  document.getElementById('card-number').textContent             = card.number;
  document.getElementById('card-polaris-badge').hidden           = !card.isPolaris;

  if (constData.color) panel.style.setProperty('--const-color', constData.color);
  panel.hidden = false;
}

/* ─── Clue notification ──────────────────────────────────────────────────── */
function showClueNotification(text) {
  const notif = document.getElementById('clue-notification');
  document.getElementById('clue-notification-text').textContent = text;
  notif.hidden = false;
  notif.classList.add('visible');
  setTimeout(() => {
    notif.classList.remove('visible');
    setTimeout(() => { notif.hidden = true; }, 400);
  }, 8000);
}

/* ─── Interaction Result ─────────────────────────────────────────────────── */
socket.on('interaction_result', ({ interaction, cardB, error }) => {
  if (error) { showBroadcast({ message: error, type: 'alert' }); return; }
  showInteractionResult(interaction, cardB);
});

function showInteractionResult(interaction, cardB) {
  const container = document.getElementById('interaction-container');
  const strongest = interaction.results.reduce((best, r) => {
    const rank = { rare: 4, upgrade: 3, mid: 2, low: 1 };
    return (rank[r.strength] || 0) > (rank[best?.strength] || 0) ? r : best;
  }, null);

  const strengthClass = strongest?.strength === 'rare' ? 'rare'
    : strongest?.strength === 'upgrade' ? 'upgrade' : 'normal';

  container.innerHTML = `
    <div class="interaction-result ${strengthClass}">
      <div class="interaction-result-label">INTERACTION</div>
      <div class="interaction-result-pair">
        <div class="interaction-card-a">${escHtml(interaction.cardA.name)}<br><span>${escHtml(interaction.cardA.constellation)}</span></div>
        <div class="interaction-connector">↔</div>
        <div class="interaction-card-b">${escHtml(cardB.name)}<br><span>${escHtml(cardB.constellation)}</span></div>
      </div>
      <div class="interaction-results-list">
        ${interaction.results.map(r => `
          <div class="interaction-rule ${r.strength}">
            <span class="rule-strength ${r.strength}">${r.strength.toUpperCase()}</span>
            <span class="rule-desc">${escHtml(r.description)}</span>
          </div>
        `).join('')}
      </div>
      <div class="result-dismiss">Tap to close</div>
    </div>`;

  document.getElementById('overlay-interaction').hidden = false;
  document.getElementById('overlay-interaction').addEventListener('click', () => {
    document.getElementById('overlay-interaction').hidden = true;
  }, { once: true });
  setTimeout(() => { document.getElementById('overlay-interaction').hidden = true; }, 12000);
}

/* ─── Terminal ───────────────────────────────────────────────────────────── */
function terminalLog(line) {
  guestState.terminalLines.push(line);
  const el = document.getElementById('terminal-lines');
  if (el) {
    el.innerHTML = guestState.terminalLines
      .map(l => `<div class="terminal-line">${escHtml(l)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
  }
}
function openTerminal() {
  document.getElementById('overlay-terminal').hidden = false;
  if (guestState.terminalLines.length === 0) {
    terminalLog('> MIDNIGHT ECLIPSE TERMINAL v1.0');
    terminalLog('> Enter: CONSTELLATION:DIRECTION pairs separated by spaces');
    terminalLog('> Example: IRIS:N VEGA:E ATLAS:W');
    terminalLog('> ');
  }
}

/* ─── Result overlay ─────────────────────────────────────────────────────── */
function showResult(result) {
  const isWinner = guestState.cardId && result.winnerCardId &&
                   guestState.cardId === result.winnerCardId;
  if (isWinner) {
    resultContainer.innerHTML = `
      <div class="result-winner">
        <div class="result-stars">✦ ✦ ✦</div>
        <div class="result-winner-label">YOU WON</div>
        <div class="result-winner-name">${escHtml(result.winnerName)}</div>
        <div class="result-award-text">${escHtml(result.award)}<br>${escHtml(result.team)}</div>
        <div class="result-dismiss">Tap anywhere to dismiss</div>
      </div>`;
  } else {
    resultContainer.innerHTML = `
      <div class="result-other">
        <div class="result-other-icon">✦</div>
        <div class="result-other-title">${escHtml(result.award)}</div>
        <div class="result-award-text">${escHtml(result.team)}</div>
        <div style="margin-top:12px;font-size:14px;color:var(--text-muted)">Winner:</div>
        <div style="font-size:24px;font-weight:700;color:var(--gold);margin-top:4px;text-shadow:0 0 20px rgba(255,215,0,0.5)">${escHtml(result.winnerName)}</div>
        <div class="result-dismiss">Tap anywhere to dismiss</div>
      </div>`;
  }
  showOverlay('result');
  if (resultDismissTimer) clearTimeout(resultDismissTimer);
  resultDismissTimer = setTimeout(hideAllOverlays, 20000);
  overlayResult.addEventListener('click', () => {
    if (resultDismissTimer) clearTimeout(resultDismissTimer);
    hideAllOverlays();
  }, { once: true });
}

/* ─── Socket events ──────────────────────────────────────────────────────── */
socket.on('connect', () => {
  connStatus.classList.remove('visible');
  if (guestState.hasJoined && guestState.name) {
    socket.emit('guest_join', { name: guestState.name, cardId: guestState.cardId });
  }
});
socket.on('disconnect',    () => connStatus.classList.add('visible'));
socket.on('connect_error', () => connStatus.classList.add('visible'));

socket.on('joined', (serverState) => {
  guestState.hasJoined = true;
  guestNameDisp.textContent = guestState.name;
  screenJoin.hidden     = true;
  screenScanning.hidden = true;
  screenMain.hidden     = false;
  syncState(serverState);
});

socket.on('phase_changed', ({ phase }) => {
  guestState.phase = phase;
  updatePhaseBadge(phase);
  updatePhaseContent(phase, guestState.currentSpeech);
});

socket.on('speech_changed', ({ index, speech }) => {
  guestState.speechIndex   = index;
  guestState.currentSpeech = speech;
  if (guestState.phase === 'SPEECHES') updateSpeechUI(speech);
});

socket.on('voting_opened', (round) => {
  guestState.voting = round;
  guestState.myVote = null;
  openVotingOverlay(round);
});

socket.on('vote_accepted', ({ optionId }) => {
  guestState.myVote = optionId;
  votingOptions.querySelectorAll('.vote-option').forEach(btn => {
    btn.disabled = true;
    btn.classList.toggle('selected', btn.dataset.optionId === optionId);
  });
  setTimeout(() => { stopTimer(); showOverlay('pending'); }, 400);
});

socket.on('voting_closed', () => {
  stopTimer();
  if (!overlayVoting.hidden || !guestState.myVote) showOverlay('pending');
});

socket.on('award_result',     (result) => { stopTimer(); showResult(result); });
socket.on('broadcast',        (msg)    => { guestState.broadcast = msg; showBroadcast(msg); });
socket.on('broadcast_cleared',()       => { guestState.broadcast = null; hideBroadcast(); });
socket.on('clue_unlocked',    ({ clue })=> showClueNotification(clue.text));

socket.on('terminal_solved', ({ message }) => {
  document.getElementById('terminal-solved-screen').hidden = false;
  document.getElementById('terminal-body').hidden = true;
  terminalLog(`> ${message}`);
  terminalLog('> System status: COMPLETE');
});
socket.on('terminal_result', ({ message }) => terminalLog(`> ${message}`));

document.getElementById('terminal-submit')?.addEventListener('click', () => {
  const input = document.getElementById('terminal-input').value.trim();
  if (!input) return;
  terminalLog(`> INPUT: ${input}`);
  const answer = {};
  input.toUpperCase().split(/\s+/).forEach(pair => {
    const [key, val] = pair.split(':');
    if (key && val) answer[key] = val;
  });
  socket.emit('terminal_submit', { answer });
  document.getElementById('terminal-input').value = '';
});

/* ─── Form submit (manual name entry) ───────────────────────────────────── */
joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name   = nameInput.value.trim();
  const cardId = cardIdInput.value.trim() || null;
  if (!name) return;
  guestState.name   = name;
  guestState.cardId = cardId;
  saveIdentity(name, cardId);
  socket.emit('guest_join', { name, cardId });
});

/* ─── Boot ───────────────────────────────────────────────────────────────── */
init();
