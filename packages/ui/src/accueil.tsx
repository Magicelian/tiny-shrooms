// Menu de démarrage : titre, reprise ou nouvelle partie, son et langue. L'île tourne doucement derrière.
import { t } from '@tiny-shrooms/i18n';
import type { ControleurInterface } from './index';
import { useMagasin } from './magasin';

/** Touche qui accompagne le glisser pour déplacer l'île : ⌘ sur Mac, Ctrl ailleurs. */
const TOUCHE = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl';

const COMMANDES = [
  ['accueil.commande.clic', 'accueil.commande.clicAction'],
  ['accueil.commande.glisser', 'accueil.commande.glisserAction'],
  ['accueil.commande.toucheGlisser', 'accueil.commande.toucheGlisserAction'],
  ['accueil.commande.zoom', 'accueil.commande.zoomAction'],
  ['accueil.commande.tourner', 'accueil.commande.tournerAction'],
] as const;

export function Accueil({ controleur }: { controleur: ControleurInterface }) {
  const etat = useMagasin(controleur.magasin);
  const vignette = controleur.vignettes?.batiment('hutte', 3);

  return (
    <div class="accueil">
      <div class="titre-jeu">
        {vignette && <img class="vignette" src={vignette} alt="" />}
        <h1>
          <span>Tiny</span>
          <span class="rouge">Shrooms</span>
        </h1>
      </div>

      <section class="panneau-accueil">
        {etat.menu === 'commandes' ? (
          <div class="corps">
            <h2>{t('accueil.commandes')}</h2>
            <dl class="commandes">
              {COMMANDES.map(([geste, action]) => (
                <div key={geste}>
                  <dt>{t(geste, { touche: TOUCHE })}</dt>
                  <dd>{t(action)}</dd>
                </div>
              ))}
            </dl>
            <button class="bouton" onClick={() => controleur.montrerCommandes(false)}>
              {t('accueil.retour')}
            </button>
          </div>
        ) : etat.menu === 'confirmer' ? (
          <div class="corps">
            <h2>{t('accueil.confirmerTitre')}</h2>
            <p>{t('accueil.confirmerTexte')}</p>
            <div class="rangee-boutons">
              <button class="bouton" onClick={() => controleur.demanderRecommencer(false)}>
                {t('accueil.annuler')}
              </button>
              <button class="bouton danger" onClick={() => controleur.recommencer()}>
                {t('accueil.effacer')}
              </button>
            </div>
          </div>
        ) : (
          <div class="corps">
            <button class="bouton valider principal" onClick={() => controleur.continuer()}>
              ▶ {t(etat.partieReprise ? 'accueil.continuer' : 'accueil.jouer')}
            </button>
            {etat.partieReprise && (
              <button class="bouton large" onClick={() => controleur.demanderRecommencer(true)}>
                {t('accueil.nouvelle')}
              </button>
            )}
            <div class="rangee-boutons">
              <button class={`bouton ${etat.son ? 'actif' : ''}`} onClick={() => controleur.reglerSon()}>
                ♪ {t(etat.son ? 'accueil.sonActif' : 'accueil.sonCoupe')}
              </button>
              <span class="langues">
                <button class={`bouton ${etat.langue === 'fr' ? 'actif' : ''}`} onClick={() => controleur.reglerLangue('fr')}>
                  FR
                </button>
                <button class={`bouton ${etat.langue === 'en' ? 'actif' : ''}`} onClick={() => controleur.reglerLangue('en')}>
                  EN
                </button>
              </span>
            </div>
            <button class="bouton" onClick={() => controleur.montrerCommandes(true)}>
              {t('accueil.commandes')}
            </button>
            {controleur.quittable && (
              <button class="lien-quitter" onClick={() => controleur.quitter()}>
                {t('accueil.quitter')}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
