/* ─── CLAWS Formal — Display Client ───────────────────────────────────────── */

const socket = io();

/* ─── Constellation Animation ────────────────────────────────────────────── */
class ConstellationAnimation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.stars  = [];
    this.raf    = null;

    this.resize();
    this.createStars(200);

    window.addEventListener('resize', () => this.resize());
    this.animate();
  }

  resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  createStars(count) {
    this.stars = [];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x:     Math.random() * this.canvas.width,
        y:     Math.random() * this.canvas.height,
        vx:    (Math.random() - 0.5) * 0.25,
        vy:    (Math.random() - 0.5) * 0.25,
        r:     Math.random() * 1.8 + 0.4,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.008 + 0.004,
      });
    }
  }

  animate() {
    this.raf = requestAnimationFrame(() => this.animate());
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    const w   = this.canvas.width;
    const h   = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Update star positions
    for (const star of this.stars) {
      star.x += star.vx;
      star.y += star.vy;
      star.phase += star.speed;

      // Wrap around edges
      if (star.x < -5)  star.x = w + 5;
      if (star.x > w + 5) star.x = -5;
      if (star.y < -5)  star.y = h + 5;
      if (star.y > h + 5) star.y = -5;
    }

    // Draw constellation lines
    ctx.lineWidth = 0.5;
    for (let i = 0; i < this.stars.length; i++) {
      for (let j = i + 1; j < this.stars.length; j++) {
        const a  = this.stars[i];
        const b  = this.stars[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const alpha = (1 - dist / 120) * 0.12;
          ctx.strokeStyle = `rgba(108, 142, 245, ${alpha})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // Draw stars
    for (const star of this.stars) {
      const twinkle = (Math.sin(star.phase) + 1) / 2;
      const alpha   = 0.25 + twinkle * 0.65;
      const radius  = star.r * (0.85 + twinkle * 0.3);

      ctx.beginPath();
      ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(220, 230, 255, ${alpha})`;
      ctx.fill();
    }
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
  }
}

/* ─── Init constellation ─────────────────────────────────────────────────── */
const canvas = document.getElementById('constellation-canvas');
const constellation = new ConstellationAnimation(canvas);

/* ─── Display state machine ──────────────────────────────────────────────── */
const displayStates = document.querySelectorAll('.display-state');

function showState(id) {
  displayStates.forEach(el => {
    el.hidden = el.id !== id;
  });
}

/* ─── DOM refs ───────────────────────────────────────────────────────────── */
const displayPhaseLabel  = document.getElementById('display-phase-label');
const displaySpeechTeam  = document.getElementById('display-speech-team');
const displaySpeechRole  = document.getElementById('display-speech-role');
const displayVotingTitle = document.getElementById('display-voting-title');
const displayVotingTeam  = document.getElementById('display-voting-team');
const displayTimer       = document.getElementById('display-timer');
const displayWinnerName  = document.getElementById('display-winner-name');
const displayWinnerAward = document.getElementById('display-winner-award');
const broadcastOverlay   = document.getElementById('display-broadcast-overlay');
const broadcastMessage   = document.getElementById('display-broadcast-message');

/* ─── Timer state ────────────────────────────────────────────────────────── */
let displayTimerInterval = null;
let winnerReturnTimer    = null;
let broadcastHideTimer   = null;
let currentPhase         = 'LOBBY';

function stopDisplayTimer() {
  if (displayTimerInterval) {
    clearInterval(displayTimerInterval);
    displayTimerInterval = null;
  }
}

function startDisplayTimer(remaining, total) {
  stopDisplayTimer();
  setDisplayTimer(remaining);

  displayTimerInterval = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    setDisplayTimer(remaining);
    if (remaining <= 0) stopDisplayTimer();
  }, 1000);
}

function setDisplayTimer(remaining) {
  displayTimer.textContent = remaining + 's';
  displayTimer.classList.toggle('danger', remaining <= 5);
}

/* ─── Phase label map ────────────────────────────────────────────────────── */
const phaseLabels = {
  LOBBY:      'LOBBY',
  DINNER:     'DINNER',
  SPEECHES:   'SPEECHES',
  MINGLING:   'MINGLING',
  AFTERPARTY: 'AFTER PARTY',
};

/* ─── Socket events ──────────────────────────────────────────────────────── */
socket.on('phase_changed', ({ phase }) => {
  currentPhase = phase;
  stopDisplayTimer();

  if (phase === 'LOBBY') {
    showState('state-lobby');
  } else {
    displayPhaseLabel.textContent = phaseLabels[phase] || phase;
    showState('state-phase');
  }
});

socket.on('speech_changed', ({ index, speech }) => {
  if (!speech) return;
  displaySpeechTeam.textContent = speech.team;
  displaySpeechRole.textContent = speech.role;
  showState('state-speech');
});

socket.on('voting_opened', (round) => {
  stopDisplayTimer();

  displayVotingTitle.textContent = round.title;
  displayVotingTeam.textContent  = round.team || '';
  showState('state-voting');

  const elapsed    = round.elapsed || 0;
  const remaining  = Math.max(0, round.timeLimit - elapsed);
  startDisplayTimer(remaining, round.timeLimit);
});

socket.on('voting_closed', () => {
  stopDisplayTimer();
  displayTimer.textContent = 'Tallying votes...';
  displayTimer.classList.remove('danger');
  // Stay on voting state, update timer text
});

socket.on('award_result', (result) => {
  stopDisplayTimer();

  // Reset winner animation by briefly removing and re-adding the element
  displayWinnerName.textContent  = result.winnerName;
  displayWinnerAward.textContent = result.award + (result.team ? ' · ' + result.team : '');

  // Force reflow so animation re-triggers
  displayWinnerName.style.animation = 'none';
  void displayWinnerName.offsetWidth;
  displayWinnerName.style.animation = '';

  showState('state-winner');

  // Return to phase state after 20 seconds
  if (winnerReturnTimer) clearTimeout(winnerReturnTimer);
  winnerReturnTimer = setTimeout(() => {
    displayPhaseLabel.textContent = phaseLabels[currentPhase] || currentPhase;
    showState(currentPhase === 'LOBBY' ? 'state-lobby' : 'state-phase');
  }, 20000);
});

socket.on('broadcast', (msg) => {
  if (broadcastHideTimer) clearTimeout(broadcastHideTimer);
  broadcastMessage.textContent = msg.message;
  broadcastOverlay.hidden = false;

  broadcastHideTimer = setTimeout(() => {
    broadcastOverlay.hidden = true;
  }, 6000);
});

socket.on('broadcast_cleared', () => {
  if (broadcastHideTimer) clearTimeout(broadcastHideTimer);
  broadcastOverlay.hidden = true;
});

socket.on('terminal_solved', () => {
  showState('state-terminal');
  // Keep forever (don't auto-revert)
});

socket.on('connect', () => {
  // On reconnect the server will re-broadcast state via existing events
  // Nothing extra needed — state restores via server replay is not implemented,
  // so just show the lobby on fresh connect if no events arrive.
});
