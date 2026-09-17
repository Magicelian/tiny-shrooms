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
  l'horloge réelle, seule une veille signalée par Rust met en pause.
- **Contrat** : `packages/engine/src/contrat.ts` (grille carrée, repère en tête de fichier).
- **Étape 3 validée** : rendu à ½ de la fenêtre (⅓ était illisible à 320 px), 2,9 ms par image.
  Caméra : boutons en bas à droite, ←/→ ou Q/E, Z ou molette.
- **Étapes 1 et 2 validées** : moteur complet jusqu'aux habitants, branché dans `apps/desktop/src/moteur-worker.ts`.
- **Étape 4 validée**. Fenêtre sans le focus :
  la vue web ne reçoit pas la souris, Rust surveille le curseur et émet `survol` (vrai/faux). L'aperçu fantôme utilise
  `emplacementRefuse` / `bonusVoisinage`, fonctions pures du moteur. JSX : `oxc.jsx` dans `vite.config.ts`.
- **Étape 5 validée**. Format et migrations :
  `packages/engine/src/sauvegarde.ts`. Fichiers : `src-tauri/src/sauvegarde.rs`, dans
  `~/Library/Application Support/fr.magicelian.tinyshrooms/` (`partie.json` + `partie.1..3.json`).
  Veille : `src-tauri/src/veille.rs` (NSWorkspace), l'événement porte l'instant de l'endormissement.
  « Quitter » demande d'abord la sauvegarde au frontend (filet : sortie forcée à 3 s).
  Dans le navigateur, la partie va dans `localStorage`.
- `pnpm --filter desktop vite` + `.claude/launch.json` : aperçu dans le navigateur, sans Tauri.
- **Étape 6 validée**. Moteur : `packages/engine/src/saisons.ts` (saison et météo se
  déduisent du pas et de la graine, rien de plus dans la sauvegarde ; froid loin d'un feu, faim, repli au
  feu l'hiver). Rendu : `packages/renderer/src/ambiance.ts` (teinte des matériaux partagés, particules
  dessinées en superposition). En dev, `moteur.onmessage = null` puis `rendu.ambiance.appliquer(...)`
  fige une saison pour l'inspecter.
- **Étape 7 validée**. Moteur : `packages/engine/src/visiteurs.ts` (tirage par visiteur à partir de la graine,
  le premier arrive dès qu'un relais est construit ; sauvegarde en version 2). Rendu : `packages/renderer/src/visiteurs.ts`.
  Alerte : `src-tauri/src/alertes.rs` (point dessiné sur l'icône ; pouls toutes les 20 s fenêtre cachée → message
  `battre` au Worker, qui ne gèle plus). En dev, le terminal affiche `alerte true/false`.
- **Étape 8 validée**. Moteur : `packages/engine/src/arbre.ts` (spores données par le bouton,
  les soigneurs et le débordement du stock plein ; stades → déblocages ; améliorations de l'atelier ; sauvegarde
  en version 3). Rendu : `packages/renderer/src/arbre.ts` (formes par stade, mycélium sur les flancs, envol).
  Critère : `packages/content/src/floraison.test.ts` (joueur scripté, ~26 s ; `--reporter=verbose` affiche la
  durée de jeu). Pour inspecter un stade dans le navigateur : modifier `etat.arbreMere` dans
  `localStorage['tiny-shrooms.partie']` puis recharger.
- **Réorientation (16/09/2026)** : city-builder sur île extensible (cahier des charges §1-3, 6.2, étapes 9-16).
  Les notes des étapes 7-8 ci-dessus décrivent du code **retiré** à l'étape 9 (seul le pouls reste, `src-tauri/src/pouls.rs`).
- **Étape 9 validée**. Souche-dépôt au centre (`ile.souche`, rendu `packages/renderer/src/souche.ts`) ; améliorations dans
  `packages/engine/src/ameliorations.ts`. Sauvegarde en version 4 : une plus ancienne donne l'origine `ancienne`, le
  frontend archive (`archiver_sauvegardes` → `partie.v3*.json` ; `tiny-shrooms.partie.v3` dans le navigateur).
- **Étape 10 validée**. Caméra : `centre` borné à l'île et paliers de zoom dans `packages/renderer/src/camera.ts`.
  Souris : `ControleurInterface.brancherSouris` (seuil de 4 px entre clic et glisser ; ⌘ → fenêtre, sauf verrouillée ;
  clic de prise de focus ignoré). Curseurs : `packages/ui/src/curseurs.ts` (variables CSS `--curseur-…`). Réglages de
  fenêtre : `src-tauri/src/reglages.rs` (`reglages.json` : verrouillage + position, écrite en quittant), case du menu
  de l'icône et événement `verrouillage`.
- **Étape 11 validée**. Clic → bulle (`Bulle` dans `packages/ui/src/magasin.ts`) : case libre
  → construire (choix, fantôme, bouton), bâtiment → infos, déplacer, démolir.
  Ressources, saison (écriteau gardé) et habitants toujours visibles ; sans le focus, commandes
  masquées et bulle fermée. L'instantané donne `habitant.lieu` (emplois pourvus).
- **Étape 12 validée**. Éléments naturels dans `ile.elements` (placés par la graine,
  `placerElements` dans `packages/engine/src/ile.ts`), repousse dans `etat.pousses` / `instantane.pousses` ; commande
  `recolter`, événement `recolte` (chiffre qui s'envole depuis le point cliqué). Partie neuve : ni stock, ni habitant,
  ni logement de base ; sans habitants les chantiers avancent seuls. Sauvegarde en version 5 (migration depuis la 4).
  Rendu : `packages/renderer/src/elements.ts`. Critère : `packages/content/src/recolte.test.ts` (hutte achevée à ~3 min).
  Menu Réglages retiré : habitants/places en haut à droite, ressources en rangée discrète en bas (plafond au survol).
- **Étape 13 implémentée, à valider**. Logements, besoins, montée en gamme et paliers : `packages/engine/src/logements.ts`
  (fonctions pures réutilisées par l'interface). Chiffres : `contenu.logement` et `contenu.paliers`. Zone de portée :
  `AidesConstruction.montrerPortee`. Critère : `packages/content/src/bourg.test.ts`.
  Livraisons : une charge déposée passe par `etat.arrivages`, rangés dans le stock au rythme de la production
  (6/min → +1 toutes les 10 s).
- **Chemins** : `packages/engine/src/chemins.ts` (A* sur la grille, caches hors sauvegarde) ; bâtiments, souche,
  eau et rochers sont infranchissables, la forêt non. Sans chemin possible, l'habitant marche droit.
- **Souche et défrichage** : `retirerSouche` (20 spores, exige un garde-manger ou une remise ; le dernier dépôt ne se
  démolit plus ensuite) et `defricher` (arbre, buisson sauvage, plante : `packages/engine/src/defrichage.ts`). Les
  habitants y travaillent (tâche `arracher`) ; une fois fini, le moteur renvoie l'île (`publierAvecIle`). Chiffres :
  `contenu.souche`, `contenu.defrichage`. Clic sur un élément épuisé, un arbre ou la souche → bulle `nature`.
  Survol : boîte claire par-dessus le bâtiment ou le décor (`AidesConstruction.surligner`). Sauvegarde en version 9.
- **Nuit** (2 min sur un jour de 10) : `temps.nuit` dans l'instantané ; les habitants rentrent dormir au pied de leur
  logement, l'éclairage baisse (`Ambiance.eclairer`) et des « z » montent (`entites.ts`). Pour la voir dans le
  navigateur : envelopper `moteur.onmessage` et forcer `instantane.temps.nuit = true`.
  Pour inspecter une partie avancée dans le navigateur : importer le moteur via `/@fs/<chemin>/packages/engine/src/index.ts`,
  simuler, puis écrire `serialiser(etat)` dans `localStorage['tiny-shrooms.partie']` et recharger.
- **Étape 14 implémentée, à valider** : la renaissance remplace l'île extensible (abandonnée). Moteur :
  `packages/engine/src/prestige.ts` (`etat.prestige` : graines, bonus, population maximale ; `renaitre` remplace
  l'état sur place). Sanctuaire au palier bourg ; sa bulle porte l'arbre de bonus (`ArbreBonus`,
  `packages/ui/src/panneaux.tsx`). Sauvegarde en version 10. Critère : `packages/content/src/renaissance.test.ts`
  (joueur scripté commun : `joueur.ts`). Dans le navigateur, la partie en cours réécrit `localStorage` au
  rechargement : bloquer `Storage.prototype.setItem` avant de recharger une partie préparée.
- **Étape 15 validée** (habillage). Modèles en voxels écrits en code : `packages/renderer/src/voxels.ts`
  (primitives → maillage à faces visibles, un groupe par couleur avec le matériau partagé, donc teinté par les saisons ;
  l'attribut `color` ne fait que nuancer : toute géométrie dessinée avec `materiau()` en exige un, `sansNuance` sinon)
  et `modeles.ts` (bâtiments par rang, souche, décor, éléments, habitants à 24 voxels/unité). Chantier : couches
  révélées du sol vers le haut (`montrerCouches`). Sons synthétisés : `packages/ui/src/sons.ts` (Web Audio, aucun
  fichier) ; `ui.sons.activer(true)` dans le navigateur. Anglais : `packages/i18n/src/en.ts` (typé sur les clés FR).
  Son (coupé par défaut) et langue (celle du système par défaut) dans le menu de l'icône : `reglages.rs`, événements
  `son` et `langue`. Icône de la barre des menus : `icons/barre-menus.png` (modèle monochrome, 16 px ×2).
  Pour inspecter les modèles dans le navigateur : envelopper `moteur.onmessage` et ajouter des bâtiments à l'instantané.
- **Bulles habillées** (17/09/2026) : cadre de bois et coins pixel (`--contour`, fin de `interface.css`), vignettes des
  modèles rendues par `packages/renderer/src/vignettes.ts` (option `vignettes` de l'interface), icônes pixel des
  ressources dans `packages/ui/src/icones.ts`, coûts illustrés et phrases à trou dans `composants.tsx` (`Cout`, `Phrase`).
  La nuit teinte aussi pluie, neige et feuilles (`TEINTES_PARTICULES` dans `ambiance.ts`).
- **Prochaine étape : 16** (équilibrage et diffusion).

## Retouches du 16/09/2026 (faites, vérifiées dans le navigateur)

- `annulerArrachage { case }` (case nulle = souche) rend tout le prix ; bouton « Annuler » dans `BulleNature`.
- La bulle nature se ferme dès qu'on lance un arrachage payable.
- Élément prêt mais stock plein → bulle nature (`ControleurInterface.recoltable`, clic et curseur).
- Première renaissance : `astuceSouche` (magasin) affiche `AstuceSouche` (`interface.tsx`), qui suit la souche à
  chaque image via `scene.projeter` ; elle disparaît dès qu'on ouvre la bulle de la souche.
- Arbre de bonus (« Pouvoirs ») dans la bulle de la souche, dès qu'on a des graines ou un bonus ; le sanctuaire ne
  sert plus qu'à renaître. Souche retirée : plus d'accès jusqu'à la renaissance suivante (à revoir si gênant).
- Dans le navigateur, `ui` (contrôleur) et `rendu` sont exposés en dev : `ui.cliquer(x, y)` simule un clic sans la
  garde du focus, `rendu.viser(x, y)` donne la case sous un point (le volet doit avoir une taille, sinon 0×0).
