# Tiny Shrooms 🍄

Une petite ville de champignons sur une île flottante, qui vit dans un coin de ton écran.

On commence seul, à ramasser des baies, du bois mort et de la mousse. Puis des habitants arrivent, prennent
les emplois et réclament de quoi mieux vivre. Leurs huttes deviennent des maisons, puis des manoirs, et le
hameau devient un village, puis un bourg. Au bourg, un sanctuaire permet de renaître sur une nouvelle île,
avec des pouvoirs qui rendent chaque partie plus rapide.

C'est un jeu **idle** et apaisant : la fenêtre fait 320 × 320 pixels et reste au-dessus des autres. On n'y perd
jamais rien, et on y jette un œil quand on veut. Le jeu est en français et en anglais.

## Installer

Télécharge le fichier qui correspond à ton ordinateur dans la
**[dernière version](https://github.com/Magicelian/tiny-shrooms/releases/latest)** :

| Ordinateur | Fichier |
|---|---|
| Mac (Apple Silicon ou Intel) | `Tiny.Shrooms_…_universal.dmg` |
| Windows | `Tiny.Shrooms_…_x64-setup.exe` |

Les autres fichiers de la page servent aux mises à jour automatiques : pas besoin d'y toucher.

### Mac

1. Ouvre le `.dmg` et glisse **Tiny Shrooms** dans **Applications**.
2. Le jeu n'est pas signé par Apple, donc macOS le bloque au premier lancement. Pour l'ouvrir :
   - ouvre **Réglages Système → Confidentialité et sécurité**, puis clique sur **Ouvrir quand même** en bas de la page ;
   - ou, dans le Terminal : `xattr -cr "/Applications/Tiny Shrooms.app"`.
3. Le jeu n'apparaît pas dans le Dock : il vit dans la **barre des menus**, en haut de l'écran (petite icône de champignon).

### Windows

Lance le `-setup.exe`. Si SmartScreen affiche un avertissement, clique sur **Informations complémentaires**,
puis sur **Exécuter quand même**. L'icône du jeu apparaît dans la zone de notification.

## Jouer

| Action | Commande |
|---|---|
| Construire, récolter, voir un bâtiment | clic |
| Déplacer la vue | clic maintenu et glisser |
| Zoomer | molette, ou `Z` |
| Tourner l'île | `←` / `→`, `Q` / `E`, ou les boutons en bas à droite |
| Déplacer la fenêtre | `⌘` + glisser (`Ctrl` + glisser sous Windows) |

Si la fenêtre n'est pas active, le premier clic ne fait que l'activer.

Le **menu de l'icône** permet d'afficher ou de cacher la fenêtre, de verrouiller sa position, et de régler le son
(coupé au départ) et la langue. La partie s'enregistre toute seule. Quand l'appli est fermée, le jeu est en pause ;
fenêtre cachée, la ville continue de vivre.

## Mises à jour

Le jeu cherche lui-même les nouvelles versions et les télécharge en arrière-plan. Quand une version est prête,
l'entrée **Redémarrer pour mettre à jour** apparaît dans le menu de l'icône. La partie est enregistrée avant
l'installation.

## Développement

Tauri 2, Three.js et Preact, avec un moteur de jeu en TypeScript sans affichage. Il faut Node, pnpm et Rust.

```bash
pnpm install
pnpm dev          # lance l'application
pnpm test         # tests, dont les simulations d'équilibrage
pnpm typecheck
```

- `apps/desktop` : application (frontend, Worker du moteur, shell Rust dans `src-tauri`) ;
- `packages/engine` : moteur de jeu pur ; `packages/content` : chiffres d'équilibrage ;
- `packages/renderer` : île en voxels pixelisée ; `packages/ui` : interface ; `packages/i18n` : textes FR et EN.

Le [cahier des charges](cahier-des-charges.md) décrit la vision, l'architecture et les étapes du projet.

**Publier une version** : mettre le même numéro dans `apps/desktop/src-tauri/tauri.conf.json` et dans `Cargo.toml`,
puis pousser l'étiquette `vX.Y.Z`. GitHub Actions construit les installeurs et publie la version.
