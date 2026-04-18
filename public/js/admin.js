/* ─── Midnight Eclipse — Admin Client ─── */

const socket = io();

const adminState = {
  authed: false,
  phase: 'LOBBY',
  speechIndex: -1,
  speechOrder: [],
  guests: [],
  cards: [],
  constellations: {},
  clues: {},
  clueStates: {},
  currentVoting: null,
  currentVotingOptions: [],
  votingHistory: [],
  presetAwardsState: {},  // awardKey → result (tracks what's been revealed)
  interactionLog: [],
  storyEvents: [],
  phaseStartTimes: {},
  terminalSolution: null,
  onlineCardIds: new Set(),
};

// ─── Auth ─────────────────────────────────────────────────────────────────

document.getElementById('auth-form')?.addEventListener('submit', e => {
  e.preventDefault();
  document.getElementById('auth-error').hidden = true;
  const pw = document.getElementById('password-input').value;
  socket.emit('admin_auth', { password: pw });
});

socket.on('admin_auth_fail', () => {
  document.getElementById('auth-error').hidden = false;
  document.getElementById('password-input').value = '';
  document.getElementById('password-input').focus();
});

socket.on('admin_ready', (data) => {
  adminState.phase           = data.state.phase;
  adminState.speechIndex     = data.state.speechIndex;
  adminState.speechOrder     = data.speechOrder || [];
  adminState.guests          = data.guests || [];
  adminState.cards           = data.cards || [];
  adminState.constellations  = data.constellations || {};
  adminState.clues           = data.clues || {};
  adminState.clueStates      = data.clueStates || {};
  adminState.interactionLog  = data.interactionLog || [];
  adminState.storyEvents     = data.storyEvents || [];
  adminState.phaseStartTimes = data.phaseStartTimes || {};
  adminState.terminalSolution = data.terminalSolution || null;
  adminState.votingHistory   = data.state.votingHistory || [];
  adminState.currentVoting   = data.state.currentVoting || null;
  adminState.presetAwardsState = {};
  for (const [key, val] of Object.entries(data.presetAwards || {})) {
    adminState.presetAwardsState[key] = val;
  }

  if (adminState.currentVoting) {
    adminState.currentVotingOptions = adminState.currentVoting.options || [];
  }

  document.getElementById('admin-auth-screen').hidden = true;
  document.getElementById('admin-dashboard').hidden = false;

  initUI();
});

function initUI() {
  renderPhaseBtns();
  renderSpeechNav();
  populateCandidates();
  renderGuests(adminState.guests);
  updateOnlineCardIds();
  renderCardRegistry(adminState.cards);
  renderConstellationStatus();
  renderClues();
  renderInteractionLog();
  renderStoryTimeline();
  renderAwardsList();
  renderPhaseProgress();
  updateStats();
  renderLedConstellationGrid();

  // Restore any active vote cards
  if (adminState.state?.activeVotings) {
    for (const round of Object.values(adminState.state.activeVotings)) {
      activeVoteCards[round.id] = { round, options: round.options };
      renderActiveVoteCard(round.id);
      if (round.status === 'closed') {
        const badge    = document.getElementById(`badge-${round.id}`);
        const closeBtn = document.getElementById(`close-btn-${round.id}`);
        const revBtn   = document.getElementById(`reveal-btn-${round.id}`);
        if (badge)    { badge.textContent = 'CLOSED'; badge.classList.add('closed'); }
        if (closeBtn)  closeBtn.hidden  = true;
        if (revBtn)    revBtn.hidden    = false;
      }
    }
  }

  renderVoteHistory();
  renderSuperlativePanel();
  renderPresetAwardsPanel();

  if (adminState.terminalSolution) {
    const statusEl = document.getElementById('terminal-admin-status');
    if (statusEl) statusEl.textContent = `Solution set: ${JSON.stringify(adminState.terminalSolution)}`;
  }
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

document.querySelectorAll('.admin-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(t => { t.hidden = true; t.classList.remove('active'); });
    btn.classList.add('active');
    const tab = document.getElementById(`tab-${btn.dataset.tab}`);
    tab.hidden = false;
    tab.classList.add('active');
  });
});

// ─── Phase Control ─────────────────────────────────────────────────────────

function renderPhaseBtns() {
  document.querySelectorAll('.phase-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.phase === adminState.phase);
    btn.addEventListener('click', () => {
      socket.emit('admin_set_phase', { phase: btn.dataset.phase });
    });
  });
}

socket.on('phase_changed', ({ phase }) => {
  adminState.phase = phase;
  document.getElementById('stat-phase').textContent = phase;
  document.querySelectorAll('.phase-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.phase === phase);
  });
  renderPhaseProgress();
});

// ─── Speech Nav ────────────────────────────────────────────────────────────

function renderSpeechNav() {
  updateSpeechDisplay();
  document.getElementById('speech-prev')?.addEventListener('click', () => {
    if (adminState.speechIndex <= 0) return;
    socket.emit('admin_set_speech', { index: adminState.speechIndex - 1 });
  });
  document.getElementById('speech-next')?.addEventListener('click', () => {
    if (adminState.speechIndex >= adminState.speechOrder.length - 1) return;
    socket.emit('admin_set_speech', { index: adminState.speechIndex + 1 });
  });
}

function updateSpeechDisplay() {
  const idx = adminState.speechIndex;
  const order = adminState.speechOrder;
  const speech = (idx >= 0 && idx < order.length) ? order[idx] : null;
  const currentEl = document.getElementById('speech-current');
  const indexEl = document.getElementById('speech-index-display');
  if (currentEl) currentEl.innerHTML = speech ? `<strong>${escHtml(speech.team)}</strong>` : '—';
  if (indexEl) indexEl.textContent = speech
    ? `${idx + 1} / ${order.length} — ${speech.role}`
    : 'No speech selected';
  const prevBtn = document.getElementById('speech-prev');
  const nextBtn = document.getElementById('speech-next');
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx >= order.length - 1;
}

socket.on('speech_changed', ({ index }) => {
  adminState.speechIndex = index;
  updateSpeechDisplay();
});

// ─── Broadcast ─────────────────────────────────────────────────────────────

document.getElementById('broadcast-send')?.addEventListener('click', () => {
  const msg = document.getElementById('broadcast-input').value.trim();
  const type = document.getElementById('broadcast-type').value;
  if (!msg) return;
  socket.emit('admin_broadcast', { message: msg, type });
  document.getElementById('broadcast-input').value = '';
});

document.getElementById('broadcast-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('broadcast-send').click();
});

document.getElementById('broadcast-clear')?.addEventListener('click', () => {
  socket.emit('admin_clear_broadcast');
});

// ─── Voting ────────────────────────────────────────────────────────────────

function makeCandidateRow(name = '', cardId = '') {
  const row = document.createElement('div');
  row.className = 'candidate-row';
  row.innerHTML = `
    <input type="text" placeholder="Name" class="candidate-name" value="${escHtml(name)}">
    <input type="text" placeholder="Card ID (optional)" class="candidate-card" value="${escHtml(cardId)}">
    <button type="button" class="remove-candidate btn btn--ghost btn--sm">×</button>
  `;
  row.querySelector('.remove-candidate').addEventListener('click', () => {
    const container = document.getElementById('vote-candidates');
    if (container.children.length > 2) row.remove();
  });
  return row;
}

function populateCandidates() {
  const container = document.getElementById('vote-candidates');
  if (!container) return;
  container.innerHTML = '';
  container.appendChild(makeCandidateRow());
  container.appendChild(makeCandidateRow());
}

document.getElementById('add-candidate')?.addEventListener('click', () => {
  document.getElementById('vote-candidates').appendChild(makeCandidateRow());
});

document.getElementById('start-vote-btn')?.addEventListener('click', startVote);

function startVote() {
  const title = document.getElementById('vote-title').value.trim();
  const team  = document.getElementById('vote-team').value.trim();
  const desc  = document.getElementById('vote-description').value.trim();
  const timeLimit = parseInt(document.getElementById('vote-timelimit').value) || 25;
  const options = [];
  document.querySelectorAll('.candidate-row').forEach((row, i) => {
    const name   = row.querySelector('.candidate-name').value.trim();
    const cardId = row.querySelector('.candidate-card').value.trim();
    if (name) options.push({ id: `opt_${i}_${Date.now()}`, name, cardId: cardId || null });
  });
  if (!title) { document.getElementById('vote-title').focus(); return; }
  if (options.length < 2) { alert('Add at least 2 candidates.'); return; }
  adminState.currentVotingOptions = options;
  socket.emit('admin_start_voting', { title, team, description: desc, options, timeLimit });
}

// ─── Multi-vote card management ───────────────────────────────────────────────

const activeVoteCards = {};

socket.on('voting_opened', (round) => {
  activeVoteCards[round.id] = { round, options: round.options };
  renderActiveVoteCard(round.id);
});

function renderActiveVoteCard(voteId) {
  const container = document.getElementById('active-votes-container');
  if (!container) return;

  const old = document.getElementById(`vote-card-${voteId}`);
  if (old) old.remove();

  const entry = activeVoteCards[voteId];
  if (!entry) return;

  const { round } = entry;
  const card = document.createElement('div');
  card.className = 'admin-panel active-vote-card';
  card.id = `vote-card-${voteId}`;
  card.innerHTML = `
    <div class="panel-title">
      ${escHtml(round.title)}
      <span class="vote-status-badge" id="badge-${voteId}">OPEN</span>
    </div>
    ${round.team ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">${escHtml(round.team)}</div>` : ''}
    <div class="vote-progress">
      <div class="vote-progress-text">
        <span id="vcount-${voteId}">0</span> / <span id="gcount-${voteId}">${adminState.guests.length}</span> votes
      </div>
      <div class="vote-progress-bar">
        <div class="vote-progress-fill" id="vfill-${voteId}"></div>
      </div>
    </div>
    <div class="vote-live-results" id="vbars-${voteId}"></div>
    <div class="vote-actions">
      <button class="btn btn--danger btn--sm" id="close-btn-${voteId}">■ Close Voting</button>
      <button class="btn btn--primary btn--sm" id="reveal-btn-${voteId}" hidden>★ Tally & Archive</button>
    </div>`;
  container.prepend(card);

  renderVoteBars(voteId, round.options, {}, 0);

  document.getElementById(`close-btn-${voteId}`).addEventListener('click', () => {
    socket.emit('admin_close_voting', { voteId });
  });
  document.getElementById(`reveal-btn-${voteId}`).addEventListener('click', () => {
    socket.emit('admin_reveal_winner', { voteId });
    setTimeout(() => {
      const c = document.getElementById(`vote-card-${voteId}`);
      if (c) c.remove();
      delete activeVoteCards[voteId];
    }, 800);
  });
}

function renderVoteBars(voteId, options, counts, total, winnerId = null) {
  const el = document.getElementById(`vbars-${voteId}`);
  if (!el) return;
  el.innerHTML = options.map(opt => {
    const count    = counts[opt.id] || 0;
    const pct      = total > 0 ? Math.round((count / total) * 100) : 0;
    const isWinner = winnerId && opt.id === winnerId;
    return `
      <div class="vote-bar-row">
        <div class="vote-bar-label">
          <span>${escHtml(opt.name)}${isWinner ? ' ★' : ''}</span>
          <span class="vote-bar-count">${count} (${pct}%)</span>
        </div>
        <div class="vote-bar">
          <div class="vote-bar-fill${isWinner ? ' winner' : ''}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

socket.on('vote_update', ({ voteId, counts, total, guestCount }) => {
  const entry = activeVoteCards[voteId];
  if (!entry) return;
  const vc = document.getElementById(`vcount-${voteId}`);
  const gc = document.getElementById(`gcount-${voteId}`);
  const vf = document.getElementById(`vfill-${voteId}`);
  if (vc) vc.textContent = total;
  if (gc) gc.textContent = guestCount;
  const pct = guestCount > 0 ? Math.round((total / guestCount) * 100) : 0;
  if (vf) vf.style.width = pct + '%';
  renderVoteBars(voteId, entry.options, counts, total);
});

socket.on('voting_results', ({ voteId, counts, total, winnerId }) => {
  const entry = activeVoteCards[voteId];
  if (!entry) return;
  renderVoteBars(voteId, entry.options, counts, total, winnerId);
  const vc = document.getElementById(`vcount-${voteId}`);
  if (vc) vc.textContent = total;
});

socket.on('voting_closed', ({ voteId }) => {
  const id = voteId || Object.keys(activeVoteCards)[0];
  if (!id) return;
  const badge     = document.getElementById(`badge-${id}`);
  const closeBtn  = document.getElementById(`close-btn-${id}`);
  const revealBtn = document.getElementById(`reveal-btn-${id}`);
  if (badge)     { badge.textContent = 'CLOSED'; badge.classList.add('closed'); }
  if (closeBtn)  closeBtn.hidden  = true;
  if (revealBtn) revealBtn.hidden = false;
});

socket.on('award_result', (result) => {
  const existing = adminState.votingHistory.find(v => v.id === result.id);
  if (existing) {
    existing.broadcastedAt = result.broadcastedAt;
  } else {
    adminState.votingHistory.push({
      id: result.id, title: result.award, team: result.team,
      winnerName: result.winnerName, winnerCardId: result.winnerCardId,
      counts: result.counts, total: result.total, broadcastedAt: result.broadcastedAt,
    });
  }
  renderVoteHistory();
  renderAwardsList();
  renderSuperlativePanel();
});

socket.on('award_broadcasted', ({ voteId, broadcastedAt }) => {
  const entry = adminState.votingHistory.find(v => v.id === voteId);
  if (entry) entry.broadcastedAt = broadcastedAt;
  renderAwardsList();
  renderSuperlativePanel();
});

// ─── Superlative reveal panel ─────────────────────────────────────────────────

function renderSuperlativePanel() {
  const el = document.getElementById('superlative-reveal-list');
  if (!el) return;
  const tallied = adminState.votingHistory.filter(v => v.winnerName);
  if (!tallied.length) {
    el.innerHTML = '<div class="empty-state">No superlatives tallied yet</div>';
    return;
  }
  el.innerHTML = tallied.map(a => {
    const revealed = !!a.broadcastedAt;
    return `
    <div class="preset-award-row${revealed ? ' award-revealed' : ''}">
      <div class="preset-award-meta">
        <span class="preset-award-icon">✦</span>
        <span class="preset-award-label">${escHtml(a.title || '')}</span>
      </div>
      <div style="font-size:13px;color:var(--gold);font-weight:600;padding:2px 0 4px">
        ★ ${escHtml(a.winnerName)}
      </div>
      ${a.team ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">${escHtml(a.team)}</div>` : ''}
      ${revealed
        ? `<div style="display:flex;gap:8px;align-items:center;margin-top:4px">
             <div style="font-size:11px;color:var(--success);letter-spacing:.04em">📢 Revealed to guests</div>
             <button class="btn btn--ghost btn--sm superlative-unreveal-btn" data-vote-id="${escHtml(a.id || '')}">↩ Unreveal</button>
           </div>`
        : `<button class="btn btn--primary btn--sm superlative-reveal-btn" data-vote-id="${escHtml(a.id || '')}">📢 Reveal to Guests</button>`
      }
    </div>`;
  }).join('');

  el.querySelectorAll('.superlative-reveal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const voteId = btn.dataset.voteId;
      if (!voteId) return;
      if (!confirm('Reveal this superlative winner to all guests now?')) return;
      socket.emit('admin_broadcast_award', { voteId });
    });
  });

  el.querySelectorAll('.superlative-unreveal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const voteId = btn.dataset.voteId;
      if (!voteId) return;
      if (!confirm('Remove this superlative winner from guest screens?')) return;
      socket.emit('admin_unreveal_superlative', { voteId });
    });
  });
}

// ─── Preset awards ────────────────────────────────────────────────────────────

const PRESET_AWARDS = [
  { key: 'MVP',     name: 'MVP Award',     icon: '★' },
  { key: 'TRUST',   name: 'Trust Award',   icon: '⚭' },
  { key: 'GEMINI',  name: 'Gemini Award',  icon: '⇌' },
  { key: 'POLARIS', name: 'Polaris Award', icon: '◉' },
  { key: 'MENTEE',  name: 'Mentee Award',  icon: '↑' },
  { key: 'MENTOR',  name: 'Mentor Award',  icon: '↓' },
];

function renderPresetAwardsPanel() {
  const el = document.getElementById('preset-awards-list');
  if (!el) return;
  el.innerHTML = PRESET_AWARDS.map(award => {
    const revealed = adminState.presetAwardsState[award.key];
    if (revealed) {
      return `
      <div class="preset-award-row award-revealed">
        <div class="preset-award-meta">
          <span class="preset-award-icon">${award.icon}</span>
          <span class="preset-award-label">${award.name}</span>
        </div>
        <div style="font-size:13px;color:var(--gold);font-weight:600;padding:2px 0 4px">★ ${escHtml(revealed.winnerName)}</div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
          <div style="font-size:11px;color:var(--success)">📢 Revealed to guests</div>
          <button class="btn btn--ghost btn--sm preset-unreveal-btn" data-key="${award.key}">↩ Unreveal</button>
        </div>
      </div>`;
    }
    return `
      <div class="preset-award-row">
        <div class="preset-award-meta">
          <span class="preset-award-icon">${award.icon}</span>
          <span class="preset-award-label">${award.name}</span>
        </div>
        <div class="preset-award-controls">
          <input type="text" class="preset-winner-input" id="preset-input-${award.key}" placeholder="Winner name...">
          <button class="btn btn--primary btn--sm preset-reveal-btn" data-key="${award.key}" data-name="${award.name}" data-icon="${award.icon}">Reveal</button>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('.preset-reveal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key  = btn.dataset.key;
      const name = btn.dataset.name;
      const icon = btn.dataset.icon;
      const input = document.getElementById(`preset-input-${key}`);
      const winnerName = input ? input.value.trim() : '';
      if (!winnerName) { input && input.focus(); return; }
      if (!confirm(`Reveal ${name} to all guests?\nWinner: ${winnerName}`)) return;
      socket.emit('admin_reveal_preset_award', { awardKey: key, awardName: name, awardIcon: icon, winnerName });
    });
  });

  el.querySelectorAll('.preset-unreveal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Remove this award from guest screens?')) return;
      socket.emit('admin_unreveal_preset_award', { awardKey: btn.dataset.key });
    });
  });
}

socket.on('preset_award_confirmed', (result) => {
  adminState.presetAwardsState[result.awardKey] = result;
  renderPresetAwardsPanel();
});

socket.on('preset_award_confirmed_unreveal', ({ awardKey }) => {
  delete adminState.presetAwardsState[awardKey];
  renderPresetAwardsPanel();
});

socket.on('award_unreveal', ({ voteId }) => {
  const entry = adminState.votingHistory.find(v => v.id === voteId);
  if (entry) entry.broadcastedAt = null;
  renderAwardsList();
  renderSuperlativePanel();
});

function resetVoteForm() {
  document.getElementById('vote-title').value       = '';
  document.getElementById('vote-team').value        = '';
  document.getElementById('vote-description').value = '';
  document.getElementById('vote-timelimit').value   = '25';
  populateCandidates();
}

function renderVoteHistory() {
  const el = document.getElementById('vote-history-list');
  if (!el) return;
  const history = adminState.votingHistory;
  if (!history || history.length === 0) {
    el.innerHTML = '<div class="empty-state">No completed votes</div>';
    return;
  }
  el.innerHTML = '';
  [...history].reverse().forEach(item => {
    const div = document.createElement('div');
    div.className = 'vote-history-item';
    div.innerHTML = `
      <div class="vote-history-award">${escHtml(item.title)}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">${escHtml(item.team || '')}</div>
      <div class="vote-history-winner">★ ${escHtml(item.winnerName)}</div>
    `;
    el.appendChild(div);
  });
}

// ─── Guests ────────────────────────────────────────────────────────────────

socket.on('guests_updated', ({ guests, count }) => {
  adminState.guests = guests;
  updateOnlineCardIds();
  renderGuests(guests);
  updateStats();
  updateCardRegistryOnlineStatus();
  renderConstellationStatus();
  document.getElementById('guest-count-display').textContent = count;
  const guestCountEl = document.getElementById('guest-count');
  if (guestCountEl) guestCountEl.textContent = count;
});

function renderGuests(guests) {
  const el = document.getElementById('guest-list');
  if (!guests || guests.length === 0) {
    el.innerHTML = '<div class="empty-state">No guests connected</div>';
    document.getElementById('guest-count-display').textContent = 0;
    return;
  }
  document.getElementById('guest-count-display').textContent = guests.length;
  const sorted = [...guests].sort((a, b) => a.joinedAt - b.joinedAt);
  el.innerHTML = '';
  sorted.forEach(g => {
    const item = document.createElement('div');
    item.className = 'guest-item';
    item.innerHTML = `
      <div>
        <div class="guest-item-name">${escHtml(g.name)}</div>
        ${g.cardId ? `<div class="guest-item-card">${escHtml(g.cardId)}</div>` : ''}
      </div>
      <div class="guest-voted-dot${g.hasVoted ? ' voted' : ''}" title="${g.hasVoted ? 'Voted' : 'Not voted'}"></div>
    `;
    el.appendChild(item);
  });
}

function updateOnlineCardIds() {
  adminState.onlineCardIds = new Set(
    adminState.guests.filter(g => g.cardId).map(g => g.cardId)
  );
}

function updateStats() {
  document.getElementById('stat-guests').textContent       = adminState.guests.length;
  document.getElementById('stat-phase').textContent        = adminState.phase;
  document.getElementById('stat-interactions').textContent = adminState.interactionLog.length;
}

// ─── Card Registry ─────────────────────────────────────────────────────────

function renderCardRegistry(cards) {
  const grid = document.getElementById('card-registry-grid');
  if (!grid) return;

  const byConst = {};
  for (const card of cards) {
    if (!byConst[card.constellation]) byConst[card.constellation] = [];
    byConst[card.constellation].push(card);
  }

  grid.innerHTML = Object.entries(byConst).map(([constName, constCards]) => {
    const constData = adminState.constellations[constName] || {};
    return `
      <div class="registry-constellation-group">
        <div class="registry-const-header" style="color:${constData.color || 'var(--accent)'}">
          ${constData.symbol || '✦'} ${constName}
          <span style="color:var(--text-muted);font-size:11px;margin-left:8px">${constData.description || ''}</span>
        </div>
        <div class="registry-cards-row">
          ${constCards.map(card => `
            <div class="registry-card" data-card-id="${card.id}">
              <div class="registry-card-online-dot ${adminState.onlineCardIds.has(card.id) ? 'online' : 'offline'}"></div>
              <div class="registry-card-name">${escHtml(card.name)}</div>
              <div class="registry-card-meta">
                ${card.isPolaris ? '<span class="polaris-tag">◉</span>' : ''}
                #${card.number} · ${card.direction}
              </div>
              <div class="registry-card-id">${escHtml(card.id)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('registry-search')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.registry-card').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.opacity = q && !text.includes(q) ? '0.2' : '1';
    });
  });
}

function updateCardRegistryOnlineStatus() {
  document.querySelectorAll('.registry-card').forEach(el => {
    const id = el.dataset.cardId;
    const dot = el.querySelector('.registry-card-online-dot');
    if (dot) {
      dot.className = `registry-card-online-dot ${adminState.onlineCardIds.has(id) ? 'online' : 'offline'}`;
    }
  });
}

// ─── Interactions ───────────────────────────────────────────────────────────

socket.on('new_interaction', (interaction) => {
  adminState.interactionLog.push(interaction);
  document.getElementById('stat-interactions').textContent = adminState.interactionLog.length;
  document.getElementById('interaction-count-badge').textContent = adminState.interactionLog.length;
  renderInteractionLog();
  renderConstellationStatus();
});

function renderInteractionLog(filter = 'all') {
  const el = document.getElementById('interaction-log');
  if (!el) return;

  const filtered = adminState.interactionLog.filter(i => {
    if (filter === 'all') return true;
    if (filter === 'rare') return i.results?.some(r => r.strength === 'rare');
    return i.type === filter;
  }).slice().reverse();

  if (!filtered.length) { el.innerHTML = '<div class="empty-state">No interactions</div>'; return; }

  el.innerHTML = filtered.slice(0, 50).map(i => {
    const time = new Date(i.timestamp).toLocaleTimeString();
    const hasRare = i.results?.some(r => r.strength === 'rare');
    if (i.type === 'PAIR_INTERACTION') {
      return `
        <div class="interaction-item ${hasRare ? 'rare' : ''}">
          <div class="interaction-time">${time}</div>
          <div class="interaction-pair-desc">${escHtml(i.cardA.name)} ↔ ${escHtml(i.cardB.name)}</div>
          <div class="interaction-consts">${escHtml(i.cardA.constellation)} / ${escHtml(i.cardB.constellation)}</div>
          ${i.results?.map(r => `<span class="rule-tag ${r.strength}">${r.strength}</span>`).join('') || ''}
        </div>`;
    } else {
      return `
        <div class="interaction-item group">
          <div class="interaction-time">${time}</div>
          <div class="interaction-pair-desc">${escHtml(i.constellation)} — ${i.count} members online</div>
          ${i.results?.map(r => `<span class="rule-tag ${r.strength}">${r.strength}</span>`).join('') || ''}
        </div>`;
    }
  }).join('');

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderInteractionLog(btn.dataset.filter);
    });
  });
}

function renderConstellationStatus() {
  const el = document.getElementById('constellation-status-grid');
  if (!el) return;

  el.innerHTML = Object.entries(adminState.constellations).map(([name, constData]) => {
    const members = adminState.cards.filter(c => c.constellation === name);
    const online = members.filter(c => adminState.onlineCardIds.has(c.id)).length;
    const pct = members.length ? Math.round((online / members.length) * 100) : 0;
    return `
      <div class="const-status-item">
        <span class="const-status-symbol" style="color:${constData.color}">${constData.symbol}</span>
        <div class="const-status-info">
          <div class="const-status-name">${name}</div>
          <div class="const-status-bar">
            <div class="const-status-fill" style="width:${pct}%;background:${constData.color}"></div>
          </div>
          <div class="const-status-count">${online}/${members.length}</div>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('pair-eval-btn')?.addEventListener('click', () => {
  const a = document.getElementById('pair-card-a').value.trim();
  const b = document.getElementById('pair-card-b').value.trim();
  if (!a || !b) return;
  socket.emit('admin_evaluate_pair', { cardIdA: a, cardIdB: b });
});

socket.on('pair_result', ({ cardA, cardB, results }) => {
  const el = document.getElementById('pair-eval-result');
  if (!el) return;
  el.innerHTML = `
    <div style="margin-top:10px;font-size:13px">
      <strong>${escHtml(cardA.name)}</strong> ↔ <strong>${escHtml(cardB.name)}</strong>
      <div style="margin-top:6px">
        ${results.map(r => `<div class="rule-tag ${r.strength}" style="display:inline-block;margin:4px 4px 0 0">${r.strength}: ${escHtml(r.description)}</div>`).join('')}
        ${!results.length ? '<div style="color:var(--text-muted)">No interactions triggered.</div>' : ''}
      </div>
    </div>`;
});

// ─── Clues ─────────────────────────────────────────────────────────────────

socket.on('clue_state_updated', ({ clueId, state }) => {
  adminState.clueStates[clueId] = state;
  renderClues();
});

function renderClues() {
  ['dinner', 'rare', 'terminal'].forEach(bucket => {
    const el = document.getElementById(`clue-list-${bucket}`);
    if (!el) return;
    const clues = adminState.clues[bucket] || [];
    el.innerHTML = clues.map(clue => {
      const cs = adminState.clueStates[clue.id] || {};
      return `
        <div class="clue-item ${cs.unlocked ? 'unlocked' : ''}">
          <div class="clue-item-level">${escHtml(clue.level || bucket)}</div>
          <div class="clue-item-text">${escHtml(clue.text)}</div>
          <div class="clue-item-actions">
            <button class="btn btn--${cs.unlocked ? 'ghost' : 'primary'} btn--sm clue-broadcast-btn"
              data-clue-id="${clue.id}" data-bucket="${bucket}">
              ${cs.unlocked ? '↑ Re-send' : '▶ Broadcast'}
            </button>
          </div>
          ${cs.unlocked ? `<div class="clue-unlocked-time">Sent ${new Date(cs.unlockedAt).toLocaleTimeString()}</div>` : ''}
        </div>`;
    }).join('') || '<div class="empty-state">No clues in this bucket</div>';

    el.querySelectorAll('.clue-broadcast-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        socket.emit('admin_broadcast_clue', { clueId: btn.dataset.clueId, bucket: btn.dataset.bucket });
      });
    });
  });
}

// ─── Story ────────────────────────────────────────────────────────────────

socket.on('story_event', (event) => {
  adminState.storyEvents.push(event);
  renderStoryTimeline();
});

function renderStoryTimeline() {
  const el = document.getElementById('story-timeline');
  if (!el) return;
  const events = adminState.storyEvents.slice().reverse();
  if (!events.length) { el.innerHTML = '<div class="empty-state">No events yet</div>'; return; }

  const icons = { PHASE_CHANGE: '◎', RARE_INTERACTION: '⚡', CLUE_UNLOCKED: '✦', AWARD_GIVEN: '★', GROUP_INTERACTION: '◈' };

  el.innerHTML = events.slice(0, 40).map(ev => `
    <div class="story-event-item ${ev.type.toLowerCase()}">
      <span class="story-event-icon">${icons[ev.type] || '·'}</span>
      <div class="story-event-body">
        <div class="story-event-desc">${escHtml(ev.description)}</div>
        <div class="story-event-time">${new Date(ev.timestamp).toLocaleTimeString()}</div>
      </div>
    </div>
  `).join('');
}

function renderAwardsList() {
  const el = document.getElementById('awards-list');
  if (!el) return;
  const awards = adminState.votingHistory.filter(v => v.winnerName);
  if (!awards.length) { el.innerHTML = '<div class="empty-state">No awards tallied yet</div>'; return; }
  el.innerHTML = awards.map(a => {
    const revealed = !!a.broadcastedAt;
    return `
    <div class="award-item${revealed ? ' award-revealed' : ' award-pending'}">
      <div class="award-name">${escHtml(a.title || a.award || '')}</div>
      <div class="award-winner">★ ${escHtml(a.winnerName)}</div>
      <div class="award-team">${escHtml(a.team || '')}</div>
      ${revealed
        ? `<div class="award-status-badge revealed">📢 Revealed to guests</div>`
        : `<button class="btn-broadcast-award" data-vote-id="${escHtml(a.id || '')}">📢 Reveal to Guests</button>`
      }
    </div>`;
  }).join('');

  el.querySelectorAll('.btn-broadcast-award').forEach(btn => {
    btn.addEventListener('click', () => {
      const voteId = btn.dataset.voteId;
      if (!voteId) return;
      if (!confirm('Reveal this award winner to all guests now?')) return;
      socket.emit('admin_broadcast_award', { voteId });
    });
  });
}

function renderPhaseProgress() {
  const el = document.getElementById('phase-progress-list');
  if (!el) return;
  const phases = ['LOBBY', 'DINNER', 'SPEECHES', 'MINGLING', 'AFTERPARTY'];
  el.innerHTML = phases.map(p => {
    const t = adminState.phaseStartTimes?.[p];
    return `
      <div class="phase-progress-item ${adminState.phase === p ? 'current' : t ? 'done' : ''}">
        <span>${p}</span>
        <span style="color:var(--text-muted);font-size:11px">${t ? new Date(t).toLocaleTimeString() : '—'}</span>
      </div>`;
  }).join('');
}

// ─── Terminal ─────────────────────────────────────────────────────────────

document.getElementById('set-terminal-solution-btn')?.addEventListener('click', () => {
  const raw = document.getElementById('terminal-solution-input').value.trim();
  const solution = {};
  raw.split(/[\n,\s]+/).forEach(pair => {
    const [k, v] = pair.split(':');
    if (k && v) solution[k.trim().toUpperCase()] = v.trim().toUpperCase();
  });
  if (!Object.keys(solution).length) return;
  socket.emit('admin_set_terminal_solution', { solution });
  adminState.terminalSolution = solution;
  document.getElementById('terminal-admin-status').textContent = 'Solution set: ' + JSON.stringify(solution);
});

document.getElementById('broadcast-terminal-solved-btn')?.addEventListener('click', () => {
  socket.emit('admin_force_terminal_complete');
});

socket.on('terminal_solved', () => {
  const statusEl = document.getElementById('terminal-admin-status');
  if (statusEl) statusEl.textContent = '✓ MIDNIGHT ECLIPSE COMPLETE broadcast sent';
});

// ─── Connection ─────────────────────────────────────────────────────────────

socket.on('connect', () => {
  // handled via admin_ready
});

// ─── Pi LED Panel ────────────────────────────────────────────────────────────

socket.on('pi_connected', () => { updatePiStatus(true); });
socket.on('pi_disconnected', () => { updatePiStatus(false); });

function updatePiStatus(connected) {
  const dot = document.getElementById('pi-status-dot');
  const label = document.getElementById('pi-status-label');
  if (dot) dot.className = `pi-status-dot ${connected ? 'online' : 'offline'}`;
  if (label) label.textContent = connected ? 'Pi LED Board: CONNECTED' : 'Pi LED Board: OFFLINE';
}

document.getElementById('led-test-btn')?.addEventListener('click', () => { socket.emit('admin_led_test'); });
document.getElementById('led-off-btn')?.addEventListener('click', () => { socket.emit('admin_led_all_off'); });
document.getElementById('led-brightness')?.addEventListener('input', e => {
  socket.emit('admin_led_brightness', { brightness: parseInt(e.target.value) });
});

function renderLedConstellationGrid() {
  const grid = document.getElementById('led-constellation-grid');
  if (!grid || !adminState.constellations) return;

  grid.innerHTML = Object.entries(adminState.constellations).map(([name, data]) => `
    <div class="led-const-row">
      <span class="led-const-symbol" style="color:${data.color}">${data.symbol}</span>
      <span class="led-const-name">${name}</span>
      <div class="led-const-btns">
        <button class="btn btn--ghost btn--xs led-const-btn" data-constellation="${name}" data-mode="pulse">Pulse</button>
        <button class="btn btn--ghost btn--xs led-const-btn" data-constellation="${name}" data-mode="glow">Glow</button>
        <button class="btn btn--ghost btn--xs led-const-btn" data-constellation="${name}" data-mode="off">Off</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.led-const-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('admin_led_constellation', { constellation: btn.dataset.constellation, mode: btn.dataset.mode });
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── Init ───────────────────────────────────────────────────────────────── */
populateCandidates();
document.getElementById('password-input')?.focus();
