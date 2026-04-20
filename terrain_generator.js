/* ==========================================================
   SPEEDRUN MAP GENERATOR — TERRAIN GENERATOR
   Convertit le squelette de segments en un terrain "serpentin"
   continu en creusant un tunnel organique dans la roche.
   ========================================================== */

class TerrainGenerator {
    constructor(ctx) {
        this.ctx = ctx;
        this.tunnelH = 4.5; // Rayon de creusement standard
    }

    generate() {
        const ctx = this.ctx;

        // 1. Initialiser tout en roche (SOLID)
        for (let y = 0; y < ctx.H; y++) {
            for (let x = 0; x < ctx.W; x++) {
                ctx.set(x, y, TILE.SOLID);
            }
        }

        // 2. Extraire la liste des waypoints successifs pour créer un chemin continu
        let waypoints = [];
        for (let i = 0; i < ctx.segments.length; i++) {
            let seg = ctx.segments[i];

            let rNorm = this.tunnelH;

            if (seg.type === 'start') {
                waypoints.push({ x: seg.x, y: seg.y - 2, r: rNorm });
                waypoints.push({ x: seg.x + seg.len, y: seg.y - 2, r: rNorm });
            }
            else if (seg.type === 'walljump') {
                // Point d'entrée du mur
                let entryX = (seg.dir === 1) ? seg.x - 3 : seg.x + 3;
                let bottomY = seg.y + seg.wallH;

                // Assurer que le tunnel va jusqu'au bas du walljump
                waypoints.push({ x: entryX, y: bottomY - 1, r: rNorm });

                // Remonter le long du mur
                waypoints.push({ x: entryX, y: seg.y - 1, r: rNorm });

                // Connecter à la plateforme de sortie
                waypoints.push({ x: seg.platformX, y: seg.y - 2, r: rNorm });
                waypoints.push({ x: seg.platformX + seg.len, y: seg.y - 2, r: rNorm });
            }
            else if (seg.type === 'slide') {
                waypoints.push({ x: seg.x, y: seg.y - 1, r: 2.5 }); // Espace restreint
                waypoints.push({ x: seg.x + seg.len, y: seg.y - 1, r: 2.5 });
            }
            else if (seg.type === 'trampoline') {
                waypoints.push({ x: seg.x + 1, y: seg.y - 4, r: rNorm + 2 }); // Plus de place au-dessus
            }
            else if (seg.type === 'turn') {
                waypoints.push({ x: seg.x + (seg.len / 2), y: seg.y - 2, r: rNorm });
            }
            else if (seg.type === 'end') {
                waypoints.push({ x: seg.x, y: seg.y - 2, r: rNorm });
                waypoints.push({ x: seg.x + seg.len, y: seg.y - 2, r: rNorm });
            }
            else {
                // dash, normal
                let sx = seg.fromX !== undefined ? seg.fromX : seg.x;
                let sy = seg.fromY !== undefined ? seg.fromY : seg.y;
                if (seg.fromX !== undefined) {
                    waypoints.push({ x: sx, y: sy - 2, r: rNorm });
                }
                waypoints.push({ x: seg.x, y: seg.y - 2, r: rNorm });
                waypoints.push({ x: seg.x + (seg.len || 1), y: seg.y - 2, r: rNorm });
            }
        }

        // 3. Lisser les waypoints (Catmull-Rom simplifiée pour éviter les angles trop secs)
        let smoothedWaypoints = [];
        if (waypoints.length > 2) {
            smoothedWaypoints.push(waypoints[0]);
            for (let i = 0; i < waypoints.length - 1; i++) {
                let p0 = i === 0 ? waypoints[i] : waypoints[i - 1];
                let p1 = waypoints[i];
                let p2 = waypoints[i + 1];
                let p3 = i + 2 < waypoints.length ? waypoints[i + 2] : p2;

                let steps = 4;
                for (let t = 1; t <= steps; t++) {
                    let tStep = t / steps;
                    let x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * tStep + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tStep * tStep + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * tStep * tStep * tStep);
                    let y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * tStep + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tStep * tStep + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * tStep * tStep * tStep);
                    let r = p1.r + (p2.r - p1.r) * tStep;

                    smoothedWaypoints.push({ x: Math.max(1, Math.min(ctx.W - 2, x)), y: Math.max(1, Math.min(ctx.H - 2, y)), r: r });
                }
            }
        } else {
            smoothedWaypoints = waypoints;
        }

        // 4. Creuser le long des waypoints lissés
        for (let i = 0; i < smoothedWaypoints.length - 1; i++) {
            let p1 = smoothedWaypoints[i];
            let p2 = smoothedWaypoints[i+1];
            // Si la distance est très grande (ex: changement d'étage brutal dans le mixed),
            // on creuse quand même pour relier
            this.carveTunnel(p1.x, p1.y, p1.r, p2.x, p2.y, p2.r);
        }

        // 5. Restaurer les plateformes exactes pour que la physique du jeu ne soit pas bloquée
        for (let i = 0; i < ctx.segments.length; i++) {
            let seg = ctx.segments[i];
            if (seg.type === 'walljump') {
                // Dessiner le mur lui-même
                let wx = seg.x;
                // Mur lisse pour walljump : on le force sur 3 cases d'épaisseur
                let startWX = seg.dir === 1 ? wx : wx - 2;
                for (let cx = startWX; cx <= startWX + 2; cx++) {
                    for (let cy = seg.y - 4; cy <= seg.y + seg.wallH + 2; cy++) {
                        if (cx >= 0 && cx < ctx.W && cy >= 0 && cy < ctx.H) {
                            ctx.set(cx, cy, TILE.SOLID);
                        }
                    }
                }
                this.drawPlatform(seg.platformX, seg.y, seg.len);
            } else if (seg.type === 'slide') {
                this.drawPlatform(seg.x, seg.y, seg.len);
                // Renforcer le plafond de la glissade pour ne pas casser le tunnel
                for(let cx = seg.x; cx < seg.x + seg.len; cx++) {
                    if (cx >= 0 && cx < ctx.W) {
                        if (seg.y - 3 >= 0) ctx.set(cx, seg.y - 3, TILE.SOLID);
                        if (seg.y - 4 >= 0) ctx.set(cx, seg.y - 4, TILE.SOLID);
                    }
                }
            } else if (seg.type === 'trampoline') {
                this.drawPlatform(seg.x, seg.y, 2);
            } else if (seg.type === 'start' || seg.type === 'end' || seg.type === 'turn' || seg.type === 'normal' || seg.type === 'dash') {
                this.drawPlatform(seg.x, seg.y, seg.len || 2);
            }
        }

        // 6. Ajouter du bruit aux contours (cellular automata très légère) pour un effet plus naturel "caverne"
        this.applyCellularAutomata();

        // 7. Fermer le contour global pour éviter que le joueur tombe hors de la map
        for (let y = 0; y < ctx.H; y++) {
            ctx.set(0, y, TILE.SOLID);
            ctx.set(ctx.W - 1, y, TILE.SOLID);
        }
        for (let x = 0; x < ctx.W; x++) {
            ctx.set(x, ctx.H - 1, TILE.SOLID);
            ctx.set(x, ctx.H - 2, TILE.SOLID);
            ctx.set(x, 0, TILE.SOLID);
        }

        // Assurer que la plateforme d'arrivée et de départ sont bien nettes après le lissage
        for (let i = 0; i < ctx.segments.length; i++) {
            let seg = ctx.segments[i];
            if (seg.type === 'start' || seg.type === 'end') {
                this.drawPlatform(seg.x, seg.y, seg.len || 2, true);
                for (let px = seg.x; px < seg.x + (seg.len || 2); px++) {
                    if (px >= 0 && px < ctx.W) {
                        for(let py = seg.y - 1; py > seg.y - 4; py--) {
                            if (py >= 0) ctx.set(px, py, TILE.EMPTY);
                        }
                    }
                }
            }
        }
    }

    drawPlatform(x, y, len, force = false) {
        const ctx = this.ctx;
        for (let px = x; px < x + len; px++) {
            if (px < 0 || px >= ctx.W) continue;
            // Surface exacte du segment
            ctx.set(px, y, TILE.SOLID);
            // Vider l'espace au-dessus juste pour être sûr
            if (force) {
                if (y - 1 >= 0) ctx.set(px, y - 1, TILE.EMPTY);
                if (y - 2 >= 0) ctx.set(px, y - 2, TILE.EMPTY);
            }
            // Assise sous le segment pour éviter qu'il ne flotte
            if (y + 1 < ctx.H) ctx.set(px, y + 1, TILE.SOLID);
            if (y + 2 < ctx.H) ctx.set(px, y + 2, TILE.SOLID);
            if (y + 3 < ctx.H) ctx.set(px, y + 3, TILE.SOLID);
            if (y + 4 < ctx.H) ctx.set(px, y + 4, TILE.SOLID);
            if (y + 5 < ctx.H) ctx.set(px, y + 5, TILE.SOLID);
        }
    }

    carveTunnel(x1, y1, r1, x2, y2, r2) {
        let dx = x2 - x1;
        let dy = y2 - y1;
        let dist = Math.sqrt(dx*dx + dy*dy);
        let steps = Math.max(1, Math.ceil(dist * 2)); // 0.5 tuile par étape

        for (let i = 0; i <= steps; i++) {
            let t = i / steps;
            let cx = x1 + dx * t;
            let cy = y1 + dy * t;
            let r = r1 + (r2 - r1) * t;
            this.carveCircle(cx, cy, r);
        }
    }

    carveCircle(cx, cy, r) {
        const ctx = this.ctx;
        let minX = Math.floor(cx - r);
        let maxX = Math.ceil(cx + r);
        let minY = Math.floor(cy - r);
        let maxY = Math.ceil(cy + r);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (x >= 2 && x < ctx.W - 2 && y >= 2 && y < ctx.H - 2) {
                    let dx = x - cx;
                    let dy = y - cy;
                    // Forme légèrement ovale pour le tunnel (plus large que haut)
                    if ((dx*dx)*0.8 + (dy*dy)*1.1 <= r*r) {
                        ctx.set(x, y, TILE.EMPTY);
                    }
                }
            }
        }
    }

    applyCellularAutomata() {
        const ctx = this.ctx;
        let newGrid = new Uint8Array(ctx.W * ctx.H);

        // Copier la grille actuelle
        for (let y = 0; y < ctx.H; y++) {
            for (let x = 0; x < ctx.W; x++) {
                newGrid[y * ctx.W + x] = ctx.get(x, y);
            }
        }

        // Lisser (1 seule passe pour ne pas trop détruire)
        for (let y = 2; y < ctx.H - 2; y++) {
            for (let x = 2; x < ctx.W - 2; x++) {
                let currentTile = ctx.get(x, y);

                // Ne pas toucher aux plateformes de base (sol dur sous le joueur)
                // On vérifie si y est la surface d'un segment
                let isSurface = false;
                for (let i = 0; i < ctx.segments.length; i++) {
                    let seg = ctx.segments[i];
                    if (y >= seg.y && y <= seg.y + 2 && x >= seg.x - 1 && x <= seg.x + (seg.len || 1) + 1) {
                        isSurface = true;
                        break;
                    }
                }
                if (isSurface) continue;

                let solidNeighbors = 0;
                for (let ny = -1; ny <= 1; ny++) {
                    for (let nx = -1; nx <= 1; nx++) {
                        if (nx === 0 && ny === 0) continue;
                        if (ctx.get(x + nx, y + ny) === TILE.SOLID) solidNeighbors++;
                    }
                }

                if (solidNeighbors >= 5) {
                    newGrid[y * ctx.W + x] = TILE.SOLID;
                } else if (solidNeighbors <= 3) {
                    newGrid[y * ctx.W + x] = TILE.EMPTY;
                }
            }
        }

        // Appliquer
        for (let y = 0; y < ctx.H; y++) {
            for (let x = 0; x < ctx.W; x++) {
                ctx.set(x, y, newGrid[y * ctx.W + x]);
            }
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TerrainGenerator };
}
