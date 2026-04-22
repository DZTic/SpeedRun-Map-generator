/* ==========================================================
 SPEEDRUN MAP GENERATOR — SMART GENERATOR (v2)
 Générateur amélioré avec validation physique garantie.
 Utilise LevelGraph et PhysicsEngine pour s'assurer que
 chaque map générée est 100% jouable.
 ========================================================== */

class SmartGenerator {
 constructor(ctx) {
 this.ctx = ctx;
 this.levelGraph = new LevelGraph(ctx);
 this.validator = new PlayabilityValidator(ctx);
 this.difficultyAnalyzer = new DifficultyValidator(ctx);
 this.maxAttempts = 10; // Augmenté pour plus de chances de succès
 }
 
 // Génération principale avec validation
 generate() {
 let attempts = 0;
 let success = false;
 
 while (attempts < this.maxAttempts && !success) {
 attempts++;
 
 try {
 // 1. Construire le graphe de niveau
 const path = this.levelGraph.generatePath();
 
 if (!path) {
 console.warn(`[SmartGenerator] Attempt ${attempts}: Could not generate valid path`);
 continue;
 }
 
 // 2. Stocker les segments dans le contexte
 this.ctx.segments = path;
 
 // 3. Construire la structure physique
 this._buildStructure(path);
 
 // 4. Valider la jouabilité
 const validation = this.validator.validate();
 
 if (!validation.valid) {
 console.warn(`[SmartGenerator] Attempt ${attempts}: Validation failed`, validation.issues);
 
 // Vérifier si ce sont uniquement des warnings ou des erreurs critiques
 const errors = validation.issues.filter(i => i.type === 'error');
 const warnings = validation.issues.filter(i => i.type === 'warning');
 
 // Si uniquement des warnings sans erreurs critiques, on accepte quand même
 if (errors.length === 0 && warnings.length > 0) {
 console.log(`[SmartGenerator] Attempt ${attempts}: Only warnings, proceeding`);
 // Continue avec la génération malgré les warnings
 } else if (errors.length > 0) {
 // Si erreurs critiques, on réessaie
 this._clearStructure();
 continue;
 }
 }
 
 // 5. Générer le terrain
 this._generateTerrain(path);
 
 // 6. Valider à nouveau avec le terrain
 const postTerrainValidation = this.validator.validate();
 if (!postTerrainValidation.valid && 
 postTerrainValidation.issues.some(i => i.type === 'error')) {
 console.warn(`[SmartGenerator] Attempt ${attempts}: Post-terrain validation failed`);
 this._clearStructure();
 continue;
 }
 
 // 7. Analyser la difficulté
 const diffAnalysis = this.difficultyAnalyzer.analyze();
 
 // 8. Décorer intelligemment
 this._smartDecorate(path, diffAnalysis);
 
 // 9. Placer départ/arrivée
 this._placeStartEnd(path);
 
 // 10. Validation finale
 const finalValidation = this.validator.validate();
 
 if (finalValidation.valid || 
 !finalValidation.issues.some(i => i.type === 'error')) {
 success = true;
 console.log(`[SmartGenerator] Success after ${attempts} attempt(s)`);
 
 // Stocker les statistiques
 this.ctx.stats = this._computeStats(path, diffAnalysis);
 }
 
 } catch (e) {
 console.error(`[SmartGenerator] Attempt ${attempts} failed:`, e);
 this._clearStructure();
 }
 }
 
 if (!success) {
 console.error('[SmartGenerator] Failed to generate valid map after all attempts');
 // Fallback: générer une map simple garantie
 return this._generateFallback();
 }
 
 return this.ctx.grid;
 }
 
 // Construit la structure physique de base
 _buildStructure(path) {
 // S'assurer que toute la grille est initialisée
 if (!this.ctx.grid || this.ctx.grid.length === 0) {
 this.ctx.grid = Array.from({ length: this.ctx.H }, () => new Array(this.ctx.W).fill(TILE.EMPTY));
 }
 
 // Construire chaque segment
 for (const seg of path) {
 this._buildSegment(seg);
 }
 
 // Ajouter les bords
 this._addBounds();
 }
 
 // Construit un segment spécifique
 _buildSegment(seg) {
 switch (seg.type) {
 case 'start':
 case 'end':
 case 'normal':
 case 'dash':
 this._buildPlatform(seg.x, seg.y, seg.len);
 break;
 
 case 'slide':
 this._buildSlide(seg);
 break;
 
 case 'walljump':
 this._buildWallJump(seg);
 break;
 
 case 'trampoline':
 this._buildTrampoline(seg);
 break;
 }
 }
 
 // Construit une plateforme simple
 _buildPlatform(x, y, len) {
 for (let i = 0; i < len; i++) {
 this.ctx.set(x + i, y, TILE.SOLID);
 // Assise sous la plateforme
 for (let dy = 1; dy <= 4; dy++) {
 if (y + dy < this.ctx.H) {
 this.ctx.set(x + i, y + dy, TILE.SOLID);
 }
 }
 }
 }
 
 // Construit un segment slide
 _buildSlide(seg) {
 // Sol du slide
 this._buildPlatform(seg.x, seg.y, seg.len);
 
 // Plafond bas (2 cases au-dessus du sol)
 for (let i = 2; i < seg.len - 1; i++) {
 if (seg.y - 2 >= 0) {
 this.ctx.set(seg.x + i, seg.y - 2, TILE.SOLID);
 }
 }
 }
 
 // Construit un segment walljump
 _buildWallJump(seg) {
 const wallThick = 2;
 const innerGap = seg.innerGap || 2;
 const wLeft = seg.x;
 const wRight = wLeft + wallThick + innerGap;
 
 // Murs verticaux
 for (let gy = seg.y; gy < seg.y + seg.wallH + 2; gy++) {
 if (gy >= this.ctx.H) continue;
 
 // Mur gauche
 this.ctx.set(wLeft, gy, TILE.SOLID);
 this.ctx.set(wLeft + 1, gy, TILE.SOLID);
 
 // Mur droit
 this.ctx.set(wRight, gy, TILE.SOLID);
 this.ctx.set(wRight + 1, gy, TILE.SOLID);
 }
 
 // Plateforme de sortie
 if (seg.platformX) {
 this._buildPlatform(seg.platformX, seg.y, seg.len || 3);
 }
 }
 
 // Construit un segment trampoline
 _buildTrampoline(seg) {
 this._buildPlatform(seg.x, seg.y, seg.len || 2);
 
 // Placer le trampoline au centre
 const tx = seg.x + Math.floor((seg.len || 2) / 2) - 1;
 if (seg.y - 1 >= 0) {
 this.ctx.set(tx, seg.y - 1, TILE.TRAMPOLINE);
 }
 }
 
 // Génère le terrain (tunnel/caverne)
 _generateTerrain(path) {
 // Créer un tunnel organique entre les segments
 const terrainGen = new TerrainGenerator(this.ctx);
 
 // Calculer les waypoints pour le tunnel
 const waypoints = this._computeWaypoints(path);
 terrainGen.generateWithWaypoints(waypoints);
 }
 
 // Calcule les waypoints pour le terrain
 _computeWaypoints(path) {
 const waypoints = [];
 
 for (const seg of path) {
 switch (seg.type) {
 case 'start':
 waypoints.push({ x: seg.x + seg.len / 2, y: seg.y - 2 });
 break;
 
 case 'end':
 waypoints.push({ x: seg.x + seg.len / 2, y: seg.y - 2 });
 break;
 
 case 'normal':
 case 'dash':
 waypoints.push({ x: seg.x + seg.len / 2, y: seg.y - 2 });
 break;
 
 case 'slide':
 waypoints.push({ x: seg.x + seg.len / 2, y: seg.y - 1 });
 break;
 
 case 'walljump':
 // Point d'entrée
 waypoints.push({ x: seg.x - 1, y: seg.y + seg.wallH - 1 });
 // Point de sortie
 if (seg.platformX) {
 waypoints.push({ x: seg.platformX + seg.len / 2, y: seg.y - 2 });
 }
 break;
 
 case 'trampoline':
 waypoints.push({ x: seg.x + 1, y: seg.y - 4 });
 break;
 }
 }
 
 return waypoints;
 }
 
 // Décoration intelligente basée sur l'analyse
 _smartDecorate(path, analysis) {
 const decorator = new SmartDecorator(this.ctx);
 decorator.decorate(path, analysis);
 }
 
 // Place départ et arrivée
 _placeStartEnd(path) {
 // Trouver le segment de départ
 const startSeg = path.find(s => s.type === 'start');
 if (startSeg) {
 const px = startSeg.x + 1;
 const py = startSeg.y - 1;
 
 // S'assurer que la case est libre
 if (this.ctx.get(px, py) === TILE.EMPTY) {
 this.ctx.set(px, py, TILE.PLAYER);
 this.ctx.playerPos = { x: px, y: py };
 }
 }
 
 // Trouver le segment de fin
 const endSeg = [...path].reverse().find(s => s.type === 'end');
 if (endSeg) {
 const fx = endSeg.x + Math.floor(endSeg.len / 2);
 const fy = endSeg.y - 1;
 
 if (this.ctx.get(fx, fy) === TILE.EMPTY) {
 this.ctx.set(fx, fy, TILE.FINISH);
 this.ctx.finishPos = { x: fx, y: fy };
 }
 }
 }
 
 // Calcule les statistiques
 _computeStats(path, analysis) {
 let dc = 0, sc = 0, sp = 0, tz = 0;
 
 for (let y = 0; y < this.ctx.H; y++) {
 for (let x = 0; x < this.ctx.W; x++) {
 const t = this.ctx.grid[y][x];
 if (t === TILE.DASH) dc++;
 if (t === TILE.SLIDE) sc++;
 if (t === TILE.TRAMPOLINE) tz++;
 if ([TILE.SPIKE_UP, TILE.SPIKE_DOWN, TILE.SPIKE_LEFT, TILE.SPIKE_RIGHT].includes(t)) sp++;
 }
 }
 
 const mainSegs = path.length;
 const secs = Math.round(30 + mainSegs * 3.5);
 
 return {
 size: `${this.ctx.W} × ${this.ctx.H}`,
 route: `${mainSegs} sections`,
 shortcuts: analysis.mechanics.dash + analysis.mechanics.slide + analysis.mechanics.walljump,
 dash: dc,
 slide: sc,
 trampoline: tz,
 spikes: sp,
 time: secs > 60 ? `${Math.floor(secs / 60)}m${secs % 60}s` : `${secs}s`,
 difficulty: analysis.issues.length > 0 ? 'warning' : 'balanced',
 issues: analysis.issues.length
 };
 }
 
 // Vide la structure pour réessayer
 _clearStructure() {
 this.ctx.grid = Array.from({ length: this.ctx.H }, () => new Array(this.ctx.W).fill(TILE.EMPTY));
 this.ctx.segments = [];
 this.ctx.items = [];
 }
 
 // Ajoute les bords
 _addBounds() {
 for (let x = 0; x < this.ctx.W; x++) {
 this.ctx.set(x, 0, TILE.SOLID);
 this.ctx.set(x, 1, TILE.SOLID);
 this.ctx.set(x, this.ctx.H - 1, TILE.SOLID);
 }
 for (let y = 0; y < this.ctx.H; y++) {
 this.ctx.set(0, y, TILE.SOLID);
 this.ctx.set(this.ctx.W - 1, y, TILE.SOLID);
 }
 }
 
// Map de fallback si tout échoue - GÉNÈRE UNE MAP SIMPLE MAIS COMPLÈTE
 _generateFallback() {
 console.log('[SmartGenerator] Using fallback generator');
 
 // Créer un chemin garanti avec plus de sections
 const path = [];
 const D = this.ctx.D;
 const W = this.ctx.W;
 const H = this.ctx.H;
 const style = this.ctx.cfg.style;
 
 // Point de départ
 const startLen = D.pMax;
 let cx, cy;
 
 if (style === 'horizontal') {
 cx = 2;
 cy = Math.floor(H * 0.42);
 } else {
 cx = 2;
 cy = H - 4;
 }
 
 path.push({ type: 'start', x: cx, y: cy, len: startLen });
 cx += startLen;
 
 // Générer un chemin simple mais plus intéressant
 if (style === 'vertical') {
 // Chemin vertical avec petits sauts
 const numSteps = Math.min(15, Math.floor((cy - 8) / 2));
 for (let i = 0; i < numSteps && cy > 8; i++) {
 const len = this.ctx.rng.int(D.pMin, D.pMax);
 const gap = this.ctx.rng.int(1, 2); // Petits gaps garantis franchissables
 
 // Mouvement horizontal alterné
 if (i % 2 === 0) {
 cx = Math.min(W - len - 2, cx + gap);
 } else {
 cx = Math.max(2, cx - gap - len + 1);
 }
 
 cy -= 1; // Petit saut vertical (max 1 case)
 
 path.push({
 type: 'normal',
 x: cx,
 y: cy,
 len: len,
 fromX: cx,
 fromY: cy + 1
 });
 
 cx += len;
 }
 } else {
 // Chemin horizontal simple
 const numSteps = Math.min(12, Math.floor((W - 10) / (D.pMax + 2)));
 
 for (let i = 0; i < numSteps && cx < W - 10; i++) {
 const len = this.ctx.rng.int(D.pMin, D.pMax);
 const gap = 2; // Gap garanti franchissable
 
 // Souvent même niveau, parfois variation
 const nextY = cy + (this.ctx.rng.bool(0.3) ? this.ctx.rng.int(-1, 1) : 0);
 cy = Math.max(6, Math.min(H - 6, nextY));
 
 cx += gap;
 
 path.push({
 type: 'normal',
 x: cx,
 y: cy,
 len: len,
 fromX: cx - gap,
 fromY: cy
 });
 
 cx += len;
 }
 }
 
// Point d'arrivée bien accessible
 const endLen = D.pMin + 1;
 const endX = Math.min(W - endLen - 2, cx);
 path.push({ type: 'end', x: endX, y: cy, len: endLen });
 
 // Vide et reconstruit
 this._clearStructure();
 this.ctx.segments = path;
 this._buildStructure(path);
 this._placeStartEnd(path);
 
 // Ajouter quelques murs et obstacles de base pour l'esthétique
 this._addBounds();
 
 // Ajouter des items si dash/slide activés
 if (this.ctx.cfg.dash && path.length > 3) {
 const idx = this.ctx.rng.int(2, path.length - 2);
 const seg = path[idx];
 this.ctx.items.push({ type: TILE.DASH, x: seg.x + 1, y: seg.y - 1 });
 this.ctx.set(seg.x + 1, seg.y - 1, TILE.DASH);
 }
 
 if (this.ctx.cfg.slide && path.length > 5) {
 const idx = this.ctx.rng.int(2, path.length - 2);
 const seg = path[idx];
 this.ctx.items.push({ type: TILE.SLIDE, x: seg.x + 1, y: seg.y - 1 });
 this.ctx.set(seg.x + 1, seg.y - 1, TILE.SLIDE);
 }
 
 // Ajouter quelques spikes si density > 0
 const spikeCount = Math.floor(this.ctx.cfg.spikeDensity / 2);
 for (let i = 0; i < spikeCount && i < path.length - 2; i++) {
 const idx = this.ctx.rng.int(1, path.length - 2);
 const seg = path[idx];
 if (this.ctx.get(seg.x + 1, seg.y - 1) === TILE.EMPTY) {
 this.ctx.set(seg.x + 1, seg.y - 1, TILE.SPIKE_UP);
 }
 }
 
 // Définir stats
 const dashCount = this.ctx.items.filter(i => i.type === TILE.DASH).length;
 const slideCount = this.ctx.items.filter(i => i.type === TILE.SLIDE).length;
 const spikeCountTotal = path.reduce((acc, seg) => {
 for (let x = seg.x; x < seg.x + seg.len; x++) {
 if (this.ctx.get(x, seg.y - 1) === TILE.SPIKE_UP) acc++;
 }
 return acc;
 }, 0);
 
 this.ctx.stats = {
 size: `${this.ctx.W} × ${this.ctx.H}`,
 route: `${path.length} sections`,
 shortcuts: 0,
 dash: dashCount,
 slide: slideCount,
 trampoline: 0,
 spikes: spikeCountTotal,
 time: `${30 * path.length}s`,
 difficulty: 'fallback'
 };
 
 console.log('[SmartGenerator] Fallback generated:', this.ctx.stats);
 
 return this.ctx.grid;
 }
}

// ─── SmartDecorator ──────────────────────────────────────────
// Décorateur intelligent qui place les items et obstacles
class SmartDecorator {
 constructor(ctx) {
 this.ctx = ctx;
 this.rng = ctx.rng;
 }
 
 decorate(path, analysis) {
 // 1. Placer les items de mécaniques où nécessaires
 this._placeMechanicItems(path);
 
 // 2. Placer les obstacles de manière équilibrée
 this._placeObstacles(path, analysis);
 
 // 3. Placer les secrets/caches optionnels
 this._placeSecrets(path);
 }
 
 _placeMechanicItems(path) {
 for (const seg of path) {
 switch (seg.type) {
 case 'dash':
 if (this.ctx.cfg.dash && seg.fromX !== undefined) {
 // Dash potion sur la plateforme de départ
 const px = Math.max(1, seg.fromX - 1);
 const py = seg.fromY - 1;
 if (this._canPlaceItem(px, py)) {
 this.ctx.set(px, py, TILE.DASH);
 this.ctx.items.push({ type: TILE.DASH, x: px, y: py });
 }
 }
 break;
 
 case 'slide':
 if (this.ctx.cfg.slide && seg.fromX !== undefined) {
 // Slide potion avant le couloir
 const px = Math.max(1, seg.fromX - 1);
 const py = seg.y - 1;
 if (this._canPlaceItem(px, py)) {
 this.ctx.set(px, py, TILE.SLIDE);
 this.ctx.items.push({ type: TILE.SLIDE, x: px, y: py });
 }
 }
 break;
 
 case 'trampoline':
 if (this.ctx.cfg.trampoline) {
 const tx = seg.x + Math.floor((seg.len || 2) / 2) - 1;
 const ty = seg.y - 1;
 if (this._canPlaceItem(tx, ty, TILE.TRAMPOLINE)) {
 this.ctx.set(tx, ty, TILE.TRAMPOLINE);
 this.ctx.items.push({ type: TILE.TRAMPOLINE, x: tx, y: ty });
 }
 }
 break;
 }
 }
 }
 
 _placeObstacles(path, analysis) {
 const spikeDensity = this.ctx.cfg.spikeDensity || 0;
 if (spikeDensity === 0) return;
 
 const maxSpikes = spikeDensity * 3;
 let placed = 0;
 
 // Éviter les zones de départ et fin
 const startIndex = Math.floor(path.length * 0.2);
 const endIndex = Math.floor(path.length * 0.8);
 
 for (let i = startIndex; i < endIndex && placed < maxSpikes; i++) {
 const seg = path[i];
 
 // Ne pas placer sur les mécaniques complexes
 if (['start', 'end', 'walljump', 'trampoline'].includes(seg.type)) continue;
 
 // Placer selon le type
 if (seg.type === 'slide' && this.rng.bool(0.4)) {
 // Spike sur le plafond du slide
 const x = seg.x + this.rng.int(2, seg.len - 2);
 const y = seg.y - 2;
 if (this._canPlaceSpike(x, y)) {
 this.ctx.set(x, y, TILE.SPIKE_DOWN);
 placed++;
 }
 }
 else if (seg.type === 'normal' && this.rng.bool(0.2)) {
 // Spike sur le sol
 const x = seg.x + this.rng.int(1, seg.len - 1);
 const y = seg.y - 1;
 if (this._canPlaceSpike(x, y)) {
 this.ctx.set(x, y, TILE.SPIKE_UP);
 placed++;
 }
 }
 }
 }
 
 _placeSecrets(path) {
 // Placer quelques caches optionnelles (20% de chances)
 if (!this.rng.bool(0.2)) return;
 
 // Chercher une zone vide pour un secret
 for (let i = 0; i < 5; i++) {
 const segIndex = this.rng.int(Math.floor(path.length * 0.3), Math.floor(path.length * 0.7));
 const seg = path[segIndex];
 
 if (!seg || seg.len < 4) continue;
 
 // Créer un passage secret parallèle
 const secretX = seg.x + this.rng.int(1, seg.len - 2);
 const secretY = seg.y - 3;
 
 if (this.ctx.get(secretX, secretY) === TILE.EMPTY &&
 this.ctx.get(secretX, secretY + 1) === TILE.EMPTY) {
 // Petite plateforme cachée
 this.ctx.set(secretX - 1, secretY + 1, TILE.SOLID);
 this.ctx.set(secretX, secretY + 1, TILE.SOLID);
 this.ctx.set(secretX + 1, secretY + 1, TILE.SOLID);
 break;
 }
 }
 }
 
 _canPlaceItem(x, y, tileType = null) {
 if (x < 0 || x >= this.ctx.W || y < 0 || y >= this.ctx.H) return false;
 
 // Doit être vide
 if (this.ctx.get(x, y) !== TILE.EMPTY) return false;
 
 // Doit avoir du sol en dessous pour les items standards
 if (!tileType || tileType !== TILE.TRAMPOLINE) {
 if (y + 1 >= this.ctx.H || this.ctx.get(x, y + 1) !== TILE.SOLID) {
 return false;
 }
 }
 
 return true;
 }
 
 _canPlaceSpike(x, y) {
 if (x < 0 || x >= this.ctx.W || y < 0 || y >= this.ctx.H) return false;
 if (this.ctx.get(x, y) !== TILE.EMPTY) return false;
 
 // Vérifier qu'il y a une surface adjacente pour le spike
 const hasSurface = (
 (y + 1 < this.ctx.H && this.ctx.get(x, y + 1) === TILE.SOLID) || // Sol
 (y - 1 >= 0 && this.ctx.get(x, y - 1) === TILE.SOLID) || // Plafond
 (x + 1 < this.ctx.W && this.ctx.get(x + 1, y) === TILE.SOLID) || // Droite
 (x - 1 >= 0 && this.ctx.get(x - 1, y) === TILE.SOLID) // Gauche
 );
 
 return hasSurface;
 }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
 module.exports = { SmartGenerator, SmartDecorator };
}
