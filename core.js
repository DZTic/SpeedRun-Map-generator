/* ==========================================================
   SPEEDRUN MAP GENERATOR — CORE
   Constantes partagées et utilitaires de base
   ========================================================== */

const TILE = {
  EMPTY: 0, SOLID: 1, PLAYER: 2, FINISH: 3,
  DASH: 4, SLIDE: 5, SPIKE_UP: 6, SPIKE_DOWN: 11, SPIKE_LEFT: 12, SPIKE_RIGHT: 13, DEATHZONE: 7,
  TRAMPOLINE: 8, WALL: 9,
};

const COLOR = {
  [TILE.EMPTY]: null,
  [TILE.SOLID]: { fill: '#374151', stroke: '#4b5563' },
  [TILE.PLAYER]: { fill: '#22d3ee', stroke: '#06b6d4', glow: '#22d3ee' },
  [TILE.FINISH]: { fill: '#fbbf24', stroke: '#f59e0b', glow: '#fbbf24' },
  [TILE.DASH]: { fill: '#fef08a', stroke: '#fde047', glow: '#fef08a' },
  [TILE.SLIDE]: { fill: '#c084fc', stroke: '#a855f7', glow: '#c084fc' },
  [TILE.SPIKE_UP]: { fill: "#ef4444", stroke: "#dc2626", glow: "#ef4444" },
  [TILE.SPIKE_DOWN]: { fill: "#ef4444", stroke: "#dc2626", glow: "#ef4444" },
  [TILE.SPIKE_LEFT]: { fill: "#ef4444", stroke: "#dc2626", glow: "#ef4444" },
  [TILE.SPIKE_RIGHT]: { fill: "#ef4444", stroke: "#dc2626", glow: "#ef4444" },
  [TILE.DEATHZONE]: { fill: '#7f1d1d', stroke: '#dc2626', pattern: true },
  [TILE.TRAMPOLINE]: { fill: '#34d399', stroke: '#10b981', glow: '#34d399' },
  [TILE.WALL]: { fill: '#1f2937', stroke: '#7c3aed' }, // WALL conservé pour le rendu, mais il s'intègrera au terrain
};

const EMOJI = {
  [TILE.PLAYER]: '🏃', [TILE.FINISH]: '🏁',
  [TILE.DASH]: '💛', [TILE.SLIDE]: '💜',
  [TILE.SPIKE_UP]: "☠", [TILE.SPIKE_DOWN]: "☠", [TILE.SPIKE_LEFT]: "☠", [TILE.SPIKE_RIGHT]: "☠", [TILE.TRAMPOLINE]: '🟢',
};

// ─── RNG seedable ────────────────────────────────────────────
class SeededRNG {
  constructor(seed) { this.seed = this._hash(String(seed)); }
  _hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h || 1;
  }
  next() {
    this.seed ^= this.seed << 13;
    this.seed ^= this.seed >> 17;
    this.seed ^= this.seed << 5;
    return (this.seed >>> 0) / 4294967295;
  }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  pick(arr) { return arr[this.int(0, arr.length - 1)]; }
  bool(p = .5) { return this.next() < p; }
}

// ─── Physique du Joueur (player.gd) ────────────────────────
const PLAYER_PHYSICS = {
  speed: 150.0,
  jump_velocity: -300.0,
  gravity: 980.0,
  dash_speed: 350.0,
  dash_duration: 0.15,
  slide_speed: 250.0,
  slide_duration: 0.4,
  tileSize: 16.0
};

// ─── Capacités max théoriques du Joueur (en cases) ────────
const CAPS = (function(p) {
  const t_apex = Math.abs(p.jump_velocity) / p.gravity;
  const h_max_px = Math.abs(p.jump_velocity) * t_apex - 0.5 * p.gravity * t_apex * t_apex;
  const max_jump_h = Math.floor(h_max_px / p.tileSize);

  const t_flight = 2 * t_apex;
  const w_max_px = p.speed * t_flight;
  const max_jump_w = Math.floor(w_max_px / p.tileSize);

  const dash_dist_px = p.dash_speed * p.dash_duration;
  const max_dash_w = Math.floor(dash_dist_px / p.tileSize);

  const slide_dist_px = p.slide_speed * p.slide_duration;
  const max_slide_w = Math.floor(slide_dist_px / p.tileSize);

  return { jH: max_jump_h, jW: max_jump_w, dashW: max_dash_w, slideW: max_slide_w };
})(PLAYER_PHYSICS);

class MapContext {
    constructor(cfg) {
        this.cfg = cfg;
        this.rng = new SeededRNG(cfg.seed);
        this.W = cfg.gridW;
        this.H = cfg.gridH;
        this.grid = Array.from({ length: this.H }, () => new Array(this.W).fill(TILE.EMPTY));
        this.segments = []; // Le squelette du niveau
        this.items = [];
        this.playerPos = null;
        this.finishPos = null;
        this.stats = {};

        const maxH = CAPS.jH;
        const maxW = CAPS.jW;

        this.D = {
 easy: { jH: Math.max(2, Math.floor(maxH * 0.5)), jW: Math.max(2, Math.floor(maxW * 0.5)), pMin: 3, pMax: 6, vStep: [2, 3], wH: [4, 6], slideL: [5, 8], dashW: CAPS.dashW },
 medium: { jH: Math.max(3, Math.floor(maxH * 0.7)), jW: Math.max(3, Math.floor(maxW * 0.7)), pMin: 2, pMax: 5, vStep: [3, 4], wH: [5, 8], slideL: [4, 7], dashW: CAPS.dashW },
 hard: { jH: Math.max(4, Math.floor(maxH * 0.9)), jW: Math.max(4, Math.floor(maxW * 0.9)), pMin: 2, pMax: 4, vStep: [4, 5], wH: [6, 10], slideL: [4, 6], dashW: CAPS.dashW },
 extreme:{ jH: maxH, jW: maxW, pMin: 1, pMax: 3, vStep: [5, 6], wH: [7, 12], slideL: [3, 5], dashW: CAPS.dashW },
        }[cfg.difficulty];
    }

    set(x, y, t) {
        if (x >= 0 && x < this.W && y >= 0 && y < this.H) this.grid[y][x] = t;
    }

    get(x, y) {
        if (x < 0 || x >= this.W || y < 0 || y >= this.H) return TILE.SOLID;
        return this.grid[y][x];
    }

    rect(x, y, w, h, t) {
        for (let i = 0; i < w; i++) {
            for (let j = 0; j < h; j++) {
                this.set(x + i, y + j, t);
            }
        }
    }
}
