import '@tiny-shrooms/ui/interface.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { contenu } from '@tiny-shrooms/content';
import { problemes, type MessageDepuisMoteur, type MessageVersMoteur, type Probleme } from '@tiny-shrooms/engine';
import { surLangue, t } from '@tiny-shrooms/i18n';
import { CHAPEAUX, COULEURS_BATIMENT, Rendu, echelleAffichage } from '@tiny-shrooms/renderer';
import { ControleurInterface, type Langue } from '@tiny-shrooms/ui';

const dansTauri = '__TAURI_INTERNALS__' in window;
const SAUVEGARDE_AUTO_MS = 30_000;

// Fichiers via Rust dans l'application ; dans un simple navigateur, le stockage local suffit à l'aperçu.
const stockage = dansTauri
  ? {
      lire: () => invoke<string[]>('lire_sauvegardes'),
      ecrire: (contenu: string) => invoke<void>('ecrire_sauvegarde', { contenu }),
      archiver: () => invoke<void>('archiver_sauvegardes'),
    }
  : {
      lire: async () => [localStorage.getItem('tiny-shrooms.partie')].filter((s) => s !== null),
      ecrire: async (contenu: string) => localStorage.setItem('tiny-shrooms.partie', contenu),
      archiver: async () => {
        const ancienne = localStorage.getItem('tiny-shrooms.partie');
        if (ancienne !== null && localStorage.getItem('tiny-shrooms.partie.v3') === null) {
          localStorage.setItem('tiny-shrooms.partie.v3', ancienne);
        }
      },
    };

// En développement, `?sansMenu` ouvre directement la partie (captures du README, voir demo/demo.ts).
const avecMenu = !(import.meta.env.DEV && new URLSearchParams(location.search).has('sansMenu'));
let fermetureDemandee = false;

const rendu = new Rendu(document.body);
const moteur = new Worker(new URL('./moteur-worker.ts', import.meta.url), { type: 'module' });
const envoyer = (message: MessageVersMoteur) => moteur.postMessage(message);

const ui = new ControleurInterface(document.getElementById('interface')!, {
  scene: rendu,
  contenu,
  envoyer: (commande) => envoyer({ type: 'commande', commande }),
  couleurs: { batiments: COULEURS_BATIMENT, chapeaux: CHAPEAUX },
  vignettes: rendu.vignettes,
  deplacerFenetre: dansTauri ? () => void getCurrentWindow().startDragging() : undefined,
  demarrage: avecMenu
    ? {
        pause: (enPause) => envoyer(enPause ? { type: 'veille', momentMs: Date.now() } : { type: 'reveil' }),
        son: (actif) => (dansTauri ? void invoke('regler_son', { son: actif }) : ui.signalerSon(actif)),
        langue: (langue) => (dansTauri ? void invoke('regler_langue', { langue }) : ui.signalerLangue(langue)),
        // Seule l'application redimensionne sa fenêtre ; dans un navigateur, le réglage n'est pas proposé.
        taille: dansTauri ? (taille) => void invoke('regler_taille', { taille }) : undefined,
      }
    : undefined,
});
if (import.meta.env.DEV) Object.assign(globalThis, { rendu, ui, moteur });

// Écritures à la file, pour que la rotation des copies ne se chevauche jamais.
let ecritures = Promise.resolve();
const sauvegarder = () => envoyer({ type: 'sauvegarder' });
/** La partie est écrite d'abord ; la réponse du moteur déclenche la sortie. */
function quitter() {
  fermetureDemandee = true;
  sauvegarder();
}

// Pastille sur l'icône de la barre des menus tant qu'un problème dure ; l'infobulle les énumère.
let problemesSignales = '';
function signalerProblemes(liste: Probleme[], forcer = false) {
  const cle = liste.join(',');
  if (!dansTauri || (cle === problemesSignales && !forcer)) return;
  problemesSignales = cle;
  const infobulle = ['Tiny Shrooms', ...liste.map((p) => `• ${t(`probleme.${p}`)}`)].join('\n');
  invoke('signaler_problemes', { actif: liste.length > 0, infobulle }).catch((erreur) => console.error('pastille impossible', erreur));
}
surLangue(() => signalerProblemes(problemesSignales ? (problemesSignales.split(',') as Probleme[]) : [], true));

moteur.onmessage = ({ data }: MessageEvent<MessageDepuisMoteur>) => {
  if (data.type === 'sauvegarde') {
    ecritures = ecritures
      .then(() => stockage.ecrire(data.contenu))
      .catch((erreur) => console.error('sauvegarde impossible', erreur));
    if (fermetureDemandee) void ecritures.then(() => invoke('quitter'));
    return;
  }
  // Rien n'est écrit avant que la partie soit chargée : une partie neuve n'écrase pas un fichier en attente.
  if (data.type === 'partieChargee') {
    // Partie d'avant la réorientation : mise de côté avant que la nouvelle ne l'écrase.
    if (data.origine === 'ancienne') {
      ecritures = ecritures.then(stockage.archiver).catch((erreur) => console.error('archivage impossible', erreur));
    }
    setInterval(sauvegarder, SAUVEGARDE_AUTO_MS);
  }
  if (data.type === 'ile') rendu.appliquerIle(data.ile);
  else if (data.type === 'instantane') {
    rendu.appliquerInstantane(data.instantane);
    signalerProblemes(problemes(data.instantane));
  }
  ui.recevoir(data);
};
envoyer({ type: 'demarrer', sauvegardes: await stockage.lire().catch(() => []) });
// Menu de démarrage ouvert : la ville attend qu'on entre.
if (avecMenu) envoyer({ type: 'veille', momentMs: Date.now() });
rendu.demarrer();
// Fenêtre agrandie : l'île et l'interface grossissent ensemble.
const suivreTaille = () => {
  rendu.redimensionner();
  ui.reglerEchelle(echelleAffichage());
};
suivreTaille();
window.addEventListener('resize', suivreTaille);

// Rendu coupé quand la fenêtre est cachée ; la simulation, elle, continue.
if (dansTauri) {
  // Rust ne signale le survol qu'à son changement : la souris part donc du dehors.
  rendu.reposer(true);
  await listen('fenetre-cachee', () => {
    rendu.arreter();
    ui.sons.suspendre(true);
  });
  await listen('fenetre-affichee', () => {
    rendu.demarrer();
    ui.sons.suspendre(false);
  });
  await listen<boolean>('survol', (e) => {
    ui.signalerSurvol(e.payload);
    rendu.reposer(!e.payload);
  });
  await listen<boolean>('verrouillage', (e) => ui.signalerVerrouillage(e.payload));
  await listen<boolean>('son', (e) => ui.signalerSon(e.payload));
  await listen<Langue>('langue', (e) => ui.signalerLangue(e.payload));
  const reglages = await invoke<{ verrouillee: boolean; son: boolean; langue: Langue }>('lire_reglages');
  ui.signalerVerrouillage(reglages.verrouillee);
  ui.signalerLangue(reglages.langue);
  ui.signalerSon(reglages.son);
  await listen<number>('veille', (e) => {
    envoyer({ type: 'veille', momentMs: e.payload });
    sauvegarder();
  });
  await listen('reveil', () => ui.magasin.valeur.menu === null && envoyer({ type: 'reveil' }));
  await listen('pouls', () => envoyer({ type: 'battre' }));
  await listen('fermeture-demandee', quitter);
} else {
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && sauvegarder());
}
