<div align="center">

<img src="docs/icone.png" width="128" alt="Icône de Tiny Shrooms" />

# Tiny Shrooms

**Une petite ville de champignons sur une île flottante, qui vit dans un coin de ton écran.**

[![Télécharger pour Mac](https://img.shields.io/badge/Mac-Télécharger-d8423a?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/Magicelian/tiny-shrooms/releases/latest)
[![Télécharger pour Windows](https://img.shields.io/badge/Windows-Télécharger-3d8fe8?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Magicelian/tiny-shrooms/releases/latest)

![Dernière version](https://img.shields.io/github/v/release/Magicelian/tiny-shrooms?label=version&color=7cc452)
![Français · English](https://img.shields.io/badge/langues-FR%20·%20EN-e8a33d)

<img src="docs/village.gif" width="480" alt="Un village de champignons animé" />

</div>

## 🍄 Le jeu

- 🧺 **On commence seul** : un clic sur un buisson, du bois mort ou de la mousse, et on récolte.
- 🏡 **Les habitants arrivent**, prennent les emplois et construisent tout seuls.
- ⬆️ **Les huttes montent en gamme** (maison, puis manoir) quand leurs besoins sont satisfaits : nourriture, chaleur, eau, commerce.
- 🌦️ **Les saisons passent** : la pluie, la neige et la nuit changent l'île et le rythme de la production.
- 🌱 **Au bourg, on renaît** sur une nouvelle île, avec des pouvoirs qui rendent chaque partie plus rapide.

C'est un jeu **idle** et apaisant : on n'y perd jamais rien, et on y jette un œil quand on veut. La fenêtre fait
320 × 320 pixels et reste au-dessus des autres.

<table align="center">
  <tr>
    <td align="center"><img src="docs/hameau.png" width="200" alt="Hameau au printemps" /><br /><sub><b>Hameau</b> · printemps</sub></td>
    <td align="center"><img src="docs/village.png" width="200" alt="Village en été" /><br /><sub><b>Village</b> · été</sub></td>
    <td align="center"><img src="docs/automne.png" width="200" alt="Village en automne" /><br /><sub><b>Village</b> · automne</sub></td>
    <td align="center"><img src="docs/bourg-hiver.png" width="200" alt="Bourg sous la neige" /><br /><sub><b>Bourg</b> · hiver</sub></td>
  </tr>
</table>

## 📦 Installer

Dans la **[dernière version](https://github.com/Magicelian/tiny-shrooms/releases/latest)**, prends un seul fichier :

| | Fichier à télécharger |
|---|---|
| 🍎 **Mac** (Apple Silicon ou Intel) | `Tiny.Shrooms_…_universal.dmg` |
| 🪟 **Windows** | `Tiny.Shrooms_…_x64-setup.exe` |

Les autres fichiers de la page servent aux mises à jour automatiques.

<details>
<summary><b>🍎 Mac : installation pas à pas</b></summary>

1. Ouvre le `.dmg` et glisse **Tiny Shrooms** dans **Applications**.
2. Le jeu n'est pas signé par Apple, donc macOS le bloque au premier lancement. Deux façons de le débloquer :
   - **Réglages Système → Confidentialité et sécurité**, puis **Ouvrir quand même** en bas de la page ;
   - ou, dans le Terminal, une fois le jeu dans Applications :
     ```bash
     xattr -cr "/Applications/Tiny Shrooms.app"
     ```
3. Le jeu n'apparaît pas dans le Dock : il vit dans la **barre des menus**, en haut de l'écran 🍄.

</details>

<details>
<summary><b>🪟 Windows : installation pas à pas</b></summary>

1. Lance le `-setup.exe`.
2. Si SmartScreen affiche un avertissement : **Informations complémentaires**, puis **Exécuter quand même**.
3. L'icône du jeu apparaît dans la zone de notification, en bas à droite.

</details>

## 🎮 Jouer

<img src="docs/gros-plan.png" width="280" align="right" alt="Gros plan sur le village" />

| Action | Commande |
|---|---|
| Construire, récolter, inspecter | **clic** |
| Déplacer la vue | **glisser** |
| Zoomer | **molette** ou `Z` |
| Tourner l'île | `←` `→` ou `Q` `E` |
| Déplacer la fenêtre | `⌘` + glisser<br />(`Ctrl` sous Windows) |

Si la fenêtre n'est pas active, le premier clic ne fait que l'activer.

Le **menu de l'icône** permet d'afficher ou de cacher la fenêtre, de verrouiller sa position, et de régler le son
(coupé au départ) et la langue.

💾 La partie s'enregistre toute seule. Appli fermée, le jeu est en pause ; fenêtre cachée, la ville continue de vivre.

🔄 Les mises à jour se téléchargent seules : quand l'une d'elles est prête, **Redémarrer pour mettre à jour**
apparaît dans le menu de l'icône.

<br clear="right" />

## 🛠️ Développement

Tauri 2, Three.js et Preact, avec un moteur de jeu en TypeScript sans affichage. Il faut Node, pnpm et Rust.

```bash
pnpm install
pnpm dev          # lance l'application
pnpm test         # tests, dont les simulations d'équilibrage
pnpm typecheck
```

| Dossier | Contenu |
|---|---|
| `apps/desktop` | application : frontend, Worker du moteur, shell Rust (`src-tauri`) |
| `packages/engine` | moteur de jeu pur |
| `packages/content` | chiffres d'équilibrage et simulations |
| `packages/renderer` | île en voxels pixelisée |
| `packages/ui` · `packages/i18n` | interface · textes FR et EN |

Le [cahier des charges](cahier-des-charges.md) décrit la vision, l'architecture et les étapes du projet.

**Publier une version** : mettre le même numéro dans `apps/desktop/src-tauri/tauri.conf.json` et dans
`Cargo.toml`, puis pousser l'étiquette `vX.Y.Z`. GitHub Actions construit les installeurs et publie la version.
