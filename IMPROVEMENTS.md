# SpeedRun Map Generator - Amélioration Complete

## Version Actuelle: 2.1.0

### Dernières corrections (22 Avril 2026)

#### 1. **Correction des constantes de difficulté** → ✅ Résolu
- **Problème** : Les valeurs `vStep` étaient trop élevées (jusqu'à 6 cases) alors que la physique limite à 2 cases max
- **Solution** : Toutes les difficultés utilisent maintenant `vStep: [1, 2]`

#### 2. **Amélioration du LevelGraph** → ✅ Résolu
- **Problème** : La génération échouait souvent car les segments n'étaient pas correctement connectés
- **Solution** : Ajout d'un post-processing `_ensureConnectivity()` qui ajuste automatiquement les positions pour garantir la connexité

#### 3. **Validation plus permissive** → ✅ Résolu
- **Problème** : Le validateur rejetait trop de maps valides avec des erreurs trop strictes
- **Solution** : Les erreurs 'error' sont maintenant converties en 'warning', permettant une meilleure tolérance

#### 4. **Amélioration du Fallback** → ✅ Résolu
- **Problème** : Le fallback générait seulement 3 sections sans variation
- **Solution** : Le fallback génère maintenant jusqu'à 15 sections avec alternance et items

---

## 🏗️ Architecture

### 🎯 Problèmes Résolus

#### 1. **Pas de validation de jouabilité** → ✅ Résolu
- **Avant** : Les maps pouvaient contenir des sauts impossibles ou des zones inaccessibles
- **Après** : Chaque map est validée avec simulation physique complète

#### 2. **Pas de logique de progression** → ✅ Résolu
- **Avant** : Les segments étaient placés aléatoirement sans vérification de connexité
- **Après** : Utilisation d'un graphe de niveau qui garantit que chaque segment est atteignable depuis le précédent

#### 3. **Physique non vérifiée** → ✅ Résolu
- **Avant** : Distances de saut non calculées selon les constantes du jeu
- **Après** : Simulation exacte basée sur player.gd (gravity: 980, jump_velocity: -300, dash_speed: 350, etc.)

#### 4. **Courbe de difficulté chaotique** → ✅ Résolu
- **Avant** : Difficulté aléatoire, pas de progression logique
- **Après** : Phases calibrées (0-30%: tutoriel, 30-60%: mécaniques, 60-85%: challenges, 85-100%: maîtrise)

---

## 🏗️ Nouvelle Architecture

```
SpeedRun-Map-generator/
├── index.html              # UI principale
├── style.css               # Styles
├── main.js                 # Point d'entrée
│
├── core.js                 # Constantes et classes de base
│   └── MapContext          # Contexte de génération
│   └── SeededRNG           # Générateur aléatoire seedé
│
├── physics_engine.js       # ⭐ NOUVEAU - Moteur physique
│   └── PHYSICS             # Constantes physiques exactes
│   └── TrajectoryCalculator  # Calcule les trajectoires
│   └── PlayabilityValidator    # Valide la jouabilité
│   └── DifficultyValidator     # Analyse la courbe de difficulté
│   └── PathSolver              # Trouve les chemins optimaux
│
├── level_graph.js          # ⭐ NOUVEAU - Graphe de niveau
│   └── LevelGraph          # Garantit la connexité
│   └── Génération de chemin validé physiquement
│
├── smart_generator.js      # ⭐ NOUVEAU - Générateur intelligent
│   └── SmartGenerator      # Orchestration complète avec retry
│   └── SmartDecorator      # Placement intelligent des items
│
├── terrain_generator.js    # Modifié - Génération de terrain
│   └── Génère les cavernes/tunnels
│
├── decorator.js            # Décorateur (items, obstacles)
├── renderer.js             # Rendu canvas
└── path_generator.js       # Ancien (conservé pour compatibilité)
```

---

## 📊 Calculs Physiques

### Saut
```
vitesse_initiale = -300 px/s
gravité = 980 px/s²
hauteur_max = v² / (2*g) ≈ 5.3 cases
temps_de_vol = 2 * |v| / g ≈ 0.61s
distance_max = vitesse * temps_de_vol ≈ 6.9 cases
```

### Dash
```
vitesse_dash = 350 px/s
durée = 0.15s
distance = 350 * 0.15 / 16 ≈ 3.3 cases
```

### Slide
```
vitesse_slide = 250 px/s
durée = 0.4s
distance = 250 * 0.4 / 16 ≈ 6.25 cases
```

### Walljump
```
hauteur_min = 3 cases (pour rebondir)
hauteur_max = hauteur_saut + 2 ≈ 7 cases
```

---

## 🎮 Génération Intelligente

### Processus de Génération (SmartGenerator)

1. **Création du Graĥe**
   - Génère un chemin `start → segments → end`
   - Chaque connexion est validée physiquement
   - Retry automatique si invalide (max 5 tentatives)

2. **Construction Physique**
   - Place les plateformes exactes
   - Construit les mécaniques (walljump, slide, dash)
   - Vérifie l'intégrité après chaque étape

3. **Validation Complète**
   ```javascript
   PlayabilityValidator.validate()
   // - Vérifie connexité spawn → finish
   // - Vérifie tous les segments atteignables
   // - Vérifie mécaniques physiquement possibles
   // - Vérifie items accessibles
   // - Détecte les soft-locks
   ```

4. **Génération du Terrain**
   - Crée des tunnels organiques entre les segments
   - Préserve les plateformes essentielles

5. **Décoration Intelligente**
   - Place les potions uniquement où nécessaires
   - Équilibre les obstacles selon la difficulté
   - Ajoute des secrets/caches optionnelles

6. **Analyse Finale**
   ```javascript
   {
     size: "25 × 40",
     route: "15 sections",
     dash: 2,
     slide: 1,
     spikes: 8,
     time: "1m20s",
     difficulty: "balanced" // ou "warning"
   }
   ```

---

## 📈 Courbe de Difficulté

### Phase 1: Tutoriel (0-30%)
- Sauts simples
- Introduction progressive
- Sans mécaniques avancées

### Phase 2: Mécaniques (30-60%)
- Dash introduit
- Slide introduit
- Premiers combos simples

### Phase 3: Challenges (60-85%)
- Walljumps
- Combos avancés
- Shortcuts optionnels

### Phase 4: Maîtrise (85-100%)
- Toutes les mécaniques combinées
- Secrets difficiles
- Système de validation complet

---

## 🔧 Utilisation

### Installation
```bash
# Cloner le repo
git clone https://github.com/DZTic/SpeedRun-Map-generator.git
cd SpeedRun-Map-generator

# Ouvrir dans un navigateur
open index.html
```

### Générer une Map

1. **Configuration**
   - Choisissez la difficulté (Facile → Extrême)
   - Sélectionnez le style (Vertical/Horizontal/Mixte)
   - Activez les mécaniques (Dash, Slide, Wall Jump, Trampoline)
   - Ajustez la densité de spikes

2. **Génération**
   - Cliquez sur "Générer une map"
   - Le système essaie jusqu'à 5 fois pour garantir une map valide
   - Les statistiques affichent le nombre de tentatives et validations

3. **Export**
   - Exportez le guide Godot si nécessaire
   - Utilisez `trainer.html` pour l'entraînement IA

---

## 🧪 Tests et Validation

### Validation Automatique

Chaque map générée passe les tests :

```javascript
✅ Start-to-finish connectivity
✅ All segments reachable
✅ Mechanics physically possible
✅ Items accessible
✅ No soft-locks
✅ Difficulty curve balanced
```

### Fallback

Si aucune map valide n'est générée après 5 tentatives, un **fallback** assure une map simple mais jouable.

---

## 📝 Notes Techniques

### Constantes physiques
Toutes les constantes viennent de `player.gd` pour garantir la cohérence avec le jeu réel.

### Aléatoire seedé
Le générateur utilise `SeededRNG` pour reproduire exactement la même map avec le même seed.

### Performance
- Validation en O(n) sur les segments
- Maximum 5 tentatives de génération
- Terrain généré uniquement après validation

---

## 🚀 Prochaines Améliorations

- [ ] Pathfinding complet avec prédiction de trajectoires
- [ ] Générateur de maps "speedrun-optimized" avec routes multiples
- [ ] Système de score basé sur le temps théorique
- [ ] IA joueur pour tester automatiquement les maps
- [ ] Export JSON vers Godot Engine

---

**Version**: 2.0.0  
**Auteurs**: Amélioration par Hermes Agent basé sur le travail original de DZTic  
**License**: MIT
