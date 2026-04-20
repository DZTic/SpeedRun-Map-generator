# SpeedRun Map Generator v2.0 🎮

> Générateur de maps speedrun avec **validation physique garantie** et **logique de progression intelligente**.

![Version](https://img.shields.io/badge/version-2.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Caractéristiques

- ✅ **Jouabilité garantie** - Chaque map est validée avec simulation physique
- ✅ **Physique réaliste** - Basé sur les constantes exactes du player.gd
- ✅ **Courbe de difficulté progressive** - De tutoriel à maîtrise
- ✅ **Algorithmes intelligents** - Graphe de niveau avec vérification de connexité
- ✅ **Mécaniques variées** - Dash, Slide, Wall Jump, Trampoline
- ✅ **Export Godot** - Guide de reconstruction pour Godot Engine
- ✅ **Trainer IA** - Apprentissage par votes

## 🚀 Démarrage Rapide

```bash
# Cloner le repository
git clone https://github.com/DZTic/SpeedRun-Map-generator.git

# Lancer
cd SpeedRun-Map-generator
# Ouvrir index.html dans un navigateur
```

## 🎯 Utilisation

1. **Configurer** les paramètres (difficulté, style, mécaniques)
2. **Cliquer** sur "Générer une map"
3. **Valider** les statistiques affichées
4. **Exporter** vers Godot si nécessaire

## 📚 Documentation

- [`IMPROVEMENTS.md`](IMPROVEMENTS.md) - Détails des améliorations v2.0
- [`PLAN_SPEEDRUN_IMPROVEMENT.md`](PLAN_SPEEDRUN_IMPROVEMENT.md) - Architecture technique

## 🏗️ Architecture

```
core.js              # Constantes et classes de base
physics_engine.js    # Simulation physique & validation
level_graph.js       # Graphe de niveau garanti
smart_generator.js   # Générateur intelligent
terrain_generator.js # Génération de terrain
decorator.js         # Items et obstacles
renderer.js          # Rendu canvas
```

## 🎮 Mécaniques Supportées

| Mécanique | Description | Physique Vérifiée |
|-----------|-------------|-------------------|
| Saut | Saut standard | ✅ 6 cases max |
| Dash | Propulsion rapide | ✅ 3.3 cases max |
| Slide | Glissade | ✅ 6.25 cases max |
| Wall Jump | Rebond sur murs | ✅ 3-7 cases |
| Trampoline | Propulseur | ✅ Hauteur variable |

## 🧪 Validation

Chaque map est automatiquement testée pour :
- Connexité spawn → finish
- Accessibilité de tous les segments
- Possibilité physique des mécaniques
- Absence de soft-locks
- Courbe de difficulté équilibrée

## 🤝 Contribution

Les PRs sont les bienvenues ! Voir `IMPROVEMENTS.md` pour la feuille de route.

## 📄 Licence

MIT © DZTic
