# Tiny Shrooms — Cahier des charges

> Jeu idle / city-builder solo qui vit dans une petite fenêtre flottante dans un coin de l'écran.
> On le laisse tourner, on y jette un œil quand on veut, on fait une action de temps en temps.
> Application de bureau : **Mac en priorité**, Windows ensuite.

---

## 1. Vision

Une île flottante vue en coupe isométrique, où de petits habitants-champignons bâtissent une ville
qui **grandit sans fin**, façon SimCity en miniature. On commence seul, en ramassant baies, bois et
mousse à la main ; puis les habitants arrivent, occupent les emplois, réclament de quoi vivre mieux,
et leurs maisons montent en gamme. Leur bonheur produit des **spores**, avec lesquelles on achète de
nouvelles parcelles : l'île s'étend dans toutes les directions.

**Promesse** : un compagnon de bureau apaisant, jamais punitif, qui ne réclame rien, et une ville
qu'on a toujours une raison de faire grandir.

**Critère de réussite de la V1** : Celian le garde ouvert toute une journée de travail sans qu'il
gêne (ni visuellement, ni en batterie), et a envie d'y revenir jusqu'au palier « bourg ».

> **Réorientation du 16/09/2026** : l'arbre-mère, la floraison, les visiteurs, le menu Habitants et
> l'interface au survol sont abandonnés au profit de ce modèle (voir étapes 9 et suivantes).

### Référence visuelle

*Tiny Tycoon* : îlot cubique flottant montrant ses couches (herbe, terre, roche), rendu 3D
affiché en basse résolution avec des pixels nets, contours fins, interface en police pixel épaisse
avec des boutons colorés cerclés de noir. Son début de partie aussi : on récolte d'abord à la main.

---

## 2. Décisions prises

| Sujet | Décision |
|---|---|
| Genre | Idle / city-builder (façon SimCity miniature) |
| Concept | La ville des champignons |
| Style | Pixel art 3D isométrique (façon Tiny Tycoon) |
| Rendu | Three.js, rendu basse résolution pixelisé + contours |
| Fenêtre | Flottante, sans bordure, toujours au-dessus, fond transparent, **fixe à 320 × 320** + icône dans la barre des menus |
| Navigation | Clic maintenu = faire glisser l'île dans toutes les directions ; zoom à la molette ; rotation par pas de 90° |
| Déplacer la fenêtre | **⌘ + clic maintenu** ; option « Verrouiller la position » (paramètres et menu de l'icône) |
| Curseur | Curseur pixel personnalisé, uniquement quand la souris est dans la fenêtre |
| Focus | Fenêtre sans le focus : aucune interface révélée, aucun aperçu ; le premier clic donne le focus sans agir |
| Emballage | Tauri v2 |
| Jeu fermé | **Pause totale** : aucune progression hors ligne |
| Fenêtre cachée (appli ouverte) | La simulation continue, seul le rendu s'arrête |
| Rythme | Aucun rythme imposé : rien n'expire |
| Alertes | Aucune pour l'instant (les visiteurs sont retirés) |
| Backend | Moteur local en TypeScript + sauvegarde fichier ; synchronisation via Raspberry Pi en option, post-V1 |
| Monde | **L'île s'agrandit** : parcelles voisines achetées en spores, sans limite |
| Début de partie | Récolte **à la main** (clic sur buissons, bois mort, mousse) ; elle reste possible ensuite mais devient négligeable |
| Construction | Clic sur une case → liste de ce qu'on peut y construire ; bonus de voisinage conservés |
| Habitants | Besoins par logement + montée en gamme + **paliers de population** ; emplois occupés automatiquement, aucun réglage |
| Difficulté | Ralentissements seulement, on ne perd jamais rien |
| Long terme | Expansion sans fin + paliers (hameau → village → bourg → cité → …) qui débloquent bâtiments et améliorations |
| Son | Ambiances douces liées à la météo + petits sons d'interface, **coupé par défaut** |
| Langue | Jeu en FR (défaut) + EN ; code et documentation en français |
| Diffusion | Celian d'abord, amis ensuite : installeurs .dmg/.exe via GitHub Actions + mises à jour automatiques, sans signature payante au départ |
| Interface | **Plus d'interface au survol** : ressources (et saison, à l'essai) intégrées au décor en permanence ; menus au clic ; icône Paramètres |
| Sauvegardes | Format en version 4 ; une ancienne partie est archivée à part et on repart de zéro |
| Contenu V1 | Une île extensible (voir §3.8) |

### Hors périmètre

- Multijoueur, classements, fonctions sociales.
- Monétisation, publicités, achats intégrés.
- Mobile et navigateur web.
- Progression hors ligne (choix assumé : pause totale).
- Signature et notarisation Apple, publication itch.io / Steam (reportées après la V1).
- Arbre-mère, prestige, visiteurs, réglage des priorités des habitants (retirés le 16/09/2026).

---

## 3. Game design

### 3.1 Boucle principale

```
 clic du joueur (début) ─┐
                         ▼
 habitants employés ──► ressources ──► construire / acheter des parcelles
        ▲                                     │
        │                                     ▼
 nouveaux habitants ◄── logements qui montent en gamme ◄── besoins satisfaits
        │
        └──► bonheur ──► spores ──► parcelles + améliorations
                   population ──► paliers ──► nouveaux bâtiments
```

### 3.2 Ressources (V1)

| Ressource | Rôle | Source principale |
|---|---|---|
| **Baies** | Nourriture des habitants ; stock pour l'hiver | Clic sur un buisson, puis cueillette (rien ne pousse en hiver) |
| **Bois mort** | Construction | Clic sur du bois mort, puis tas de bois |
| **Mousse** | Isolation, confort, montée en gamme | Clic sur la mousse, puis tapis de mousse (plus lent en été) |
| **Spores** | Achat de parcelles et d'améliorations | Produites par les habitants, selon leur bonheur (l'« impôt » de la ville) |

- Chaque ressource a un stock maximal, augmenté par les bâtiments de stockage.
- **Récolte à la main** : un clic sur un élément naturel donne une petite quantité et l'épuise un
  moment (il repousse). C'est le moteur du tout début ; au palier village, la production des
  habitants la rend presque inutile, mais elle reste disponible.
- Les éléments naturels se régénèrent et apparaissent aussi sur les nouvelles parcelles.

### 3.3 Bâtiments (V1)

| Bâtiment | Effet | Emplois | Palier |
|---|---|---|---|
| Souche-dépôt | Dépôt de départ, présent dès le début | — | départ |
| Hutte-chapeau | Logement, monte en gamme (voir 3.4) | — | départ |
| Cueillette | Produit des baies (+25 % à côté d'un buisson sauvage) | 2 | départ |
| Tas de bois | Produit du bois mort (+25 % en lisière de forêt) | 2 | départ |
| Tapis de mousse | Produit de la mousse (+25 % près de l'eau ou à l'ombre) | 2 | départ |
| Garde-manger | +stock de baies | — | hameau |
| Remise | +stock de bois et de mousse | — | hameau |
| Feu de camp | Chaleur et confort alentour | — | hameau |
| Séchoir | Baies → baies séchées, qui se conservent pour l'hiver | 1 | village |
| Puits / fontaine | Besoin « eau » des maisons | — | village |
| Atelier | Améliorations (vitesse, production) payées en spores | 1 | village |
| Place du marché | Besoin « commerce » des maisons de rang 3 | 2 | bourg |

- Un bâtiment de production ne tourne qu'avec ses emplois pourvus ; à moitié pourvu, il produit
  à moitié. Un clic dessus affiche les postes occupés et sa production.
- La liste s'allonge à chaque nouveau palier (contenu post-V1 : chemins, décorations, pierre…).

### 3.4 Habitants

- **Arrivée** : un logement libre attire des habitants tant que la ville a de quoi les nourrir.
- **Emplois** : chaque habitant prend seul le poste libre le plus proche de chez lui ; les porteurs
  et bâtisseurs sont pris parmi les sans-emploi. **Aucun réglage**, aucun menu Habitants.
- **Besoins et montée en gamme** (par logement) :

| Rang | Logement | Habitants | Besoins |
|---|---|---|---|
| 1 | Hutte | 2 | Nourriture |
| 2 | Maison | 4 | + chaleur (feu de camp proche) + eau (puits proche) |
| 3 | Manoir | 8 | + mousse livrée + commerce (marché proche) |

  Un logement dont un besoin manque ne descend pas en gamme : il cesse seulement de progresser et
  son bonheur baisse, donc il produit moins de spores.
- **Paliers de population** : hameau (0) → village (15) → bourg (50) → cité (150) → … (seuils à
  régler). Chaque palier débloque bâtiments et améliorations, et s'annonce discrètement.
- Animations visibles : marcher, porter, construire, dormir la nuit, se réchauffer au feu en hiver.
- V1 : une seule espèce, avec des variations de couleur de chapeau.

### 3.5 Saisons et météo

- Inchangé : cycle printemps → été → automne → hiver en **temps de jeu ouvert**, météo qui module
  légèrement la production, hiver qui ralentit sans jamais rien faire perdre.
- Affichage : **à l'essai**, un petit indicateur intégré au décor (voir 6.2) ; retiré s'il ne rend
  pas bien, les saisons restant visibles sur l'île.

### 3.6 Expansion de l'île

- L'île est découpée en **parcelles** (8 × 8 cases à régler). On part d'une parcelle.
- Un clic sur le bord de l'île, face au vide, propose d'acheter la parcelle voisine ; son prix en
  spores croît avec le nombre de parcelles possédées.
- Une nouvelle parcelle arrive avec ses éléments naturels (buissons, bois mort, mousse, eau), tirés
  de la graine de la partie. Pas de limite de taille.
- La coupe (herbe, terre, roche) suit le contour de l'île.

### 3.7 (retiré) Arbre-mère et prestige

Abandonné le 16/09/2026 ; le code de l'étape 8 est retiré à l'étape 9.

### 3.8 Contenu de la V1

1 île extensible (forêt), 4 ressources, ~12 bâtiments, 3 rangs de logement, 4 paliers de
population, 4 saisons + météo, FR + EN, ambiances sonores.

---

## 4. Architecture technique

### 4.1 Vue d'ensemble

```
┌──────────────────────── Application Tauri ────────────────────────┐
│                                                                    │
│  Rust (shell natif)          WebView                               │
│  • fenêtre transparente      ┌──────────── FRONTEND ─────────────┐ │
│  • toujours au-dessus        │ Renderer Three.js  │ UI Preact    │ │
│  • icône barre des menus     │ Audio              │ i18n         │ │
│  • fichiers de sauvegarde    └────────▲──────────────┬───────────┘ │
│  • détection de veille       instantanés/événements │ commandes   │
│                              ┌────────┴──────────────▼───────────┐ │
│                              │ BACKEND : moteur de jeu (Worker)   │ │
│                              │ simulation · économie · sauvegarde │ │
│                              └────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
                     (post-V1, optionnel) ──► API de synchro sur Raspberry Pi
```

**Règle d'or** : le moteur ne connaît ni Three.js ni le DOM. Le frontend ne modifie jamais l'état
directement, il envoie des **commandes** et affiche des **instantanés** (snapshots).

### 4.2 Pile technique

| Couche | Choix |
|---|---|
| Langage | TypeScript (strict) |
| Monorepo | pnpm workspaces |
| Build | Vite |
| Emballage | Tauri v2 (plugins : `fs`, `updater`, `tray`, `window-state`) |
| Rendu | Three.js |
| UI | Preact (léger, suffit pour une interface superposée) |
| Tests | Vitest (moteur) |
| Modèles 3D | Blockbench ou MagicaVoxel → glTF |
| CI | GitHub Actions (tauri-action) → .dmg + .exe |
| Synchro (post-V1) | Node + Hono + SQLite sur le Raspberry Pi |

### 4.3 Arborescence prévue

```
tiny_shrooms/
├── cahier-des-charges.md
├── apps/
│   └── desktop/            # point d'entrée Tauri
│       ├── src-tauri/      # Rust : fenêtre, barre des menus, fichiers, veille
│       └── src/            # assemblage frontend + worker moteur
├── packages/
│   ├── engine/             # BACKEND : simulation pure, testée
│   ├── content/            # données : ressources, bâtiments, paliers, équilibrage
│   ├── renderer/           # FRONTEND : scène Three.js pixelisée
│   ├── ui/                 # FRONTEND : interface Preact
│   └── i18n/               # textes FR / EN
├── assets/                 # modèles glTF, sons, police pixel
└── services/
    └── sync/               # post-V1 : API Raspberry Pi
```

---

## 5. Backend

### 5.1 Moteur de jeu (`packages/engine`)

- **Simulation à pas fixe** : 4 ticks par seconde, déterministe (graine aléatoire sauvegardée).
- Tourne dans un **Web Worker**, pour ne pas dépendre du rendu.
- **Temps** : chaque tick consomme le temps réel écoulé et rattrape tous les pas manqués, quelle que
  soit la durée de l'écart : macOS peut geler le Worker plus de 20 min fenêtre cachée (mesuré à
  l'étape 0). Seule une **veille signalée par Rust** met le jeu en pause ; aucun écart n'est deviné
  à partir de sa seule durée.
- **Systèmes** : ressources, production, récolte à la main, habitants (emplois, besoins,
  montée en gamme), paliers de population, construction, parcelles, bonheur et spores, saisons et météo.
- **Commandes** (frontend → moteur) : `poserBatiment`, `deplacerBatiment`, `demolir`, `ameliorer`,
  `recolter`, `acheterParcelle`, `modifierReglage`.
- **Événements** (moteur → frontend) : instantané léger toutes les 250 ms + événements ponctuels
  (`saisonChangee`, `palierAtteint`, `logementAmeliore`, `stockPlein`…). Le contrat complet est dans
  `packages/engine/src/contrat.ts`.
- Toutes les valeurs d'équilibrage viennent de `packages/content` : on n'écrit aucun chiffre en dur
  dans le moteur.

### 5.2 Sauvegarde

- Fichier JSON dans le dossier de données de l'application (`~/Library/Application Support/…`
  sur Mac, `%APPDATA%` sous Windows).
- Champ `version` + **migrations** successives dès la première sauvegarde.
- Sauvegarde automatique toutes les 30 s, à la fermeture et à la mise en veille.
- **3 copies de secours** en rotation ; en cas de fichier corrompu, reprise sur la plus récente valide.
- Aucun horodatage n'est utilisé pour calculer des gains (pause totale).

### 5.3 Shell natif (`apps/desktop/src-tauri`)

- Fenêtre sans bordure, transparente, toujours au-dessus, **fixe à 320 × 320** ;
  déplaçable par ⌘ + glisser, sauf si la position est verrouillée ; position mémorisée.
- Réglages : verrouillage de la position, opacité de la fenêtre, « toujours au-dessus » activable, lancement au démarrage.
- **Icône de barre des menus** : afficher / cacher, verrouiller la position, résumé des ressources
  dans le menu, quitter.
- Quand la fenêtre est cachée : prévenir le frontend pour qu'il coupe le rendu, la simulation continue.
- Détection de mise en veille et de réveil du système → sauvegarde + pause.

### 5.4 Synchronisation Raspberry Pi (post-V1, optionnelle)

- Petite API : `PUT /save`, `GET /save`, protégée par un jeton personnel.
- Stratégie simple : la sauvegarde la plus avancée gagne, avec confirmation en cas de conflit.
- Le jeu fonctionne entièrement sans.

---

## 6. Frontend

### 6.1 Rendu (`packages/renderer`)

- Caméra **orthographique isométrique** ; rotation par pas de 90° ; zoom à la molette (plusieurs niveaux) ;
  **glisser au clic maintenu** dans toutes les directions, borné à l'étendue de l'île.
- **Pipeline pixelisé** : rendu dans une cible basse résolution (½ de la taille de la fenêtre),
  agrandie avec filtrage `nearest` ; passe de **contours** (détection de bords sur la profondeur et
  les normales) ; ombrage en paliers (toon) ; palette limitée.
- Fond **transparent** (`alpha: true`, fond à opacité 0) : seul l'îlot flotte sur le bureau.
- **Îlot en coupe** : couches herbe / terre / roche, qui suivent le contour des parcelles.
- Grande île : maillages instanciés, seules les parcelles proches de la vue sont dessinées.
- Grille de placement visible uniquement en mode construction ; aperçu fantôme vert ou rouge.
- Saisons : teinte du sol et des arbres, neige, feuilles qui tombent ; météo en particules.
- Habitants : sprites 3D simples, animations par sous-parties (rebond, balancement).
- Performances : **30 i/s** quand la fenêtre est visible, **0** quand elle est cachée,
  images supplémentaires limitées quand rien ne bouge.

### 6.2 Interface (`packages/ui`)

- **Aucune interface au survol.** L'île occupe la fenêtre ; seuls restent :
  - les **ressources**, affichées en permanence et intégrées au décor (par exemple de petits
    panneaux de bois plantés dans un coin, ou des pots et sacs posés sur une étagère en pixel,
    avec leur nombre) plutôt qu'une colonne de compteurs ;
  - la **saison et la météo**, à l'essai, dans le même esprit (un petit écriteau ou une girouette) ;
    retirées si le rendu ne convainc pas ;
  - une **icône Paramètres** discrète dans un coin, qui ouvre le menu des réglages (son, langue,
    verrouillage de la fenêtre, opacité…) et les boutons de caméra.
- **Clic sur une case vide** : petite bulle listant ce qu'on peut y construire (coût, effet, bonus de
  voisinage), puis aperçu fantôme vert ou rouge avant de confirmer.
- **Clic sur un bâtiment** : bulle d'informations (emplois pourvus, production, besoins d'un
  logement) avec améliorer, déplacer, démolir.
- **Clic sur un élément naturel** : récolte à la main, avec un petit chiffre qui s'envole.
- **Clic au bord de l'île** : achat de la parcelle voisine.
- Bulles et menus fermables d'un clic ailleurs ou avec Échap ; un glisser ne compte pas comme un clic.
- **Curseur personnalisé** (pixel, cerclé de noir) dans la fenêtre seulement, avec des variantes :
  main (récolter), marteau (construire), main fermée (glisser).
- **Sans le focus** : rien ne s'affiche au passage de la souris ; le premier clic sert seulement à
  prendre le focus.
- Style : police pixel épaisse, boutons pleins cerclés de noir, contrastes forts pour rester
  lisible en 320 px.
- Infobulles : coût, production, bonus de voisinage.

### 6.3 Audio

- Ambiances en boucle (oiseaux, pluie, vent, feu) mixées selon la météo et la saison.
- Petits sons d'interface (poser, récolter, palier atteint).
- Coupé par défaut, bouton unique pour activer ; volume dans les réglages.

### 6.4 Langues

- Toutes les chaînes passent par `packages/i18n` dès le premier écran. FR par défaut, EN disponible,
  selon la langue du système au premier lancement.

---

## 7. Étapes de réalisation

Chaque étape se termine par quelque chose de **vérifiable**. On ne passe pas à la suivante tant que
son critère n'est pas rempli.

### Étape 0 — Fondations et levée des risques
- Monorepo pnpm, Vite, TypeScript strict, Vitest.
- Tauri v2 : fenêtre transparente sans bordure, toujours au-dessus, déplaçable ; icône de barre des menus
  qui cache et affiche la fenêtre.
- Cube Three.js transparent qui tourne dans la fenêtre.
- **Test du Worker quand la fenêtre est cachée** : mesurer si macOS ralentit les timers.
- **Critère** : sur Mac, un cube flotte sur le bureau sans cadre, reste au-dessus, se cache via la barre
  des menus, et le compteur du Worker continue d'avancer correctement fenêtre cachée.
- **Résultat (16/09/2026)** : fenêtre, déplacement et barre des menus validés. Worker **gelé** fenêtre
  cachée : 21 % des ticks sur 28 min, dont un gel de 20 min, sans veille du Mac. Décision : rattrapage
  sur l'horloge réelle + veille détectée côté Rust (voir 5.1).

### Étape 1 — Noyau du moteur (backend)
- Boucle à pas fixe, gestion du temps et de la veille, ressources, stocks, commandes et événements.
- `packages/content` avec les premières données.
- **Critère** : tests Vitest verts ; une simulation sans affichage produit les quantités attendues sur 1 h simulée.
- **Résultat (16/09/2026)** : validé (22 tests). `Moteur` reçoit et émet les messages du contrat, le temps réel
  lui est passé en paramètre ; `packages/content` porte un premier jet d'équilibrage. Pour l'instant les
  bâtiments produisent seuls et les chantiers avancent seuls : l'étape 2 y met les habitants.

### Étape 2 — Grille, bâtiments, habitants (backend)
- Grille de l'île, placement, déplacement, démolition, bonus de voisinage.
- Habitants : arrivée, choix de tâche par priorités, épinglage, bien-être.
- **Critère** : scénario testé « poser 3 bâtiments → les habitants récoltent et construisent seuls ».
- **Résultat (16/09/2026)** : validé (33 tests). Tout passe par les habitants : un bâtiment ne produit
  qu'avec un récolteur, la récolte attend en réserve qu'un porteur l'amène à un dépôt (arbre-mère,
  garde-manger, remise), le chantier n'avance qu'avec des bâtisseurs. Déplacements en ligne droite,
  sommeil sur place la nuit, partie commencée le matin. Le vrai moteur remplace le faux dans le Worker.

### Étape 3 — Îlot pixelisé (frontend)
- Pipeline basse résolution + contours + ombrage en paliers ; îlot en coupe ; caméra isométrique,
  rotation et zoom.
- Bâtiments et habitants en formes provisoires (cubes colorés), synchronisés sur les instantanés du moteur.
- **Critère** : le rendu rappelle l'image de référence ; 30 i/s stables ; 0 i/s fenêtre cachée.
- **Résultat (16/09/2026)** : validé sur Mac, nourri par un faux moteur. Rendu à ½ de la fenêtre
  (⅓ rendait bâtiments et habitants illisibles à 320 px), 2,9 ms par image ; habitants agrandis ×1,7.

### Étape 4 — Interface au survol → premier jouable
- Compteurs, barre d'outils, panneau de construction avec aperçu fantôme, panneau des priorités.
- i18n branchée (FR seulement pour l'instant).
- **Critère** : on peut jouer la boucle récolte → construction → nouveaux habitants uniquement à la souris,
  dans une fenêtre de 320 px.
- **Résultat (16/09/2026)** : validé sur Mac ; boucle jouée à la souris à 320 × 320 (3 bâtiments posés,
  3ᵉ habitant arrivé). Clic court = poser ou sélectionner, appui glissé = déplacer la fenêtre (remplace la
  zone de glisser plein écran). Clic droit ou Échap annule. Fenêtre sans le focus : Rust surveille le
  curseur pour révéler l'interface. Chiffres en Jersey 10, plus lisibles que ceux de Pixelify Sans.

### Étape 5 — Sauvegarde et pause
- Écriture fichier via Tauri, versions et migrations, 3 copies de secours, sauvegarde à la fermeture et à la veille.
- **Critère** : quitter en pleine partie puis relancer restitue l'état exact ; aucun gain après 1 h fermé ;
  un fichier corrompu est récupéré.
- **Résultat (16/09/2026)** : validé sur Mac. Fichier versionné (`partie.json` + 3 copies en rotation,
  écriture via un fichier temporaire), sauvegarde toutes les 30 s, à la fermeture et à la veille (détectée
  par NSWorkspace). L'événement de veille porte l'instant de l'endormissement : un Worker gelé qui le lit au
  réveil ne rattrape pas la durée de la veille.

### Étape 6 — Saisons et météo
- Moteur : cycle des saisons, effets de la météo, ralentissement hivernal, séchoir, feu de camp.
- Rendu : teintes, neige, pluie, feuilles.
- **Critère** : une année complète s'enchaîne ; un hiver non préparé ralentit sans rien faire perdre.
- **Résultat (16/09/2026)** : validé sur Mac. Saison et météo déduites du pas et de la graine (rien de plus
  dans la sauvegarde). Hiver : aucune baie, travail à 60 % hors de portée d'un feu de camp, à 50 % pour un
  village affamé ; une baie séchée vaut 3 baies. Rendu : teintes des matériaux partagés avec fondu en fin de
  saison, pluie, neige et feuilles en superposition ; l'arbre-mère reste vert. Corrigé au passage : un porteur
  ne ramasse plus que ce qui tient dans les stocks (il restait bloqué, stock plein).

### Étape 7 — Visiteurs et alertes
- Relais des visiteurs, hérisson marchand, escargot voyageur, luciole.
- Point sur l'icône de la barre des menus + habitant qui fait signe.
- **Critère** : un visiteur arrivé fenêtre cachée est signalé dans la barre des menus et attend indéfiniment.
- **Résultat (16/09/2026)** : validé sur Mac. Relais à 2 places ; premier visiteur dès la fin du chantier, puis
  un toutes les 3 à 8 min, tiré au sort à partir de la graine (sauvegarde en version 2). Hérisson : échange à taux
  variable ; escargot : spores ou plan encore verrouillé ; luciole : production ×1,25 à ×1,5 pendant 3 à 6 min.
  Fenêtre cachée, Rust envoie un **pouls** toutes les 20 s et le Worker rattrape aussitôt : mesuré 18 min sans
  gel, réponse en moins de 100 ms, donc aucune alerte à produire côté Rust. Le point rouge est dessiné sur
  l'icône ; son allumage a été vu fenêtre visible, l'arrivée pendant un rattrapage est couverte par les tests.

### Étape 8 — Arbre-mère et floraison
- Stades de croissance, déblocages, mycélium dans la coupe, séquence de floraison, écran « nouvelle île à venir ».
- **Critère** : on peut atteindre la floraison en partant de zéro (vérifié avec une simulation accélérée).
- **Résultat (16/09/2026)** : validé sur Mac. L'arbre reçoit des spores
  de trois façons : le bouton « Nourrir », les soigneurs (directement), et le débordement d'un stock de spores
  plein. Rien ne se perd donc fenêtre cachée. Seuils : 200, 2 500 puis 12 000 spores. Au départ : hutte,
  cueillette, tas de bois, tapis de mousse, garde-manger, remise, feu de camp. L'arbuste débloque le séchoir et
  le relais, l'arbre débloque l'atelier et ses deux améliorations (marche et production, +15 % par niveau,
  3 niveaux). Mycélium dessiné sur les flancs de l'île, du plus proche de l'arbre au plus lointain. Floraison :
  envol des spores pendant 6 s, puis écran « nouvelle île à venir » ; l'île continue ensuite. Simulation
  accélérée avec un joueur scripté : floraison en **17,8 h** de jeu (arbuste à 1,8 h, arbre à 5,3 h), le test
  exige entre 10 et 30 h. Sauvegarde en version 3.

> **Réorientation (16/09/2026)** : les étapes 0 à 8 sont conservées comme historique. Les visiteurs
> (étape 7) et l'arbre-mère (étape 8) sont retirés à l'étape 9 ; la suite reprend le nouveau modèle.

### Étape 9 — Réorientation : retrait et nouvelle base
- Retirer arbre-mère, floraison, spores de l'arbre, visiteurs, relais, alertes d'icône, priorités,
  épinglage, menu Habitants (moteur, contenu, rendu, interface, i18n, tests).
- Souche-dépôt à la place de l'arbre-mère comme dépôt de départ.
- Sauvegarde en version 4 : une partie plus ancienne est archivée (`partie.v3.json`) et on repart de zéro.
- **Critère** : tests et types verts ; le jeu se lance sur une partie neuve sans trace des systèmes retirés.
- **Résultat (16/09/2026)** : validé (38 tests moteur, 7 contenu). Retirés : `arbre.ts` et `visiteurs.ts` (moteur et
  rendu), le relais, les priorités, l'épinglage, les panneaux Habitants, Arbre-mère et Visiteurs, l'écran de floraison,
  l'alerte d'icône (le pouls reste, dans `pouls.rs`). Les habitants choisissent leur tâche avec un poids commun ; sans
  rien à faire, ils attendent. Améliorations de l'atelier dans `ameliorations.ts`, toujours payées en bois et mousse.
  Tous les bâtiments sont disponibles d'emblée en attendant les paliers. Sauvegarde en version 4 : le moteur répond
  `partieChargee` avec l'origine `ancienne`, le frontend appelle `archiver_sauvegardes` (Rust renomme en
  `partie.v3*.json`, sans jamais rien supprimer) avant la première écriture. Vérifié dans le navigateur : ancienne
  partie archivée, nouvelle écrite en version 4, souche au centre.

### Étape 10 — Commandes à la souris et fenêtre
- Glisser au clic maintenu pour déplacer la vue, dans toutes les directions ; molette pour le zoom.
- ⌘ + glisser pour déplacer la fenêtre ; « Verrouiller la position » dans les paramètres et le menu de l'icône.
- Curseur personnalisé et ses variantes, dans la fenêtre seulement.
- Sans le focus : plus rien ne se révèle au survol ; le premier clic prend le focus sans agir.
- **Critère** : à 320 px, on parcourt l'île à la souris sans jamais déplacer la fenêtre par erreur ;
  le curseur retrouve son apparence normale dès qu'il sort de la fenêtre.

### Étape 11 — Interface au clic
- Suppression de la barre d'outils au survol ; bulle de construction sur une case vide, bulle
  d'informations sur un bâtiment, icône et menu Paramètres.
- Ressources intégrées au décor ; saison et météo à l'essai dans le même style.
- **Critère** : toute la boucle se joue au clic, à 320 px ; les ressources restent lisibles sur
  toutes les saisons ; décision prise (garder ou retirer) pour l'affichage de la saison.

### Étape 12 — Récolte à la main
- Éléments naturels cliquables (buissons, bois mort, mousse), épuisement puis repousse, chiffre qui s'envole.
- Partie neuve : aucun habitant, seuls la souche-dépôt et quelques éléments naturels.
- **Critère** : depuis une partie neuve, on construit la première hutte uniquement en récoltant à la main
  (cible : 2 à 4 min).

### Étape 13 — Habitants façon SimCity
- Emplois par bâtiment, affectation automatique ; besoins par logement, bonheur, montée en gamme
  (hutte → maison → manoir) ; spores produites selon le bonheur.
- Paliers de population et déblocages ; nouveaux bâtiments (puits, marché).
- **Critère** : simulation accélérée d'un joueur scripté qui atteint le palier bourg ; un besoin
  manquant ralentit sans jamais faire perdre d'habitants.

### Étape 14 — Île extensible
- Parcelles, achat en spores au bord de l'île, éléments naturels générés par la graine, coupe qui suit le contour.
- Rendu d'une grande île : instanciation, seules les parcelles proches de la vue sont dessinées.
- **Critère** : une île de 50 parcelles reste à 30 i/s et sous 3 ms par image de simulation ;
  sauvegarde et rechargement exacts.

### Étape 15 — Habillage
- Modèles définitifs (Blockbench ou MagicaVoxel), animations des habitants, police pixel, style de l'interface.
- Ambiances sonores et sons d'interface ; traduction EN.
- **Critère** : plus aucune forme provisoire ; FR et EN complets ; son coupé au premier lancement.

### Étape 16 — Équilibrage et diffusion → **V1**
- Simulations accélérées pour régler la courbe (temps jusqu'au palier bourg : cible à définir, base 10-20 h de jeu ouvert).
- Consommation : CPU et batterie fenêtre visible et cachée.
- GitHub Actions : .dmg (Mac Apple Silicon + Intel) et .exe ; mises à jour automatiques.
- Vérification sous Windows : transparence, toujours au-dessus, zone de notification.
- **Critère** : Celian installe la V1 depuis le .dmg et la garde ouverte une journée entière.

### Après la V1
1. Nouveaux paliers, bâtiments et ressources (pierre, champignons lumineux…), chemins et décorations.
2. Biomes sur les nouvelles parcelles (marais, rochers…).
3. Espèces d'habitants rares et collection.
4. Synchronisation via le Raspberry Pi.
5. Signature et notarisation Apple, page itch.io.

---

## 8. Risques identifiés

| Risque | Parade |
|---|---|
| macOS gèle le Worker quand la fenêtre est cachée (**confirmé** à l'étape 0) | Rattrapage du temps écoulé ; fenêtre cachée, un pouls envoyé par Rust toutes les 20 s suffit à réveiller le Worker (mesuré à l'étape 7) |
| Fenêtre transparente capricieuse selon la version de macOS ou de Windows | Validée à l'étape 0 ; repli sur une fenêtre à fond coloré arrondi |
| Consommation batterie d'un rendu 3D permanent | 30 i/s maximum, 0 caché, rendu à la demande quand rien ne bouge |
| Interface illisible en 320 px | Test systématique à la taille minimale à chaque étape d'interface |
| Île sans limite : rendu, simulation et sauvegarde qui grossissent | Instanciation et tri par parcelle ; simulation des bâtiments par agrégats ; mesure à l'étape 14 |
| Curseur personnalisé et glisser dans une fenêtre sans le focus (la vue web ne reçoit pas la souris) | Premier clic = prise du focus ; curseur appliqué côté Rust si le CSS ne suffit pas |
| Glisser la vue et ⌘ + glisser confondus avec un clic | Seuil de quelques pixels avant de considérer un appui comme un glisser |
| Équilibrage d'une partie sans fin à régler à la main | Simulation accélérée sans affichage, possible grâce au moteur séparé |

## 9. Questions ouvertes (à trancher en cours de route)

- Durée exacte d'une saison, seuils des paliers et prix des parcelles.
- Taille d'une parcelle (8 × 8 en premier jet) et forme de l'île de départ.
- Forme exacte de l'affichage des ressources dans le décor ; sort de l'affichage de la saison.
- Identité des habitants : ont-ils un nom d'espèce propre ?
- Direction musicale si on ajoute un jour une musique.
