/* ==========================================================
   SPEEDRUN MAP GENERATOR — PATH GENERATOR
   Crée le squelette du chemin (segments logiques et sauts).
   Génère une route plus en "serpentin" naturel.
   ========================================================== */

class PathGenerator {
    constructor(ctx) {
        this.ctx = ctx;
    }

    generate() {
        const style = this.ctx.cfg.style;
        if (style === 'vertical') {
            this._buildVertical();
        } else if (style === 'horizontal') {
            this._buildHorizontal();
        } else {
            // Mixed : un peu d'horizontal puis du vertical
            this._buildHorizontal(Math.floor(this.ctx.H * 0.5));
            this._buildVertical(Math.floor(this.ctx.H * 0.5));
        }
    }

    _buildVertical(startY) {
        const ctx = this.ctx;
        const D = ctx.D;
        const W = ctx.W;
        let cy = startY || (ctx.H - 3);

        const gapW = D.jW - 1;
        const midX = Math.floor(W / 2);

        let startLen = ctx.rng.int(D.pMin, D.pMax);
        let cx = Math.floor(W / 2) - Math.floor(startLen / 2);
        ctx.segments.push({ type: 'start', x: cx, y: cy, len: startLen });

        // On va garder une direction pour plusieurs sauts pour faire un effet serpentin (zigzag ample)
        let dir = ctx.rng.next() < 0.5 ? 1 : -1;
        let stepsInDir = ctx.rng.int(2, 4);

        let wjCooldown = 0;
        let safety = 0;
        const maxSegs = 60;
        let prevCh = 'normal';

        const TRANSITIONS = {
            normal: ['normal', 'dash', 'slide', 'walljump', 'trampoline'],
            dash: ['normal', 'dash', 'slide', 'walljump', 'trampoline'],
            slide: ['normal', 'dash', 'slide', 'walljump', 'trampoline'],
            walljump: ['dash', 'slide', 'trampoline'], // Eviter d'enchainer les walljumps
            trampoline: ['dash', 'slide', 'walljump', 'trampoline'],
        };

        while (cy > 5 && safety < maxSegs) {
            safety++;

            stepsInDir--;
            if (stepsInDir <= 0) {
                dir *= -1;
                stepsInDir = ctx.rng.int(2, 4);
            }

            const vStep = ctx.rng.next() < 0.5 ? D.vStep[0] : D.vStep[1];
            const nextY = cy - vStep;
            if (nextY <= 3) break;

            // Vérifier si on tape le bord, si oui, forcer le changement de direction
            if ((dir === 1 && cx > W - 15) || (dir === -1 && cx < 15)) {
                dir *= -1;
                stepsInDir = ctx.rng.int(2, 4);
            }

            let goRight = (dir === 1);

            const candidates = (TRANSITIONS[prevCh] || ['normal']).filter(ch => {
                if (ch === 'normal') return true;
                if (ch === 'dash') return ctx.cfg.dash && ctx.rng.bool(0.3);
                if (ch === 'slide') return ctx.cfg.slide && ctx.rng.bool(0.3);
                if (ch === 'trampoline') return ctx.cfg.trampoline && ctx.rng.bool(0.25);
                // Réduire drastiquement la probabilité et augmenter le cooldown des walljumps
                if (ch === 'walljump') return ctx.cfg.walljump && wjCooldown <= 0 && ctx.rng.bool(0.15);
                return false;
            });

            let ch = ctx.rng.pick(candidates.length ? candidates : ['normal']);
            prevCh = ch;

            if (ch === 'walljump') {
                cx = this._segWallJump(cx, cy, nextY, goRight);
                wjCooldown = 4; // Long cooldown pour éviter d'en avoir partout
                // Le walljump change naturellement la direction en sortie souvent, on s'adapte
                dir *= -1;
                stepsInDir = ctx.rng.int(2, 4);
            } else {
                let leftMax = Math.max(2, cx - 12);
                let rightMin = Math.min(W - 12, cx + 2);

                if (ch === 'dash') cx = this._segDash(cx, cy, nextY, goRight);
                else if (ch === 'slide') cx = this._segSlide(cx, cy, nextY, goRight);
                else if (ch === 'trampoline') cx = this._segTrampoline(cx, cy, nextY, goRight);
                else cx = this._segNormal(cx, cy, nextY, goRight, leftMax, rightMin, ctx.rng.int(D.pMin, D.pMax));
                wjCooldown = Math.max(0, wjCooldown - 1);
            }

            cy = nextY;
        }

        ctx.segments.push({ type: 'end', x: cx, y: cy, len: D.pMin + 1 });
    }

    _buildHorizontal(limitY) {
        const ctx = this.ctx;
        const D = ctx.D;
        let cy = ctx.H - 4;
        let cx = 2;
        let dir = 1; // 1 right, -1 left
        let safety = 0;
        const maxSafety = ctx.W * 3;

        let startLen = D.pMax;
        ctx.segments.push({ type: 'start', x: cx, y: cy, len: startLen });
        cx += startLen;

        let prevCh = 'normal';
        let wjCooldown = 0;

        const TRANSITIONS = {
            normal: ['normal', 'dash', 'slide', 'walljump', 'trampoline', 'normaljump'],
            normaljump: ['normal', 'dash', 'slide', 'walljump', 'trampoline', 'slidejump'],
            dash: ['dash', 'slide', 'walljump', 'trampoline', 'normaljump'],
            slide: ['dash', 'slide', 'walljump', 'trampoline', 'normaljump', 'slidejump'],
            walljump: ['dash', 'slide', 'trampoline', 'normaljump'],
            trampoline: ['dash', 'slide', 'walljump', 'normaljump'],
            slidejump: ['dash', 'slide', 'walljump', 'trampoline', 'normaljump']
        };

        while (cy > (limitY || 5) && safety < maxSafety) {
            safety++;
            const terLen = ctx.rng.int(D.pMin + 1, D.pMax + 2);

            // Laisser la hauteur varier légèrement pour un effet organique,
            // mais on garde une tendance globale (par ex on monte un peu)
            let yDir = ctx.rng.next() > 0.6 ? 1 : -1;
            let nextY = cy + yDir * ctx.rng.int(1, D.jH - 1);
            nextY = Math.max(4, Math.min(ctx.H - 5, nextY));

            // Pour faire un serpentin, on ne va pas forcément jusqu'au bout du bord.
            // On peut tourner aléatoirement si on est assez loin du bord opposé.
            const minDistanceToEdge = D.jW + terLen + ctx.rng.int(5, 10);
            let forcedTurn = (dir === 1 && cx + minDistanceToEdge >= ctx.W) || (dir === -1 && cx - minDistanceToEdge <= 0);

            // Chance aléatoire de tourner avant la fin si on a de la place
            let randomTurn = ctx.rng.bool(0.1) && ((dir === 1 && cx > ctx.W * 0.6) || (dir === -1 && cx < ctx.W * 0.4));

            let mustTurn = forcedTurn || randomTurn;

            if (mustTurn) {
                const turnLen = D.pMax;
                // Un "turn" horizontal = on monte d'un étage
                const turnY = cy - ctx.rng.int(7, 10);
                if (turnY <= (limitY || 5)) break;

                const gap = ctx.rng.int(1, D.jW - 1);
                let tx = dir === 1 ? Math.min(cx + gap, ctx.W - turnLen - 2) : Math.max(2, cx - gap - turnLen);

                ctx.segments.push({ type: 'turn', x: tx, y: turnY, len: turnLen, dir: dir });

                cx = dir === 1 ? tx : tx + turnLen - 1;
                cy = turnY;
                dir *= -1;
                continue;
            }

            const candidates = (TRANSITIONS[prevCh] || ['normal']).filter(ch => {
                if (ch === 'normal' || ch === 'normaljump') return true;
                if (ch === 'dash') return ctx.cfg.dash && ctx.rng.bool(0.25);
                if (ch === 'slide') return ctx.cfg.slide && ctx.rng.bool(0.25);
                if (ch === 'trampoline') return ctx.cfg.trampoline && ctx.rng.bool(0.2);
                if (ch === 'walljump') return ctx.cfg.walljump && wjCooldown <= 0 && ctx.rng.bool(0.1); // walljump rare
                if (ch === 'slidejump') return ctx.cfg.slide && ctx.rng.bool(0.2);
                return false;
            });

            let ch = ctx.rng.pick(candidates);
            prevCh = ch;
            let result;

            if (ch === 'walljump') {
                result = this._hSegWallJump(cx, cy, nextY, terLen, dir);
                wjCooldown = 5; // Long cooldown
            } else {
                if (ch === 'dash') result = this._hSegDash(cx, cy, nextY, terLen, dir);
                else if (ch === 'slide') result = this._hSegSlide(cx, cy, nextY, terLen, dir);
                else if (ch === 'trampoline') result = this._hSegTrampoline(cx, cy, nextY, terLen, dir);
                else if (ch === 'normaljump') result = this._hSegJump(cx, cy, nextY, terLen, dir);
                else if (ch === 'slidejump') result = this._hSegSlideJump(cx, cy, nextY, terLen, dir);
                else result = this._hSegNormal(cx, cy, nextY, terLen, dir);
                wjCooldown = Math.max(0, wjCooldown - 1);
            }

            if (!result) break;
            cx = result.nextX; cy = result.nextY;
        }

        const endLen = D.pMin + 1;
        let endX = dir === 1 ? Math.min(cx, ctx.W - endLen - 2) : Math.max(2, cx - endLen);
        ctx.segments.push({ type: 'end', x: endX, y: cy, len: endLen });
    }

    // --- Vertical Segments ---
    _segNormal(cx, cy, nextY, goRight, leftMax, rightMin, len) {
        const ctx = this.ctx;
        let nx;
        if (goRight) {
            nx = Math.min(cx + ctx.rng.int(2, ctx.D.jW), ctx.W - len - 1);
        } else {
            nx = Math.max(2, cx - ctx.rng.int(2, ctx.D.jW) - len);
        }
        nx = Math.max(2, Math.min(ctx.W - len - 2, nx));

        ctx.segments.push({ type: 'normal', x: nx, y: nextY, len, fromX: goRight ? cx - 1 : cx + 1, fromY: cy });
        return goRight ? nx + len - 1 : nx;
    }

    _segWallJump(cx, cy, nextY, goRight) {
        const ctx = this.ctx;
        const gapToWall = Math.max(1, ctx.D.jW - 2);
        const wallThick = 2;
        let wx = goRight ? cx + gapToWall : cx - gapToWall - wallThick;
        wx = Math.max(3, Math.min(ctx.W - wallThick - 4, wx));

        const approachLen = ctx.rng.int(ctx.D.pMin, ctx.D.pMax);
        let appX = goRight ? Math.max(2, wx - gapToWall - approachLen) : wx + wallThick + gapToWall;

        const exitLen = ctx.rng.int(ctx.D.pMin, ctx.D.pMax);
        let exitX = goRight ? wx + wallThick + 1 : Math.max(2, wx - exitLen - 1);

        ctx.segments.push({ type: 'normal', x: appX, y: cy, len: approachLen });
        ctx.segments.push({ type: 'walljump', x: wx, y: nextY, wallH: cy - nextY, platformX: exitX, len: exitLen, dir: goRight ? 1 : -1 });
        return goRight ? exitX + exitLen - 1 : exitX;
    }

    _segDash(cx, cy, nextY, goRight) {
        const ctx = this.ctx;
        const dashGap = ctx.D.jW + 2;
        const launchLen = ctx.rng.int(ctx.D.pMin, ctx.D.pMax);
        let lx = goRight ? Math.max(2, cx) : Math.max(2, cx - launchLen);

        const landLen = ctx.rng.int(ctx.D.pMin, ctx.D.pMax);
        let landX = goRight ? Math.min(ctx.W - landLen - 2, lx + launchLen + dashGap) : Math.max(2, lx - dashGap - landLen);

        ctx.segments.push({ type: 'normal', x: lx, y: cy, len: launchLen });
        ctx.segments.push({ type: 'dash', x: landX, y: nextY, len: landLen, fromX: lx, fromY: cy, dir: goRight ? 1 : -1 });
        return goRight ? landX : landX + landLen - 1;
    }

    _segSlide(cx, cy, nextY, goRight) {
        const ctx = this.ctx;
        const len = ctx.rng.int(...ctx.D.slideL);
        let sx = goRight ? Math.min(ctx.W - len - 2, cx + 2) : Math.max(2, cx - len - 2);

        ctx.segments.push({ type: 'slide', x: sx, y: nextY, len, dir: goRight ? 1 : -1 });
        return goRight ? sx + len - 1 : sx;
    }

    _segTrampoline(cx, cy, nextY, goRight) {
        const ctx = this.ctx;
        const len = 2;
        const gap = 2;
        let px = goRight ? Math.min(ctx.W - len - 2, cx + gap) : Math.max(2, cx - gap - len);

        ctx.segments.push({ type: 'trampoline', x: px, y: nextY + 1, len });
        return goRight ? px + len - 1 : px;
    }

    // --- Horizontal Segments ---
    _hSegNormal(cx, cy, nextY, terLen, dir) {
        const ctx = this.ctx;
        let diffY = cy - nextY;
        if (diffY > ctx.D.jH - 1) { nextY = cy - (ctx.D.jH - 1); diffY = ctx.D.jH - 1; }
        let maxGap = diffY > 0 ? Math.max(1, ctx.D.jW - Math.ceil(diffY/2) - 1) : ctx.D.jW - 1;
        const gap = ctx.rng.int(1, Math.max(1, maxGap));
        const nx = dir === 1 ? cx + gap : cx - gap - terLen;

        if (nx <= 2 || nx + terLen >= ctx.W - 2) return null;
        ctx.segments.push({ type: 'normal', x: nx, y: nextY, len: terLen });
        return { nextX: dir === 1 ? nx + terLen : nx, nextY };
    }

    _hSegJump(cx, cy, nextY, terLen, dir) {
        const ctx = this.ctx;
        let diffY = cy - nextY;
        if (diffY > ctx.D.jH - 1) { nextY = cy - (ctx.D.jH - 1); diffY = ctx.D.jH - 1; }
        let maxGap = diffY > 0 ? Math.max(2, ctx.D.jW - Math.ceil(diffY/2)) : ctx.D.jW;
        const gap = ctx.rng.int(Math.max(2, maxGap - 1), maxGap);
        const nx = dir === 1 ? cx + gap : cx - gap - terLen;

        if (nx <= 2 || nx + terLen >= ctx.W - 2) return null;
        ctx.segments.push({ type: 'normal', x: nx, y: nextY, len: terLen, jump: true });
        return { nextX: dir === 1 ? nx + terLen : nx, nextY };
    }

    _hSegDash(cx, cy, nextY, terLen, dir) {
        const ctx = this.ctx;
        const dashGap = ctx.D.jW + 2;
        const nx = dir === 1 ? cx + dashGap : cx - dashGap - terLen;
        if (nx <= 2 || nx + terLen >= ctx.W - 2) return null;

        let diffY = cy - nextY;
        if (diffY > ctx.D.jH) nextY = cy - ctx.D.jH;

        ctx.segments.push({ type: 'dash', x: nx, y: nextY, len: terLen, fromX: cx, fromY: cy, dir });
        return { nextX: dir === 1 ? nx + terLen : nx, nextY };
    }

    _hSegSlide(cx, cy, nextY, terLen, dir) {
        const ctx = this.ctx;
        const slideLen = ctx.rng.int(...ctx.D.slideL);
        const sx = dir === 1 ? cx + 1 : cx - slideLen - 1;
        if (sx <= 2 || sx + slideLen >= ctx.W - 2) return null;

        ctx.segments.push({ type: 'slide', x: sx, y: cy, len: slideLen, fromX: cx, dir });

        const ex = dir === 1 ? sx + slideLen : sx - terLen;
        if (ex > 2 && ex + terLen < ctx.W - 2) {
            ctx.segments.push({ type: 'normal', x: ex, y: cy, len: terLen });
            return { nextX: dir === 1 ? ex + terLen : ex, nextY: cy };
        }
        return { nextX: dir === 1 ? sx + slideLen : sx, nextY: cy };
    }

    _hSegWallJump(cx, cy, nextY, terLen, dir) {
        const ctx = this.ctx;
        const wallThick = 2;
        const gapToWall = Math.max(1, ctx.D.jW - 2);
        const wx = dir === 1 ? cx + gapToWall : cx - gapToWall - wallThick;
        if (wx <= 3 || wx + wallThick + terLen + 3 >= ctx.W) return null;

        const topY = cy - ctx.rng.int(...ctx.D.wH);
        if (topY <= 3) return this._hSegNormal(cx, cy, nextY, terLen, dir);

        const entLen = ctx.D.pMin;
        const entX = dir === 1 ? Math.max(2, wx - gapToWall - entLen) : wx + wallThick + gapToWall;
        ctx.segments.push({ type: 'normal', x: entX, y: cy, len: entLen });

        const exitX = dir === 1 ? wx + wallThick + 1 : wx - terLen - 1;
        ctx.segments.push({ type: 'walljump', x: wx, y: topY, wallH: cy - topY, platformX: exitX, len: terLen, dir });

        return { nextX: dir === 1 ? exitX + terLen : exitX, nextY: topY };
    }

    _hSegSlideJump(cx, cy, nextY, terLen, dir) {
        const ctx = this.ctx;
        const slideLen = ctx.rng.int(...ctx.D.slideL);
        const sx = dir === 1 ? cx + 1 : cx - slideLen - 1;
        if (sx <= 2 || sx + slideLen >= ctx.W - 2) return null;

        ctx.segments.push({ type: 'slide', x: sx, y: cy, len: slideLen, fromX: cx, dir });

        const gap = ctx.rng.int(ctx.D.jW + 1, Math.floor(ctx.D.jW * 1.5));
        const ex = dir === 1 ? sx + slideLen + gap : sx - gap - terLen;
        if (ex <= 2 || ex + terLen >= ctx.W - 2) return null;

        ctx.segments.push({ type: 'normal', x: ex, y: nextY, len: terLen, jump: true });
        return { nextX: dir === 1 ? ex + terLen : ex, nextY };
    }

    _hSegTrampoline(cx, cy, nextY, terLen, dir) {
        const ctx = this.ctx;
        const gap = 2;
        const tx = dir === 1 ? cx + gap : cx - gap - 1;
        if (tx <= 2 || tx + 1 >= ctx.W - 2) return null;

        ctx.segments.push({ type: "trampoline", x: tx, y: cy, len: 2 });

        const jumpH = ctx.rng.int(5, 8);
        const targetY = Math.max(4, cy - jumpH);
        const targetX = dir === 1 ? tx + ctx.rng.int(2, 4) : tx - ctx.rng.int(2, 4) - terLen;

        if (targetX <= 2 || targetX + terLen >= ctx.W - 2) return { nextX: dir === 1 ? tx + 2 : tx, nextY: cy };

        ctx.segments.push({ type: "normal", x: targetX, y: targetY, len: terLen });
        return { nextX: dir === 1 ? targetX + terLen : targetX, nextY: targetY };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PathGenerator };
}
