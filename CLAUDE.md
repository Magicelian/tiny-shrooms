# Tiny Shrooms

Jeu idle de bureau (Tauri 2 + Three.js + Preact, Mac d'abord). Le **cahier des charges**
([cahier-des-charges.md](cahier-des-charges.md)) fait foi : vision, architecture, étapes, décisions.

## Commandes

- `pnpm dev` : lance l'application (Vite sur le port 1420 + shell Tauri).
- `pnpm test` : tests Vitest · `pnpm typecheck` : contrôle des types.
- Rust compile dans `~/Library/Caches/tiny_shrooms/target` (voir `.cargo/config.toml`), hors de OneDrive.

## Structure

- `apps/desktop` : point d'entrée ; `src/` frontend et worker, `src-tauri/` shell Rust.
- `packages/engine` : moteur pur, sans DOM ni Three.js ; `src/contrat.ts` fixe les échanges avec le frontend,
  `src/contenu.ts` la forme des données d'équilibrage, dont les valeurs vivent dans `packages/content`.
- `packages/content` : chiffres de la V1 et test d'une heure simulée.
- `packages/renderer` : îlot Three.js pixelisé (rendu à ½, passe de contours, toon, caméra iso).
- Les autres paquets du cahier (`ui`, `i18n`) sont à créer.

## Conventions

- Identifiants, commentaires et textes en **français**.
- Le frontend envoie des commandes et affiche des instantanés ; il ne modifie jamais l'état.

## Où on en est

- **Étape 0 validée** (commit `09566a8`). macOS gèle le Worker fenêtre cachée : le moteur doit
  rattraper le temps écoulé sur l'horloge réelle, seule une veille signalée par Rust met en pause.
- **Contrat posé** : `packages/engine/src/contrat.ts` (grille carrée, repère en tête de fichier).
- **Ordre choisi** : contrat (types des instantanés et commandes) → étape 3 (îlot pixelisé nourri
  de fausses données) → étapes 1 et 2 (moteur) branchées ensuite.
- **Étape 1 validée** : horloge qui rattrape tout sauf la veille, stocks, production, chantiers, commandes.
  Placement sans contrôle et sans habitants : c'est l'étape 2, puis brancher `Moteur` dans un Worker
  à la place du faux moteur.
- **Étape 3 validée** : `apps/desktop/src/faux-moteur.ts` nourrit
  l'îlot de fausses données (à remplacer par le vrai moteur). Caméra : ←/→ ou Q/E tournent, Z ou molette zooment.
  Rendu à ½ de la fenêtre (⅓ était illisible à 320 px) ; coût mesuré : 2,9 ms par image.
- `pnpm --filter desktop vite` + `.claude/launch.json` : aperçu dans le navigateur, sans Tauri.
