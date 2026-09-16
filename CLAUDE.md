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
- `packages/ui` : interface Preact au survol ; `ControleurInterface` reçoit les messages du moteur et
  traduit la souris en commandes. `packages/i18n` : chaînes FR, `t('cle', { variables })`.

## Conventions

- Identifiants, commentaires et textes en **français**.
- Le frontend envoie des commandes et affiche des instantanés ; il ne modifie jamais l'état.

## Où on en est

- **Étape 0 validée**. macOS gèle le Worker fenêtre cachée : le moteur rattrape le temps écoulé sur
  l'horloge réelle, seule une veille signalée par Rust met en pause. **Rust ne détecte pas encore la
  veille** : à faire à l'étape 5, le Worker n'a qu'à relayer `veille` / `reveil` au moteur.
- **Contrat** : `packages/engine/src/contrat.ts` (grille carrée, repère en tête de fichier).
- **Étape 3 validée** : rendu à ½ de la fenêtre (⅓ était illisible à 320 px), 2,9 ms par image.
  Caméra : boutons en bas à droite, ←/→ ou Q/E, Z ou molette.
- **Étapes 1 et 2 validées** : moteur complet jusqu'aux habitants, branché dans `apps/desktop/src/moteur-worker.ts`.
- **Étape 4 validée**. Fenêtre sans le focus :
  la vue web ne reçoit pas la souris, Rust surveille le curseur et émet `survol` (vrai/faux). L'aperçu fantôme utilise
  `emplacementRefuse` / `bonusVoisinage`, fonctions pures du moteur. JSX : `oxc.jsx` dans `vite.config.ts`.
- **Prochaine étape : 5** (sauvegarde et pause).
- `pnpm --filter desktop vite` + `.claude/launch.json` : aperçu dans le navigateur, sans Tauri.
