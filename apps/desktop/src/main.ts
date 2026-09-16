import '@tiny-shrooms/ui/interface.css';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { contenu } from '@tiny-shrooms/content';
import type { MessageDepuisMoteur, MessageVersMoteur } from '@tiny-shrooms/engine';
import { CHAPEAUX, COULEURS_BATIMENT, Rendu } from '@tiny-shrooms/renderer';
import { ControleurInterface } from '@tiny-shrooms/ui';

const dansTauri = '__TAURI_INTERNALS__' in window;

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
if (import.meta.env.DEV) Object.assign(globalThis, { rendu, ui });

moteur.onmessage = ({ data }: MessageEvent<MessageDepuisMoteur>) => {
  if (data.type === 'ile') rendu.appliquerIle(data.ile);
  else if (data.type === 'instantane') rendu.appliquerInstantane(data.instantane);
  ui.recevoir(data);
};
envoyer({ type: 'demarrer', sauvegarde: null });
rendu.demarrer();
window.addEventListener('resize', () => rendu.redimensionner());

// Rendu coupé quand la fenêtre est cachée ; la simulation, elle, continue.
if (dansTauri) {
  await listen('fenetre-cachee', () => rendu.arreter());
  await listen('fenetre-affichee', () => rendu.demarrer());
  await listen<boolean>('survol', (e) => ui.signalerSurvol(e.payload));
}
