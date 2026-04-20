/* ==========================================================
 SPEEDRUN MAP GENERATOR — LEVEL GRAPH
 Graphe de niveau avec validation de connexité garantie.
 Chaque nœud est physiquement atteignable depuis le précédent.
 ========================================================== */

class LevelGraph {
 constructor(ctx) {
 this.ctx = ctx;
 this.nodes = [];
 this.edges = [];
 this.physics = new TrajectoryCalculator();
 }
 
 // Ajoute un nœud (segment) avec validation
 addNode(node) {
 // Vérifier que le nœud précédent peut atteindre celui-ci
 if (this.nodes.length > 0) {
 const prev = this.nodes[this.nodes.length - 1];
 const connection = this._validateConnection(prev, node);
 
 if (!connection.valid) {
 console.warn(`[LevelGraph] Connection invalid: ${connection.reason}`);
 return false;
 }
 
 this.edges.push({
 from: prev,
 to: node,
 type: connection.type,
 difficulty: connection.difficulty
 });
 }
 
 this.nodes.push(node);
 return true;
 }
 
 // Valide qu'une connexion entre deux nœuds est possible
 _validateConnection(from, to) {
 const fromX = from.x + Math.floor((from.len || 2) / 2);
 const fromY = from.y;
 const toX = to.x + Math.floor((to.len || 2) / 2);
 const toY = to.y;
 
 const deltaX = Math.abs(toX - fromX);
 const deltaY = Math.abs(toY - fromY);
 
 // Essayer d'abord un saut normal
 const jumpCheck = this.physics.canJump(fromX, fromY, toX, toY);
 if (jumpCheck.possible) {
 return { valid: true, type: 'jump', difficulty: jumpCheck.difficulty };
 }
 
 // Essayer un dash si le joueur peut en avoir
 if (this.ctx.cfg.dash) {
 const dashCheck = this.physics.canDash(fromX, fromY, toX, toY);
 if (dashCheck.possible) {
 return { valid: true, type: 'dash', difficulty: 0.7 };
 }
 }
 
 // Si c'est un walljump, vérifier spécifiquement
 if (to.type === 'walljump') {
 const wjCheck = this.physics.canWallJump(to.wallH || 5);
 if (wjCheck.possible) {
 return { valid: true, type: 'walljump', difficulty: 0.8 };
 }
 }
 
 // Si aucune mécanique ne fonctionne
 return {
 valid: false,
 reason: `No valid connection from (${fromX},${fromY}) to (${toX},${toY})`,
 deltaX,
 deltaY,
 maxJumpWidth: PHYSICS.JUMP_MAX_WIDTH,
 maxJumpHeight: PHYSICS.JUMP_MAX_HEIGHT
 };
 }
 
 // Génère un chemin complet du début à la fin
 generatePath() {
 const path = [];
 const style = this.ctx.cfg.style;
 
 // Point de départ
 const startNode = this._createStartNode();
 path.push(startNode);
 
 // Générer les segments intermédiaires selon le style
 if (style === 'vertical') {
 this._generateVerticalPath(path);
 } else if (style === 'horizontal') {
 this._generateHorizontalPath(path);
 } else {
 this._generateMixedPath(path);
 }
 
 // Point d'arrivée
 const endNode = this._createEndNode(path[path.length - 1]);
 path.push(endNode);
 
 // Vérifier que tout le chemin est valide
 const validPath = this._validateFullPath(path);
 
 return validPath ? path : null;
 }
 
 _createStartNode() {
 const D = this.ctx.D;
 const W = this.ctx.W;
 const H = this.ctx.H;
 
 const len = this.ctx.rng.int(D.pMin, D.pMax);
 let x, y;
 
 if (this.ctx.cfg.style === 'horizontal') {
 x = 2;
 y = Math.floor(H * 0.42);
 } else {
 x = Math.floor(W / 2) - Math.floor(len / 2);
 y = H - 4;
 }
 
 return {
 type: 'start',
 x: x,
 y: y,
 len: len,
 id: 0
 };
 }
 
 _createEndNode(prevNode) {
 const D = this.ctx.D;
 const len = D.pMin + 1;
 
 let x, y;
 if (this.ctx.cfg.style === 'horizontal') {
 x = Math.min(this.ctx.W - len - 2, prevNode.x + 10);
 y = prevNode.y;
 } else {
 x = Math.min(this.ctx.W - len - 2, prevNode.x + 5);
 y = 4;
 }
 
 return {
 type: 'end',
 x: x,
 y: y,
 len: len,
 id: this.nodes.length + 1
 };
 }
 
 _generateVerticalPath(path) {
 const D = this.ctx.D;
 const W = this.ctx.W;
 let current = path[0];
 let safety = 0;
 let cy = current.y;
 
 // Machine à états pour les transitions
 const TRANSITIONS = {
 normal: ['normal', 'dash', 'slide', 'walljump', 'trampoline'],
 dash: ['normal', 'slide', 'walljump', 'trampoline'],
 slide: ['normal', 'dash', 'walljump', 'trampoline'],
 walljump: ['normal', 'dash', 'slide', 'trampoline'],
 trampoline: ['normal', 'dash', 'slide', 'walljump']
 };
 
 let prevType = 'normal';
 let wjCooldown = 0;
 let index = 0;
 
 while (cy > 8 && safety < 50) {
 safety++;
 index++;
 
 const progress = index / 40; // Estimation
 
 // Choix vertical
 const vStep = this.ctx.rng.next() < 0.5 ? D.vStep[0] : D.vStep[1];
 const nextY = cy - vStep;
 
 if (nextY <= 5) break;
 
 // Éviter de sortir des bords
 const goRight = index % 2 === 1;
 
 // Filtrer les candidats selon les mécaniques activées
 const candidates = (TRANSITIONS[prevType] || ['normal']).filter(ch => {
 if (ch === 'normal') return true;
 if (ch === 'dash') return this.ctx.cfg.dash && progress >= 0.35;
 if (ch === 'slide') return this.ctx.cfg.slide && progress >= 0.45;
 if (ch === 'trampoline') return this.ctx.cfg.trampoline && progress >= 0.35;
 if (ch === 'walljump') return this.ctx.cfg.walljump && progress >= 0.15 && wjCooldown <= 0;
 return false;
 });
 
 // Forcer un normal si pas assez de diversité
 let choice = this.ctx.rng.pick(candidates.length ? candidates : ['normal']);
 
 // Limiter les walljump consécutifs
 if (choice === 'walljump') {
 wjCooldown = 3;
 } else {
 wjCooldown = Math.max(0, wjCooldown - 1);
 }
 
 // Créer le nœud selon le type choisi
 let node;
 switch (choice) {
 case 'dash':
 node = this._createDashNode(current, nextY, goRight, D);
 break;
 case 'slide':
 node = this._createSlideNode(current, nextY, goRight, D);
 break;
 case 'walljump':
 node = this._createWallJumpNode(current, nextY, goRight, D);
 break;
 case 'trampoline':
 node = this._createTrampolineNode(current, nextY, goRight, D);
 break;
 default:
 node = this._createNormalNode(current, nextY, goRight, D);
 }
 
 // Valider que le nœud peut être atteint
 const connection = this._validateConnection(current, node);
 if (connection.valid) {
 path.push(node);
 current = node;
 prevType = choice;
 cy = nextY;
 }
 }
 
 return path;
 }
 
 _generateHorizontalPath(path) {
 const D = this.ctx.D;
 let current = path[0];
 let safety = 0;
 let index = 0;
 
 while (current.x < this.ctx.W - 15 && safety < 60) {
 safety++;
 index++;
 
 const progress = current.x / this.ctx.W;
 
 // Variation verticale limitée en horizontal
 let nextY = current.y + this.ctx.rng.int(-2, 2);
 nextY = Math.max(6, Math.min(this.ctx.H - 6, nextY));
 
 const terLen = this.ctx.rng.int(D.pMin + 1, D.pMax + 1);
 
 // Choix de mécanique
 const pool = ['normal'];
 if (this.ctx.cfg.dash && progress >= 0.10) pool.push('dash');
 if (this.ctx.cfg.slide && progress >= 0.15) pool.push('slide');
 if (this.ctx.cfg.walljump && progress >= 0.05 && index % 4 === 0) pool.push('walljump');
 if (this.ctx.cfg.trampoline && progress >= 0.15) pool.push('trampoline');
 
 const choice = this.ctx.rng.pick(pool);
 let node;
 
 switch (choice) {
 case 'dash':
 node = this._createHorizontalDashNode(current, nextY, terLen, D);
 break;
 case 'slide':
 node = this._createHorizontalSlideNode(current, nextY, terLen, D);
 break;
 case 'walljump':
 node = this._createHorizontalWallJumpNode(current, nextY, terLen, D);
 break;
 case 'trampoline':
 node = this._createHorizontalTrampolineNode(current, nextY, terLen, D);
 break;
 default:
 node = this._createHorizontalNormalNode(current, nextY, terLen, D);
 }
 
 const connection = this._validateConnection(current, node);
 if (connection.valid) {
 path.push(node);
 current = node;
 }
 }
 
 return path;
 }
 
 _generateMixedPath(path) {
 // Partie horizontale (45%)
 const splitX = Math.floor(this.ctx.W * 0.45);
 
 // Génère d'abord l'horizontal
 const horizontalNodes = this._generateHorizontalPath(path);
 
 // Trouve le point de transition
 const lastHorizontal = horizontalNodes[horizontalNodes.length - 1];
 let transitionNode = {
   type: 'normal',
   x: lastHorizontal.x + lastHorizontal.len,
   y: lastHorizontal.y,
   len: this.ctx.D.pMin + 2
 };
 path.push(transitionNode);
 
 // Puis le vertical
 this._generateVerticalPath(path);
 
 return path;
 }
 
 // Créateurs de nœuds avec contraintes physiques
 _createNormalNode(prev, nextY, goRight, D) {
 const len = this.ctx.rng.int(D.pMin, D.pMax);
 const maxGap = PHYSICS.JUMP_MAX_WIDTH - len;
 const gap = Math.min(maxGap, this.ctx.rng.int(2, Math.max(2, maxGap)));
 
 let nx;
 if (goRight) {
 nx = Math.min(this.ctx.W - len - 2, prev.x + gap);
 } else {
 nx = Math.max(2, prev.x - gap - len);
 }
 
 return {
 type: 'normal',
 x: nx,
 y: nextY,
 len: len,
 fromX: prev.x,
 fromY: prev.y
 };
 }
 
 _createDashNode(prev, nextY, goRight, D) {
 const len = this.ctx.rng.int(D.pMin, D.pMax);
 const dashGap = Math.min(PHYSICS.DASH_MAX_WIDTH, D.jW + 2);
 
 let nx = goRight 
 ? Math.min(this.ctx.W - len - 2, prev.x + dashGap)
 : Math.max(2, prev.x - dashGap - len);
 
 return {
 type: 'dash',
 x: nx,
 y: nextY,
 len: len,
 fromX: prev.x,
 fromY: prev.y,
 dir: goRight ? 1 : -1
 };
 }
 
 _createSlideNode(prev, nextY, goRight, D) {
 const len = Math.min(PHYSICS.SLIDE_MAX_WIDTH, this.ctx.rng.int(...D.slideL));
 
 let nx = goRight
 ? Math.min(this.ctx.W - len - 2, prev.x + 2)
 : Math.max(2, prev.x - len - 2);
 
 return {
 type: 'slide',
 x: nx,
 y: nextY,
 len: len,
 dir: goRight ? 1 : -1
 };
 }
 
 _createWallJumpNode(prev, nextY, goRight, D) {
 const wallThick = 2;
 const innerGap = 2;
 const exitLen = this.ctx.rng.int(D.pMin, D.pMax);
 const wallH = this.ctx.rng.int(...D.wH);
 
 // Position du mur
 let wx = goRight 
 ? Math.min(this.ctx.W - exitLen - wallThick - 5, prev.x + 5)
 : Math.max(2, prev.x - wallThick - innerGap - 5);
 
 return {
 type: 'walljump',
 x: wx,
 y: nextY,
 wallH: wallH,
 innerGap: innerGap,
 platformX: goRight ? wx + wallThick + innerGap : Math.max(2, wx - exitLen - 1),
 len: exitLen,
 dir: goRight ? 1 : -1
 };
 }
 
 _createTrampolineNode(prev, nextY, goRight, D) {
 const len = 2;
 const gap = 2;
 
 let px = goRight
 ? Math.min(this.ctx.W - len - 2, prev.x + gap)
 : Math.max(2, prev.x - gap - len);
 
 return {
 type: 'trampoline',
 x: px,
 y: nextY + 1,
 len: len
 };
 }
 
 // Créateurs pour horizontal
 _createHorizontalNormalNode(prev, nextY, len, D) {
 const maxGap = Math.max(1, PHYSICS.JUMP_MAX_WIDTH - Math.ceil((prev.y - nextY) / 2) - 1);
 const gap = this.ctx.rng.int(1, Math.max(1, maxGap));
 
 return {
 type: 'normal',
 x: prev.x + prev.len + gap,
 y: nextY,
 len: len
 };
 }
 
 _createHorizontalDashNode(prev, nextY, len, D) {
 const dashGap = PHYSICS.DASH_MAX_WIDTH;
 
 return {
 type: 'dash',
 x: prev.x + prev.len + dashGap,
 y: nextY,
 len: len,
 fromX: prev.x,
 fromY: prev.y
 };
 }
 
 _createHorizontalSlideNode(prev, nextY, len, D) {
 const slideLen = Math.min(PHYSICS.SLIDE_MAX_WIDTH, this.ctx.rng.int(...D.slideL));
 
 return {
 type: 'slide',
 x: prev.x + prev.len,
 y: prev.y,
 len: slideLen,
 fromX: prev.x
 };
 }
 
 _createHorizontalWallJumpNode(prev, nextY, len, D) {
 const wallThick = 2;
 const innerGap = 2;
 const totalW = wallThick * 2 + innerGap;
 const topY = prev.y - this.ctx.rng.int(...D.wH);
 
 return {
 type: 'walljump',
 x: prev.x + prev.len + 1,
 y: topY,
 wallH: prev.y - topY,
 innerGap: innerGap,
 platformX: prev.x + prev.len + totalW + 1,
 len: len
 };
 }
 
 _createHorizontalTrampolineNode(prev, nextY, len, D) {
 const gap = 2;
 
 return {
 type: 'trampoline',
 x: prev.x + prev.len + gap,
 y: prev.y,
 len: 2
 };
 }
 
 // Valide le chemin complet
 _validateFullPath(path) {
 // Vérifier que tous les segments sont physiquement valides
 for (let i = 0; i < path.length - 1; i++) {
 const current = path[i];
 const next = path[i + 1];
 
 const check = this._validateConnection(current, next);
 if (!check.valid) {
 console.warn(`[LevelGraph] Invalid path at segment ${i}: ${check.reason}`);
 return false;
 }
 }
 
 return true;
 }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
 module.exports = { LevelGraph };
}
