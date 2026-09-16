import '@tiny-shrooms/ui/interface.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { contenu } from '@tiny-shrooms/content';
import type { MessageDepuisMoteur, MessageVersMoteur } from '@tiny-shrooms/engine';
import { CHAPEAUX, COULEURS_BATIMENT, Rendu } from '@tiny-shrooms/renderer';
import { ControleurInterface } from '@tiny-shrooms/ui';

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

const rendu = new Rendu(document.body);
const moteur = new Worker(new URL('./moteur-worker.ts', import.meta.url), { type: 'module' });
const envoyer = (message: MessageVersMoteur) => moteur.postMessage(message);

const ui = new ControleurInterface(document.getElementById('interface')!, {
  scene: rendu,
  contenu,
  envoyer: (commande) => envoyer({ type: 'commande', commande }),
  couleurs: { batiments: COULEURS_BATIMENT, chapeaux: CHAPEAUX },
  deplacerFenetre: dansTauri ? () => void getCurrentWindow().startDragging() : undefined,
});
if (import.meta.env.DEV) Object.assign(globalThis, { rendu, ui, moteur });

// Écritures à la file, pour que la rotation des copies ne se chevauche jamais.
let ecritures = Promise.resolve();
let fermetureDemandee = false;
const sauvegarder = () => envoyer({ type: 'sauvegarder' });

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
  }
  ui.recevoir(data);
};
envoyer({ type: 'demarrer', sauvegardes: await stockage.lire().catch(() => []) });
rendu.demarrer();
window.addEventListener('resize', () => rendu.redimensionner());

// Rendu coupé quand la fenêtre est cachée ; la simulation, elle, continue.
if (dansTauri) {
  await listen('fenetre-cachee', () => rendu.arreter());
  await listen('fenetre-affichee', () => rendu.demarrer());
  await listen<boolean>('survol', (e) => ui.signalerSurvol(e.payload));
  await listen<boolean>('verrouillage', (e) => ui.signalerVerrouillage(e.payload));
  const reglages = await invoke<{ verrouillee: boolean }>('lire_reglages');
  ui.signalerVerrouillage(reglages.verrouillee);
  await listen<number>('veille', (e) => {
    envoyer({ type: 'veille', momentMs: e.payload });
    sauvegarder();
  });
  await listen('reveil', () => envoyer({ type: 'reveil' }));
  await listen('pouls', () => envoyer({ type: 'battre' }));
  await listen('fermeture-demandee', () => {
    fermetureDemandee = true;
    sauvegarder();
  });
} else {
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && sauvegarder());
}
