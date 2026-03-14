/* ==========================================================
   SPEEDRUN MAP GENERATOR — v3
   Wall jump = puit vertical logique (entrée bas, sortie haut)
   Horizontal = terrain varié et dense avec vrais défis
   ========================================================== */

const TILE = {
  EMPTY: 0, SOLID: 1, PLAYER: 2, FINISH: 3,
  DASH: 4, SLIDE: 5, SPIKE: 6, DEATHZONE: 7,
  TRAMPOLINE: 8, WALL: 9,
};

const COLOR = {
  [TILE.EMPTY]: null,
  [TILE.SOLID]: { fill: '#374151', stroke: '#4b5563' },
  [TILE.PLAYER]: { fill: '#22d3ee', stroke: '#06b6d4', glow: '#22d3ee' },
  [TILE.FINISH]: { fill: '#fbbf24', stroke: '#f59e0b', glow: '#fbbf24' },
  [TILE.DASH]: { fill: '#fef08a', stroke: '#fde047', glow: '#fef08a' },
  [TILE.SLIDE]: { fill: '#c084fc', stroke: '#a855f7', glow: '#c084fc' },
  [TILE.SPIKE]: { fill: '#ef4444', stroke: '#dc2626', glow: '#ef4444' },
  [TILE.DEATHZONE]: { fill: '#7f1d1d', stroke: '#dc2626', pattern: true },
  [TILE.TRAMPOLINE]: { fill: '#34d399', stroke: '#10b981', glow: '#34d399' },
  [TILE.WALL]: { fill: '#1f2937', stroke: '#7c3aed' },
};

const EMOJI = {
  [TILE.PLAYER]: '🏃', [TILE.FINISH]: '🏁',
  [TILE.DASH]: '💛', [TILE.SLIDE]: '💜',
  [TILE.SPIKE]: '☠', [TILE.TRAMPOLINE]: '🟢',
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

// ─── Générateur principal ────────────────────────────────────
class SpeedrunMapGenerator {
  constructor(cfg) {
    this.cfg = cfg;
    this.rng = new SeededRNG(cfg.seed);
    this.W = cfg.gridW;
    this.H = cfg.gridH;
    this.grid = [];
    this.segments = [];
    this.items = [];
    this.playerPos = null;
    this.finishPos = null;
    this.stats = {};

    // Difficulté → limites de saut
    this.D = {
      easy: { jH: 4, jW: 4, pMin: 3, pMax: 6, vStep: [3, 4], wH: [4, 6], slideL: [5, 8] },
      medium: { jH: 5, jW: 5, pMin: 2, pMax: 5, vStep: [4, 6], wH: [5, 8], slideL: [4, 7] },
      hard: { jH: 6, jW: 6, pMin: 2, pMax: 4, vStep: [5, 7], wH: [6, 10], slideL: [4, 6] },
      extreme: { jH: 7, jW: 7, pMin: 1, pMax: 3, vStep: [6, 8], wH: [7, 12], slideL: [3, 5] },
    }[cfg.difficulty];
  }

  generate() {
    this.grid = Array.from({ length: this.H }, () => new Array(this.W).fill(TILE.EMPTY));

    if (this.cfg.style === 'vertical') {
      this._buildVertical();
      this._buildVerticalCorridors();
    } else if (this.cfg.style === 'horizontal') {
      this._buildHorizontal();
      this._buildHorizontalCorridors();
    } else {
      this._buildMixed();
      this._buildVerticalCorridors();
    }

    this._addBounds();
    this._placePlayer();
    this._placeFinish();
    this._placeItems();
    this._placeObstacles();
    this._computeStats();
    return this.grid;
  }

  // ═══════════════════════════════════════════════════════════
  // MODE VERTICAL — montée zigzag, courbe de difficulté progressive
  // Principe speedrun :
  //   Début simple → enseigne la grammaire du niveau
  //   Milieu : challenges mixtes avec alternatives
  //   Fin : segments les plus denses, skip intentionnel
  // ═══════════════════════════════════════════════════════════
  _buildVertical() {
    const D = this.D;
    const W = this.W;
    let cy = this.H - 3;

    // Zones calibrées sur D.jW : gap central = D.jW-1 (toujours franchissable,
    // quelle que soit la largeur W — corrige le bug sur les grandes maps)
    const gapW = D.jW - 1;
    const midX = Math.floor(W / 2);
    const leftMax = midX - Math.ceil(gapW / 2);   // bord DROIT de la zone gauche
    const rightMin = midX + Math.floor(gapW / 2) + 1; // bord GAUCHE de la zone droite

    // Longueurs calibrées par difficulté (D.pMin/pMax, déjà équilibrées)
    const pLen = () => this.rng.int(D.pMin, D.pMax);

    // Plateforme de départ (zone gauche, bord gauche de la map)
    let startLen = pLen();
    this._platform(1, cy, startLen);
    this.segments.push({ type: 'start', x: 1, y: cy, len: startLen });
    let cx = startLen;
    let goRight = true;

    let wjCooldown = 0, segIndex = 0;
    const maxSegs = Math.max(60, Math.ceil((this.H - 6) / D.vStep[0]) + 8);
    let safety = 0;

    // \u2500\u2500 Machine \u00e0 \u00e9tats : transitions logiques entre m\u00e9caniques \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Apr\u00e8s un walljump : PAUSE obligatoire (normal)
    // Apr\u00e8s un dash   : pause ou enchan\u00eene slide (combo logique)
    // Apr\u00e8s un slide  : pause ou enchan\u00eene dash
    // Trois normaux minimum avant le premier challenge
    const TRANSITIONS = {
      normal: ['normal', 'dash', 'slide', 'walljump', 'trampoline'],
      dash: ['normal', 'dash', 'slide', 'walljump', 'trampoline'],
      slide: ['normal', 'dash', 'slide', 'walljump', 'trampoline'],
      walljump: ['dash', 'slide', 'walljump', 'trampoline'], // Speedrun: plus de pause
      trampoline: ['dash', 'slide', 'walljump', 'trampoline'],
    };

    // \u2500\u2500 Introduction progressive des m\u00e9caniques (seuils de progression) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Phase 1 (0-35%)  : normaux uniquement = apprendre les sauts de base
    // Phase 2 (35-55%) : dash puis slide = une m\u00e9canique \u00e0 la fois
    // Phase 3 (55-75%) : walljump + combinaisons
    // Phase 4 (75-100%): tout + difficult\u00e9 max
    const INTRO = { dash: 0.35, slide: 0.45, trampoline: 0.35, walljump: 0.55 };

    let prevCh = 'normal';

    while (cy > 5 && safety < maxSegs) {
      safety++; segIndex++;
      const progress = segIndex / Math.max(maxSegs - 8, 1);

      // vStep varié : 20% d'un petit saut, 20% d'un grand, reste aléatoire
      const vr = this.rng.next();
      const vStep = vr < 0.20 ? D.vStep[0]
        : vr < 0.40 ? D.vStep[1]
          : this.rng.int(D.vStep[0], D.vStep[1]);
      const nextY = cy - vStep;
      if (nextY <= 3) break;

      // Alternance stricte — pas de staircase (empilements illisibles)
      goRight = !goRight;

      // Candidats mécaniques (machine à états + phases)
      const candidates = (TRANSITIONS[prevCh] || ['normal']).filter(ch => {
        if (ch === 'normal') return true;
        if (ch === 'dash') return this.cfg.dash && progress >= INTRO.dash;
        if (ch === 'slide') return this.cfg.slide && progress >= INTRO.slide;
        if (ch === 'trampoline') return this.cfg.trampoline && progress >= INTRO.trampoline;
        if (ch === 'walljump') return this.cfg.walljump && progress >= INTRO.walljump && wjCooldown <= 0;
        return false;
      });
      const ch = this.rng.pick(candidates.length ? candidates : ['normal']);
      prevCh = ch;

      if (ch === 'walljump') {
        cx = this._segWallJump(cx, cy, nextY, goRight);
        wjCooldown = 0;
      } else {
        if (ch === 'dash') cx = this._segDash(cx, cy, nextY, goRight);
        else if (ch === 'slide') cx = this._segSlide(cx, cy, nextY, goRight);
        else if (ch === 'trampoline') cx = this._segTrampoline(cx, cy, nextY, goRight);
        else cx = this._segNormal(cx, cy, nextY, goRight, leftMax, rightMin, pLen());
        wjCooldown = Math.max(0, wjCooldown - 1);
      }

      cy = nextY;

      if (progress > 0.25 && segIndex % 4 === 0 && this.rng.bool(0.55))
        this._placeSkip(cx, cy, goRight, 'vertical');
    }
  }

  // Couloirs : remplit le côté EXTÉRIEUR de chaque plateforme entre les niveaux.
  // Plateforme GAUCHE → remplir à gauche (x=1 à seg.x-1) : mur de cave gauche.
  // Plateforme DROITE → remplir à droite (seg.x+len à W-2) : mur de cave droit.
  // Résultat : les deux bords de la map sont utilisés visuellement.
  _buildVerticalCorridors() {
    const W = this.W;
    const midX = W / 2;
    const path = this.segments.filter(s =>
      !s.skip && !s.shortcut && s.len && s.len > 0 &&
      ['start', 'normal', 'dash', 'slide', 'trampoline'].includes(s.type)
    );
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      const next = path[i + 1];
      if (!seg.len || !next.len) continue;
      const yStart = next.y + 1;
      const yEnd = seg.y - 1;
      if (yStart > yEnd) continue;
      const segMid = seg.x + seg.len / 2;
      if (segMid <= midX) {
        // Zone GAUCHE : remplir le côté gauche (x=1 à seg.x-1)
        for (let y = yStart; y <= yEnd; y++)
          for (let x = 1; x < seg.x; x++)
            if (this._get(x, y) === TILE.EMPTY) this._set(x, y, TILE.SOLID);
      } else {
        // Zone DROITE : remplir le côté droit (seg.x+len à W-2)
        for (let y = yStart; y <= yEnd; y++)
          for (let x = seg.x + seg.len; x < W - 1; x++)
            if (this._get(x, y) === TILE.EMPTY) this._set(x, y, TILE.SOLID);
      }
    }
  }

  _buildHorizontalCorridors() {
    const H = this.H;
    const path = this.segments.filter(s =>
      ['start', 'normal', 'dash', 'slide', 'trampoline', 'end', 'normaljump'].includes(s.type)
    );
    for (const seg of path) {
      if (!seg.len) continue;
      // Épaisseur "Céleste" : soit grosse masse au sol si bas, soit bloc rectangulaire suspendu
      const thickness = this.rng.int(3, 8);
      const bottom = (seg.y > H - 12) ? H - 1 : Math.min(H - 1, seg.y + thickness);

      for (let x = seg.x; x < seg.x + seg.len; x++) {
        for (let y = seg.y + 1; y <= bottom; y++) {
          if (y < H && this._get(x, y) === TILE.EMPTY) this._set(x, y, TILE.SOLID);
        }
      }
    }
  }

  // Segment normal : 2 zones — plateforme aux BORDS de zone pour utiliser toute la largeur.
  // Zone gauche : finit à leftMax (bord droit de la zone).
  // Zone droite : commence à rightMin (bord gauche de la zone).
  // La différence de position est dans la profondeur (vers son mur extérieur).
  _segNormal(cx, cy, nextY, goRight, leftMax, rightMin, len) {
    const W = this.W;
    if (leftMax === undefined) {
      // Fallback (mode horizontal / mixed)
      const gapW = this.D.jW - 1;
      const midX = Math.floor(W / 2);
      leftMax = midX - Math.ceil(gapW / 2);
      rightMin = midX + Math.floor(gapW / 2) + 1;
      len = this.rng.int(this.D.pMin, this.D.pMax);
    }
    let nx;
    if (goRight) {
      // Zone droite : commence à rightMin (+ offset 0-1 pour légère variété sans casser le gap)
      const off = this.rng.int(0, 1);
      nx = Math.min(rightMin + off, W - len - 1);
    } else {
      // Zone gauche : se TERMINE à leftMax (- offset 0-1)
      const rightEdge = leftMax - this.rng.int(0, 1);
      nx = Math.max(1, rightEdge - len + 1);
    }
    nx = Math.max(1, Math.min(W - len - 1, nx));

    const gapX = goRight ? (nx - cx) : (cx - (nx + len - 1));
    const needsDash = this.cfg.dash && gapX > this.D.jW;

    this._platform(nx, nextY, len);
    this.segments.push({
      type: 'normal', x: nx, y: nextY, len,
      needsDash,
      fromX: goRight ? Math.max(1, cx - 1) : Math.min(W - 2, cx + 1),
      fromY: cy,
    });
    return goRight ? nx + len - 1 : nx;
  }

  // ─── Wall Jump : PUIT VERTICAL ────────────────────────────
  //
  //   Placement invariant (peu importe goRight) :
  //   Le puits est toujours inséré entre cx et le côté de sortie.
  //
  //   goRight=true :
  //     [APPROCHE=WWWW]    ← cx est ici, on prolonge jusqu'à wLeft
  //            WW    WW    ← murs (nextY à cy)
  //                  [SORTIE===]  ← à droite du mur droit, à nextY
  //
  //   goRight=false :
  //     [SORTIE===]WWWW    ← sortie à gauche du mur gauche, à nextY
  //               WW    WW
  //                [APPROCHE====]  ← cx est ici, prolongement vers droite
  _segWallJump(cx, cy, nextY, goRight) {
    const D = this.D;
    const wallThick = 2;
    const innerGap = 4;
    const totalW = wallThick * 2 + innerGap; // 8 cases

    const shaftH = cy - nextY;
    if (shaftH < 3) return this._segNormal(cx, cy, nextY, goRight);

    // Place le puits immédiatement devant le joueur (côté goRight)
    let wx; // colonne du bord gauche du MUR GAUCHE
    if (goRight) {
      // Le joueur vient de la gauche : puits juste à droite de cx
      wx = cx + 1;
    } else {
      // Le joueur vient de la droite : puits juste à gauche de cx
      wx = cx - totalW - 1;
    }
    // Sécurité : rester dans la grille avec de la marge
    wx = Math.max(2, Math.min(this.W - totalW - 3, wx));

    const wLeft = wx;
    const wRight = wx + wallThick + innerGap;

    // ── Murs : de nextY (haut) à cy-3 (bas)
    // Les 2 cases du BAS restent ouvertes (cy-2 et cy-1) → le joueur peut y entrer debout
    for (let gy = nextY; gy < cy - 2; gy++) {
      if (gy < 2 || gy >= this.H) continue;
      this._set(wLeft, gy, TILE.WALL);
      this._set(wLeft + 1, gy, TILE.WALL);
      this._set(wRight, gy, TILE.WALL);
      this._set(wRight + 1, gy, TILE.WALL);
    }

    // ── Sol d'approche : s'arrête 2 cases AVANT le mur gauche
    // Le joueur doit sauter les 2 dernières cases pour entrer → pas de blocage
    if (goRight) {
      for (let x = Math.max(1, cx); x <= wLeft - 2; x++) {
        if (this._get(x, cy) === TILE.EMPTY) this._set(x, cy, TILE.SOLID);
      }
    } else {
      for (let x = wRight + wallThick + 2; x <= Math.min(this.W - 2, cx); x++) {
        if (this._get(x, cy) === TILE.EMPTY) this._set(x, cy, TILE.SOLID);
      }
    }
    // Fond intérieur du puits (entre les deux murs, à cy)
    for (let i = 0; i < innerGap; i++) {
      this._set(wLeft + wallThick + i, cy, TILE.SOLID);
    }

    // ── Plateforme de sortie : côté OPPOSÉ à l'entrée, en haut ──
    // goRight → le joueur ressort à DROITE (après le mur droit)
    // goLeft  → le joueur ressort à GAUCHE (avant le mur gauche)
    const exitLen = this.rng.int(D.pMin, D.pMax);
    let exitX;
    if (goRight) {
      exitX = Math.min(this.W - exitLen - 1, wRight + wallThick);
    } else {
      exitX = Math.max(1, wLeft - exitLen);
    }
    this._platform(exitX, nextY, exitLen);

    this.segments.push({
      type: 'walljump', x: wLeft, y: nextY,
      wallH: shaftH, innerGap, platformX: exitX, len: exitLen,
    });

    // Ancrage suivant = bord droit de la sortie (si goRight) ou gauche
    return goRight ? exitX + exitLen - 1 : exitX;
  }

  // ─── Dash Gap (vertical) : précipice sans fond ─────────────
  // Le gap est un vide entre les deux plateformes.
  // PAS de death zone ici : en mode vertical, ce gap n'est pas un précipice
  // irréversible (le joueur peut sauter depuis le bas).
  // Le challenge vient de la distance : impossible sans dash.
  _segDash(cx, cy, nextY, goRight) {
    const D = this.D;
    const dashGap = D.jW + 2; // trop large pour sauter seul

    // Plateforme de lancement (courte — juste assez pour s'élancer)
    const launchLen = this.rng.int(D.pMin - 1, D.pMin + 1);
    let lx = goRight ? Math.max(1, cx) : Math.max(1, cx - launchLen);
    lx = Math.max(1, Math.min(this.W - launchLen - 2, lx));
    this._platform(lx, cy, launchLen);
    this.segments.push({ type: 'normal', x: lx, y: cy, len: launchLen });

    // Plateforme d'atterrissage
    const landLen = this.rng.int(D.pMin - 1, D.pMin + 1);
    let landX = goRight
      ? Math.min(this.W - landLen - 1, lx + launchLen + dashGap)
      : Math.max(1, lx - dashGap - landLen);
    this._platform(landX, nextY, landLen);

    // Pas de death zone en mode vertical : le vide est le danger naturel
    this.segments.push({ type: 'dash', x: landX, y: nextY, len: landLen, fromX: lx, fromY: cy });
    return goRight ? landX : landX + landLen - 1;
  }

  // ─── Slide : couloir à plafond bas ─────────────────────────
  _segSlide(cx, cy, nextY, goRight) {
    const D = this.D;
    const len = this.rng.int(...D.slideL);

    // On colle un peu plus le slide pour l`'enchaîner sans ralentir
    let sx = goRight
      ? Math.min(this.W - len - 1, cx + this.rng.int(1, Math.max(1, D.jW - 3)))
      : Math.max(1, cx - len - this.rng.int(1, Math.max(1, D.jW - 3)));
    sx = Math.max(1, Math.min(this.W - len - 1, sx));

    // Sol du couloir
    this._platform(sx, nextY, len);
    // Plafond bas (2 cases = hauteur slide)
    for (let i = 1; i < len - 1; i++) this._set(sx + i, nextY - 2, TILE.SOLID);

    this.segments.push({ type: 'slide', x: sx, y: nextY, len });
    return goRight ? sx + len - 1 : sx;
  }

  // ─── Trampoline : propulseur vertical ──────────────────────
  _segTrampoline(cx, cy, nextY, goRight) {
    // Plus petite plateforme pour le trampoline pour un saut plus précis
    const len = Math.max(1, this.rng.int(D.pMin - 1, D.pMax - 2));
    const gap = this.rng.int(1, Math.min(3, D.jW - 1));

    let px = goRight
      ? Math.min(this.W - len - 1, cx + gap)
      : Math.max(1, cx - gap - len);
    this._platform(px, nextY + 1, len);

    const tx = px + Math.floor(len / 2);
    this._set(tx, nextY, TILE.TRAMPOLINE);
    this.items.push({ type: TILE.TRAMPOLINE, x: tx, y: nextY });
    this.segments.push({ type: 'trampoline', x: px, y: nextY + 1, len });
    return goRight ? px + len - 1 : px;
  }

  // ═══════════════════════════════════════════════════════════
  // MODE HORIZONTAL — courbe progressive + routes multiples
  // Speedrun design :
  //   - 1er tiers : sauts simples, enseigne les gaps
  //   - 2e tiers  : challenges variés, shortcuts disponibles
  //   - 3e tiers  : défis denses + skip risqué vers la fin
  // ═══════════════════════════════════════════════════════════
  _buildHorizontal() {
    const D = this.D;
    const midY = Math.floor(this.H * 0.42);
    let cx = 0, cy = midY;
    let segIndex = 0;

    // Terrasse de départ (moins longue pour le speedrun)
    const startLen = D.pMax;
    this._platform(cx, cy, startLen);
    this.segments.push({ type: 'start', x: cx, y: cy, len: startLen });
    cx = startLen;

    const estSections = Math.floor(this.W / (D.pMin + 3));

    const TRANSITIONS = {
      normal: ['normal', 'dash', 'slide', 'walljump', 'trampoline', 'normaljump'],
      normaljump: ['normal', 'dash', 'slide', 'walljump', 'trampoline'],
      dash: ['dash', 'slide', 'walljump', 'trampoline', 'normaljump'],
      slide: ['dash', 'slide', 'walljump', 'trampoline', 'normaljump'],
      walljump: ['dash', 'slide', 'walljump', 'trampoline', 'normaljump'],
      trampoline: ['dash', 'slide', 'walljump', 'trampoline', 'normaljump'],
    };

    // Seuils d'intro très bas en horizontal car il y a peu de segments
    const INTRO = { dash: 0.15, slide: 0.20, trampoline: 0.15, walljump: 0.25 };
    let prevCh = 'normal';
    let normalCount = 0;
    let wjCooldown = 0;
    let safety = 0;

    while (cx < this.W - D.pMax - 2 && safety < 80) {
      safety++;
      segIndex++;
      const progress = segIndex / Math.max(estSections, 1);

      // Celeste-like vertical journey
      // Progressively changes altitude
      let nextY;
      if (progress < 0.35) {
        // Go UP (from bottom to top)
        nextY = Math.max(5, cy - this.rng.int(0, D.jH - 1));
      } else if (progress < 0.70) {
        // Go DOWN (plunge deeply)
        nextY = Math.min(this.H - 6, cy + this.rng.int(0, D.vStep[1] + 1));
      } else {
        // Mixed chaotic (up or down)
        nextY = cy + this.rng.int(-D.jH + 1, D.vStep[1]);
        nextY = Math.max(5, Math.min(this.H - 6, nextY));
      }

      const terLen = this.rng.int(D.pMin + 1, D.pMax + 2);

      // Calcul des candidats
      const candidates = (TRANSITIONS[prevCh] || ['normal']).filter(ch => {
        if (ch === 'normal' || ch === 'normaljump') return true;
        if (ch === 'dash') return this.cfg.dash && progress >= INTRO.dash;
        if (ch === 'slide') return this.cfg.slide && progress >= INTRO.slide;
        if (ch === 'trampoline') return this.cfg.trampoline && progress >= INTRO.trampoline;
        if (ch === 'walljump') return this.cfg.walljump && progress >= INTRO.walljump && wjCooldown <= 0;
        return false;
      });

      // Forcer une mécanique si trop de segments normaux successifs
      let ch;
      if (normalCount >= 2) {
        const mechs = candidates.filter(c => c !== 'normal' && c !== 'normaljump');
        if (mechs.length > 0) ch = this.rng.pick(mechs);
        else ch = this.rng.pick(candidates);
      } else {
        ch = this.rng.pick(candidates);
      }

      if (ch === 'normal' || ch === 'normaljump') normalCount++;
      else normalCount = 0;
      prevCh = ch;

      let result;
      if (ch === 'walljump') {
        result = this._hSegWallJump(cx, cy, nextY, terLen);
        wjCooldown = 0;
      } else {
        if (ch === 'dash') result = this._hSegDash(cx, cy, nextY, terLen);
        else if (ch === 'slide') result = this._hSegSlide(cx, cy, nextY, terLen);
        else if (ch === 'trampoline') result = this._hSegTrampoline(cx, cy, nextY, terLen);
        else if (ch === 'normaljump') result = this._hSegJump(cx, cy, nextY, terLen);
        else result = this._hSegNormal(cx, cy, nextY, terLen);
        wjCooldown = Math.max(0, wjCooldown - 1);
      }

      if (!result || result.nextX >= this.W - 2) break;
      cx = result.nextX; cy = result.nextY;

      // Uniquement si pas de mécanique complexe pour éviter les superpositions
      if (['normal', 'normaljump'].includes(ch)) {
        const shortcutChance = progress > 0.25 && progress < 0.85 ? 0.35 : 0.10;
        if (this.rng.bool(shortcutChance) && cx + 5 < this.W) {
          const shortY = cy - this.rng.int(3, 6);
          const shortX = cx - this.rng.int(1, 3);
          const shortL = this.rng.int(3, 5);
          if (shortY > 3 && shortX >= 1 && shortX + shortL < this.W) {
            this._platform(shortX, shortY, shortL);
            this.segments.push({ type: 'shortcut', x: shortX, y: shortY, len: shortL });
          }
        }
      }
    }

    const endLen = D.pMin + 1;
    const endX = Math.min(cx, this.W - endLen - 1);
    this._platform(endX, cy, endLen);
    this.segments.push({ type: 'end', x: endX, y: cy, len: endLen });
  }

  // ── Horizontal : plateforme avec saut petit ────────────────
  _hSegNormal(cx, cy, nextY, terLen) {
    const D = this.D;
    // Si on saute vers le HAUT, le gap maximal doit être plus petit !
    let diffY = cy - nextY; // positif si nextY est plus haut
    if (diffY > D.jH - 1) { nextY = cy - (D.jH - 1); diffY = D.jH - 1; }

    let maxGap = D.jW - 1;
    if (diffY > 0) maxGap = Math.max(1, D.jW - Math.ceil(diffY / 2) - 1);

    const gap = this.rng.int(1, Math.max(1, maxGap));
    const nx = cx + gap;
    if (nx + terLen >= this.W - 1) return null;
    this._platform(nx, nextY, terLen);
    this.segments.push({ type: 'normal', x: nx, y: nextY, len: terLen });
    return { nextX: nx + terLen, nextY };
  }

  // ── Horizontal : saut par-dessus un précipice ──────────────
  // Death zone = fond du précipice (le joueur tombe s'il rate)
  _hSegJump(cx, cy, nextY, terLen) {
    const D = this.D;
    let diffY = cy - nextY;
    if (diffY > D.jH - 1) { nextY = cy - (D.jH - 1); diffY = D.jH - 1; }

    let maxGap = D.jW;
    if (diffY > 0) maxGap = Math.max(2, D.jW - Math.ceil(diffY / 2));

    const gap = this.rng.int(Math.max(2, maxGap - 1), maxGap);
    const nx = cx + gap;
    if (nx + terLen >= this.W - 1) return null;
    this._platform(nx, nextY, terLen);
    // Death zone tout au fond du précipice
    const pitBottom = this.H - 2;
    for (let gx = cx; gx < nx; gx++) {
      for (let gy = pitBottom; gy < this.H - 1; gy++) {
        if (this._get(gx, gy) === TILE.EMPTY) this._set(gx, gy, TILE.DEATHZONE);
      }
    }
    this.segments.push({ type: 'normal', x: nx, y: nextY, len: terLen });
    return { nextX: nx + terLen, nextY };
  }

  // ── Horizontal : dash gap (précipice infranchissable sans dash) ──
  // Death zone = fond du précipice, PAS sur la surface
  _hSegDash(cx, cy, nextY, terLen) {
    const D = this.D;
    const dashGap = D.jW + 3;
    const nx = cx + dashGap;
    if (nx + terLen >= this.W - 1) return null;
    const ny = Math.max(4, Math.min(this.H - 5, cy + this.rng.int(-1, 1))); // proche de cy
    terLen = Math.max(2, terLen - 1);
    this._platform(nx, ny, terLen);
    // Death zone sous le gap (fond de la map)
    const pitBottom = this.H - 2;
    for (let gx = cx; gx < nx; gx++) {
      for (let gy = pitBottom; gy < this.H - 1; gy++) {
        if (this._get(gx, gy) === TILE.EMPTY) this._set(gx, gy, TILE.DEATHZONE);
      }
    }
    this.segments.push({ type: 'dash', x: nx, y: ny, len: terLen, fromX: cx, fromY: cy });
    return { nextX: nx + terLen, nextY: ny };
  }

  // ── Horizontal : couloir slide ─────────────────────────────
  _hSegSlide(cx, cy, nextY, terLen) {
    const D = this.D;
    const slideLen = this.rng.int(...D.slideL);
    const sx = cx; // Collé au segment précédent pour pouvoir prendre son élan
    if (sx + slideLen >= this.W - 1) return null;

    this._platform(sx, cy, slideLen); // Même hauteur strictement (slide sol plat)
    // Plafond de slide complet sur toute la longueur Sauf les 2 premières cases pour s'insérer
    for (let i = 2; i < slideLen; i++) {
      // Mur du plafond (descend jusqu'à cy-2 pour laisser 1 bloc vide : cy-1)
      for (let gy = 0; gy <= cy - 2; gy++) {
        this._set(sx + i, gy, TILE.SOLID);
      }
    }
    this.segments.push({ type: 'slide', x: sx, y: cy, len: slideLen, fromX: cx });

    // Sortie normale pour reprendre de la vitesse !
    const ex = sx + slideLen;
    const elen = terLen;
    if (ex + elen < this.W) {
      this._platform(ex, cy, elen);
      this.segments.push({ type: 'normal', x: ex, y: cy, len: elen });
      return { nextX: ex + elen, nextY: cy };
    }
    return { nextX: sx + slideLen, nextY: cy };
  }

  // ── Horizontal : wall jump vertical dans le parcours ───────
  // Le joueur doit monter un puit vertical puis retomber de l'autre côté
  _hSegWallJump(cx, cy, nextY, terLen) {
    const D = this.D;
    // Un innerGap de 2 est idéal en 16x16 pour rebondir de mur en mur rapidement dans Celeste!
    const wallThick = 2, innerGap = 2, totalW = wallThick * 2 + innerGap;

    // La "montée" est au-dessus du sol courant
    const topY = cy - this.rng.int(...D.wH);
    if (topY <= 3) return this._hSegNormal(cx, Math.min(cy, nextY), nextY, terLen);

    const wx = cx + 1;
    if (wx + totalW + terLen + 1 >= this.W) return null;

    // On utilise TILE.SOLID partout (au lieu de WALL) pour que l'autotile Godot de base (Terre/Herbe)
    // fasse proprement les contours de la tour sans "trou noir" ni "mur suspendu invisible".

    // Dessiner les murs (vertical) et prolonger la structure jusqu'au fond
    for (let gy = topY; gy < this.H - 1; gy++) {
      // Mur Droit (qui va du pont tout au sol)
      this._set(wx + 2 + innerGap, gy, TILE.SOLID);
      this._set(wx + 3 + innerGap, gy, TILE.SOLID);

      // Mur Gauche avec ouverture d'accès !
      // Le joueur arrive par la gauche sur un sol à Y = cy. La tête à cy-2.
      // Donc l'ouverture est à cy-1, cy-2, cy-3.
      // gy === cy DOIT être solide pour faire le sol de l'embrasure de porte.
      if (gy < cy - 3 || gy >= cy) {
        this._set(wx, gy, TILE.SOLID);
        this._set(wx + 1, gy, TILE.SOLID);
      }
    }

    // Le sol/pilier INTERIEUR du puit (au niveau de cy)
    // L'espace intérieur (wx+2 .. wx+3) de cy-1 en allant vers le haut RESTE TILE.EMPTY !!!
    for (let i = 0; i < innerGap; i++) {
      this._set(wx + 2 + i, cy, TILE.SOLID);
      for (let gy = cy + 1; gy < this.H - 1; gy++) {
        this._set(wx + 2 + i, gy, TILE.SOLID);
      }
    }

    // Plateforme d'entrée (avant le mur gauche)
    const entLen = D.pMin;
    const entX = Math.max(1, wx - entLen);
    this._platform(entX, cy, entLen);
    this.segments.push({ type: 'normal', x: entX, y: cy, len: entLen });

    // Sortie en haut : plateforme "pont" au sommet du puit
    const bridgeY = topY - 1;
    if (bridgeY > 2) {
      const blen = totalW + 2;
      this._platform(wx - 1, bridgeY, blen);
      this.segments.push({ type: 'bridge', x: wx - 1, y: bridgeY, len: blen }); // 'bridge' pour pas remplir
    }

    // Plateforme de continuation après le puit (redescend)
    const exitX = wx + totalW + 1;
    if (exitX + terLen < this.W) {
      const exitY = nextY;
      this._platform(exitX, exitY, terLen);
      this.segments.push({ type: 'normal', x: exitX, y: exitY, len: terLen });
      return { nextX: exitX + terLen, nextY: exitY };
    }
    return null;
  }

  // ── Horizontal : trampoline ────────────────────────────────
  _hSegTrampoline(cx, cy, nextY, terLen) {
    const D = this.D;
    // On met un petit ilot avec le trampoline après un gap normal
    const gap = this.rng.int(1, 3);
    const tx = cx + gap;
    if (tx + 1 >= this.W - 1) return null;

    // Mini îlot 1 case pour le trampoline
    this._platform(tx, cy, 1);
    this._set(tx, cy - 1, TILE.TRAMPOLINE);
    this.items.push({ type: TILE.TRAMPOLINE, x: tx, y: cy - 1 });
    this.segments.push({ type: "trampoline", x: tx, y: cy, len: 1 });

    // Le trampoline permet de sauter HAUT, on crée la suite en hauteur
    const jumpH = this.rng.int(5, 8);
    const targetY = Math.max(4, cy - jumpH);
    const targetX = tx + this.rng.int(2, 4);
    terLen = Math.max(2, terLen - 1);
    if (targetX + terLen >= this.W - 1) return { nextX: tx + 1, nextY: cy };

    this._platform(targetX, targetY, terLen);
    this.segments.push({ type: "normal", x: targetX, y: targetY, len: terLen });
    return { nextX: targetX + terLen, nextY: targetY };
    return { nextX: targetX + terLen, nextY: targetY };
  }

  // ═══════════════════════════════════════════════════════════
  // MODE MIXTE : phase horizontale → transition → montée
  // ═══════════════════════════════════════════════════════════
  _buildMixed() {
    const D = this.D;
    const splitX = Math.floor(this.W * 0.45);
    let cx = 0;
    let cy = Math.floor(this.H * 0.68);

    // Phase horizontale (moitié gauche)
    const startLen = D.pMax;
    this._platform(cx, cy, startLen);
    this.segments.push({ type: 'start', x: cx, y: cy, len: startLen });
    cx = startLen;

    let safety = 0;
    while (cx < splitX - D.pMin && safety < 25) {
      safety++;
      const pool = ['normaljump', 'normaljump'];
      if (this.cfg.dash) pool.push('dash');
      if (this.cfg.slide) pool.push('slide');
      const ch = this.rng.pick(pool);
      const vd = this.rng.int(-2, 2);
      cy = Math.max(5, Math.min(this.H - 5, cy + vd));
      const terLen = this.rng.int(D.pMin, D.pMax);
      let r;
      if (ch === 'dash') r = this._hSegDash(cx, cy, cy, terLen);
      else if (ch === 'slide') r = this._hSegSlide(cx, cy, cy, terLen);
      else r = this._hSegJump(cx, cy, cy, terLen);
      if (!r) break;
      cx = r.nextX; cy = r.nextY;
    }

    // Plateforme de transition
    const transLen = D.pMin + 2;
    this._platform(cx, cy, transLen);
    this.segments.push({ type: 'normal', x: cx, y: cy, len: transLen });
    cx = cx + Math.floor(transLen / 2);

    // Phase verticale (montée)
    let goRight = true;
    let lastWJ = false;
    safety = 0;
    while (cy > 5 && safety < 30) {
      safety++;
      const vStep = this.rng.int(...D.vStep);
      const nextY = cy - vStep;
      if (nextY <= 3) break;

      const pool = ['normal', 'normal'];
      if (this.cfg.walljump && !lastWJ) pool.push('walljump');
      if (this.cfg.dash) pool.push('dash');
      if (this.cfg.slide) pool.push('slide');
      if (this.cfg.trampoline) pool.push('trampoline');
      const ch = this.rng.pick(pool);
      lastWJ = (ch === 'walljump');

      if (ch === 'walljump') cx = this._segWallJump(cx, cy, nextY, goRight);
      else if (ch === 'dash') cx = this._segDash(cx, cy, nextY, goRight);
      else if (ch === 'slide') cx = this._segSlide(cx, cy, nextY, goRight);
      else if (ch === 'trampoline') cx = this._segTrampoline(cx, cy, nextY, goRight);
      else cx = this._segNormal(cx, cy, nextY, goRight);

      cy = nextY; goRight = !goRight;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Utilitaires grille
  // ═══════════════════════════════════════════════════════════
  _platform(x, y, len) {
    for (let i = 0; i < len; i++) this._set(x + i, y, TILE.SOLID);
  }
  _set(x, y, t) {
    if (x >= 0 && x < this.W && y >= 0 && y < this.H) this.grid[y][x] = t;
  }
  _get(x, y) {
    if (x < 0 || x >= this.W || y < 0 || y >= this.H) return TILE.SOLID;
    return this.grid[y][x];
  }
  _addBounds() {
    for (let x = 0; x < this.W; x++) {
      this.grid[0][x] = TILE.SOLID;
      this.grid[1][x] = TILE.SOLID;
      this.grid[this.H - 1][x] = TILE.SOLID;
    }
  }

  _placePlayer() {
    // Cherche la première plateforme depuis bas-gauche
    for (let y = this.H - 2; y >= 2; y--) {
      for (let x = 1; x < Math.floor(this.W * 0.4); x++) {
        if (this.grid[y][x] === TILE.SOLID && this.grid[y - 1][x] === TILE.EMPTY) {
          this._set(x, y - 1, TILE.PLAYER);
          this.playerPos = { x, y: y - 1 };
          return;
        }
      }
    }
    this._set(2, this.H - 4, TILE.PLAYER);
    this.playerPos = { x: 2, y: this.H - 4 };
  }

  _placeFinish() {
    const style = this.cfg.style;
    if (style === 'horizontal') {
      // Droite de la map
      for (let x = this.W - 2; x >= Math.floor(this.W * 0.7); x--) {
        for (let y = 2; y < this.H - 2; y++) {
          if (this.grid[y][x] === TILE.SOLID && this.grid[y - 1][x] === TILE.EMPTY) {
            this._set(x, y - 1, TILE.FINISH);
            this.finishPos = { x, y: y - 1 };
            return;
          }
        }
      }
    } else {
      // Haut de la map
      for (let y = 2; y < Math.floor(this.H * 0.3); y++) {
        for (let x = 1; x < this.W - 1; x++) {
          if (this.grid[y][x] === TILE.SOLID && this.grid[y - 1][x] === TILE.EMPTY) {
            this._set(x, y - 1, TILE.FINISH);
            this.finishPos = { x, y: y - 1 };
            return;
          }
        }
      }
    }
    this._set(Math.floor(this.W / 2), 2, TILE.FINISH);
    this.finishPos = { x: Math.floor(this.W / 2), y: 2 };
  }

  // ─── Placement des items ───────────────────────────────────────
  // Règle : 1 potion UNIQUEMENT si le segment correspondant en a besoin.
  // Jamais de potion sur une plateforme normale (cela n'a aucun sens).
  _placeItems() {
    for (const seg of this.segments) {
      // Dash : potion sur la DERNIÈRE case de la plateforme d'approche
      if (seg.type === 'dash' && this.cfg.dash && seg.fromX !== undefined) {
        const px = Math.max(1, seg.fromX - 1);
        const py = seg.fromY !== undefined ? seg.fromY - 1 : seg.y - 1;
        if (this._get(px, py) === TILE.EMPTY && this._get(px, py + 1) === TILE.SOLID) {
          this._set(px, py, TILE.DASH);
          this.items.push({ type: TILE.DASH, x: px, y: py });
        }
      }
      // Slide : potion à l'entrée du couloir slide (cx-1)
      if (seg.type === 'slide' && this.cfg.slide && seg.fromX !== undefined) {
        const px = Math.max(1, seg.fromX - 1);
        const py = seg.y - 1;
        if (this._get(px, py) === TILE.EMPTY && this._get(px, py + 1) === TILE.SOLID) {
          this._set(px, py, TILE.SLIDE);
          this.items.push({ type: TILE.SLIDE, x: px, y: py });
        }
      }
      // Normal avec gap trop large : potion dash automatique sur la plateforme de départ
      if (seg.type === 'normal' && seg.needsDash && seg.fromX !== undefined) {
        const px = Math.max(1, seg.fromX - 1);
        const py = seg.fromY - 1;
        if (this._get(px, py) === TILE.EMPTY && this._get(px, py + 1) === TILE.SOLID) {
          this._set(px, py, TILE.DASH);
          this.items.push({ type: TILE.DASH, x: px, y: py });
        }
      }
    }
  }

  _placeObstacles() {
    const spikeDensity = this.cfg.spikeDensity;
    if (spikeDensity === 0) return;
    // Règle speedrun : obstacles uniquement dans la 2e moitié du parcours.
    // Évite le "kaizo frustrant" dès le départ.
    const total = this.segments.length;

    // Pré-calcul des zones protégées : intérieur des puits de wall jump.
    // Un spike DANS un puits = impossible à éviter → interdit.
    const wjZones = this.segments
      .filter(s => s.type === 'walljump')
      .map(s => ({
        x1: s.x - 1,                          // marge 1 case à gauche
        x2: s.x + (s.innerGap || 4) + 5,      // marge 1 case à droite (2 murs + gap + 1)
        y1: s.y - 1,                           // un cran au-dessus de la sortie
        y2: s.y + (s.wallH || 6) + 1,          // fond du puits + 1
      }));

    const isInWJZone = (x, y) =>
      wjZones.some(z => x >= z.x1 && x <= z.x2 && y >= z.y1 && y <= z.y2);

    let placed = 0;
    this.segments.forEach((seg, idx) => {
      if (placed >= spikeDensity * 2) return;
      if (!seg.len || seg.len < 3) return;
      // Jamais sur départ, fin ou wall jump
      if (['start', 'end', 'walljump'].includes(seg.type)) return;
      // Seulement dans la seconde moitié
      if (idx < Math.floor(total * 0.45)) return;
      // Spikes sur les bords des plateformes (mais JAMAIS sur le tout dernier bloc où le joueur DOIT sauter = frustrant)
      if (this.rng.bool(0.5)) {
        // Au lieu de mettre un pic sur l'edge droit (seg.x + seg.len - 1), on le met en `seg.x + seg.len - 2` ou `seg.x`
        const ex = this.rng.bool() ? seg.x : seg.x + seg.len - 2;
        const ey = seg.y - 1;
        // Refuser si dans une zone de wall jump ou si tuile non vide
        if (isInWJZone(ex, ey)) return;
        if (this._get(ex, ey) === TILE.EMPTY && this._get(ex, seg.y) === TILE.SOLID) {
          this._set(ex, ey, TILE.SPIKE);
          placed++;
        }
      }
    });
  }

  // ── Skip intentionnel : raccourci difficile mais récompensant ──
  // Plateforme haute accessible uniquement par saut très précis.
  // Le joueur safe peut l'ignorer ; le speedrunner avancé la visera.
  _placeSkip(cx, cy, goRight, mode) {
    const skipH = this.rng.int(4, 7);  // hauteur du saut pour atteindre le skip
    const skipLen = this.rng.int(3, 5);
    let sx, sy;
    if (mode === 'vertical') {
      // Plateforme sur le côté opposé à la direction, légèrement plus haute
      sy = cy - skipH;
      sx = goRight
        ? Math.min(this.W - skipLen - 1, cx + this.rng.int(2, 5))
        : Math.max(1, cx - this.rng.int(2, 5) - skipLen);
    } else {
      sy = cy - skipH;
      sx = Math.min(this.W - skipLen - 1, cx + this.rng.int(1, 4));
    }
    if (sy < 3 || sx < 1 || sx + skipLen >= this.W) return;
    // Ne pas placer si chevauchement
    for (let i = 0; i < skipLen; i++) {
      if (this._get(sx + i, sy) !== TILE.EMPTY) return;
    }
    this._platform(sx, sy, skipLen);
    this.segments.push({ type: 'normal', x: sx, y: sy, len: skipLen, skip: true });
  }

  _computeStats() {
    let dc = 0, sc = 0, sp = 0;
    const shortcuts = this.segments.filter(s => s.shortcut || s.skip).length;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const t = this.grid[y][x];
      if (t === TILE.DASH) dc++;
      if (t === TILE.SLIDE) sc++;
      if (t === TILE.SPIKE) sp++;
    }
    const mainSegs = this.segments.filter(s => !s.shortcut && !s.skip).length;
    // Temps estimé basé sur les segments principaux uniquement
    const base = { easy: 18, medium: 40, hard: 65, extreme: 100 }[this.cfg.difficulty];
    const secs = Math.round(base + mainSegs * 3.5);
    const m = Math.floor(secs / 60), s = secs % 60;
    this.stats = {
      size: `${this.W} × ${this.H}`,
      route: `${mainSegs} sections`,
      shortcuts,
      dash: dc, slide: sc, spikes: sp,
      time: m > 0 ? `${m}m${s}s` : `${s}s`,
    };
  }

  // ── Terrain fill : cave-style ────────────────────────────────
  // Remplit sous chaque plateforme et sur les côtés inutilisés
  // → les plateformes deviennent des corniches, pas des îlots flottants
  _fillTerrain() {
    // PASS 1 : remplir en-dessous de chaque segment
    for (const seg of this.segments) {
      if (!seg.len) continue;
      for (let sx = seg.x; sx < seg.x + seg.len; sx++) {
        if (sx < 1 || sx >= this.W - 1) continue;
        for (let sy = seg.y + 1; sy < this.H - 1; sy++) {
          if (this._get(sx, sy) === TILE.EMPTY) this._set(sx, sy, TILE.SOLID);
        }
      }
    }
    // PASS 2 : remplir les côtés (zones jamais accessibles)
    // Pour chaque rangée, combler jusqu'à 2 cases des bords non-vides
    for (let y = 1; y < this.H - 1; y++) {
      let L = this.W, R = 0;
      for (let x = 1; x < this.W - 1; x++) {
        if (this._get(x, y) !== TILE.EMPTY) { L = Math.min(L, x); R = Math.max(R, x); }
      }
      if (R < L) continue; // rangée vide → ignorer
      for (let x = 1; x < L - 1; x++)
        if (this._get(x, y) === TILE.EMPTY) this._set(x, y, TILE.SOLID);
      for (let x = R + 2; x < this.W - 1; x++)
        if (this._get(x, y) === TILE.EMPTY) this._set(x, y, TILE.SOLID);
    }
  }
}

// ─── Renderer Canvas ─────────────────────────────────────────
class MapRenderer {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.tileSize = 16; this.zoom = 1; }
  setZoom(z) { this.zoom = Math.max(0.3, Math.min(3, z)); }

  render(grid) {
    if (!grid || !grid.length) return;
    const H = grid.length, W = grid[0].length, ts = this.tileSize * this.zoom;
    this.canvas.width = W * ts; this.canvas.height = H * ts;
    const ctx = this.ctx;
    // Fond : noir absolu pour maximer le contraste avec les blocs
    ctx.fillStyle = '#060810'; ctx.fillRect(0, 0, W * ts, H * ts);
    const dzP = this._dzPat(ctx);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x] === TILE.EMPTY) continue;
      this._tile(ctx, x, y, grid[y][x], ts, dzP);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(8, ts * 0.62)}px serif`;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = EMOJI[grid[y][x]];
      if (e) ctx.fillText(e, x * ts + ts / 2, y * ts + ts / 2);
    }
  }

  _dzPat(ctx) {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    const p = c.getContext('2d');
    p.fillStyle = '#7f1d1d'; p.fillRect(0, 0, 8, 8);
    p.strokeStyle = '#ef444480'; p.lineWidth = 1.2;
    p.beginPath(); p.moveTo(0, 8); p.lineTo(8, 0);
    p.moveTo(-2, 2); p.lineTo(6, -6); p.moveTo(2, 10); p.lineTo(10, 2); p.stroke();
    return ctx.createPattern(c, 'repeat');
  }

  _tile(ctx, x, y, tile, ts, dzP) {
    const col = COLOR[tile]; if (!col) return;
    const px = x * ts, py = y * ts;
    ctx.save();
    if (col.glow) { ctx.shadowColor = col.glow; ctx.shadowBlur = ts * 0.85; }
    ctx.fillStyle = tile === TILE.DEATHZONE ? dzP : col.fill;
    ctx.fillRect(px, py, ts, ts);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = col.stroke; ctx.lineWidth = tile === TILE.WALL ? 2.5 : 1;
    ctx.strokeRect(px + .5, py + .5, ts - 1, ts - 1);
    if (tile === TILE.SPIKE) {
      ctx.fillStyle = '#fca5a5'; ctx.beginPath();
      ctx.moveTo(px + ts / 2, py + 2); ctx.lineTo(px + ts - 2, py + ts - 2); ctx.lineTo(px + 2, py + ts - 2);
      ctx.closePath(); ctx.fill();
    }
    if (tile === TILE.SOLID) {
      // Surface supérieure lumineuse : montre clairement où marcher
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(px, py, ts, 3);  // bande blanche épaisse
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px, py + 3, ts, 4); // fondu léger dessous
    }
    if (tile === TILE.WALL) { ctx.fillStyle = 'rgba(124,58,237,0.3)'; ctx.fillRect(px + ts - 3, py, 3, ts); }
    ctx.restore();
  }
}

// ─── Guide Godot ─────────────────────────────────────────────
function buildGodotGuide(gen) {
  const items = gen.items, segs = gen.segments, W = gen.W, H = gen.H, ts = 16;
  const dashI = items.filter(i => i.type === TILE.DASH);
  const slideI = items.filter(i => i.type === TILE.SLIDE);
  const trampI = items.filter(i => i.type === TILE.TRAMPOLINE);
  const wallS = segs.filter(s => s.type === 'walljump');
  const dashS = segs.filter(s => s.type === 'dash');
  const slideS = segs.filter(s => s.type === 'slide');
  const coord = (x, y) => `(${x * ts}, ${y * ts})`;

  let html = `
  <div class="export-section"><h3>📐 Paramètres de la scène</h3><div class="export-step">
    <div class="step-num">1</div><div class="step-text">
      Scène <strong>Node2D</strong> — taille : <code>${W * ts} × ${H * ts} px</code>
      (${W}×${H} cases de 16 px)
    </div></div></div>
  <div class="export-section"><h3>🏃 Spawn du joueur</h3><div class="export-step">
    <div class="step-num">2</div><div class="step-text">
      Instance <code>player.tscn</code> en <code>${coord(gen.playerPos?.x ?? 1, gen.playerPos?.y ?? H - 3)}</code>
    </div></div></div>
  <div class="export-section"><h3>🏁 Ligne d'arrivée</h3><div class="export-step">
    <div class="step-num">3</div><div class="step-text">
      <strong>Area2D</strong> + <code>finish_area.gd</code> en <code>${coord(gen.finishPos?.x ?? Math.floor(W / 2), gen.finishPos?.y ?? 3)}</code><br/>
      CollisionShape2D rectangle — <code>chemin_niveau_suivant</code> → niveau suivant
    </div></div></div>`;

  if (dashI.length > 0) html += `
  <div class="export-section"><h3>💛 Potions Dash (${dashI.length}) — avant chaque gap</h3><div class="export-step">
    <div class="step-num">4</div><div class="step-text">
      Instance <code>res://res/Items/Dash/dash_item.tscn</code> :
      <table class="coord-table" style="margin-top:8px"><thead><tr><th>#</th><th>Pixels</th><th>Grille</th></tr></thead><tbody>
      ${dashI.map((d, i) => `<tr><td>${i + 1}</td><td>${coord(d.x, d.y)}</td><td>(${d.x},${d.y})</td></tr>`).join('')}
      </tbody></table>
    </div></div></div>`;

  if (slideI.length > 0) html += `
  <div class="export-section"><h3>💜 Potions Slide (${slideI.length}) — entrée des couloirs</h3><div class="export-step">
    <div class="step-num">5</div><div class="step-text">
      Instance <code>res://res/Items/Slide/slide_item.tscn</code> :
      <table class="coord-table" style="margin-top:8px"><thead><tr><th>#</th><th>Pixels</th><th>Grille</th></tr></thead><tbody>
      ${slideI.map((s, i) => `<tr><td>${i + 1}</td><td>${coord(s.x, s.y)}</td><td>(${s.x},${s.y})</td></tr>`).join('')}
      </tbody></table>
    </div></div></div>`;

  if (wallS.length > 0) html += `
  <div class="export-section"><h3>🧱 Puits Wall Jump (${wallS.length})</h3><div class="export-step">
    <div class="step-num">6</div><div class="step-text">
      Structure : <strong>2 murs épais 2 cases</strong>, séparés de <strong>4 cases</strong> (innerGap).<br/>
      Le joueur entre par le <strong>bas</strong> du puit, wall-jump entre les murs, sort par le <strong>haut</strong>.<br/>
      ${wallS.map((s, i) => `<br/>• Puit ${i + 1} : départ <code>${coord(s.x, s.y)}</code>, hauteur <code>${s.wallH || 6}</code> cases — sortie <code>${coord(s.platformX ?? s.x, s.y)}</code>`).join('')}
    </div></div></div>`;

  if (dashS.length > 0) html += `
  <div class="export-section"><h3>⚡ Gaps Dash (${dashS.length}) — infranchissables sans dash</h3><div class="export-step">
    <div class="step-num">7</div><div class="step-text">
      Death Zone dans chaque gap. La potion Dash doit être AVANT le gap.<br/>
      ${dashS.map((s, i) => `<br/>• Gap ${i + 1} : atterrissage <code>${coord(s.x, s.y)}</code>`).join('')}
    </div></div></div>`;

  if (slideS.length > 0) html += `
  <div class="export-section"><h3>💨 Couloirs Slide (${slideS.length}) — plafond 2 cases</h3><div class="export-step">
    <div class="step-num">8</div><div class="step-text">
      Plafond à <strong>2 cases</strong> (32px) — joueur debout bloqué.<br/>
      ${slideS.map((s, i) => `<br/>• Couloir ${i + 1} : <code>${coord(s.x, s.y)}</code> — longueur <code>${s.len || 5}</code> cases`).join('')}
    </div></div></div>`;

  html += `
  <div class="export-section"><h3>📋 Checklist finale</h3><div class="export-step">
    <div class="step-num">✓</div><div class="step-text">
      ☐ Le joueur peut atteindre la ligne d'arrivée<br/>
      ☐ Chaque gap dash est infranchissable sans dash<br/>
      ☐ Les couloirs slide bloquent le joueur debout<br/>
      ☐ Les puits wall jump ont entrée bas / sortie haut<br/>
      ☐ Potions avant les défis qui les nécessitent<br/>
      ☐ <code>chemin_niveau_suivant</code> configuré<br/>
      ☐ ZoneDeMort en bas du niveau
    </div></div></div>`;

  return html;
}

// ─── Application principale ───────────────────────────────────
(function () {
  const canvas = document.getElementById('map-canvas');
  const renderer = new MapRenderer(canvas);
  let currentGrid = null, currentGen = null, zoom = 1.2;
  const $ = id => document.getElementById(id);

  const seg = id => ({
    value: () => $(id).querySelector('.seg-btn.active')?.dataset.val,
    init: () => {
      $(id).querySelectorAll('.seg-btn').forEach(b => {
        b.addEventListener('click', () => {
          $(id).querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
        });
      });
    }
  });
  const diffSeg = seg('difficulty'), styleSeg = seg('style');
  diffSeg.init(); styleSeg.init();

  $('spike-density').addEventListener('input', e => $('spike-val').textContent = e.target.value);
  $('dz-density').addEventListener('input', e => $('dz-val').textContent = e.target.value);
  $('btn-rand-seed').addEventListener('click', () => $('seed-input').value = 'seed_' + Math.floor(Math.random() * 99999));

  // Preset dimensions selon le style
  const PRESETS = { vertical: { w: 28, h: 48 }, horizontal: { w: 68, h: 24 }, mixed: { w: 44, h: 38 } };
  document.getElementById('style').querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.val] || PRESETS.vertical;
      $('grid-w').value = p.w; $('grid-h').value = p.h;
    });
  });

  function updateZoom(delta) {
    zoom = Math.max(0.3, Math.min(3, zoom + delta));
    $('zoom-display').textContent = Math.round(zoom * 100) + '%';
    if (currentGrid) { renderer.setZoom(zoom); renderer.render(currentGrid); }
  }
  $('btn-zoom-in').addEventListener('click', () => updateZoom(0.2));
  $('btn-zoom-out').addEventListener('click', () => updateZoom(-0.2));
  $('canvas-container').addEventListener('wheel', e => { e.preventDefault(); updateZoom(e.deltaY < 0 ? .1 : -.1); }, { passive: false });

  function getConfig() {
    const seed = $('seed-input').value.trim() || ('map_' + Date.now());
    const style = styleSeg.value() || 'vertical';
    return {
      seed, style,
      difficulty: diffSeg.value() || 'medium',
      gridW: Math.max(20, Math.min(110, parseInt($('grid-w').value) || 28)),
      gridH: Math.max(15, Math.min(100, parseInt($('grid-h').value) || 48)),
      dash: $('mec-dash').checked,
      slide: $('mec-slide').checked,
      walljump: $('mec-walljump').checked,
      trampoline: $('mec-trampoline').checked,
      spikeDensity: parseInt($('spike-density').value),
      dzDensity: parseInt($('dz-density').value),
    };
  }

  function generate() {
    const cfg = getConfig();
    const gen = new SpeedrunMapGenerator(cfg);
    const grid = gen.generate();
    currentGrid = grid; currentGen = gen;
    $('canvas-placeholder').style.display = 'none';
    renderer.setZoom(zoom); renderer.render(grid);
    const names = ['Neon Ascent', 'Void Rush', 'Crimson Climb', 'Shadow Sprint',
      'Pulse Tower', 'Gravity Breach', 'Flash Circuit', 'Storm Peak',
      'Phantom Road', 'Warp Core', 'Eclipse Run', 'Delta Storm',
      'Hyper Dash', 'Turbo Loop', 'Speed Frenzy', 'Apex Run',
      'Zero Gravity', 'Quantum Leap', 'Blaze Trail', 'Vortex Run'];
    const rng = new SeededRNG(cfg.seed);
    $('map-name').textContent = rng.pick(names) + ' [' + cfg.seed + ']';
    const s = gen.stats;
    $('stat-size').textContent = s.size;
    $('stat-route').textContent = s.route;
    $('stat-dash').textContent = s.dash;
    $('stat-slide').textContent = s.slide;
    $('stat-spikes').textContent = s.spikes;
    const scEl = $('stat-shortcuts'); if (scEl) scEl.textContent = s.shortcuts ?? 0;
    $('stat-time').textContent = s.time;
    $('stats-row').style.display = 'flex';
  }

  $('btn-generate').addEventListener('click', generate);
  $('btn-clear').addEventListener('click', () => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.width = 0;
    $('canvas-placeholder').style.display = 'flex';
    $('stats-row').style.display = 'none';
    $('map-name').textContent = '—';
    currentGrid = null; currentGen = null;
    $('modal-overlay').style.display = 'none';
  });
  $('btn-export').addEventListener('click', () => {
    if (!currentGen) { generate(); return; }
    $('modal-body').innerHTML = buildGodotGuide(currentGen);
    $('modal-overlay').style.display = 'flex';
  });
  $('modal-close').addEventListener('click', () => $('modal-overlay').style.display = 'none');
  $('btn-close-modal').addEventListener('click', () => $('modal-overlay').style.display = 'none');
  $('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) $('modal-overlay').style.display = 'none'; });
  $('btn-copy-guide').addEventListener('click', () => {
    navigator.clipboard.writeText($('modal-body').innerText).then(() => {
      $('btn-copy-guide').textContent = '✅ Copié!';
      setTimeout(() => $('btn-copy-guide').textContent = '📋 Copier le guide', 2000);
    });
  });

  setTimeout(generate, 300);
})();
