# Tiny Shrooms

Jeu idle de bureau (Tauri 2 + Three.js + Preact, Mac d'abord). Le **cahier des charges**
([cahier-des-charges.md](cahier-des-charges.md)) fait foi : vision, architecture, étapes, décisions.

## Commandes

- `pnpm dev` : lance l'application (Vite sur le port 1420 + shell Tauri).
- `pnpm test` : tests Vitest · `pnpm typecheck` : contrôle des types.
- Rust compile dans `~/Library/Caches/tiny_shrooms/target` (voir `.cargo/config.toml`), hors de OneDrive.

## Structure

- `apps/desktop` : point d'entrée ; `src/` frontend et worker, `src-tauri/` shell Rust.
- `packages/engine` : moteur pur, sans DOM ni Three.js. Les autres paquets du cahier sont à créer.

## Conventions

- Identifiants, commentaires et textes en **français**.
- Le frontend envoie des commandes et affiche des instantanés ; il ne modifie jamais l'état.

## Où on en est

- **Étape 0 validée** (commit `09566a8`). macOS gèle le Worker fenêtre cachée : le moteur doit
  rattraper le temps écoulé sur l'horloge réelle, seule une veille signalée par Rust met en pause.
- **Contrat posé** : `packages/engine/src/contrat.ts` (grille carrée, repère en tête de fichier).
- **Ordre choisi** : contrat (types des instantanés et commandes) → étape 3 (îlot pixelisé nourri
  de fausses données) → étapes 1 et 2 (moteur) branchées ensuite.
- `apps/desktop/src/sonde-worker.ts` est une sonde de l'étape 0, à retirer quand le moteur arrive.
