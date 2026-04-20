/* ==========================================================
   SPEEDRUN MAP GENERATOR — DECORATOR
   Ajoute les détails, potions, pics, et finitions.
   ========================================================== */

class Decorator {
    constructor(ctx) {
        this.ctx = ctx;
    }

    generate() {
        this._placeDeathZones();
        this._placeItems();
        this._placeObstacles();
        this._placeStartEnd();
        this._computeStats();
    }

    _placeDeathZones() {
        const ctx = this.ctx;
        // Placer une zone de mort au fond des précipices
        // On cherche les colonnes où il y a du vide au dessus du bord inférieur
        for (let x = 1; x < ctx.W - 1; x++) {
            // Si le sol juste au-dessus du sol absolu est vide, et qu'il y a du vide plus haut
            if (ctx.get(x, ctx.H - 2) === TILE.EMPTY) {
                ctx.set(x, ctx.H - 2, TILE.DEATHZONE);
            }
        }
    }

    _placeItems() {
        const ctx = this.ctx;
        for (const seg of ctx.segments) {
            if (seg.type === 'dash' && ctx.cfg.dash && seg.fromX !== undefined) {
                let px = seg.dir === -1 ? seg.fromX : Math.max(1, seg.fromX - 1);
                let py = seg.fromY - 1;
                if (ctx.get(px, py) === TILE.EMPTY && ctx.get(px, py + 1) === TILE.SOLID) {
                    ctx.set(px, py, TILE.DASH);
                    ctx.items.push({ type: TILE.DASH, x: px, y: py });
                }
            }
            else if (seg.type === 'slide' && ctx.cfg.slide && seg.fromX !== undefined) {
                let px = seg.dir === -1 ? seg.fromX : Math.max(1, seg.fromX - 1);
                let py = seg.y - 1;
                if (ctx.get(px, py) === TILE.EMPTY && ctx.get(px, py + 1) === TILE.SOLID) {
                    ctx.set(px, py, TILE.SLIDE);
                    ctx.items.push({ type: TILE.SLIDE, x: px, y: py });
                }
            }
            else if (seg.type === 'trampoline' && ctx.cfg.trampoline) {
                // Le trampoline est placé au milieu de son petit segment
                const tx = seg.x;
                const ty = seg.y - 1;
                ctx.set(tx, ty, TILE.TRAMPOLINE);
                ctx.items.push({ type: TILE.TRAMPOLINE, x: tx, y: ty });
            }
        }
    }

    _placeObstacles() {
        const ctx = this.ctx;
        const spikeDensity = ctx.cfg.spikeDensity;
        if (spikeDensity === 0) return;

        const maxZones = spikeDensity * 3;
        let placedZones = 0;

        for (let idx = Math.floor(ctx.segments.length * 0.25); idx < ctx.segments.length; idx++) {
            if (placedZones >= maxZones) break;
            const seg = ctx.segments[idx];

            if (['start', 'end', 'turn'].includes(seg.type) || (seg.len && seg.len < 3)) continue;

            if (seg.type === 'slide' && ctx.rng.bool(0.7 * (spikeDensity / 10))) {
                for (let i = 2; i < seg.len - 1; i++) {
                    if (ctx.rng.bool(0.4)) {
                        let ceilY = seg.y - 1;
                        while (ceilY > 0 && ctx.get(seg.x + i, ceilY) === TILE.EMPTY) ceilY--;
                        if (ceilY > 0 && ctx.get(seg.x + i, ceilY + 1) === TILE.EMPTY && ctx.get(seg.x + i, ceilY + 2) === TILE.EMPTY) {
                            ctx.set(seg.x + i, ceilY + 1, TILE.SPIKE_DOWN);
                        }
                    }
                }
                placedZones++;
            }
            else if ((seg.type === 'normal' || seg.type === 'dash') && ctx.rng.bool(0.4 * (spikeDensity / 10))) {
                const ex = seg.x + ctx.rng.int(1, seg.len - 2);
                const ey = seg.y - 1;
                if (ctx.get(ex, seg.y) === TILE.SOLID && ctx.get(ex, ey - 1) === TILE.EMPTY && ctx.get(ex, ey - 2) === TILE.EMPTY) {
                    ctx.set(ex, ey, TILE.SPIKE_UP);
                    placedZones++;
                }
            }
        }
    }

    _placeStartEnd() {
        const ctx = this.ctx;

        // Spawn Player
        const startSeg = ctx.segments.find(s => s.type === 'start');
        if (startSeg) {
            let px = startSeg.x + 1;
            let py = startSeg.y - 1;
            ctx.set(px, py, TILE.PLAYER);
            ctx.playerPos = { x: px, y: py };
        }

        // Finish
        const endSeg = [...ctx.segments].reverse().find(s => s.type === 'end' || s.type === 'normal');
        if (endSeg) {
            let fx = endSeg.x + Math.floor(endSeg.len / 2);
            let fy = endSeg.y - 1;
            ctx.set(fx, fy, TILE.FINISH);
            ctx.finishPos = { x: fx, y: fy };
        }
    }

    _computeStats() {
        const ctx = this.ctx;
        let dc = 0, sc = 0, sp = 0;
        for (let y = 0; y < ctx.H; y++) for (let x = 0; x < ctx.W; x++) {
            const t = ctx.grid[y][x];
            if (t === TILE.DASH) dc++;
            if (t === TILE.SLIDE) sc++;
            if (t === TILE.SPIKE_UP || t === TILE.SPIKE_DOWN || t === TILE.SPIKE_LEFT || t === TILE.SPIKE_RIGHT) sp++;
        }
        const mainSegs = ctx.segments.length;
        const secs = Math.round(30 + mainSegs * 3.5);
        ctx.stats = {
            size: `${ctx.W} × ${ctx.H}`,
            route: `${mainSegs} sections`,
            shortcuts: 0,
            dash: dc, slide: sc, spikes: sp,
            time: secs > 60 ? `${Math.floor(secs / 60)}m${secs % 60}s` : `${secs}s`,
        };
    }
}
