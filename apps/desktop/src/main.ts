import { listen } from '@tauri-apps/api/event';
import type { MessageDepuisMoteur, MessageVersMoteur } from '@tiny-shrooms/engine';
import { Rendu } from '@tiny-shrooms/renderer';

const rendu = new Rendu(document.body);
if (import.meta.env.DEV) Object.assign(globalThis, { rendu });

const moteur = new Worker(new URL('./moteur-worker.ts', import.meta.url), { type: 'module' });
const envoyer = (message: MessageVersMoteur) => moteur.postMessage(message);

moteur.onmessage = ({ data }: MessageEvent<MessageDepuisMoteur>) => {
  if (data.type === 'ile') rendu.appliquerIle(data.ile);
  else if (data.type === 'instantane') rendu.appliquerInstantane(data.instantane);
};
envoyer({ type: 'demarrer', sauvegarde: null });
rendu.demarrer();

// Commandes de caméra provisoires, en attendant l'interface de l'étape 4.
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'q') rendu.tourner(-1);
  else if (e.key === 'ArrowRight' || e.key === 'e') rendu.tourner(1);
  else if (e.key === 'z') rendu.basculerZoom();
});
window.addEventListener('wheel', () => rendu.basculerZoom(), { passive: true });
window.addEventListener('resize', () => rendu.redimensionner());

// Rendu coupé quand la fenêtre est cachée ; la simulation, elle, continue.
if ('__TAURI_INTERNALS__' in window) {
  await listen('fenetre-cachee', () => rendu.arreter());
  await listen('fenetre-affichee', () => rendu.demarrer());
}
