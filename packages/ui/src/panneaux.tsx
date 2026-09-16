// Contenu des bulles ouvertes au clic.
import { useState } from 'preact/hooks';
import type { Batiment, Instantane } from '@tiny-shrooms/engine';
import { AMELIORATIONS_VILLAGE, coutAmelioration } from '@tiny-shrooms/engine';
import { nombre, t } from '@tiny-shrooms/i18n';
import { abordable, effets, listeQuantites, nomBatiment, pourcent } from './format';
import type { ControleurInterface } from './index';
import { useMagasin, type Bulle } from './magasin';

interface Props {
  controleur: ControleurInterface;
  instantane: Instantane;
}

const hex = (couleur: number) => `#${couleur.toString(16).padStart(6, '0')}`;

export function BulleConstruire({ controleur, instantane, bulle }: Props & { bulle: Extract<Bulle, { type: 'construire' }> }) {
  const { contenu, couleurs } = controleur;
  const { bonusVise } = useMagasin(controleur.magasin);
  const { choix } = bulle;
  const payable = choix !== null && abordable(contenu.batiments[choix].cout, instantane.stocks);
  return (
    <>
      <ul class="catalogue">
        {instantane.batimentsDebloques.map((type) => {
          const cout = contenu.batiments[type].cout;
          return (
            <li key={type}>
              <button
                class={`carte ${abordable(cout, instantane.stocks) ? '' : 'manque'} ${type === choix ? 'choisie' : ''}`}
                onClick={() => controleur.choisir(type)}
              >
                <span class="pastille" style={{ background: hex(couleurs.batiments[type]) }} />
                <span class="nom">{nomBatiment(type)}</span>
                <span class="cout">{listeQuantites(cout) || t('construction.gratuit')}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div class="detail">
        {choix ? (
          <>
            {effets(contenu, choix).map((ligne) => (
              <p key={ligne}>{ligne}</p>
            ))}
            {bonusVise !== null && bonusVise > 1 && (
              <p class="bonus">{t('construction.bonusIci', { pourcent: pourcent(bonusVise - 1) })}</p>
            )}
            <button class={`bouton large ${payable ? 'valider' : 'manque'}`} disabled={!payable} onClick={() => controleur.construire()}>
              {t('construction.poser')}
            </button>
          </>
        ) : (
          <p class="discret">{t('construction.choisir')}</p>
        )}
      </div>
    </>
  );
}

export function BulleBatiment({ controleur, batiment, instantane }: Props & { batiment: Batiment }) {
  const [confirmer, setConfirmer] = useState(false);
  const { contenu } = controleur;
  const def = contenu.batiments[batiment.type];
  const remboursement = listeQuantites(def.cout, contenu.remboursementDemolition);
  const enChantier = batiment.chantier !== null;
  // Bâtisseurs pendant le chantier, récolteurs ensuite.
  const postes = enChantier ? contenu.habitants.ouvriersParChantier : def.production ? (def.postes ?? 1) : 0;
  const pourvus = instantane.habitants.filter(
    (h) => h.lieu === batiment.id && h.tache === (enChantier ? 'construire' : 'recolter'),
  ).length;
  return (
    <>
      {enChantier && (
        <>
          <p>{t('effet.chantier', { pourcent: pourcent(batiment.chantier!) })}</p>
          <Jauge valeur={batiment.chantier!} />
        </>
      )}
      {postes > 0 && <p><strong>{t(enChantier ? 'construction.batisseurs' : 'construction.emplois', { pourvus, postes })}</strong></p>}
      {effets(contenu, batiment.type).map((ligne) => (
        <p key={ligne}>{ligne}</p>
      ))}
      {batiment.bonusVoisinage > 1 && <p class="bonus">{t('effet.bonusActuel', { pourcent: pourcent(batiment.bonusVoisinage - 1) })}</p>}
      {batiment.type === 'atelier' && !enChantier && <Ameliorations controleur={controleur} instantane={instantane} />}
      <div class="actions">
        <button class="bouton" onClick={() => controleur.commencerDeplacement(batiment.id)}>
          {t('construction.deplacer')}
        </button>
        <button
          class={`bouton ${confirmer ? 'danger' : ''}`}
          onClick={() => {
            if (!confirmer) return setConfirmer(true);
            controleur.envoyer({ type: 'demolir', id: batiment.id });
            controleur.fermer();
          }}
        >
          {confirmer ? t('construction.confirmer', { liste: remboursement }) : t('construction.demolir')}
        </button>
      </div>
    </>
  );
}

function Ameliorations({ controleur, instantane }: Props) {
  return (
    <ul class="ameliorations">
      {AMELIORATIONS_VILLAGE.map((a) => {
        const def = controleur.contenu.ameliorations[a];
        const niveau = instantane.ameliorations[a];
        const cout = coutAmelioration(controleur.contenu, a, niveau);
        return (
          <li key={a}>
            <p>
              <strong>{t(`amelioration.${a}`)}</strong> · {t('amelioration.niveau', { niveau, max: def.niveauMax })}
            </p>
            <p class="discret">{t(`amelioration.effet.${a}`, { pourcent: pourcent(def.effet * niveau) })}</p>
            {cout ? (
              <button
                class={`bouton large ${abordable(cout, instantane.stocks) ? '' : 'manque'}`}
                onClick={() => controleur.envoyer({ type: 'ameliorer', cible: { village: a } })}
              >
                {t('amelioration.acheter', { liste: listeQuantites(cout) })}
              </button>
            ) : (
              <p class="bonus">{t('amelioration.max')}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Jauge({ valeur }: { valeur: number }) {
  return (
    <div class="jauge">
      <div style={{ width: `${Math.round(valeur * 100)}%` }} />
    </div>
  );
}
