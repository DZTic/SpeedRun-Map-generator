/* ==========================================================
   SPEEDRUN MAP GENERATOR — RENDERER
   Affiche la grille sur un canvas HTML5.
   ========================================================== */

class MapRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.tileSize = 16;
        this.zoom = 1;
    }

    setZoom(z) {
        this.zoom = Math.max(0.3, Math.min(3, z));
    }

 render(grid, ctx = null) {
 if (!grid || !grid.length) return;
 const H = grid.length, W = grid[0].length, ts = this.tileSize * this.zoom;
 this.canvas.width = W * ts;
 this.canvas.height = H * ts;
 const c = this.ctx;

 const dzP = this._dzPat(c);

 c.fillStyle = '#060810';
 c.fillRect(0, 0, W * ts, H * ts);

 for (let y = 0; y < H; y++) {
 for (let x = 0; x < W; x++) {
 if (grid[y][x] === TILE.EMPTY) continue;
 this._tile(c, x, y, grid[y][x], ts, dzP);
 }
 }

 c.textAlign = 'center';
 c.textBaseline = 'middle';
 c.font = `${Math.max(8, ts * 0.62)}px serif`;
 for (let y = 0; y < H; y++) {
 for (let x = 0; x < W; x++) {
 const e = EMOJI[grid[y][x]];
 if (e) c.fillText(e, x * ts + ts / 2, y * ts + ts / 2);
 }
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
        let actualTile = tile;
        // Les WALL générés sont traités visuellement comme du terrain normal pour le rendu caverne
        if (actualTile === TILE.WALL) actualTile = TILE.SOLID;

        const col = COLOR[actualTile]; if (!col) return;
        const px = x * ts, py = y * ts;
        ctx.save();
        if (col.glow) { ctx.shadowColor = col.glow; ctx.shadowBlur = ts * 0.85; }
        ctx.fillStyle = actualTile === TILE.DEATHZONE ? dzP : col.fill;
        ctx.fillRect(px, py, ts, ts);
        ctx.shadowBlur = 0;

        ctx.strokeStyle = col.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + .5, py + .5, ts - 1, ts - 1);

        if (actualTile === TILE.SPIKE_UP) {
            ctx.fillStyle = '#fca5a5'; ctx.beginPath();
            ctx.moveTo(px + ts / 2, py + 2); ctx.lineTo(px + ts - 2, py + ts - 2); ctx.lineTo(px + 2, py + ts - 2);
            ctx.closePath(); ctx.fill();
        }
        if (actualTile === TILE.SPIKE_DOWN) {
            ctx.fillStyle = '#fca5a5'; ctx.beginPath();
            ctx.moveTo(px + ts / 2, py + ts - 2); ctx.lineTo(px + ts - 2, py + 2); ctx.lineTo(px + 2, py + 2);
            ctx.closePath(); ctx.fill();
        }
        if (actualTile === TILE.SOLID) {
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fillRect(px, py, ts, 3);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(px, py + 3, ts, 4);
        }
        ctx.restore();
    }
}
