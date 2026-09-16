// Composants de l'interface : compteurs, barre d'outils, bandeau de placement, panneaux et messages.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Instantane, Meteo, Ressource, TypeBatiment } from '@tiny-shrooms/engine';
import { nombre, t } from '@tiny-shrooms/i18n';
import { abordable, listeQuantites, nomBatiment, nomRessource, pourcent } from './format';
import type { ControleurInterface } from './index';
import { useMagasin, type Panneau } from './magasin';
import { PanneauBatiment, PanneauConstruire, PanneauReglages } from './panneaux';

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
  const { instantane, panneau, placement } = etat;
  if (!instantane) return null;
  const ouvrir = (p: Panneau) =>
    controleur.magasin.modifier({ panneau: memePanneau(panneau, p) ? null : p, placement: null });

  return (
    <div class={`interface ${etat.survol || placement ? 'visible' : ''}`}>
      <div class="haut">
        <div class="infos">
          <span class="etiquette" title={t(`meteo.${instantane.temps.meteo}`)}>
            {ICONES_METEO[instantane.temps.meteo]}{' '}
            {t('temps.annee', { saison: t(`saison.${instantane.temps.saison}`), annee: instantane.temps.annee })}
          </span>
        </div>
        <nav class="outils">
          <Outil icone="🔨" titre={t('outil.construire')} actif={panneau === 'construire' || !!placement} onClick={() => (placement ? controleur.finirPlacement() : ouvrir('construire'))} />
          <Outil icone="⚙" titre={t('outil.reglages')} actif={panneau === 'reglages'} onClick={() => ouvrir('reglages')} />
        </nav>
      </div>

      {placement && <BandeauPlacement controleur={controleur} type={placement} bonus={etat.bonusVise} instantane={instantane} />}

      <Compteurs instantane={instantane} />

      <nav class="camera">
        <Outil petit icone="⟲" titre={t('outil.tournerGauche')} onClick={() => controleur.tourner(-1)} />
        <Outil petit icone="⟳" titre={t('outil.tournerDroite')} onClick={() => controleur.tourner(1)} />
        <Outil petit icone="⌕" titre={t('outil.zoom')} onClick={() => controleur.basculerZoom()} />
      </nav>

      {panneau && <ContenuPanneau controleur={controleur} panneau={panneau} instantane={instantane} />}

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

function memePanneau(a: Panneau | null, b: Panneau): boolean {
  if (typeof a === 'object' && a !== null && typeof b === 'object') return a.batiment === b.batiment;
  return a === b;
}

function ContenuPanneau({ controleur, panneau, instantane }: Props & { panneau: Panneau; instantane: Instantane }) {
  const fermer = () => controleur.magasin.modifier({ panneau: null });
  if (panneau === 'construire')
    return (
      <Cadre titre={t('outil.construire')} fermer={fermer}>
        <PanneauConstruire controleur={controleur} instantane={instantane} />
      </Cadre>
    );
  if (panneau === 'reglages')
    return (
      <Cadre titre={t('outil.reglages')} fermer={fermer}>
        <PanneauReglages />
      </Cadre>
    );
  const batiment = instantane.batiments.find((b) => b.id === panneau.batiment);
  if (!batiment) return null;
  return (
    <Cadre titre={nomBatiment(batiment.type)} fermer={fermer} bas>
      <PanneauBatiment key={batiment.id} controleur={controleur} instantane={instantane} batiment={batiment} />
    </Cadre>
  );
}

function Cadre({ titre, fermer, bas, children }: { titre: string; fermer: () => void; bas?: boolean; children: ComponentChildren }) {
  return (
    <section class={`panneau ${bas ? 'bas' : ''}`}>
      <header>
        <h2>{titre}</h2>
        <button class="bouton fermer" title={t('panneau.fermer')} onClick={fermer}>
          ✕
        </button>
      </header>
      <div class="corps">{children}</div>
    </section>
  );
}

function Outil(props: { icone: string; titre: string; actif?: boolean; petit?: boolean; onClick: () => void }) {
  return (
    <button
      class={`bouton outil ${props.actif ? 'actif' : ''} ${props.petit ? 'petit' : ''}`}
      title={props.titre}
      aria-label={props.titre}
      onClick={props.onClick}
    >
      {props.icone}
    </button>
  );
}

function Compteurs({ instantane }: { instantane: Instantane }) {
  const { stocks } = instantane;
  const visibles: Ressource[] = ['baies', 'boisMort', 'mousse', 'spores'];
  if (stocks.baiesSechees.quantite > 0 || instantane.batimentsDebloques.includes('sechoir')) visibles.splice(1, 0, 'baiesSechees');
  return (
    <ul class="compteurs">
      {visibles.map((r) => (
        <Compteur key={r} ressource={r} instantane={instantane} />
      ))}
    </ul>
  );
}

function Compteur({ ressource, instantane }: { ressource: Ressource; instantane: Instantane }) {
  const [detail, setDetail] = useState(false);
  const stock = instantane.stocks[ressource];
  const plein = stock.quantite >= stock.plafond;
  const variation = stock.productionParMinute;
  return (
    <li class={`compteur ${plein ? 'plein' : ''}`} onMouseEnter={() => setDetail(true)} onMouseLeave={() => setDetail(false)}>
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

function BandeauPlacement(props: Props & { type: TypeBatiment; bonus: number | null; instantane: Instantane }) {
  const { controleur, type, bonus, instantane } = props;
  const cout = controleur.contenu.batiments[type].cout;
  const payable = abordable(cout, instantane.stocks);
  return (
    <div class="bandeau">
      <div class="ligne">
        <span>
          <strong>{nomBatiment(type)}</strong>
          <span class={payable ? '' : 'manque'}> · {listeQuantites(cout)}</span>
          {bonus !== null && bonus > 1 && <span class="bonus"> · {t('construction.bonusIci', { pourcent: pourcent(bonus - 1) })}</span>}
        </span>
        <button class="bouton fermer" title={t('panneau.fermer')} onClick={() => controleur.finirPlacement()}>
          ✕
        </button>
      </div>
      <div class="ligne aide">{t('construction.aide')}</div>
    </div>
  );
}
