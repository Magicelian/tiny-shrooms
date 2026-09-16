// Composants de l'interface : panneaux de bois (ressources), écriteau (saison), icône Réglages, bulles et messages.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Instantane, Meteo, Ressource } from '@tiny-shrooms/engine';
import { nombre, t } from '@tiny-shrooms/i18n';
import { nomBatiment, nomRessource, pourcent } from './format';
import type { ControleurInterface } from './index';
import { useMagasin, type Bulle } from './magasin';
import { BulleBatiment, BulleConstruire, BulleReglages } from './panneaux';

export interface Props {
  controleur: ControleurInterface;
}

const ICONES_METEO: Record<Meteo, string> = { soleil: '☀', pluie: '☂', vent: '≋', neige: '❄' };

const COULEURS_RESSOURCE: Record<Ressource, string> = {
  baies: '#c2358a',
  baiesSechees: '#8e3a5c',
  boisMort: '#9c6b3f',
  mousse: '#5fae6e',
  spores: '#e8d56a',
};

export function Interface({ controleur }: Props) {
  const etat = useMagasin(controleur.magasin);
  const { instantane, bulle, deplacement } = etat;
  if (!instantane) return null;

  return (
    <div class={`interface ${etat.focus ? 'active' : ''}`}>
      <Ecriteau instantane={instantane} />
      <Poteau instantane={instantane} />

      <button
        class={`bouton outil commande reglages ${bulle?.type === 'reglages' ? 'actif' : ''}`}
        title={t('outil.reglages')}
        aria-label={t('outil.reglages')}
        onClick={() => controleur.basculerReglages()}
      >
        ⚙
      </button>

      {deplacement !== null && <BandeauDeplacement controleur={controleur} bonus={etat.bonusVise} />}
      {bulle && <ContenuBulle controleur={controleur} bulle={bulle} instantane={instantane} />}

      <div class="messages">
        {etat.messages.map((m) => (
          <div key={m.id} class="message">
            {m.texte}
          </div>
        ))}
      </div>
    </div>
  );
}

function ContenuBulle({ controleur, bulle, instantane }: Props & { bulle: Bulle; instantane: Instantane }) {
  const fermer = () => controleur.fermer();
  if (bulle.type === 'reglages')
    return (
      <Cadre titre={t('outil.reglages')} fermer={fermer} position="reglages">
        <BulleReglages controleur={controleur} />
      </Cadre>
    );
  if (bulle.type === 'construire')
    return (
      <Cadre titre={t('construction.titre')} fermer={fermer} position={bulle.haut ? 'haut' : 'bas'}>
        <BulleConstruire controleur={controleur} instantane={instantane} bulle={bulle} />
      </Cadre>
    );
  const batiment = controleur.batiment(bulle.id);
  if (!batiment) return null;
  return (
    <Cadre titre={nomBatiment(batiment.type)} fermer={fermer} position={bulle.haut ? 'haut' : 'bas'}>
      <BulleBatiment key={batiment.id} controleur={controleur} instantane={instantane} batiment={batiment} />
    </Cadre>
  );
}

function Cadre(props: { titre: string; fermer: () => void; position: 'haut' | 'bas' | 'reglages'; children: ComponentChildren }) {
  return (
    <section class={`bulle commande ${props.position}`}>
      <header>
        <h2>{props.titre}</h2>
        <button class="bouton fermer" title={t('panneau.fermer')} onClick={props.fermer}>
          ✕
        </button>
      </header>
      <div class="corps">{props.children}</div>
    </section>
  );
}

/** Saison et météo sur un petit écriteau suspendu, en haut à gauche. */
function Ecriteau({ instantane }: { instantane: Instantane }) {
  const { temps } = instantane;
  return (
    <div class="ecriteau" title={t(`meteo.${temps.meteo}`)}>
      <span class="meteo">{ICONES_METEO[temps.meteo]}</span>
      {t('temps.annee', { saison: t(`saison.${temps.saison}`), annee: temps.annee })}
    </div>
  );
}

/** Ressources sur des planches clouées à un poteau, en bas à gauche. */
function Poteau({ instantane }: { instantane: Instantane }) {
  const { stocks } = instantane;
  const visibles: Ressource[] = ['baies', 'boisMort', 'mousse', 'spores'];
  if (stocks.baiesSechees.quantite > 0 || instantane.batimentsDebloques.includes('sechoir')) visibles.splice(1, 0, 'baiesSechees');
  return (
    <ul class="poteau">
      {visibles.map((r) => (
        <Planche key={r} ressource={r} instantane={instantane} />
      ))}
    </ul>
  );
}

function Planche({ ressource, instantane }: { ressource: Ressource; instantane: Instantane }) {
  const [detail, setDetail] = useState(false);
  const stock = instantane.stocks[ressource];
  const plein = stock.quantite >= stock.plafond;
  const variation = stock.productionParMinute;
  return (
    <li class={`planche ${plein ? 'plein' : ''}`} onMouseEnter={() => setDetail(true)} onMouseLeave={() => setDetail(false)}>
      <span class="pastille" style={{ background: COULEURS_RESSOURCE[ressource] }} />
      <span class="quantite">{nombre(Math.floor(stock.quantite))}</span>
      <span class="plafond">/{nombre(stock.plafond)}</span>
      {detail && (
        <span class="infobulle">
          {nomRessource(ressource)} · {variation >= 0 ? '+' : ''}
          {t('ressource.parMinute', { valeur: nombre(variation, 1) })}
        </span>
      )}
    </li>
  );
}

function BandeauDeplacement({ controleur, bonus }: Props & { bonus: number | null }) {
  const { deplacement } = controleur.magasin.valeur;
  const batiment = deplacement === null ? undefined : controleur.batiment(deplacement);
  if (!batiment) return null;
  return (
    <div class="bandeau commande">
      <div class="ligne">
        <span>
          <strong>{nomBatiment(batiment.type)}</strong>
          {bonus !== null && bonus > 1 && <span class="bonus"> · {t('construction.bonusIci', { pourcent: pourcent(bonus - 1) })}</span>}
        </span>
        <button class="bouton fermer" title={t('panneau.fermer')} onClick={() => controleur.fermer()}>
          ✕
        </button>
      </div>
      <div class="ligne aide">{t('construction.aideDeplacer')}</div>
    </div>
  );
}
