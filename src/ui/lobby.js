// Lobby, role wheel, hide countdown and kill feed.
//
// Self-contained: this module builds its own DOM and injects its own stylesheet
// rather than depending on markup in index.html, so the whole round mode can be
// added or removed without touching the rest of the front end. Every class is
// namespaced `lb-` and colours are read from the existing CSS custom properties
// so it inherits the game's look automatically.

import { PHASE, ROLE } from '../game/round.js';
import { audio } from '../engine/audio.js';

const CSS = `
.lb-screen{position:fixed;inset:0;z-index:30;display:none;place-items:center;
  background:radial-gradient(120% 90% at 50% 30%,rgba(18,22,31,.92),rgba(4,5,8,.97));
  backdrop-filter:blur(10px);font-family:var(--font-ui)}
.lb-screen.on{display:grid}
.lb-wrap{width:min(1080px,92vw);max-height:92vh;overflow:hidden;display:grid;gap:18px}
.lb-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px}
.lb-title{font-family:var(--font-display);font-size:clamp(1.6rem,4vw,2.6rem);
  letter-spacing:.14em;transform:skewX(var(--skew));text-transform:uppercase}
.lb-sub{font-family:var(--font-mono);font-size:.66rem;letter-spacing:.3em;color:var(--ink-faint)}

.lb-you{display:grid;justify-items:center;gap:10px;padding:22px 0}
.lb-youav{width:96px;height:96px;border-radius:22px;display:grid;place-items:center;
  font-family:var(--font-display);font-size:2rem;color:#0b0d11;transform:skewX(var(--skew));
  background:linear-gradient(150deg,var(--gold-1),var(--gold-2));
  box-shadow:0 12px 40px rgba(255,215,0,.25),0 0 0 3px #000 inset}
.lb-youname{font-family:var(--font-display);font-size:1.3rem;letter-spacing:.14em;
  transform:skewX(var(--skew))}
.lb-youtag{font-family:var(--font-mono);font-size:.6rem;letter-spacing:.28em;color:var(--ink-faint)}
.lb-joinbig{font-family:var(--font-display);font-size:clamp(3rem,11vw,6rem);line-height:1;
  letter-spacing:.05em;transform:skewX(var(--skew));color:var(--cyan);
  text-shadow:0 0 60px rgba(70,224,255,.35),0 4px 0 #000}
.lb-joinlbl{font-family:var(--font-mono);font-size:.66rem;letter-spacing:.34em;color:var(--ink-dim)}
.lb-roster{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:640px}
.lb-chip{display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:20px;
  border:1px solid var(--line);background:rgba(14,17,24,.7);
  font-family:var(--font-display);font-size:.7rem;letter-spacing:.08em}
.lb-chip.you{border-color:var(--gold-1);color:var(--gold-1)}
.lb-chip.bot{opacity:.55}
.lb-chip i{width:7px;height:7px;border-radius:50%;background:var(--green)}
.lb-chip.bot i{background:var(--ink-faint)}
.lb-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px}
.lb-slot{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;
  border:1px solid var(--line);background:rgba(14,17,24,.7);transition:.25s}
.lb-slot.ready{border-color:rgba(69,224,138,.45);background:rgba(12,32,22,.6)}
.lb-slot.you{border-color:var(--gold-1);box-shadow:0 0 0 1px rgba(255,215,0,.3)}
.lb-slot.empty{opacity:.35;border-style:dashed}
.lb-av{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;flex:0 0 auto;
  font-family:var(--font-display);font-size:.8rem;color:#0b0d11;transform:skewX(var(--skew))}
.lb-nm{font-family:var(--font-display);font-size:.82rem;letter-spacing:.08em;line-height:1.2}
.lb-st{font-family:var(--font-mono);font-size:.54rem;letter-spacing:.18em;color:var(--ink-faint)}
.lb-slot.ready .lb-st{color:var(--green)}

.lb-foot{display:flex;align-items:center;justify-content:space-between;gap:14px}
.lb-count{font-family:var(--font-mono);font-size:.7rem;letter-spacing:.2em;color:var(--ink-dim)}

/* ---- the wheel ---- */
.lb-wheelbox{position:relative;height:132px;overflow:hidden;border-radius:14px;
  border:1px solid var(--line-hi);background:rgba(6,8,12,.85)}
.lb-reel{display:flex;position:absolute;top:0;bottom:0;left:0;will-change:transform}
.lb-cell{width:190px;flex:0 0 190px;display:grid;place-items:center;gap:4px;
  border-right:1px solid rgba(255,255,255,.06)}
.lb-cell b{font-family:var(--font-display);font-size:1.02rem;letter-spacing:.08em;
  transform:skewX(var(--skew))}
.lb-cell span{font-family:var(--font-mono);font-size:.56rem;letter-spacing:.22em}
.lb-cell.seeker span{color:var(--red)}
.lb-cell.hider span{color:var(--cyan)}
.lb-needle{position:absolute;left:50%;top:0;bottom:0;width:3px;margin-left:-1.5px;
  background:linear-gradient(180deg,var(--gold-1),transparent);box-shadow:0 0 18px var(--gold-1);z-index:2}
.lb-fade{position:absolute;inset:0;pointer-events:none;z-index:1;
  background:linear-gradient(90deg,rgba(6,8,12,1),transparent 18%,transparent 82%,rgba(6,8,12,1))}

.lb-reveal{text-align:center;display:grid;gap:6px;min-height:120px;place-content:center}
.lb-role{font-family:var(--font-display);font-size:clamp(2.4rem,8vw,4.6rem);letter-spacing:.16em;
  transform:skewX(var(--skew));line-height:1}
.lb-role.seeker{color:var(--red);text-shadow:0 0 50px rgba(255,60,40,.5),0 3px 0 #000}
.lb-role.hider{color:var(--cyan);text-shadow:0 0 50px rgba(70,224,255,.45),0 3px 0 #000}
.lb-rolesub{font-family:var(--font-mono);font-size:.68rem;letter-spacing:.26em;color:var(--ink-dim)}

/* ---- hide phase ---- */
.lb-hide{position:fixed;inset:0;z-index:28;display:none;pointer-events:none}
.lb-hide.on{display:block}
.lb-timer{position:absolute;top:12vh;left:0;right:0;text-align:center}
.lb-timer .n{font-family:var(--font-display);font-size:clamp(3.4rem,12vw,7rem);line-height:1;
  letter-spacing:.06em;transform:skewX(var(--skew));text-shadow:0 0 60px rgba(0,0,0,.9),0 4px 0 #000}
.lb-timer .l{font-family:var(--font-mono);font-size:.72rem;letter-spacing:.42em;color:var(--ink-dim);margin-top:6px}
.lb-timer.urgent .n{color:var(--red);animation:lbpulse .5s steps(2) infinite}
@keyframes lbpulse{50%{opacity:.45}}
.lb-caged{position:absolute;inset:0;background:
  repeating-linear-gradient(90deg,rgba(0,0,0,.92) 0 14px,transparent 14px 76px),
  radial-gradient(70% 60% at 50% 50%,transparent 30%,rgba(0,0,0,.85));}

/* ---- hunt HUD ---- */
.lb-hunt{position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:14;display:none;
  align-items:center;gap:10px;padding:8px 18px;border-radius:12px;
  border:1px solid var(--line);background:rgba(10,12,18,.7);backdrop-filter:blur(10px)}
.lb-hunt.on{display:flex}
.lb-hunt b{font-family:var(--font-display);font-size:1.1rem;letter-spacing:.1em}
.lb-hunt span{font-family:var(--font-mono);font-size:.58rem;letter-spacing:.22em;color:var(--ink-faint)}
.lb-dot{width:9px;height:9px;border-radius:50%;background:var(--cyan);box-shadow:0 0 8px var(--cyan)}
.lb-dot.dead{background:#3a3f47;box-shadow:none}

.lb-feed{position:fixed;top:74px;right:26px;z-index:14;display:grid;gap:6px;justify-items:end}
.lb-kill{font-family:var(--font-display);font-size:.78rem;letter-spacing:.08em;
  padding:7px 14px;border-radius:9px;border:1px solid var(--line-hi);
  border-left:3px solid var(--red);background:rgba(14,10,12,.8);backdrop-filter:blur(8px);
  animation:lbin .3s cubic-bezier(.2,.8,.2,1)}
.lb-kill.you{border-left-color:var(--gold-1);color:var(--gold-1)}
@keyframes lbin{from{opacity:0;transform:translateX(24px)}}

.lb-dead{position:fixed;inset:0;z-index:26;display:none;place-items:center;
  background:radial-gradient(60% 55% at 50% 50%,rgba(60,0,0,.35),rgba(2,2,4,.92))}
.lb-dead.on{display:grid}
.lb-dead .t{font-family:var(--font-display);font-size:clamp(2.6rem,9vw,5rem);letter-spacing:.2em;
  color:var(--red);transform:skewX(var(--skew));text-shadow:0 4px 0 #000}
.lb-dead .s{font-family:var(--font-mono);font-size:.7rem;letter-spacing:.3em;color:var(--ink-dim);
  text-align:center;margin-top:10px}
@media (prefers-reduced-motion:reduce){.lb-kill,.lb-timer.urgent .n{animation:none}}
`;

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

export class Lobby {
  constructor(round, game) {
    this.round = round;
    this.game = game;
    this._buildStyles();
    this._buildDOM();
    this._wire();
    this._spinning = null;
  }

  _buildStyles() {
    if (document.getElementById('lb-style')) return;
    const s = document.createElement('style');
    s.id = 'lb-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  _buildDOM() {
    // --- lobby / wheel screen ---
    this.screen = el('div', 'lb-screen');
    this.wrap = el('div', 'lb-wrap');
    this.head = el('div', 'lb-head');
    this.title = el('div', 'lb-title', 'LOBBY');
    this.sub = el('div', 'lb-sub', '11 SLOTS · 1 SEEKER · 10 HIDERS');
    this.head.append(this.title, this.sub);

    this.slots = el('div', 'lb-slots');
    this.slots.style.display = 'none';        // kept for the full-roster view

    // The lobby the user asked for: your character, a button, and a clock.
    this.you = el('div', 'lb-you');
    this.youAv = el('div', 'lb-youav', 'YOU');
    this.youName = el('div', 'lb-youname', 'OPERATIVE');
    this.youTag = el('div', 'lb-youtag', 'PRESS START TO OPEN THE ROOM');
    this.joinBig = el('div', 'lb-joinbig', '');
    this.joinLbl = el('div', 'lb-joinlbl', '');
    this.roster = el('div', 'lb-roster');
    this.you.append(this.youAv, this.youName, this.youTag, this.joinBig, this.joinLbl, this.roster);

    this.wheelBox = el('div', 'lb-wheelbox');
    this.reel = el('div', 'lb-reel');
    this.wheelBox.append(this.reel, el('div', 'lb-fade'), el('div', 'lb-needle'));
    this.wheelBox.style.display = 'none';

    this.reveal = el('div', 'lb-reveal');
    this.reveal.style.display = 'none';

    this.foot = el('div', 'lb-foot');
    this.count = el('div', 'lb-count', '0 / 11 READY');
    this.readyBtn = el('button', 'btn play', '<span>START</span>');
    this.foot.append(this.count, this.readyBtn);

    this.wrap.append(this.head, this.you, this.slots, this.wheelBox, this.reveal, this.foot);
    this.screen.append(this.wrap);
    document.body.appendChild(this.screen);

    // --- hide-phase overlay ---
    this.hide = el('div', 'lb-hide');
    this.cage = el('div', 'lb-caged');
    this.cage.style.display = 'none';
    this.timer = el('div', 'lb-timer', '<div class="n">30</div><div class="l">FIND SOMEWHERE TO HIDE</div>');
    this.hide.append(this.cage, this.timer);
    document.body.appendChild(this.hide);

    // --- hunt HUD ---
    this.hunt = el('div', 'lb-hunt');
    document.body.appendChild(this.hunt);
    this.feed = el('div', 'lb-feed');
    document.body.appendChild(this.feed);

    // --- death overlay ---
    this.dead = el('div', 'lb-dead',
      '<div><div class="t">CAUGHT</div>' +
      '<div class="s">YOU HAVE BEEN FOUND · RESPAWNING AT THE START AREA</div></div>');
    document.body.appendChild(this.dead);
  }

  _wire() {
    this.readyBtn.addEventListener('click', () => {
      const on = this.round.toggleReady();
      audio.ui(on ? 'confirm' : 'back');
      this.readyBtn.firstChild.textContent = on ? 'CANCEL' : 'START';
      this.renderYou();
    });

    this.round.on('phase', (phase, data) => this.onPhase(phase, data));
    this.round.on('lobby', () => this.renderYou());
    this.round.on('ready', () => this.renderYou());
    this.round.on('join', () => this.renderYou());
    this.round.on('joinOpen', () => this.renderYou());
    this.round.on('respawn', () => { this.showDead(false); this.renderHunt(); });
    this.round.on('secret', (who) => this.pushKill({ name: 'THE PUP', by: who, isLocal: false }));
    this.round.on('caught', (p, entry) => this.pushKill(entry));
    this.round.on('localCaught', () => this.showDead(true));
  }

  // ------------------------------------------------------------------ phases
  onPhase(phase, data) {
    this.screen.classList.toggle('on', phase === PHASE.LOBBY || phase === PHASE.WHEEL);
    this.hide.classList.toggle('on', phase === PHASE.HIDE);
    this.hunt.classList.toggle('on', phase === PHASE.HUNT);
    if (phase !== PHASE.HUNT && phase !== PHASE.HIDE) this.showDead(false);

    if (phase === PHASE.LOBBY) {
      this.title.textContent = 'LOBBY';
      this.wheelBox.style.display = 'none';
      this.reveal.style.display = 'none';
      this.slots.style.display = '';
      this.foot.style.display = '';
      this.readyBtn.firstChild.textContent = 'START';
      this.feed.innerHTML = '';
      this.you.style.display = '';
      this.renderYou();
    }
    if (phase === PHASE.WHEEL) {
      this.title.textContent = 'ASSIGNING ROLES';
      this.you.style.display = 'none';
      this.slots.style.display = 'none';
      this.foot.style.display = 'none';
      this.wheelBox.style.display = '';
      this.reveal.style.display = '';
      this.reveal.innerHTML = '';
      this.startSpin(data);
    }
    if (phase === PHASE.HIDE) {
      const seeker = this.round.localIsSeeker;
      this.cage.style.display = seeker ? '' : 'none';
      this.timer.querySelector('.l').textContent =
        seeker ? 'THE HUNT BEGINS IN' : 'FIND SOMEWHERE TO HIDE';
    }
    if (phase === PHASE.HUNT) this.renderHunt();
  }

  // --------------------------------------------------------------------- you
  /**
   * The lobby is deliberately just you. Other people appear as chips as they
   * arrive; the eleven-slot grid only shows up once the room actually fills.
   */
  renderYou() {
    const r = this.round;
    const me = r.local;
    if (!me) return;
    this.youAv.textContent = (me.name || 'YOU').slice(0, 2);
    this.youName.textContent = me.name || 'OPERATIVE';

    const humans = r.humanCount;
    if (r.joinOpen) {
      const left = Math.ceil(r.joinLeft);
      this.joinBig.textContent = String(left);
      this.joinLbl.textContent = 'SECONDS FOR OTHERS TO JOIN';
      this.youTag.textContent = humans > 1
        ? `${humans} PLAYERS IN THE ROOM`
        : 'WAITING FOR ANYONE ELSE';
    } else {
      this.joinBig.textContent = '';
      this.joinLbl.textContent = '';
      this.youTag.textContent = 'PRESS START TO OPEN THE ROOM';
    }

    // Chips for anyone who has actually turned up.
    this.roster.innerHTML = '';
    const real = r.participants.filter(p => !p.isAI);
    for (const p of real) {
      const c = el('div', 'lb-chip' + (p.isLocal ? ' you' : ''));
      c.append(el('i'), document.createTextNode(p.name));
      this.roster.appendChild(c);
    }
    if (r.joinOpen && real.length < 11) {
      const c = el('div', 'lb-chip bot');
      c.append(el('i'), document.createTextNode(`+${11 - real.length} AI`));
      this.roster.appendChild(c);
    }
    this.count.textContent = `${real.length} REAL · ${11 - real.length} AI`;
  }

  // ------------------------------------------------------------------- slots
  renderSlots() {
    const ps = this.round.participants;
    this.slots.innerHTML = '';
    for (const p of ps) {
      const s = el('div', 'lb-slot' + (p.ready ? ' ready' : '') + (p.isLocal ? ' you' : ''));
      const av = el('div', 'lb-av', (p.name || '?').slice(0, 2));
      av.style.background = p.isLocal
        ? 'linear-gradient(150deg,var(--gold-1),var(--gold-2))'
        : `hsl(${(hashName(p.name) % 360)} 40% 55%)`;
      const txt = el('div');
      txt.append(el('div', 'lb-nm', p.name), el('div', 'lb-st',
        p.ready ? 'READY' : (p.isAI ? 'CONNECTING…' : 'NOT READY')));
      s.append(av, txt);
      this.slots.appendChild(s);
    }
    const n = ps.filter(p => p.ready).length;
    this.count.textContent = `${n} / ${ps.length} READY`;
  }

  // ------------------------------------------------------------------- wheel
  /**
   * The outcome is already decided; this only presents it. We build a long reel
   * whose landing cell is the real result, then ease the reel to put that cell
   * under the needle exactly as the phase timer expires.
   */
  startSpin(data) {
    const ps = this.round.participants;
    const CELL = 190;
    const loops = data.turns ?? 5;
    const seq = [];
    for (let l = 0; l < loops; l++) for (const p of ps) seq.push(p);
    // ...then append the run that ends on the seeker.
    for (let i = 0; i <= data.seekerIdx; i++) seq.push(ps[i]);

    this.reel.innerHTML = '';
    for (const p of seq) {
      const isSeeker = p === ps[data.seekerIdx];
      const c = el('div', 'lb-cell ' + (isSeeker ? 'seeker' : 'hider'));
      c.append(el('b', null, p.name), el('span', null, isSeeker ? 'SEEKER' : 'HIDER'));
      this.reel.appendChild(c);
    }

    const boxW = this.wheelBox.clientWidth || 900;
    const finalX = -((seq.length - 1) * CELL) + boxW / 2 - CELL / 2;
    const dur = (data.duration ?? 6.5) * 1000 * 0.82;

    const t0 = performance.now();
    let lastCell = -1;
    cancelAnimationFrame(this._spinning);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      // Strong ease-out: fast blur at the start, a long crawl into the stop.
      const e = 1 - Math.pow(1 - t, 4.2);
      const x = finalX * e;
      this.reel.style.transform = `translateX(${x}px)`;
      const cell = Math.floor(-x / CELL);
      if (cell !== lastCell) {
        lastCell = cell;
        if (t < 0.97) audio.play({ type: 'square', freq: 1100, dur: 0.03, gain: 0.05 });
      }
      if (t < 1) this._spinning = requestAnimationFrame(step);
      else this.revealRole();
    };
    this._spinning = requestAnimationFrame(step);
  }

  revealRole() {
    const seeker = this.round.localIsSeeker;
    this.reveal.innerHTML = '';
    const r = el('div', 'lb-role ' + (seeker ? 'seeker' : 'hider'), seeker ? 'SEEKER' : 'HIDER');
    const s = el('div', 'lb-rolesub', seeker
      ? 'HUNT THEM DOWN. ALL TEN.'
      : `${this.round.wheelResult?.seekerName ?? 'SOMETHING'} IS THE SEEKER · STAY OUT OF SIGHT`);
    this.reveal.append(r, s);
    if (seeker) {
      audio.play({ type: 'sawtooth', freq: 150, freqEnd: 60, dur: 1.1, gain: 0.2, filter: 900, q: 4 });
    } else {
      audio.play({ type: 'triangle', freq: 520, dur: 0.16, gain: 0.14 });
      audio.play({ type: 'triangle', freq: 780, dur: 0.3, gain: 0.11, delay: 0.11 });
    }
  }

  // -------------------------------------------------------------------- hunt
  renderHunt() {
    this.hunt.innerHTML = '';
    const left = this.round.aliveHiders.length;
    const b = el('b', null, String(left));
    const sp = el('span', null, 'HIDERS REMAINING');
    const dots = el('div');
    dots.style.cssText = 'display:flex;gap:4px;margin-left:6px';
    for (const p of this.round.hiders) {
      dots.appendChild(el('i', 'lb-dot' + (p.alive ? '' : ' dead')));
    }
    this.hunt.append(b, sp, dots);
  }

  pushKill(entry) {
    const k = el('div', 'lb-kill' + (entry.isLocal ? ' you' : ''),
      `${entry.by} &nbsp;›&nbsp; ${entry.name}`);
    this.feed.appendChild(k);
    setTimeout(() => k.remove(), 5200);
    while (this.feed.children.length > 5) this.feed.firstChild.remove();
    this.renderHunt();
    audio.play({ type: 'square', freq: 300, freqEnd: 120, dur: 0.22, gain: 0.12, filter: 1800 });
  }

  showDead(on) { this.dead.classList.toggle('on', on); }

  // -------------------------------------------------------------------- tick
  update() {
    const r = this.round;
    if (r.phase === PHASE.HIDE) {
      const left = Math.ceil(r.timeLeft);
      this.timer.querySelector('.n').textContent = String(left);
      this.timer.classList.toggle('urgent', left <= 5);
    }
    if (r.phase === PHASE.LOBBY && r.joinOpen) {
      const left = Math.ceil(r.joinLeft);
      if (left !== this._lastLeft) {
        this._lastLeft = left;
        this.joinBig.textContent = String(left);
        if (left <= 5 && left > 0) audio.ui('hover');
      }
    }
  }

  destroy() {
    cancelAnimationFrame(this._spinning);
    for (const n of [this.screen, this.hide, this.hunt, this.feed, this.dead]) n.remove();
  }
}

function hashName(s) {
  let h = 0;
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
