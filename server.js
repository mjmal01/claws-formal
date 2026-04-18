const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'claws2025';

// ─── Load card data ───────────────────────────────────────────────────────────

let cardDb = [];
let constellationDb = {};
let clueDb = {};

try {
  cardDb = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/cards.json'), 'utf8'));
  constellationDb = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/constellations.json'), 'utf8'));
  clueDb = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/clues.json'), 'utf8'));
  console.log(`Loaded ${cardDb.length} cards, ${Object.keys(constellationDb).length} constellations`);
} catch (e) {
  console.warn('Could not load data files:', e.message);
}

let ledMapDb = {};
try {
  ledMapDb = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/led_map.json'), 'utf8'));
} catch(e) {
  console.warn('No led_map.json found — Pi LED system disabled');
}

// ─── Logic modules ────────────────────────────────────────────────────────────

const { evaluatePair } = require('./src/logic/pairRules');
const { evaluateGroup } = require('./src/logic/groupRules');

// ─── State ───────────────────────────────────────────────────────────────────

const speechOrder = [
  { team: 'Presidents',     role: 'Opening Address' },
  { team: 'Product Management', role: 'Current → Next Framing' },
  { team: 'Hardware',       role: 'Team Speech' },
  { team: 'Technical PM',   role: 'Team Speech' },
  { team: 'Artificial Intelligence', role: 'Team Speech' },
  { team: 'Augmented Reality', role: 'Team Speech' },
  { team: 'Infrastructure', role: 'Team Speech' },
  { team: 'UX Design',      role: 'Team Speech' },
  { team: 'Research',       role: 'Team Speech' },
  { team: 'Outreach',       role: 'Team Speech' },
  { team: 'Finance',        role: 'Team Speech' },
  { team: 'Content',        role: 'Team Speech' },
  { team: 'Social',         role: 'Team Speech' },
  { team: 'Product Management', role: 'Closing Reflection' },
];

let state = {
  phase: 'LOBBY',
  speechIndex: -1,
  activeVotings: {},   // voteId → round object (supports multiple simultaneous votes)
  votingHistory: [],
  presetAwards: {},    // awardKey → result object (tracks what's been revealed)
  broadcast: null,
  terminalSolved: false,
  terminalSolution: null,
  interactionLog: [],       // array of pair/group interaction events
  clueStates: {},           // clueId → { unlocked: bool, unlockedAt, unlockedBy }
  storyEvents: [],          // timeline: { type, description, timestamp, data }
  phaseStartTimes: {},      // phase → timestamp
};

// After loading clueDb, initialize clue states (only array buckets)
if (clueDb) {
  for (const bucket of Object.values(clueDb)) {
    if (!Array.isArray(bucket)) continue;
    for (const clue of bucket) {
      state.clueStates[clue.id] = { unlocked: false, unlockedAt: null, unlockedBy: null };
    }
  }
}

// socketId → { name, cardId, joinedAt, hasVoted }
const guests = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentSpeech() {
  if (state.speechIndex < 0 || state.speechIndex >= speechOrder.length) return null;
  return speechOrder[state.speechIndex];
}

function buildGuestState(socketId) {
  const guest = guests.get(socketId);
  const card = guest?.cardId ? cardDb.find(c => c.id === guest.cardId) : null;

  const activeVotings = Object.values(state.activeVotings).map(round => {
    const now = Date.now();
    const elapsed = round.startedAt ? Math.floor((now - round.startedAt) / 1000) : 0;
    return {
      id: round.id,
      title: round.title,
      team: round.team,
      description: round.description,
      options: round.options,
      timeLimit: round.timeLimit,
      status: round.status,
      elapsed,
      myVote: round.votes[socketId] || null,
    };
  });

  return {
    phase: state.phase,
    speechIndex: state.speechIndex,
    currentSpeech: getCurrentSpeech(),
    broadcast: state.broadcast,
    voting: activeVotings[0] || null,   // backwards compat for guest.js overlay
    activeVotings,
    presetAwards: Object.values(state.presetAwards),
    revealedSuperlatives: state.votingHistory
      .filter(v => v.result && v.result.broadcastedAt)
      .map(v => v.result),
    card: card || null,
    constellations: constellationDb,
  };
}

function computeVoteCounts(round) {
  if (!round) return { counts: {}, total: 0 };
  const counts = {};
  for (const opt of round.options) counts[opt.id] = 0;
  for (const optId of Object.values(round.votes)) {
    if (counts[optId] !== undefined) counts[optId]++;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}

function computeWinner(round) {
  const { counts } = computeVoteCounts(round);
  let winnerId = null, winnerCount = -1;
  for (const [id, count] of Object.entries(counts)) {
    if (count > winnerCount) { winnerCount = count; winnerId = id; }
  }
  if (!winnerId) return null;
  return round.options.find(o => o.id === winnerId) || null;
}

function emitGuestsUpdated() {
  const guestList = Array.from(guests.entries()).map(([sid, g]) => ({
    socketId: sid,
    name: g.name,
    cardId: g.cardId,
    joinedAt: g.joinedAt,
    hasVoted: g.hasVoted,
  }));
  io.to('admin').emit('guests_updated', { guests: guestList, count: guestList.length });
}

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ─── Pi LED helpers ───────────────────────────────────────────────────────────

function emitLed(event, data) {
  io.to('pi').emit(event, data);
}

function buildPiState() {
  const onlineCardIds = new Set();
  for (const guest of guests.values()) {
    if (guest.cardId) onlineCardIds.add(guest.cardId);
  }
  const ledStates = {};
  for (const [cardId, ledInfo] of Object.entries(ledMapDb.cards || {})) {
    ledStates[cardId] = {
      ...ledInfo,
      online: onlineCardIds.has(cardId),
      color: ledMapDb.constellationGroups?.[ledInfo.constellation]?.color || [255, 255, 255],
    };
  }
  return { ledStates, phase: state.phase, constellationGroups: ledMapDb.constellationGroups };
}

// ─── Socket.io ───────────────────────────────────────────────────────────────

io.on('connection', (socket) => {

  // Guest joins
  socket.on('guest_join', ({ name, cardId }) => {
    let resolvedName = name ? String(name).trim().slice(0, 60) : '';
    const cleanCard = cardId ? String(cardId).trim().slice(0, 64) : null;

    if (!resolvedName && cleanCard) {
      const cardData = cardDb.find(c => c.id === cleanCard);
      if (cardData) resolvedName = cardData.name;
    }
    if (!resolvedName) return;

    guests.set(socket.id, {
      name: resolvedName,
      cardId: cleanCard,
      joinedAt: Date.now(),
      hasVoted: !!(state.currentVoting && state.currentVoting.votes[socket.id]),
    });

    socket.emit('joined', buildGuestState(socket.id));
    emitGuestsUpdated();

    if (cleanCard) {
      const cardData = cardDb.find(c => c.id === cleanCard);
      if (cardData) {
        io.emit('card_online', {
          cardId: cleanCard,
          name: resolvedName,
          constellation: cardData.constellation,
          symbol: cardData.symbol,
          table: cardData.table,
          number: cardData.number,
          direction: cardData.direction,
          isPolaris: cardData.isPolaris,
        });
      }
    }

    if (cleanCard && ledMapDb.cards?.[cleanCard]) {
      const ledInfo = ledMapDb.cards[cleanCard];
      const color = ledMapDb.constellationGroups?.[ledInfo.constellation]?.color || [255,255,255];
      emitLed('led_card_online', {
        cardId: cleanCard,
        index: ledInfo.index,
        constellation: ledInfo.constellation,
        color,
      });
    }

    if (cleanCard) {
      checkConstellationActivation(cleanCard);
    }
  });

  // Guest registers a pair interaction
  socket.on('register_interaction', ({ targetCardId }) => {
    const guest = guests.get(socket.id);
    if (!guest?.cardId) return;
    if (guest.cardId === targetCardId) return;

    const cardA = cardDb.find(c => c.id === guest.cardId);
    const cardB = cardDb.find(c => c.id === targetCardId);
    if (!cardA || !cardB) {
      socket.emit('interaction_result', { error: 'Unknown card.' });
      return;
    }

    const results = evaluatePair(cardA, cardB);

    const interaction = {
      id: `pair_${Date.now()}`,
      type: 'PAIR_INTERACTION',
      timestamp: Date.now(),
      cardA: { id: cardA.id, name: cardA.name, constellation: cardA.constellation, number: cardA.number, direction: cardA.direction },
      cardB: { id: cardB.id, name: cardB.name, constellation: cardB.constellation, number: cardB.number, direction: cardB.direction },
      results,
      triggeredBy: socket.id,
    };

    state.interactionLog.push(interaction);
    socket.emit('interaction_result', { interaction, cardB });
    io.to('admin').emit('new_interaction', interaction);

    const hasRare = results.some(r => r.strength === 'rare');
    if (hasRare) {
      const storyEvent = {
        type: 'RARE_INTERACTION',
        description: `Rare interaction: ${cardA.name} (${cardA.constellation}) ↔ ${cardB.name} (${cardB.constellation})`,
        timestamp: Date.now(),
        data: { interaction },
      };
      state.storyEvents.push(storyEvent);
      io.to('admin').emit('story_event', storyEvent);
    }

    const ledA = ledMapDb.cards?.[cardA.id];
    const ledB = ledMapDb.cards?.[cardB.id];
    if (ledA && ledB) {
      emitLed('led_pair_interaction', {
        indexA: ledA.index,
        indexB: ledB.index,
        colorA: ledMapDb.constellationGroups?.[ledA.constellation]?.color || [255,255,255],
        colorB: ledMapDb.constellationGroups?.[ledB.constellation]?.color || [255,255,255],
        rare: hasRare,
      });
    }
  });

  // Guest submits vote
  socket.on('submit_vote', ({ voteId, optionId }) => {
    const round = voteId
      ? state.activeVotings[voteId]
      : Object.values(state.activeVotings).find(r => r.status === 'open');

    if (!round || round.status !== 'open') return;
    const validOption = round.options.find(o => o.id === optionId);
    if (!validOption) return;

    if (round.votes[socket.id]) {
      socket.emit('vote_accepted', { voteId: round.id, optionId: round.votes[socket.id] });
      return;
    }

    round.votes[socket.id] = optionId;
    const guest = guests.get(socket.id);
    if (guest) guest.hasVoted = true;

    socket.emit('vote_accepted', { voteId: round.id, optionId });
    const { counts, total } = computeVoteCounts(round);
    io.to('admin').emit('vote_update', { voteId: round.id, counts, total, guestCount: guests.size });
    emitGuestsUpdated();
  });

  // Admin auth
  socket.on('admin_auth', ({ password }) => {
    if (password !== ADMIN_PASSWORD) {
      socket.emit('admin_auth_fail');
      return;
    }
    socket.join('admin');
    const guestList = Array.from(guests.entries()).map(([sid, g]) => ({
      socketId: sid,
      name: g.name,
      cardId: g.cardId,
      joinedAt: g.joinedAt,
      hasVoted: g.hasVoted,
    }));
    socket.emit('admin_ready', {
      state,
      guests: guestList,
      speechOrder,
      cards: cardDb,
      constellations: constellationDb,
      clues: clueDb,
      terminalSolution: state.terminalSolution,
      terminalSolved: state.terminalSolved,
      interactionLog: state.interactionLog,
      clueStates: state.clueStates,
      storyEvents: state.storyEvents,
      phaseStartTimes: state.phaseStartTimes,
      presetAwards: state.presetAwards,
      ledMap: ledMapDb,
    });
  });

  // Admin: set phase
  socket.on('admin_set_phase', ({ phase }) => {
    const valid = ['LOBBY', 'DINNER', 'SPEECHES', 'MINGLING', 'AFTERPARTY'];
    if (!valid.includes(phase)) return;
    state.phase = phase;
    state.phaseStartTimes[phase] = Date.now();
    state.storyEvents.push({ type: 'PHASE_CHANGE', description: `Phase changed to ${phase}`, timestamp: Date.now(), data: { phase } });
    io.emit('phase_changed', { phase });
    emitLed('led_phase_change', { phase });
  });

  // Admin: set speech
  socket.on('admin_set_speech', ({ index }) => {
    const idx = parseInt(index, 10);
    if (isNaN(idx) || idx < -1 || idx >= speechOrder.length) return;
    state.speechIndex = idx;
    const speech = getCurrentSpeech();
    io.emit('speech_changed', { index: idx, speech });
  });

  // Admin: start voting
  socket.on('admin_start_voting', (roundData) => {
    if (!roundData || !roundData.title || !Array.isArray(roundData.options)) return;
    if (roundData.options.length < 2) return;

    const timeLimit = Math.max(5, Math.min(120, parseInt(roundData.timeLimit, 10) || 25));

    const round = {
      id: `vote_${Date.now()}`,
      title: roundData.title,
      team: roundData.team || '',
      description: roundData.description || '',
      options: roundData.options.map((o, i) => ({
        id: o.id || `opt_${i}`,
        name: o.name,
        cardId: o.cardId || null,
      })),
      timeLimit,
      votes: {},
      status: 'open',
      startedAt: Date.now(),
    };

    state.activeVotings[round.id] = round;

    const publicRound = {
      id: round.id, title: round.title, team: round.team,
      description: round.description, options: round.options,
      timeLimit: round.timeLimit, status: round.status,
      startedAt: round.startedAt, elapsed: 0,
    };

    io.emit('voting_opened', publicRound);

    round._autoCloseTimer = setTimeout(() => {
      if (state.activeVotings[round.id]?.status === 'open') closeVoting(round.id);
    }, timeLimit * 1000);

    emitGuestsUpdated();
  });

  // Admin: close voting
  socket.on('admin_close_voting', ({ voteId }) => {
    closeVoting(voteId);
  });

  // Admin: tally winner (admin only, not broadcast to guests yet)
  socket.on('admin_reveal_winner', ({ voteId }) => {
    const round = state.activeVotings[voteId];
    if (!round) return;
    const winner = computeWinner(round);
    const { counts, total } = computeVoteCounts(round);

    const result = {
      id: round.id,
      award: round.title,
      team: round.team,
      winnerName: winner ? winner.name : 'No votes cast',
      winnerCardId: winner ? winner.cardId : null,
      counts,
      total,
      broadcastedAt: null,
    };

    io.to('admin').emit('award_result', result);

    state.votingHistory.push({
      ...round,
      winnerName: result.winnerName,
      winnerCardId: result.winnerCardId,
      closedAt: Date.now(),
      result,
    });

    state.storyEvents.push({
      type: 'AWARD_TALLIED',
      description: `${result.award} tallied — winner: ${result.winnerName} (not yet revealed to guests)`,
      timestamp: Date.now(),
      data: result,
    });
    io.to('admin').emit('story_event', state.storyEvents[state.storyEvents.length - 1]);
    delete state.activeVotings[voteId];
  });

  // Admin: broadcast a superlative to all guests
  socket.on('admin_broadcast_award', ({ voteId }) => {
    const entry = state.votingHistory.find(v => v.id === voteId);
    if (!entry || !entry.result) return;

    entry.result.broadcastedAt = Date.now();
    io.emit('award_result', entry.result);

    if (entry.result.winnerCardId && ledMapDb.cards?.[entry.result.winnerCardId]) {
      const ledInfo = ledMapDb.cards[entry.result.winnerCardId];
      const group = ledMapDb.constellationGroups?.[ledInfo.constellation];
      if (group) {
        emitLed('led_award', {
          constellation: ledInfo.constellation,
          indices: group.indices,
          color: group.color,
          winnerIndex: ledInfo.index,
        });
      }
    }

    state.storyEvents.push({
      type: 'AWARD_GIVEN',
      description: `${entry.result.award} revealed to guests — winner: ${entry.result.winnerName} (${entry.result.team})`,
      timestamp: Date.now(),
      data: entry.result,
    });
    io.to('admin').emit('story_event', state.storyEvents[state.storyEvents.length - 1]);
    io.to('admin').emit('award_broadcasted', { voteId, broadcastedAt: entry.result.broadcastedAt });
  });

  // Admin: reveal a preset award to all guests
  socket.on('admin_reveal_preset_award', ({ awardKey, awardName, awardIcon, winnerName }) => {
    if (!awardKey || !winnerName) return;
    const result = {
      id: `preset_${awardKey}`,
      awardKey,
      award: awardName,
      awardIcon: awardIcon || '★',
      winnerName,
      preset: true,
      broadcastedAt: Date.now(),
    };
    state.presetAwards[awardKey] = result;
    io.emit('preset_award_result', result);
    io.to('admin').emit('preset_award_confirmed', result);
    state.storyEvents.push({ type: 'AWARD_GIVEN', description: `${awardName} awarded to ${winnerName}`, timestamp: Date.now(), data: result });
    io.to('admin').emit('story_event', state.storyEvents[state.storyEvents.length - 1]);
  });

  // Admin: unreveal a preset award
  socket.on('admin_unreveal_preset_award', ({ awardKey }) => {
    delete state.presetAwards[awardKey];
    io.emit('preset_award_unreveal', { awardKey });
    io.to('admin').emit('preset_award_confirmed_unreveal', { awardKey });
    state.storyEvents.push({ type: 'AWARD_GIVEN', description: `Preset award unrevealed: ${awardKey}`, timestamp: Date.now(), data: { awardKey } });
  });

  // Admin: unreveal a superlative
  socket.on('admin_unreveal_superlative', ({ voteId }) => {
    const entry = state.votingHistory.find(v => v.id === voteId);
    if (entry && entry.result) entry.result.broadcastedAt = null;
    io.emit('award_unreveal', { voteId });
    io.to('admin').emit('award_broadcasted', { voteId, broadcastedAt: null });
  });

  // Admin: broadcast message
  socket.on('admin_broadcast', ({ message, type }) => {
    if (!message) return;
    const msg = {
      message: String(message).slice(0, 200),
      type: ['info', 'alert', 'success'].includes(type) ? type : 'info',
      timestamp: Date.now(),
    };
    state.broadcast = msg;
    io.emit('broadcast', msg);
  });

  // Admin: clear broadcast
  socket.on('admin_clear_broadcast', () => {
    state.broadcast = null;
    io.emit('broadcast_cleared');
  });

  // Admin: set terminal solution
  socket.on('admin_set_terminal_solution', ({ solution }) => {
    if (!socket.rooms.has('admin')) return;
    state.terminalSolution = solution;
    socket.emit('terminal_solution_set', { ok: true });
  });

  // Guest: submit terminal answer
  socket.on('terminal_submit', ({ answer }) => {
    if (!state.terminalSolution) {
      socket.emit('terminal_result', { correct: false, message: 'Terminal not yet active.' });
      return;
    }
    const keys = Object.keys(state.terminalSolution);
    const correct = keys.every(k => answer[k] && answer[k].toUpperCase() === state.terminalSolution[k]);
    if (correct) {
      state.terminalSolved = true;
      io.emit('terminal_solved', { message: 'MIDNIGHT ECLIPSE COMPLETE' });
      emitLed('led_finale', {});
    } else {
      socket.emit('terminal_result', { correct: false, message: 'Alignment incorrect. Recalibrate.' });
    }
  });

  // Admin: force terminal complete
  socket.on('admin_force_terminal_complete', () => {
    if (!socket.rooms.has('admin')) return;
    state.terminalSolved = true;
    io.emit('terminal_solved', { message: 'MIDNIGHT ECLIPSE COMPLETE' });
    emitLed('led_finale', {});
  });

  // Admin: evaluate pair
  socket.on('admin_evaluate_pair', ({ cardIdA, cardIdB }) => {
    if (!socket.rooms.has('admin')) return;
    const cardA = cardDb.find(c => c.id === cardIdA);
    const cardB = cardDb.find(c => c.id === cardIdB);
    if (!cardA || !cardB) return;
    const results = evaluatePair(cardA, cardB);
    socket.emit('pair_result', { cardA, cardB, results });
  });

  // Admin: broadcast clue unlock
  socket.on('admin_broadcast_clue', ({ clueId, bucket }) => {
    if (!socket.rooms.has('admin')) return;
    const clue = Array.isArray(clueDb[bucket]) ? clueDb[bucket].find(c => c.id === clueId) : null;
    if (!clue) return;
    state.clueStates[clueId] = { unlocked: true, unlockedAt: Date.now(), unlockedBy: 'admin' };
    state.storyEvents.push({ type: 'CLUE_UNLOCKED', description: `Clue unlocked: "${clue.text.slice(0, 40)}..."`, timestamp: Date.now(), data: { clue, bucket } });
    io.emit('clue_unlocked', { clue });
    io.to('admin').emit('clue_state_updated', { clueId, state: state.clueStates[clueId] });
    io.to('admin').emit('story_event', state.storyEvents[state.storyEvents.length - 1]);
  });

  // Pi device auth
  socket.on('pi_auth', ({ password }) => {
    if (password !== ADMIN_PASSWORD) { socket.emit('pi_auth_fail'); return; }
    socket.join('pi');
    console.log('[Pi] LED board connected:', socket.id);
    socket.emit('pi_ready', buildPiState());
    io.to('admin').emit('pi_connected');
  });

  socket.on('pi_sync', () => {
    if (!socket.rooms.has('pi')) return;
    socket.emit('pi_full_state', buildPiState());
  });

  // Admin: LED controls
  socket.on('admin_led_test', () => { if (!socket.rooms.has('admin')) return; emitLed('led_test', {}); });
  socket.on('admin_led_all_off', () => { if (!socket.rooms.has('admin')) return; emitLed('led_all_off', {}); });
  socket.on('admin_led_constellation', ({ constellation, mode }) => {
    if (!socket.rooms.has('admin')) return;
    const group = ledMapDb.constellationGroups?.[constellation];
    if (!group) return;
    emitLed('led_constellation', { constellation, indices: group.indices, color: group.color, mode: mode || 'pulse' });
  });
  socket.on('admin_led_brightness', ({ brightness }) => {
    if (!socket.rooms.has('admin')) return;
    emitLed('led_brightness', { brightness: Math.max(0, Math.min(255, parseInt(brightness) || 100)) });
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.rooms.has('pi')) {
      console.log('[Pi] LED board disconnected');
      io.to('admin').emit('pi_disconnected');
    }
    if (guests.has(socket.id)) {
      const leaving = guests.get(socket.id);
      guests.delete(socket.id);
      emitGuestsUpdated();
      if (leaving?.cardId) io.emit('card_offline', { cardId: leaving.cardId });
    }
  });
});

function closeVoting(voteId) {
  const round = state.activeVotings[voteId];
  if (!round || round.status === 'closed') return;
  if (round._autoCloseTimer) clearTimeout(round._autoCloseTimer);
  round.status = 'closed';
  io.emit('voting_closed', { voteId });
  const { counts, total } = computeVoteCounts(round);
  const winner = computeWinner(round);
  io.to('admin').emit('voting_results', { voteId, counts, total, winnerId: winner?.id || null, winnerName: winner?.name || null });
}

// ─── checkConstellationActivation ─────────────────────────────────────────────

function checkConstellationActivation(newCardId) {
  const newCard = cardDb.find(c => c.id === newCardId);
  if (!newCard) return;

  const onlineCards = [];
  for (const guest of guests.values()) {
    if (!guest.cardId) continue;
    const card = cardDb.find(c => c.id === guest.cardId);
    if (card && card.constellation === newCard.constellation) onlineCards.push(card);
  }

  if (onlineCards.length >= 2) {
    const groupResults = evaluateGroup(onlineCards);
    const event = {
      id: `group_${Date.now()}`,
      type: 'GROUP_INTERACTION',
      timestamp: Date.now(),
      constellation: newCard.constellation,
      cards: onlineCards.map(c => ({ id: c.id, name: c.name, constellation: c.constellation, number: c.number })),
      results: groupResults,
      count: onlineCards.length,
    };
    state.interactionLog.push(event);
    io.to('admin').emit('new_interaction', event);

    const group = ledMapDb.constellationGroups?.[newCard.constellation];
    if (group) {
      if (onlineCards.length >= 3) {
        emitLed('led_constellation_full', { constellation: newCard.constellation, indices: group.indices, color: group.color });
      } else if (onlineCards.length === 2) {
        emitLed('led_constellation_partial', {
          constellation: newCard.constellation,
          onlineIndices: onlineCards.map(c => ledMapDb.cards?.[c.id]?.index).filter(i => i !== undefined),
          color: group.color,
        });
      }
    }
  }
}

// ─── Static files ─────────────────────────────────────────────────────────────

app.use('/data', express.static(path.join(__dirname, 'data')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/card/:id', (req, res) => {
  const card = cardDb.find(c => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  const constData = constellationDb[card.constellation] || {};
  res.json({ card, constellation: constData });
});

app.get('/api/led-map', (req, res) => { res.json(ledMapDb); });

app.get('/api/pi/status', (req, res) => {
  const piSockets = [...io.sockets.adapter.rooms.get('pi') || []];
  res.json({ connected: piSockets.length > 0, count: piSockets.length });
});

// ─── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║        MIDNIGHT ECLIPSE — SERVER STARTED         ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Guest URL:    http://${ip}:${PORT}/`);
  console.log(`║  Admin URL:    http://${ip}:${PORT}/admin.html`);
  console.log(`║  Display URL:  http://${ip}:${PORT}/display.html`);
  console.log(`║  Password:     ${ADMIN_PASSWORD}`);
  console.log('╚══════════════════════════════════════════════════╝\n');
});
