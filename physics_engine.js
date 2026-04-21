/* ==========================================================
 SPEEDRUN MAP GENERATOR — PHYSICS ENGINE
 Simule les capacités physiques du joueur pour valider
 que chaque saut, dash et mécanique est possible.
 
 Basé sur les constantes de player.gd:
 - gravity: 980.0
 - jump_velocity: -300.0
 - speed: 150.0
 - dash_speed: 350.0
 - dash_duration: 0.15
 - slide_speed: 250.0
 - slide_duration: 0.4
 ========================================================== */

// ─── Constantes Physiques (de player.gd) ─────────────────────
const PHYSICS = {
 GRAVITY: 980.0,
 JUMP_VELOCITY: -300.0,
 SPEED: 150.0,
 DASH_SPEED: 350.0,
 DASH_DURATION: 0.15,
 SLIDE_SPEED: 250.0,
 SLIDE_DURATION: 0.4,
 TILE_SIZE: 16.0,
 
 // Calculs des capacités max (en cases)
 get JUMP_MAX_HEIGHT() {
 const t_apex = Math.abs(this.JUMP_VELOCITY) / this.GRAVITY;
 const h_max = Math.abs(this.JUMP_VELOCITY) * t_apex - 0.5 * this.GRAVITY * t_apex * t_apex;
 return Math.floor(h_max / this.TILE_SIZE);
 },
 
 get JUMP_MAX_WIDTH() {
 const t_apex = Math.abs(this.JUMP_VELOCITY) / this.GRAVITY;
 const t_flight = 2 * t_apex;
 const w_max = this.SPEED * t_flight;
 return Math.floor(w_max / this.TILE_SIZE);
 },
 
 get DASH_MAX_WIDTH() {
 return Math.floor((this.DASH_SPEED * this.DASH_DURATION) / this.TILE_SIZE);
 },
 
 get SLIDE_MAX_WIDTH() {
 return Math.floor((this.SLIDE_SPEED * this.SLIDE_DURATION) / this.TILE_SIZE);
 }
};

// ─── TrajectoryCalculator ────────────────────────────────────
// Calcule la trajectoire exacte d'un saut/traversée
class TrajectoryCalculator {
 constructor() {
 this.tileSize = PHYSICS.TILE_SIZE;
 }
 
 // Calcule la hauteur maximale atteignable depuis une position
 // avec un certain nombre de sauts consécutifs
 getMaxHeight(numJumps = 1) {
 return PHYSICS.JUMP_MAX_HEIGHT * numJumps;
 }
 
 // Calcule la distance horizontale franchissable
 // accounting for height difference
 getJumpRange(deltaY = 0) {
 // Si on monte, la distance diminue
 // Si on descend, la distance augmente
 const heightFactor = Math.max(0.3, 1 - (deltaY / PHYSICS.JUMP_MAX_HEIGHT) * 0.5);
 return Math.floor(PHYSICS.JUMP_MAX_WIDTH * heightFactor);
 }
 
 // Vérifie si un saut entre deux points est possible
 canJump(fromX, fromY, toX, toY) {
 const deltaX = Math.abs(toX - fromX);
 const deltaY = fromY - toY; // Positif = montée
 
 // Vérification basique hauteur
 if (deltaY > PHYSICS.JUMP_MAX_HEIGHT) {
 return { possible: false, reason: 'too_high', max: PHYSICS.JUMP_MAX_HEIGHT };
 }
 
 // Vérification distance horizontale
 const maxRange = this.getJumpRange(deltaY);
 if (deltaX > maxRange) {
 return { possible: false, reason: 'too_far', max: maxRange, requested: deltaX };
 }
 
 return { possible: true, difficulty: deltaX / maxRange };
 }
 
 // Vérifie si un dash peut franchir un gap
 canDash(fromX, fromY, toX, toY) {
 const deltaX = Math.abs(toX - fromX);
 const deltaY = Math.abs(toY - fromY);
 
 // Dash permet peu de variation verticale
 if (deltaY > 2) {
 return { possible: false, reason: 'dash_requires_flat' };
 }
 
 if (deltaX > PHYSICS.DASH_MAX_WIDTH) {
 return { possible: false, reason: 'dash_too_far', max: PHYSICS.DASH_MAX_WIDTH };
 }
 
 return { possible: true };
 }
 
 // Vérifie si un walljump est possible
 canWallJump(wallHeight) {
 // Un walljump nécessite au moins 2 cases de hauteur (réduit depuis 3 car JUMP_MAX_HEIGHT=2)
 // et maximum JUMP_MAX_HEIGHT
 if (wallHeight < 2) {
 return { possible: false, reason: 'wall_too_short', min: 2 };
 }
 if (wallHeight > PHYSICS.JUMP_MAX_HEIGHT + 2) {
 return { possible: false, reason: 'wall_too_high', max: PHYSICS.JUMP_MAX_HEIGHT + 2 };
 }
 return { possible: true };
 }
 
 // Vérifie si un slide peut être réalisé
 canSlide(length) {
 if (length > PHYSICS.SLIDE_MAX_WIDTH) {
 return { possible: false, reason: 'slide_too_long', max: PHYSICS.SLIDE_MAX_WIDTH };
 }
 return { possible: true };
 }
 
 // Calcule les positions atteignables depuis un point
 getReachablePositions(fromX, fromY, hasDash = false, hasSlide = false) {
 const reachable = [];
 
 // Sauts normaux
 const jumpRange = this.getJumpRange(0);
 for (let dy = -PHYSICS.JUMP_MAX_HEIGHT; dy <= 2; dy++) {
 const range = this.getJumpRange(Math.max(0, -dy));
 for (let dx = -range; dx <= range; dx++) {
 if (dx === 0 && dy === 0) continue;
 const check = this.canJump(fromX, fromY, fromX + dx, fromY + dy);
 if (check.possible) {
 reachable.push({
 x: fromX + dx,
 y: fromY + dy,
 type: 'jump',
 difficulty: check.difficulty
 });
 }
 }
 }
 
 // Dash (si disponible)
 if (hasDash) {
 for (let dx = -PHYSICS.DASH_MAX_WIDTH; dx <= PHYSICS.DASH_MAX_WIDTH; dx++) {
 if (Math.abs(dx) < 2) continue; // Dash sur distance min
 reachable.push({
 x: fromX + dx,
 y: fromY,
 type: 'dash'
 });
 }
 }
 
 // Slide (si disponible) - déplacement horizontal
 if (hasSlide) {
 for (let dx = 1; dx <= PHYSICS.SLIDE_MAX_WIDTH; dx++) {
 reachable.push({
 x: fromX + dx,
 y: fromY,
 type: 'slide'
 });
 reachable.push({
 x: fromX - dx,
 y: fromY,
 type: 'slide'
 });
 }
 }
 
 return reachable;
 }
 
 // Simule un saut complet et retourne la trajectoire
 simulateJump(fromX, fromY, toX, toY) {
 const trajectory = [];
 const dx = toX - fromX;
 const dy = toY - fromY;
 const distance = Math.sqrt(dx * dx + dy * dy);
 
 if (distance === 0) return trajectory;
 
 // Paramètres initiaux
 let vx = (dx / distance) * PHYSICS.SPEED;
 let vy = PHYSICS.JUMP_VELOCITY;
 let px = fromX * PHYSICS.TILE_SIZE;
 let py = fromY * PHYSICS.TILE_SIZE;
 
 // Simulation par pas de temps
 const dt = 0.016; // ~60fps
 let time = 0;
 
 while (time < 2.0 && py >= 0) { // Max 2 secondes ou touche sol
 px += vx * dt;
 py += vy * dt;
 vy += PHYSICS.GRAVITY * dt;
 time += dt;
 
 trajectory.push({
 x: px / PHYSICS.TILE_SIZE,
 y: py / PHYSICS.TILE_SIZE,
 time
 });
 
 // Arrêt si on dépasse largement la cible
 if (time > 0.5 && py > (fromY + 5) * PHYSICS.TILE_SIZE) break;
 }
 
 return trajectory;
 }
}

// ─── PlayabilityValidator ───────────────────────────────────
// Vérifie qu'un niveau complet est jouable du début à la fin
class PlayabilityValidator {
 constructor(mapContext) {
 this.ctx = mapContext;
 this.physics = new TrajectoryCalculator();
 this.issues = [];
 }
 
 // Valide le niveau complet
 validate() {
 this.issues = [];
 const checks = [
 this._validateStartFinishConnectivity(),
 this._validateAllSegmentsReachable(),
 this._validateMechanicsPossible(),
 this._validateItemsAccessible(),
 this._validateNoSoftLocks()
 ];
 
 return {
 valid: this.issues.length === 0,
 issues: this.issues,
 segments: this.ctx.segments.length,
 checksPassed: checks.filter(c => c).length
 };
 }
 
 // Vérifie que le départ et l'arrivée sont reliés
 _validateStartFinishConnectivity() {
 const startSeg = this.ctx.segments.find(s => s.type === 'start');
 const endSeg = this.ctx.segments.find(s => s.type === 'end');
 
 if (!startSeg) {
 this.issues.push({ type: 'error', message: 'No start segment found' });
 return false;
 }
 if (!endSeg) {
 this.issues.push({ type: 'error', message: 'No end segment found' });
 return false;
 }
 
 // BFS pour vérifier la connexité
 const visited = new Set();
 const queue = [startSeg];
 visited.add(startSeg);
 
 while (queue.length > 0) {
 const current = queue.shift();
 
 // Trouver les segments adjacents
 const adjacent = this._findAdjacentSegments(current);
 for (const adj of adjacent) {
 if (!visited.has(adj)) {
 visited.add(adj);
 queue.push(adj);
 }
 }
 }
 
 if (!visited.has(endSeg)) {
 this.issues.push({ 
 type: 'error', 
 message: 'End segment is not reachable from start',
 start: startSeg,
 end: endSeg
 });
 return false;
 }
 
 return true;
 }
 
 // Vérifie que tous les segments sont atteignables
 _validateAllSegmentsReachable() {
 const startSeg = this.ctx.segments.find(s => s.type === 'start');
 if (!startSeg) return false;
 
 const reachable = this._getAllReachableSegments(startSeg);
 const unreachable = this.ctx.segments.filter(s => !reachable.has(s));
 
 if (unreachable.length > 0) {
 this.issues.push({
 type: 'warning',
 message: `${unreachable.length} segments are unreachable`,
 segments: unreachable.map(s => s.type)
 });
 return false;
 }
 
 return true;
 }
 
 // Vérifie que les mécaniques sont physiquement possibles
 _validateMechanicsPossible() {
 let valid = true;
 
 for (const seg of this.ctx.segments) {
 switch (seg.type) {
 case 'dash':
 if (seg.fromX !== undefined) {
 const check = this.physics.canDash(seg.fromX, seg.fromY, seg.x, seg.y);
 if (!check.possible) {
 this.issues.push({
 type: 'error',
 message: `Impossible dash: ${check.reason}`,
 segment: seg
 });
 valid = false;
 }
 }
 break;
 
 case 'walljump':
 const wallCheck = this.physics.canWallJump(seg.wallH || 5);
 if (!wallCheck.possible) {
 this.issues.push({
 type: 'error',
 message: `Impossible walljump: ${wallCheck.reason}`,
 segment: seg
 });
 valid = false;
 }
 break;
 
 case 'slide':
 const slideCheck = this.physics.canSlide(seg.len || 5);
 if (!slideCheck.possible) {
 this.issues.push({
 type: 'warning',
 message: `Long slide may be difficult: ${slideCheck.reason}`,
 segment: seg
 });
 }
 break;
 
 case 'normal':
 // Vérifier que le saut précédent est possible
 if (seg.fromX !== undefined) {
 const jumpCheck = this.physics.canJump(seg.fromX, seg.fromY, seg.x + Math.floor(seg.len/2), seg.y);
 if (!jumpCheck.possible) {
 this.issues.push({
 type: 'error',
 message: `Impossible jump: ${jumpCheck.reason}`,
 from: { x: seg.fromX, y: seg.fromY },
 to: { x: seg.x, y: seg.y },
 segment: seg
 });
 valid = false;
 }
 }
 break;
 }
 }
 
 return valid;
 }
 
 // Vérifie que les items sont accessibles
 _validateItemsAccessible() {
 let valid = true;
 
 for (const item of this.ctx.items || []) {
 const accessible = this._isPositionAccessible(item.x, item.y);
 if (!accessible) {
 this.issues.push({
 type: 'warning',
 message: `Item at (${item.x}, ${item.y}) may be inaccessible`,
 item
 });
 valid = false;
 }
 }
 
 return valid;
 }
 
 // Vérifie qu'il n'y a pas de soft locks
 _validateNoSoftLocks() {
 // Un soft lock serait une zone où le joueur est bloqué
 // sans moyen de revenir en arrière
 
 // Pour l'instant, on vérifie simplement que tous les segments
 // ont une "issue" (sauf l'arrivée)
 let valid = true;
 
 for (const seg of this.ctx.segments) {
 if (seg.type === 'end') continue;
 
 const next = this._findNextSegment(seg);
 if (!next) {
 this.issues.push({
 type: 'warning',
 message: `Segment ${seg.type} at (${seg.x}, ${seg.y}) has no exit`,
 segment: seg
 });
 valid = false;
 }
 }
 
 return valid;
 }
 
 // Méthodes utilitaires
 _findAdjacentSegments(segment) {
 const adjacent = [];
 for (const seg of this.ctx.segments) {
 if (seg === segment) continue;
 
 // Calculer le centre de chaque segment
 const segCenterX = seg.x + Math.floor((seg.len || 2) / 2);
 const segCenterY = seg.y;
 const segmentCenterX = segment.x + Math.floor((segment.len || 2) / 2);
 const segmentCenterY = segment.y;
 
 // Vérifier si seg est adjacent à segment
 const deltaX = Math.abs(segCenterX - segmentCenterX);
 const deltaY = Math.abs(segCenterY - segmentCenterY);
 const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
 
 // Distance max = saut horizontal max + marge
 const maxDist = PHYSICS.JUMP_MAX_WIDTH + 2;
 if (dist <= maxDist) {
 // Vérifier que le saut est physiquement possible
 const reach = this.physics.canJump(
 segmentCenterX, segmentCenterY,
 segCenterX, segCenterY
 );
 if (reach.possible) {
 adjacent.push(seg);
 }
 }
 }
 return adjacent;
 }
 
 _getAllReachableSegments(start) {
 const reachable = new Set();
 const queue = [start];
 reachable.add(start);
 
 while (queue.length > 0) {
 const current = queue.shift();
 const adjacent = this._findAdjacentSegments(current);
 
 for (const adj of adjacent) {
 if (!reachable.has(adj)) {
 reachable.add(adj);
 queue.push(adj);
 }
 }
 }
 
 return reachable;
 }
 
 _isPositionAccessible(x, y) {
 // Vérifier s'il y a un sol sous la position
 if (y >= this.ctx.H - 1) return false;
 
 // Doit avoir du sol en dessous ou être proche d'un segment
 const segments = this.ctx.segments.filter(s => {
 const dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2));
 return dist < 3;
 });
 
 return segments.length > 0;
 }
 
 _findNextSegment(segment) {
 const idx = this.ctx.segments.indexOf(segment);
 if (idx >= 0 && idx < this.ctx.segments.length - 1) {
 return this.ctx.segments[idx + 1];
 }
 return null;
 }
}

// ─── DifficultyValidator ─────────────────────────────────────
// Valide que la courbe de difficulté est respectée
class DifficultyValidator {
 constructor(mapContext) {
 this.ctx = mapContext;
 }
 
 analyze() {
 const analysis = {
 totalSegments: this.ctx.segments.length,
 mechanics: { dash: 0, slide: 0, walljump: 0, trampoline: 0, normal: 0 },
 difficultyCurve: [],
 issues: []
 };
 
 // Compter les mécaniques
 for (let i = 0; i < this.ctx.segments.length; i++) {
 const seg = this.ctx.segments[i];
 const progress = i / this.ctx.segments.length;
 
 if (seg.type === 'dash') analysis.mechanics.dash++;
 else if (seg.type === 'slide') analysis.mechanics.slide++;
 else if (seg.type === 'walljump') analysis.mechanics.walljump++;
 else if (seg.type === 'trampoline') analysis.mechanics.trampoline++;
 else if (seg.type === 'normal') analysis.mechanics.normal++;
 
 // Analyser la difficulté par segment
 const segDifficulty = this._getSegmentDifficulty(seg);
 analysis.difficultyCurve.push({
 index: i,
 progress: Math.round(progress * 100),
 type: seg.type,
 difficulty: segDifficulty
 });
 }
 
 // Vérifier la courbe de difficulté
 this._validateDifficultyCurve(analysis);
 
 return analysis;
 }
 
 _getSegmentDifficulty(seg) {
 switch (seg.type) {
 case 'normal': return 1;
 case 'slide': return 2;
 case 'dash': return 2;
 case 'trampoline': return 2;
 case 'walljump': return 3;
 case 'end': return 1;
 default: return 1;
 }
 }
 
 _validateDifficultyCurve(analysis) {
 const curve = analysis.difficultyCurve;
 
 // Phase 1 (0-30%): Devrait être simple
 const phase1 = curve.filter(s => s.progress < 30);
 const phase1Avg = phase1.reduce((a, s) => a + s.difficulty, 0) / phase1.length;
 
 if (phase1Avg > 1.8) {
 analysis.issues.push({
 type: 'warning',
 message: `Phase 1 (0-30%) may be too hard (${phase1Avg.toFixed(1)} avg difficulty)`
 });
 }
 
 // Phase 4 (85-100%): Devrait être le plus dur
 const phase4 = curve.filter(s => s.progress >= 85);
 const phase4Avg = phase4.reduce((a, s) => a + s.difficulty, 0) / phase4.length;
 
 if (phase4Avg < 1.5) {
 analysis.issues.push({
 type: 'suggestion',
 message: `Final phase (85-100%) could be more challenging (${phase4Avg.toFixed(1)} avg difficulty)`
 });
 }
 
 // Vérifier qu'il n'y a pas trop de mécaniques difficiles d'affilée
 let hardStreak = 0;
 for (const seg of curve) {
 if (seg.difficulty >= 2) {
 hardStreak++;
 if (hardStreak > 4) {
 analysis.issues.push({
 type: 'warning',
 message: `Detected ${hardStreak} hard segments in a row at ${seg.progress}%`
 });
 }
 } else {
 hardStreak = 0;
 }
 }
 }
}

// ─── PathSolver ──────────────────────────────────────────────
// Trouve un chemin jouable entre tous les segments
class PathSolver {
 constructor(mapContext) {
 this.ctx = mapContext;
 this.physics = new TrajectoryCalculator();
 }
 
 // Résout le chemin optimal entre tous les segments
 solve() {
 const segments = this.ctx.segments;
 const connections = [];
 
 for (let i = 0; i < segments.length - 1; i++) {
 const current = segments[i];
 const next = segments[i + 1];
 
 const connection = this._findBestConnection(current, next);
 if (connection) {
 connections.push(connection);
 }
 }
 
 return {
 segments: segments.length,
 connections: connections.length,
 connectionRate: connections.length / (segments.length - 1),
 path: connections
 };
 }
 
 _findBestConnection(from, to) {
 // Calculer la transition optimale entre deux segments
 const fromX = from.x + (from.len || 2) / 2;
 const fromY = from.y - 1;
 const toX = to.x + (to.len || 2) / 2;
 const toY = to.y - 1;
 
 // Essayer différentes mécaniques
 const candidates = [
 { type: 'jump', check: this.physics.canJump(fromX, fromY, toX, toY) },
 { type: 'dash', check: this.physics.canDash(fromX, fromY, toX, toY) }
 ];
 
 for (const candidate of candidates) {
 if (candidate.check.possible) {
 return {
 from: { x: fromX, y: fromY },
 to: { x: toX, y: toY },
 type: candidate.type,
 difficulty: candidate.check.difficulty || 0.5
 };
 }
 }
 
 return null;
 }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
 module.exports = {
 PHYSICS,
 TrajectoryCalculator,
 PlayabilityValidator,
 DifficultyValidator,
 PathSolver
 };
}
