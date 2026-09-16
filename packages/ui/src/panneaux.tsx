// Contenu des panneaux superposés à l'îlot.
import { useState } from 'preact/hooks';
import type { Batiment, Instantane, TypeBatiment } from '@tiny-shrooms/engine';
import { AMELIORATIONS_VILLAGE, coutAmelioration } from '@tiny-shrooms/engine';
import { nombre, t } from '@tiny-shrooms/i18n';
import { abordable, effets, listeQuantites, nomBatiment, pourcent } from './format';
import type { ControleurInterface } from './index';

interface Props {
  controleur: ControleurInterface;
  instantane: Instantane;
}

const hex = (couleur: number) => `#${couleur.toString(16).padStart(6, '0')}`;

export function PanneauConstruire({ controleur, instantane }: Props) {
  const [survole, setSurvole] = useState<TypeBatiment | null>(null);
  const { contenu, couleurs } = controleur;
  return (
    <>
      <ul class="catalogue">
        {instantane.batimentsDebloques.map((type) => {
          const cout = contenu.batiments[type].cout;
          const payable = abordable(cout, instantane.stocks);
          return (
            <li key={type}>
              <button
                class={`carte ${payable ? '' : 'manque'}`}
                onMouseEnter={() => setSurvole(type)}
                onFocus={() => setSurvole(type)}
                onClick={() => controleur.commencerPlacement(type)}
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
        {survole
          ? effets(contenu, survole).map((ligne) => <p key={ligne}>{ligne}</p>)
          : <p class="discret">{t('construction.aide')}</p>}
      </div>
    </>
  );
}

export function PanneauBatiment({ controleur, batiment, instantane }: Props & { batiment: Batiment }) {
  const [confirmer, setConfirmer] = useState(false);
  const { contenu } = controleur;
  const remboursement = listeQuantites(contenu.batiments[batiment.type].cout, contenu.remboursementDemolition);
  return (
    <>
      {batiment.chantier !== null && (
        <>
          <p>{t('effet.chantier', { pourcent: pourcent(batiment.chantier) })}</p>
          <Jauge valeur={batiment.chantier} />
        </>
      )}
      {effets(contenu, batiment.type).map((ligne) => (
        <p key={ligne}>{ligne}</p>
      ))}
      {batiment.bonusVoisinage > 1 && <p class="bonus">{t('effet.bonusActuel', { pourcent: pourcent(batiment.bonusVoisinage - 1) })}</p>}
      {batiment.type === 'atelier' && batiment.chantier === null && <Ameliorations controleur={controleur} instantane={instantane} />}
      <button
        class={`bouton large ${confirmer ? 'danger' : ''}`}
        onClick={() => {
          if (!confirmer) return setConfirmer(true);
          controleur.envoyer({ type: 'demolir', id: batiment.id });
          controleur.magasin.modifier({ panneau: null });
        }}
      >
        {confirmer ? t('construction.confirmer', { liste: remboursement }) : t('construction.demolir')}
      </button>
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

export function PanneauReglages() {
  return (
    <>
      <p>{t('reglages.camera')}</p>
      <p class="discret">{t('reglages.aVenir')}</p>
    </>
  );
}

function Jauge({ valeur }: { valeur: number }) {
  return (
    <div class="jauge">
      <div style={{ width: `${Math.round(valeur * 100)}%` }} />
    </div>
  );
}
