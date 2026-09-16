// Le moteur tourne ici, à l'écart du rendu : il bat toutes les 250 ms et rattrape tout retard.
import { contenu } from '@tiny-shrooms/content';
import { Moteur, PAS_DE_SIMULATION_MS, type MessageDepuisMoteur, type MessageVersMoteur, type TypeBatiment } from '@tiny-shrooms/engine';

const portee = globalThis as unknown as {
  postMessage(message: MessageDepuisMoteur): void;
  onmessage: ((message: MessageEvent<MessageVersMoteur>) => void) | null;
};

const moteur = new Moteur(contenu, Date.now());
let battement: ReturnType<typeof setInterval> | null = null;

const publier = (messages: MessageDepuisMoteur[]) => messages.forEach((m) => portee.postMessage(m));

portee.onmessage = ({ data }) => {
  publier(moteur.recevoir(data, Date.now()));
  if (data.type !== 'demarrer' || battement !== null) return;
  battement = setInterval(() => publier(moteur.battre(Date.now())), PAS_DE_SIMULATION_MS);
  // En attendant l'interface de l'étape 4 : quelques bâtiments pour voir le village vivre.
  if (import.meta.env.DEV && data.sauvegarde === null) {
    const cases = moteur.casesLibres();
    (['cueillette', 'tasDeBois', 'hutte'] as TypeBatiment[]).forEach((batiment, i) => {
      const commande = { type: 'poserBatiment', batiment, case: cases[i * 3]!, orientation: 0 } as const;
      publier(moteur.recevoir({ type: 'commande', commande }, Date.now()));
    });
  }
};
