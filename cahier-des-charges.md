# Tiny Shrooms — Cahier des charges

> Jeu idle / gestion solo qui vit dans une petite fenêtre flottante dans un coin de l'écran.
> On le laisse tourner, on y jette un œil quand on veut, on fait une action de temps en temps.
> Application de bureau : **Mac en priorité**, Windows ensuite.

---

## 1. Vision

Une clairière flottante, vue en coupe isométrique, où de petits habitants-champignons récoltent,
construisent et font grandir leur village au fil des saisons. Le joueur place des bâtiments,
règle les priorités du village, accueille des visiteurs et fait grandir l'**arbre-mère**, dont la
floraison envoie des spores fonder de nouvelles îles.

**Promesse** : un compagnon de bureau apaisant, jamais punitif, qui ne réclame rien.

**Critère de réussite de la V1** : Celian le garde ouvert toute une journée de travail sans qu'il
gêne (ni visuellement, ni en batterie), et a envie d'y revenir jusqu'à la première floraison.

### Référence visuelle

*Tiny Tycoon* : îlot cubique flottant montrant ses couches (herbe, terre, roche), rendu 3D
affiché en basse résolution avec des pixels nets, contours fins, interface en police pixel épaisse
avec des boutons colorés cerclés de noir.

---

## 2. Décisions prises

| Sujet | Décision |
|---|---|
| Genre | Idle / gestion |
| Concept | Le village des champignons |
| Style | Pixel art 3D isométrique (façon Tiny Tycoon) |
| Rendu | Three.js, rendu basse résolution pixelisé + contours |
| Fenêtre | Flottante, sans bordure, toujours au-dessus, fond transparent **+ icône dans la barre des menus** |
| Emballage | Tauri v2 |
| Jeu fermé | **Pause totale** : aucune progression hors ligne |
| Fenêtre cachée (appli ouverte) | La simulation continue, seul le rendu s'arrête |
| Rythme | Aucun rythme imposé : rien n'expire, les visiteurs attendent |
| Alertes | Discrètes : habitant qui fait signe + point sur l'icône de la barre des menus |
| Backend | Moteur local en TypeScript + sauvegarde fichier ; synchronisation via Raspberry Pi en option, post-V1 |
| Construction | Placement libre sur grille, bonus de voisinage |
| Difficulté | Ralentissements seulement, on ne perd jamais rien |
| Habitants | Automatiques, guidés par des priorités réglables ; affectation manuelle possible |
| Long terme | Floraison de l'arbre-mère → nouvelle île + bonus permanents (prestige) |
| Son | Ambiances douces liées à la météo + petits sons d'interface, **coupé par défaut** |
| Langue | Jeu en FR (défaut) + EN ; code et documentation en français |
| Diffusion | Celian d'abord, amis ensuite : installeurs .dmg/.exe via GitHub Actions + mises à jour automatiques, sans signature payante au départ |
| Interface | Au repos, l'îlot seul ; au survol, ressources et barre d'outils ; panneaux par-dessus l'îlot |
| Contenu V1 | Une île complète (voir §3.8) |

### Hors périmètre

- Multijoueur, classements, fonctions sociales.
- Monétisation, publicités, achats intégrés.
- Mobile et navigateur web.
- Progression hors ligne (choix assumé : pause totale).
- Signature et notarisation Apple, publication itch.io / Steam (reportées après la V1).

---

## 3. Game design

### 3.1 Boucle principale

```
Habitants récoltent ──► ressources ──► construire / améliorer
        ▲                                     │
        │                                     ▼
 nouveaux habitants ◄── logements + bien-être ◄── bâtiments
                                              │
                                              ▼
                        spores ──► arbre-mère ──► floraison (prestige)
```

### 3.2 Ressources (V1)

| Ressource | Rôle | Source principale |
|---|---|---|
| **Baies** | Nourriture des habitants ; stock pour l'hiver | Cueillette (rien ne pousse en hiver) |
| **Bois mort** | Construction | Ramassage en forêt |
| **Mousse** | Isolation, confort, améliorations | Tapis de mousse (plus lent en été) |
| **Spores** | Croissance de l'arbre-mère, déblocages | Habitants heureux + racines de l'arbre-mère |

Chaque ressource a un stock maximal, augmenté par les bâtiments de stockage.

### 3.3 Bâtiments (V1 : 10)

| Bâtiment | Effet | Bonus de voisinage (exemples) |
|---|---|---|
| Hutte-chapeau | Loge 2 habitants | +bien-être à côté d'un feu de camp |
| Cueillette | Produit des baies | +25 % à côté d'un buisson sauvage |
| Tas de bois | Produit du bois mort | +25 % en lisière de forêt |
| Tapis de mousse | Produit de la mousse | +25 % près de l'eau ou à l'ombre |
| Garde-manger | +stock de baies | — |
| Remise | +stock de bois et de mousse | — |
| Séchoir | Convertit des baies en baies séchées, qui se conservent pour l'hiver | +vitesse à côté du garde-manger |
| Feu de camp | Bien-être et chaleur alentour (réduit le ralentissement hivernal) | — |
| Atelier | Améliorations : vitesse des habitants, outils | — |
| Relais des visiteurs | Accueille jusqu'à 2 visiteurs à la fois | — |

L'**arbre-mère** est présent dès le départ, au centre de l'île ; il ne se construit pas.

### 3.4 Habitants

- Arrivent quand il y a des logements libres et un bien-être suffisant.
- Choisissent seuls leur tâche selon les **priorités du village** (curseurs : récolter / construire /
  stocker / soigner l'arbre-mère).
- On peut **épingler** un habitant sur une tâche précise.
- Animations visibles : marcher, porter, construire, dormir la nuit, se réchauffer au feu en hiver.
- V1 : une seule espèce, avec des variations de couleur de chapeau. Espèces rares après la V1.

### 3.5 Saisons et météo

- Cycle printemps → été → automne → hiver, mesuré en **temps de jeu ouvert** (durée à régler,
  base de départ : 30 min par saison).
- La météo (soleil, pluie, vent, neige) module légèrement la production et pilote les ambiances sonores.
- **Hiver** : les baies ne poussent plus et la production baisse sans stock ni feux de camp.
  Ce n'est qu'un **ralentissement** : jamais de perte d'habitants ni de ressources.

### 3.6 Visiteurs

Ils arrivent au relais, **attendent indéfiniment**, et déclenchent le point sur l'icône de la
barre des menus.

| Visiteur | Interaction |
|---|---|
| Hérisson marchand | Échange de ressources à un taux variable |
| Escargot voyageur | Mini-quête : « apporte-moi X », récompensée en spores ou en plan de bâtiment |
| Luciole | Bonus temporaire de production (se déclenche quand on l'accepte) |

### 3.7 Arbre-mère et prestige

- Nourri de spores, il passe par des stades visibles (pousse → arbuste → arbre → floraison).
  Son **mycélium** s'étend dans la coupe souterraine de l'île.
- Chaque stade débloque des bâtiments ou des améliorations.
- **Floraison** : les spores s'envolent vers une **nouvelle île** (après la V1 : marais, montagne,
  île de corail…). On repart avec des **bonus permanents** (graines de mycélium) et l'ancienne île
  reste consultable.
- V1 : la première floraison est jouable jusqu'au bout ; l'écran de départ vers une nouvelle île
  annonce la suite.

### 3.8 Contenu de la V1

1 île (forêt), 4 ressources, 10 bâtiments, 4 saisons + météo, 3 visiteurs, arbre-mère en 4 stades
jusqu'à la première floraison, FR + EN, ambiances sonores.

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
│   ├── content/            # données : ressources, bâtiments, visiteurs, équilibrage
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
- **Systèmes** : ressources, production, habitants (choix de tâche par priorités), construction,
  bien-être, saisons et météo, visiteurs, arbre-mère.
- **Commandes** (frontend → moteur) : `poserBatiment`, `deplacerBatiment`, `demolir`, `ameliorer`,
  `reglerPriorites`, `epinglerHabitant`, `repondreVisiteur`, `nourrirArbre`, `fleurir`, `modifierReglage`.
- **Événements** (moteur → frontend) : instantané léger toutes les 250 ms + événements ponctuels
  (`visiteurArrive`, `saisonChangee`, `stadeAtteint`, `stockPlein`…). Le contrat complet est dans
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

- Fenêtre sans bordure, transparente, toujours au-dessus, redimensionnable (minimum 240×240, défaut 320×320),
  déplaçable par glisser ; position et taille mémorisées.
- Réglages : opacité de la fenêtre, « toujours au-dessus » activable, lancement au démarrage.
- **Icône de barre des menus** : afficher / cacher, point de notification, résumé des ressources
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

- Caméra **orthographique isométrique** ; rotation par pas de 90° ; 2 niveaux de zoom.
- **Pipeline pixelisé** : rendu dans une cible basse résolution (½ de la taille de la fenêtre),
  agrandie avec filtrage `nearest` ; passe de **contours** (détection de bords sur la profondeur et
  les normales) ; ombrage en paliers (toon) ; palette limitée.
- Fond **transparent** (`alpha: true`, fond à opacité 0) : seul l'îlot flotte sur le bureau.
- **Îlot en coupe** : couches herbe / terre / roche, mycélium de l'arbre-mère visible sous terre.
- Grille de placement visible uniquement en mode construction ; aperçu fantôme vert ou rouge.
- Saisons : teinte du sol et des arbres, neige, feuilles qui tombent ; météo en particules.
- Habitants : sprites 3D simples, animations par sous-parties (rebond, balancement).
- Performances : **30 i/s** quand la fenêtre est visible, **0** quand elle est cachée,
  images supplémentaires limitées quand rien ne bouge.

### 6.2 Interface (`packages/ui`)

- **Au repos** : l'îlot seul. Un habitant fait signe au-dessus du relais quand un visiteur attend.
- **Au survol** : compteurs de ressources (colonne en bas à gauche, façon Tiny Tycoon) + barre
  d'outils compacte : Construire · Habitants · Arbre-mère · Réglages.
- Panneaux superposés à l'îlot, fermables d'un clic ou avec Échap.
- Style : police pixel épaisse, boutons pleins cerclés de noir, contrastes forts pour rester
  lisible en 320 px.
- Infobulles : coût, production, bonus de voisinage.

### 6.3 Audio

- Ambiances en boucle (oiseaux, pluie, vent, feu) mixées selon la météo et la saison.
- Petits sons d'interface (poser, récolter, visiteur).
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

### Étape 9 — Habillage
- Modèles définitifs (Blockbench ou MagicaVoxel), animations des habitants, police pixel, style de l'interface.
- Ambiances sonores et sons d'interface ; traduction EN.
- **Critère** : plus aucune forme provisoire ; FR et EN complets ; son coupé au premier lancement.

### Étape 10 — Équilibrage et diffusion → **V1**
- Simulations accélérées pour régler la courbe (temps jusqu'à la floraison : cible à définir, base 15-25 h de jeu ouvert).
- Consommation : CPU et batterie fenêtre visible et cachée.
- GitHub Actions : .dmg (Mac Apple Silicon + Intel) et .exe ; mises à jour automatiques.
- Vérification sous Windows : transparence, toujours au-dessus, zone de notification.
- **Critère** : Celian installe la V1 depuis le .dmg et la garde ouverte une journée entière.

### Après la V1
1. Nouvelles îles (marais, montagne…) et bonus permanents de prestige.
2. Espèces d'habitants rares et collection.
3. Synchronisation via le Raspberry Pi.
4. Signature et notarisation Apple, page itch.io.

---

## 8. Risques identifiés

| Risque | Parade |
|---|---|
| macOS gèle le Worker quand la fenêtre est cachée (**confirmé** à l'étape 0) | Rattrapage du temps écoulé ; fenêtre cachée, un pouls envoyé par Rust toutes les 20 s suffit à réveiller le Worker (mesuré à l'étape 7) |
| Fenêtre transparente capricieuse selon la version de macOS ou de Windows | Validée à l'étape 0 ; repli sur une fenêtre à fond coloré arrondi |
| Consommation batterie d'un rendu 3D permanent | 30 i/s maximum, 0 caché, rendu à la demande quand rien ne bouge |
| Interface illisible en 320 px | Test systématique à la taille minimale dès l'étape 4 |
| Équilibrage d'un idle long à régler à la main | Simulation accélérée sans affichage, possible grâce au moteur séparé |

## 9. Questions ouvertes (à trancher en cours de route)

- Durée exacte d'une saison et temps cible jusqu'à la floraison (premier jet : 17,8 h, étape 8).
- Taille de la grille de départ et éventuel agrandissement de l'île.
- Identité des habitants : ont-ils un nom d'espèce propre ?
- Direction musicale si on ajoute un jour une musique.
