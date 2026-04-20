/* ==========================================================
   SPEEDRUN MAP GENERATOR — TRAINER (Apprentissage par vote humain)
   Implémente un algorithme génétique guidé par les votes du joueur.
   
   Principe :
   1. Génère N maps avec des "gènes" (paramètres de génération variés)
   2. Simule le chemin du joueur et trace les waypoints
   3. Fait voter l'utilisateur (👍 / 👎)
   4. Ajuste les poids des gènes selon les votes (évolution)
   5. La prochaine génération hérite des "bons gènes"
   ========================================================== */

class MapGene {
    constructor(base = null) {
        if (base) {
            // Hériter + muter
            this.difficulty = base.difficulty;
            this.style = base.style;
            this.dashProb = this._mutate(base.dashProb, 0.15);
            this.slideProb = this._mutate(base.slideProb, 0.15);
            this.walljumpProb = this._mutate(base.walljumpProb, 0.10);
            this.trampolineProb = this._mutate(base.trampolineProb, 0.10);
            this.spikeDensity = this._mutate(base.spikeDensity, 1.5, 0, 10);
            this.dzDensity = this._mutate(base.dzDensity, 0.8, 0, 5);
            this.tunnelWidth = this._mutate(base.tunnelWidth, 0.5, 2, 7);
            this.serpentinFactor = this._mutate(base.serpentinFactor, 0.2, 0.2, 1.5);
            this.segmentLengthFactor = this._mutate(base.segmentLengthFactor, 0.2, 0.4, 1.8);
            this.heightVariation = this._mutate(base.heightVariation, 0.2, 0.2, 1.5);
        } else {
            // Gène aléatoire de départ
            this.difficulty = MapGene.randomPick(['easy', 'medium', 'hard', 'extreme']);
            this.style = MapGene.randomPick(['vertical', 'horizontal', 'mixed']);
            this.dashProb = Math.random() * 0.5;
            this.slideProb = Math.random() * 0.5;
            this.walljumpProb = Math.random() * 0.3;
            this.trampolineProb = Math.random() * 0.3;
            this.spikeDensity = Math.random() * 10;
            this.dzDensity = Math.random() * 5;
            this.tunnelWidth = 3 + Math.random() * 4;
            this.serpentinFactor = 0.3 + Math.random() * 1.2;
            this.segmentLengthFactor = 0.5 + Math.random();
            this.heightVariation = 0.3 + Math.random();
        }
        this.score = 0;
        this.votes = 0;
    }

    _mutate(val, delta, min = 0, max = 1) {
        const mutated = val + (Math.random() * 2 - 1) * delta;
        return Math.max(min, Math.min(max, mutated));
    }

    static randomPick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // Convertit le gène en paramètres utilisables par le générateur
    toParams(gridW, gridH, seed) {
        return {
            gridW,
            gridH,
            seed: seed || Math.random().toString(36).substring(2, 10),
            difficulty: this.difficulty,
            style: this.style,
            dash: this.dashProb > 0.2,
            slide: this.slideProb > 0.2,
            walljump: this.walljumpProb > 0.15,
            trampoline: this.trampolineProb > 0.15,
            spikeDensity: this.spikeDensity,
            deathzoneDensity: this.dzDensity,
            // Paramètres étendus pour le trainer
            _dashProb: this.dashProb,
            _slideProb: this.slideProb,
            _walljumpProb: this.walljumpProb,
            _trampolineProb: this.trampolineProb,
            _tunnelWidth: this.tunnelWidth,
            _serpentinFactor: this.serpentinFactor,
            _segmentLengthFactor: this.segmentLengthFactor,
            _heightVariation: this.heightVariation,
        };
    }

    addVote(positive) {
        this.votes++;
        this.score += positive ? 1 : -1;
    }

    get rating() {
        if (this.votes === 0) return 0;
        return this.score / this.votes;
    }

    clone() {
        return Object.assign(new MapGene(), JSON.parse(JSON.stringify(this)));
    }

    describe() {
        const parts = [];
        parts.push(`Diff: ${this.difficulty}`);
        parts.push(`Style: ${this.style}`);
        if (this.dashProb > 0.2) parts.push(`Dash ${Math.round(this.dashProb * 100)}%`);
        if (this.slideProb > 0.2) parts.push(`Slide ${Math.round(this.slideProb * 100)}%`);
        if (this.walljumpProb > 0.15) parts.push(`WJ ${Math.round(this.walljumpProb * 100)}%`);
        if (this.trampolineProb > 0.15) parts.push(`Tramp ${Math.round(this.trampolineProb * 100)}%`);
        parts.push(`Spikes: ${this.spikeDensity.toFixed(1)}`);
        return parts.join(' · ');
    }
}

/* ──────────────────────────────────────────────────────────
   Player Path Simulator
   Simule grossièrement le chemin du joueur en suivant les
   segments de la map pour tracer la route empruntée.
   ────────────────────────────────────────────────────────── */
class PlayerPathSimulator {
    simulate(mapCtx) {
        const path = [];
        const segments = mapCtx.segments;
        if (!segments || segments.length === 0) return path;

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            
            if (seg.type === 'start') {
                // Début : spawn au centre de la plateforme de départ
                path.push({ x: seg.x + Math.floor((seg.len || 2) / 2), y: seg.y - 1, type: 'spawn' });
            } else if (seg.type === 'end') {
                // Arrivée
                path.push({ x: seg.x + Math.floor((seg.len || 2) / 2), y: seg.y - 1, type: 'finish' });
            } else if (seg.type === 'walljump') {
                // Wall jump : on monte le long du mur
                const bottomY = seg.y + seg.wallH;
                const midX = seg.x + (seg.dir === 1 ? -1 : 2);
                path.push({ x: midX, y: bottomY - 1, type: 'walljump_enter' });
                // Points intermédiaires le long du mur
                for (let py = bottomY - 1; py >= seg.y + 1; py -= 2) {
                    path.push({ x: midX, y: py, type: 'walljump_climb' });
                }
                path.push({ x: seg.platformX + Math.floor((seg.len || 2) / 2), y: seg.y - 1, type: 'walljump_exit' });
            } else if (seg.type === 'trampoline') {
                path.push({ x: seg.x + 1, y: seg.y - 1, type: 'trampoline' });
                // Arc de rebond vers le haut
                for (let j = 1; j <= 5; j++) {
                    path.push({ x: seg.x + 1, y: seg.y - 1 - j * 2, type: 'bounce' });
                }
            } else if (seg.type === 'slide') {
                // Glissade : chemin horizontal bas
                const midX = seg.x + Math.floor((seg.len || 2) / 2);
                path.push({ x: seg.x, y: seg.y - 1, type: 'slide_start' });
                path.push({ x: midX, y: seg.y - 1, type: 'slide_mid' });
                path.push({ x: seg.x + (seg.len || 2), y: seg.y - 1, type: 'slide_end' });
            } else if (seg.type === 'dash') {
                // Dash : trajet direct avec arc
                if (seg.fromX !== undefined) {
                    path.push({ x: seg.fromX, y: seg.fromY - 1, type: 'dash_start' });
                }
                path.push({ x: seg.x + Math.floor((seg.len || 2) / 2), y: seg.y - 1, type: 'dash_land' });
            } else if (seg.type === 'normal' || seg.type === 'turn') {
                // Plateforme normale : on marche dessus
                const cx = seg.x + Math.floor((seg.len || 2) / 2);
                // Si on vient d'un fromX, interpoler
                if (seg.fromX !== undefined) {
                    path.push({ x: seg.fromX, y: seg.fromY - 1, type: 'jump_start' });
                }
                path.push({ x: cx, y: seg.y - 1, type: seg.jump ? 'jump_land' : 'walk' });
            }
        }

        return path;
    }

    // Calcule des stats sur la map depuis les segments
    analyzeMap(mapCtx) {
        const segs = mapCtx.segments;
        let wallJumps = 0, dashes = 0, slides = 0, trampolines = 0, normals = 0;
        let totalHeight = 0;
        let startSeg = null, endSeg = null;

        for (const s of segs) {
            if (s.type === 'start') startSeg = s;
            if (s.type === 'end') endSeg = s;
            if (s.type === 'walljump') wallJumps++;
            if (s.type === 'dash') dashes++;
            if (s.type === 'slide') slides++;
            if (s.type === 'trampoline') trampolines++;
            if (s.type === 'normal') normals++;
        }

        if (startSeg && endSeg) {
            totalHeight = startSeg.y - endSeg.y;
        }

        return {
            totalSegments: segs.length,
            wallJumps, dashes, slides, trampolines, normals,
            heightGained: Math.max(0, totalHeight),
            variety: new Set(segs.map(s => s.type)).size,
        };
    }
}

/* ──────────────────────────────────────────────────────────
   TrainerEngine — Moteur d'apprentissage principal
   ────────────────────────────────────────────────────────── */
class TrainerEngine {
    constructor() {
        this.population = []; // Gènes actuels
        this.champions = [];  // Meilleurs gènes gardés
        this.history = [];    // Historique des votes
        this.generation = 0;
        this.totalVotes = 0;
        this.totalPositive = 0;
        
        this.POPULATION_SIZE = 6;
        this.CHAMPION_KEEP = 2; // Nombre de champions à garder

        this._loadFromStorage();
    }

    _loadFromStorage() {
        try {
            const saved = localStorage.getItem('map_trainer_state');
            if (saved) {
                const state = JSON.parse(saved);
                this.generation = state.generation || 0;
                this.totalVotes = state.totalVotes || 0;
                this.totalPositive = state.totalPositive || 0;
                this.champions = (state.champions || []).map(g => Object.assign(new MapGene(), g));
                this.history = state.history || [];
                console.log(`[Trainer] État chargé : gén. ${this.generation}, ${this.totalVotes} votes`);
            }
        } catch (e) {
            console.warn('[Trainer] Pas d\'état sauvegardé.');
        }
    }

    _saveToStorage() {
        try {
            localStorage.setItem('map_trainer_state', JSON.stringify({
                generation: this.generation,
                totalVotes: this.totalVotes,
                totalPositive: this.totalPositive,
                champions: this.champions,
                history: this.history.slice(-50), // Garder les 50 derniers
            }));
        } catch (e) {}
    }

    // Génère un batch de maps pour le vote
    generateBatch(gridW, gridH) {
        this.population = [];
        
        // Créer des gènes variés basés sur les champions
        if (this.champions.length > 0) {
            // Quelques mutations des champions
            for (let i = 0; i < Math.floor(this.POPULATION_SIZE * 0.5); i++) {
                const champ = this.champions[Math.floor(Math.random() * this.champions.length)];
                this.population.push(new MapGene(champ));
            }
            // Quelques complètement aléatoires (exploration)
            while (this.population.length < this.POPULATION_SIZE) {
                this.population.push(new MapGene());
            }
        } else {
            // Première génération : tout aléatoire
            for (let i = 0; i < this.POPULATION_SIZE; i++) {
                this.population.push(new MapGene());
            }
        }

        // Générer les maps
        const maps = this.population.map((gene, i) => {
            const seed = `trainer_gen${this.generation}_${i}_${Date.now()}`;
            const params = gene.toParams(gridW, gridH, seed);
            
            try {
                const ctx = new MapContext(params);
                
                // Appliquer les modificateurs du gène sur le PathGenerator
                const pathGen = new PathGenerator(ctx);
                this._applyGeneToPathGen(pathGen, gene);
                pathGen.generate();
                
                const terrainGen = new TerrainGenerator(ctx);
                terrainGen.tunnelH = gene.tunnelWidth;
                terrainGen.generate();
                
                const decorator = new Decorator(ctx);
                decorator.generate();
                
                // Simuler le chemin joueur
                const simulator = new PlayerPathSimulator();
                const playerPath = simulator.simulate(ctx);
                const analysis = simulator.analyzeMap(ctx);
                
                return { mapCtx: ctx, gene, geneIndex: i, playerPath, analysis, seed, params };
            } catch (e) {
                console.error('[Trainer] Erreur génération map:', e);
                return null;
            }
        }).filter(Boolean);

        return maps;
    }

    _applyGeneToPathGen(pathGen, gene) {
        // Surcharger temporairement les probabilités du PathGenerator
        // via monkey-patching des méthodes de filtrage candidats
        const origVertical = pathGen._buildVertical.bind(pathGen);
        const origHorizontal = pathGen._buildHorizontal.bind(pathGen);
        
        // On modifie les contextes pour refléter les gènes
        const ctx = pathGen.ctx;
        // On peut ajuster directement le D context (segment lengths, jump heights)
        if (ctx.D) {
            const sf = gene.segmentLengthFactor;
            ctx.D.pMin = Math.max(1, Math.round(ctx.D.pMin * sf));
            ctx.D.pMax = Math.max(ctx.D.pMin + 1, Math.round(ctx.D.pMax * sf));
            
            const hv = gene.heightVariation;
            if (ctx.D.vStep) {
                ctx.D.vStep = [
                    Math.max(1, Math.round(ctx.D.vStep[0] * hv)),
                    Math.max(2, Math.round(ctx.D.vStep[1] * hv))
                ];
            }
        }
    }

    // Enregistre un vote (positive = true/false)
    vote(geneIndex, positive) {
        const gene = this.population[geneIndex];
        if (!gene) return;

        gene.addVote(positive);
        this.totalVotes++;
        if (positive) this.totalPositive++;

        this.history.push({
            generation: this.generation,
            geneIndex,
            positive,
            geneDesc: gene.describe(),
            timestamp: Date.now(),
        });

        this._saveToStorage();
    }

    // Évolue vers la prochaine génération
    evolve() {
        this.generation++;

        // Trier par score
        const scored = [...this.population].sort((a, b) => b.rating - a.rating);
        
        // Garder les meilleurs comme champions
        const positives = scored.filter(g => g.rating > 0 && g.votes > 0);
        
        if (positives.length > 0) {
            // Fusionner avec les anciens champions
            this.champions = [...positives, ...this.champions]
                .sort((a, b) => b.rating - a.rating)
                .slice(0, this.CHAMPION_KEEP + positives.length);
            
            // Limiter les champions
            this.champions = this.champions.slice(0, 6);
        }

        console.log(`[Trainer] Évolution → Gén. ${this.generation}. Champions: ${this.champions.length}`);
        this._saveToStorage();
    }

    resetAll() {
        this.population = [];
        this.champions = [];
        this.history = [];
        this.generation = 0;
        this.totalVotes = 0;
        this.totalPositive = 0;
        localStorage.removeItem('map_trainer_state');
    }

    getStats() {
        const favoriteStyles = {};
        const favoriteDiffs = {};
        for (const h of this.history) {
            if (h.positive) {
                const g = this.population[h.geneIndex] || this.champions.find((_, i) => i === h.geneIndex);
                if (g) {
                    favoriteStyles[g.style] = (favoriteStyles[g.style] || 0) + 1;
                    favoriteDiffs[g.difficulty] = (favoriteDiffs[g.difficulty] || 0) + 1;
                }
            }
        }
        
        const posRate = this.totalVotes > 0 ? Math.round(this.totalPositive / this.totalVotes * 100) : 0;
        
        return {
            generation: this.generation,
            totalVotes: this.totalVotes,
            positiveRate: posRate,
            champions: this.champions.length,
        };
    }

    exportChampions() {
        return JSON.stringify(this.champions, null, 2);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MapGene, PlayerPathSimulator, TrainerEngine };
}
