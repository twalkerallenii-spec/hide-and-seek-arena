// Credits roll. Built from data so the arena list stays in sync automatically.

import { ARENA_LIST } from '../arenas/index.js';
import { SKINS, POWERUPS } from '../game/content.js';
import { save } from '../game/state.js';

export function buildCredits() {
  const el = document.getElementById('creditScroll');
  const stats = save.data.stats;
  const hrs = Math.floor(stats.playtime / 3600);
  const mins = Math.floor((stats.playtime % 3600) / 60);

  el.innerHTML = `
    <h1>HIDE &amp; SEEK</h1>
    <p class="big">TWELVE ARENAS</p>

    <h2>THE ARENAS</h2>
    ${ARENA_LIST.map(a => `
      <p><span class="big">${String(a.order).padStart(2, '0')} — ${a.name}</span><br>
      <span class="tiny">${a.tagline}</span></p>`).join('')}

    <h2>ENGINE</h2>
    <p>Renderer, post-processing stack and colour grade<br>
       Procedural PBR texture foundry — 21 surface generators<br>
       Capsule/octree first-person controller<br>
       Procedural WebAudio synthesis — every sound in this game is generated at runtime<br>
       Deterministic world generation</p>

    <h2>SYSTEMS</h2>
    <p>The Seeker — expanding-ring sweep detection<br>
       The Fear model<br>
       ${Object.keys(POWERUPS).length} power-ups · ${SKINS.length} signatures · 8 upgrades · 6 mutators<br>
       One dog per arena</p>

    <h2>ART DIRECTION</h2>
    <p class="tiny">
      Palette and layer language adapted from the author's own design notes:<br>
      the five-layer vertical stack, the coolant-cyan / forge-red / void-violet triad,<br>
      the rule that a transition between layers must be a hard, felt cut,<br>
      and the pillar that says a city can lie.
    </p>

    <h2>BUILT WITH</h2>
    <p class="tiny">three.js (MIT) · WebGL 2 · WebAudio · Canvas 2D<br>
       No image files. No model files. No audio files.<br>
       Everything you saw and heard was generated in your browser.</p>

    <h2>YOUR RUN</h2>
    <p>${stats.runs} runs · ${stats.coinsAllTime.toLocaleString()} coins found<br>
       ${save.pupCount} of 12 dogs · ${save.clearedCount} of 12 arenas cleared<br>
       ${hrs}h ${mins}m played</p>

    <h2>AND</h2>
    <p class="big">THE PUP</p>
    <p class="tiny">Good boy. Every single time.</p>

    <h2></h2>
    <p class="big">THANKS FOR PLAYING</p>
    <p class="tiny">Press SKIP or Esc to return.</p>
  `;

  // restart the roll animation
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
}
