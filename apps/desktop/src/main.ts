import '@tiny-shrooms/ui/interface.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { contenu } from '@tiny-shrooms/content';
import type { MessageDepuisMoteur, MessageVersMoteur } from '@tiny-shrooms/engine';
import { CHAPEAUX, COULEURS_BATIMENT, DUREE_ENVOL_MS, Rendu } from '@tiny-shrooms/renderer';
import { ControleurInterface, infobulleAlerte } from '@tiny-shrooms/ui';

const dansTauri = '__TAURI_INTERNALS__' in window;
const SAUVEGARDE_AUTO_MS = 30_000;

// Fichiers via Rust dans l'application ; dans un simple navigateur, le stockage local suffit à l'aperçu.
const stockage = dansTauri
  ? {
      lire: () => invoke<string[]>('lire_sauvegardes'),
      ecrire: (contenu: string) => invoke<void>('ecrire_sauvegarde', { contenu }),
    }
  : {
      lire: async () => [localStorage.getItem('tiny-shrooms.partie')].filter((s) => s !== null),
      ecrire: async (contenu: string) => localStorage.setItem('tiny-shrooms.partie', contenu),
    };

const rendu = new Rendu(document.body);
const moteur = new Worker(new URL('./moteur-worker.ts', import.meta.url), { type: 'module' });
const envoyer = (message: MessageVersMoteur) => moteur.postMessage(message);

const ui = new ControleurInterface(document.getElementById('interface')!, {
  scene: rendu,
  contenu,
  envoyer: (commande) => envoyer({ type: 'commande', commande }),
  couleurs: { batiments: COULEURS_BATIMENT, chapeaux: CHAPEAUX },
  dureeEnvolMs: DUREE_ENVOL_MS,
  deplacerFenetre: dansTauri ? () => void getCurrentWindow().startDragging() : undefined,
});
if (import.meta.env.DEV) Object.assign(globalThis, { rendu, ui, moteur });

// Écritures à la file, pour que la rotation des copies ne se chevauche jamais.
let ecritures = Promise.resolve();
let fermetureDemandee = false;
const sauvegarder = () => envoyer({ type: 'sauvegarder' });

// Point sur l'icône de la barre des menus tant qu'un visiteur attend.
let visiteursSignales = 0;
function signalerVisiteurs(nombre: number) {
  if (!dansTauri || nombre === visiteursSignales) return;
  visiteursSignales = nombre;
  invoke('signaler_alerte', { alerte: nombre > 0, infobulle: infobulleAlerte(nombre) }).catch((erreur) => console.error('alerte impossible', erreur));
}

moteur.onmessage = ({ data }: MessageEvent<MessageDepuisMoteur>) => {
  if (data.type === 'sauvegarde') {
    ecritures = ecritures
      .then(() => stockage.ecrire(data.contenu))
      .catch((erreur) => console.error('sauvegarde impossible', erreur));
    if (fermetureDemandee) void ecritures.then(() => invoke('quitter'));
    return;
  }
  // Rien n'est écrit avant que la partie soit chargée : une partie neuve n'écrase pas un fichier en attente.
  if (data.type === 'partieChargee') setInterval(sauvegarder, SAUVEGARDE_AUTO_MS);
  if (data.type === 'ile') rendu.appliquerIle(data.ile);
  else if (data.type === 'instantane') {
    rendu.appliquerInstantane(data.instantane);
    signalerVisiteurs(data.instantane.visiteurs.length);
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
