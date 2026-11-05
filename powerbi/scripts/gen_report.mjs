// Génère les pages PBIR du rapport RH : un accueil personnalisé selon le rôle + une page masquée par acteur (PPTX slides 20 à 22).
// Sécurité par page : chaque page d'acteur filtre Acteurs[page] sur elle-même ; les mesures renvoient vide si la page n'appartient pas au rôle.
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { measures } from './measures.mjs';
import { acteur } from './acteurs.mjs';

// Le script vit dans powerbi/scripts : le rapport est deux dossiers plus haut
const REPORT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'RH_Report.Report');
const DEF = join(REPORT, 'definition');
const PAGES = join(DEF, 'pages');
const VIS_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.5.0/schema.json';
const PAGE_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json';
const M = 'Mesures';

// ---------- palette
const C = {
  navy: '#0C3549', ink: '#1F2A44', muted: '#5B6478', line: '#E3E8F0', bg: '#F4F6FA', white: '#FFFFFF',
  teal: '#1B998B', amber: '#F2B84B', coral: '#ED7373', green: '#44C088', blue: '#2E86DE', violet: '#7B6CD9', slate: '#8A94A6',
};

// ---------- briques JSON
const lit = (v) => ({ expr: { Literal: { Value: v } } });
const s = (v) => lit(`'${String(v).replace(/'/g, "''")}'`);
const b = (v) => lit(v ? 'true' : 'false');
const n = (v) => lit(`${v}D`);
const L = (v) => lit(`${v}L`);
const color = (hex) => ({ solid: { color: s(hex) } });
const colorM = (measure) => ({ solid: { color: { expr: { Measure: { Expression: { SourceRef: { Entity: M } }, Property: measure } } } } });

const known = new Set(measures.map(m => m.n));
const mea = (name, displayName) => {
  if (!known.has(name)) throw new Error('Mesure inconnue : ' + name);
  const p = { field: { Measure: { Expression: { SourceRef: { Entity: M } }, Property: name } }, queryRef: `${M}.${name}`, nativeQueryRef: name };
  if (displayName) p.displayName = displayName;
  return p;
};
const col = (entity, prop, displayName) => {
  const p = { field: { Column: { Expression: { SourceRef: { Entity: entity } }, Property: prop } }, queryRef: `${entity}.${prop}`, nativeQueryRef: prop };
  if (displayName) p.displayName = displayName;
  return p;
};
const DEP = () => col('dw dim_departement', 'departement_libelle', 'Département');

const container = (title, { bg = C.white, border = true, shadow = true } = {}) => {
  const o = {
    background: [{ properties: { show: b(true), color: color(bg), transparency: n(0) } }],
    border: [{ properties: { show: b(border), color: color(C.line), radius: n(12), width: n(1) } }],
    dropShadow: [{ properties: { show: b(shadow), color: color('#1F2A44'), transparency: n(90), position: s('Outer'), preset: s('BottomRight') } }],
    padding: [{ properties: { top: n(8), bottom: n(8), left: n(12), right: n(12) } }],
    title: [{ properties: title ? { show: b(true), text: s(title), fontColor: color(C.ink), fontSize: n(12), bold: b(true), fontFamily: s('Segoe UI Semibold') } : { show: b(false) } }],
  };
  return o;
};

const axes = (extra = {}) => ({
  categoryAxis: [{ properties: { fontSize: n(9), labelColor: color(C.muted), showAxisTitle: b(false), maxMarginFactor: L(45), ...(extra.categorical ? { axisType: s('Categorical') } : {}) } }],
  valueAxis: [{ properties: { show: b(extra.valueAxis ?? false), fontSize: n(9), labelColor: color(C.muted), showAxisTitle: b(false), gridlineShow: b(false) } }],
  // Fond blanc sous l'étiquette : lisible dans une barre foncée comme à côté.
  // Barres empilées : l'étiquette est toujours dans la barre, donc texte blanc sans fond.
  labels: [{ properties: {
    show: b(extra.labels ?? true), fontSize: n(9), color: color(extra.stacked ? C.white : C.ink),
    labelDisplayUnits: n(extra.units ?? 1), labelPrecision: L(extra.precision ?? 0),
    enableBackground: b(!extra.stacked), ...(extra.stacked ? {} : { backgroundColor: color(C.white), backgroundTransparency: n(15) }),
  } }],
  legend: [{ properties: { show: b(extra.legend ?? false), position: s('Top'), fontSize: n(9), labelColor: color(C.muted) } }],
});

// ---------- visuels
let z = 1000;
const visual = (name, pos, body) => ({
  $schema: VIS_SCHEMA,
  name,
  position: { x: pos[0], y: pos[1], z: z++, width: pos[2], height: pos[3], tabOrder: z - 1000 },
  visual: { ...body, drillFilterOtherVisuals: true },
});

const textbox = (name, pos, paragraphs, { bg = null, radius = 12 } = {}) => visual(name, pos, {
  visualType: 'textbox',
  objects: { general: [{ properties: { paragraphs } }] },
  visualContainerObjects: {
    background: [{ properties: { show: b(!!bg), ...(bg ? { color: color(bg), transparency: n(0) } : {}) } }],
    border: [{ properties: { show: b(false), radius: n(radius) } }],
    title: [{ properties: { show: b(false) } }],
    padding: [{ properties: { top: n(6), bottom: n(6), left: n(18), right: n(18) } }],
  },
});
const run = (value, { size = 10, colorHex = C.ink, bold = false } = {}) =>
  ({ value, textStyle: { fontSize: `${size}pt`, color: colorHex, fontFamily: bold ? 'Segoe UI Semibold' : 'Segoe UI', ...(bold ? { fontWeight: 'bold' } : {}) } });
const para = (...runs) => ({ textRuns: runs });

// units : 0 = automatique (11,3 M), 1 = aucune (169 561)
const card = (name, pos, measure, { colorMeasure = null, accent = C.navy, label = null, units = 1, precision = null } = {}) => visual(name, pos, {
  visualType: 'card',
  query: { queryState: { Values: { projections: [mea(measure, label)] } } },
  objects: {
    labels: [{ properties: {
      color: colorMeasure ? colorM(colorMeasure) : color(accent), fontSize: n(24), fontFamily: s('Segoe UI Semibold'),
      labelDisplayUnits: n(units), ...(precision !== null ? { labelPrecision: L(precision) } : {}),
    } }],
    categoryLabels: [{ properties: { show: b(true), color: color(C.muted), fontSize: n(9), fontFamily: s('Segoe UI') } }],
  },
  visualContainerObjects: { ...container(null), padding: [{ properties: { top: n(4), bottom: n(4), left: n(6), right: n(6) } }] },
});

const sortBy = (proj, dir = 'Descending') => ({ sort: [{ field: proj.field, direction: dir }], isDefaultSort: true });

const chart = (name, pos, type, title, { cat, y = [], series = null, colors = null, colorMeasure = null, sort = null, opts = {} }) => {
  const queryState = {};
  if (cat) queryState.Category = { projections: [cat] };
  if (series) queryState.Series = { projections: [series] };
  queryState.Y = { projections: y };
  const objects = axes(opts);
  if (colorMeasure) {
    objects.dataPoint = [{ properties: { fill: colorM(colorMeasure) }, selector: { data: [{ dataViewWildcard: { matchingOption: 1 } }] } }];
  } else if (colors && !series) {
    objects.dataPoint = y.map((p, i) => ({ properties: { fill: color(colors[i % colors.length]) }, selector: { metadata: p.queryRef } }));
  }
  const query = { queryState };
  if (sort) query.sortDefinition = sortBy(sort);
  return visual(name, pos, { visualType: type, query, objects, visualContainerObjects: container(title) });
};

const donut = (name, pos, title, cat, y) => visual(name, pos, {
  visualType: 'donutChart',
  query: { queryState: { Category: { projections: [cat] }, Y: { projections: [y] } }, sortDefinition: sortBy(y) },
  objects: {
    legend: [{ properties: { show: b(true), position: s('Right'), fontSize: n(9), labelColor: color(C.muted) } }],
    labels: [{ properties: { show: b(true), labelStyle: s('Percent of total'), fontSize: n(9) } }],
  },
  visualContainerObjects: container(title),
});

const table = (name, pos, title, values, sort = null) => {
  const query = { queryState: { Values: { projections: values } } };
  if (sort) query.sortDefinition = sortBy(sort);
  return visual(name, pos, {
    visualType: 'tableEx', query,
    objects: {
      columnHeaders: [{ properties: { fontColor: color(C.white), backColor: color(C.navy), fontSize: n(9), bold: b(true) } }],
      values: [{ properties: { fontSize: n(9), fontColorPrimary: color(C.ink), backColorPrimary: color(C.white), backColorSecondary: color(C.bg) } }],
      total: [{ properties: { fontSize: n(9), bold: b(true) } }],
      grid: [{ properties: { gridHorizontal: b(false), gridVertical: b(false), rowPadding: L(4) } }],
    },
    visualContainerObjects: container(title),
  });
};

// Carte de texte : affiche une mesure texte, sans fond ni libellé (bandeaux dynamiques, accueil)
const textCard = (name, pos, measure, { size = 12, colorHex = C.ink, bold = false } = {}) => visual(name, pos, {
  visualType: 'card',
  query: { queryState: { Values: { projections: [mea(measure)] } } },
  objects: {
    labels: [{ properties: { color: color(colorHex), fontSize: n(size), fontFamily: s(bold ? 'Segoe UI Semibold' : 'Segoe UI') } }],
    categoryLabels: [{ properties: { show: b(false) } }],
  },
  visualContainerObjects: {
    background: [{ properties: { show: b(false) } }],
    border: [{ properties: { show: b(false) } }],
    dropShadow: [{ properties: { show: b(false) } }],
    title: [{ properties: { show: b(false) } }],
    padding: [{ properties: { top: n(0), bottom: n(0), left: n(0), right: n(0) } }],
  },
});

// Bouton invisible posé sur une zone de texte (le texte et la couleur sont portés par la zone de texte en dessous) :
// interrupteurs « show » sans sélecteur, propriétés d'état sous { id: 'default' } / { id: 'hover' }.
// target : identifiant de page (destination fixe) ou { measure } (destination = nom affiché renvoyé par la mesure).
const button = (name, pos, target) => ({
  ...visual(name, pos, {
    visualType: 'actionButton',
    objects: {
      icon: [{ properties: { shapeType: s('blank') }, selector: { id: 'default' } }],
      outline: [{ properties: { show: b(false) } }],
      text: [{ properties: { show: b(false) } }],
      fill: [
        { properties: { show: b(true) } },
        { properties: { fillColor: color(C.white), transparency: n(100) }, selector: { id: 'default' } },
        { properties: { fillColor: color(C.white), transparency: n(80) }, selector: { id: 'hover' } },
      ],
    },
    visualContainerObjects: {
      visualLink: [{ properties: {
        show: b(true), type: s('PageNavigation'),
        navigationSection: typeof target === 'string' ? s(target)
          : { expr: { Measure: { Expression: { SourceRef: { Entity: M } }, Property: target.measure } } },
      } }],
    },
  }),
  howCreated: 'InsertVisualButton',
});

// Pastille cliquable : zone de texte colorée + bouton invisible au-dessus
const pill = (name, pos, label, target, { bg = C.white, fg = C.navy, size = 10 } = {}) => [
  textbox(`${name}Texte`, pos, [para(run(label, { size, colorHex: fg, bold: true }))], { bg, radius: 18 }),
  button(`${name}Lien`, pos, target),
];

// ---------- gabarit commun des pages acteurs
const W = 1280, H = 720, MX = 16, GAP = 12;
const ACCUEIL = 'pg01Accueil';
// Bandeau : acteur, ce qu'il peut décider, sa vue ; puis retour à l'accueil, périmètre et message d'accès
const header = (a, { subtitle = null, extra = [] } = {}) => [
  textbox('v00Entete', [0, 0, W, 56], [
    para(run(a.acteur, { size: 16, colorHex: C.white, bold: true }),
      ...(subtitle ? [run(`   ${subtitle}`, { size: 12, colorHex: '#C9D6E3', bold: true })] : [])),
    para(run(`Vous pouvez ${a.decide}  ·  ${a.vue}`, { size: 9, colorHex: '#C9D6E3' })),
  ], { bg: C.navy, radius: 0 }),
  ...pill('v01Accueil', [MX, 66, 120, 34], '←  Accueil', ACCUEIL),
  ...extra,
  textCard('v03Perimetre', [MX + 120 + GAP + (extra.length ? 172 : 0), 70, 330, 28], 'Périmètre', { size: 10, colorHex: C.muted, bold: true }),
  textCard('v04MessageAcces', [W - MX - 600, 68, 600, 30], 'Message accès', { size: 10, colorHex: C.coral, bold: true }),
];
// Cartes KPI : couleur portée par une mesure (blanc sur blanc quand la page n'appartient pas au rôle)
const kpiRow = (items, y = 112, h = 88) => {
  const w = (W - 2 * MX - (items.length - 1) * GAP) / items.length;
  return items.map((it, i) => card(`v1${i}Kpi`, [Math.round(MX + i * (w + GAP)), y, Math.round(w), h], it.m,
    { ...it, colorMeasure: it.colorMeasure || (it.alert ? 'Couleur KPI alerte' : 'Couleur KPI') }));
};
const ROW1 = [212, 236], ROW2 = [460, 222];
const cols = (k, widths = null) => {
  const ws = widths || Array(k).fill((W - 2 * MX - (k - 1) * GAP) / k);
  let x = MX;
  return ws.map(w => { const r = [Math.round(x), Math.round(w)]; x += w + GAP; return r; });
};
const at = (c, row) => [c[0], row[0], c[1], row[1]];
const note = (text) => textbox('v99Note', [MX, 686, W - 2 * MX, 28], [para(run(text, { size: 8, colorHex: C.muted }))]);

// ---------- visuels réutilisés d'une page acteur à l'autre
const V = {
  effectifCapacite: (name, pos) => chart(name, pos, 'clusteredBarChart', 'Effectif et capacité par département',
    { cat: DEP(), y: [mea('Effectif'), mea('Capacité')], colors: [C.navy, '#C9D6E3'], sort: mea('Effectif'), opts: { legend: true } }),
  occupation: (name, pos) => chart(name, pos, 'clusteredBarChart', "Taux d'occupation par département",
    { cat: DEP(), y: [mea("Taux d'occupation")], colorMeasure: 'Couleur occupation', sort: mea("Taux d'occupation") }),
  contrats: (name, pos) => donut(name, pos, 'Répartition des contrats', col('dw dim_contrat', 'type_contrat', 'Contrat'), mea('Effectif')),
  entreesAnnee: (name, pos) => chart(name, pos, 'clusteredColumnChart', "Entrées par année d'embauche",
    { cat: col('dw dim_date', 'annee', 'Année'), y: [mea('Entrées')], colors: [C.blue], opts: { categorical: true } }),
  canal: (name, pos) => chart(name, pos, 'clusteredBarChart', 'Effectif par canal de recrutement',
    { cat: col('dw dim_canal_recrutement', 'canal_libelle', 'Canal'), y: [mea('Effectif')], colors: [C.teal], sort: mea('Effectif') }),
  coutDepartement: (name, pos) => chart(name, pos, 'barChart', 'Coût mensuel estimé par département',
    { cat: DEP(), y: [mea('Masse salariale'), mea('Coût vacataires'), mea('Coût heures sup admin')], colors: [C.navy, C.teal, C.amber], opts: { legend: true, units: 0, precision: 1 } }),
  salaireGenre: (name, pos) => chart(name, pos, 'clusteredBarChart', 'Salaire médian femmes / hommes par département',
    { cat: DEP(), y: [mea('Salaire médian femmes'), mea('Salaire médian hommes')], colors: [C.coral, C.blue], opts: { legend: true } }),
  salaireContrat: (name, pos) => chart(name, pos, 'clusteredBarChart', 'Salaire médian par contrat',
    { cat: col('dw dim_contrat', 'type_contrat', 'Contrat'), y: [mea('Salaire médian')], colors: [C.navy], sort: mea('Salaire médian') }),
  heuresMois: (name, pos) => chart(name, pos, 'lineChart', 'Heures travaillées par jour, par mois et par pôle',
    { cat: col('dw dim_date', 'annee_mois', 'Mois'), y: [mea('Heures par jour')], series: col('dw dim_pole', 'pole_libelle', 'Pôle'), opts: { legend: true, valueAxis: true, labels: false } }),
  plus8h: (name, pos) => chart(name, pos, 'clusteredBarChart', '% de jours au-delà de 8 h',
    { cat: DEP(), y: [mea('% jours > 8 h')], colors: [C.violet], sort: mea('% jours > 8 h') }),
  arrivees: (name, pos) => chart(name, pos, 'clusteredColumnChart', 'Arrivées par tranche de 15 minutes',
    { cat: col('dw dim_heure', 'tranche_15min', 'Tranche'), y: [mea('Jours pointés')], colors: [C.navy] }),
  niveaux: (name, pos) => donut(name, pos, 'Inscriptions par niveau de difficulté', col('dw dim_niveau_cours', 'niveau_libelle', 'Niveau'), mea('Inscriptions')),
  couverture: (name, pos) => chart(name, pos, 'clusteredBarChart', 'Couverture formation (cible ≥ 95 %)',
    { cat: DEP(), y: [mea('Couverture formation')], colorMeasure: 'Couleur couverture', sort: mea('Couverture formation') }),
  typeConge: (name, pos) => chart(name, pos, 'clusteredBarChart', 'Dernier congé pris (normalisé)',
    { cat: col('dw dim_type_conge', 'type_conge_libelle', 'Type de congé'), y: [mea('Effectif')], colors: [C.green], sort: mea('Effectif') }),
  typeParDep: (name, pos) => chart(name, pos, 'hundredPercentStackedBarChart', 'Dernier congé par département',
    { cat: DEP(), y: [mea('Effectif')], series: col('dw dim_type_conge', 'type_conge_libelle', 'Type de congé'), opts: { legend: true, stacked: true } }),
  consoSolde: (name, pos) => chart(name, pos, 'clusteredBarChart', 'Congés consommés et solde moyen (jours)',
    { cat: DEP(), y: [mea('Congés consommés (moyenne)'), mea('Solde moyen (jours)')], colors: [C.green, '#C9D6E3'], opts: { legend: true } }),
  echeancesMois: (name, pos) => chart(name, pos, 'clusteredColumnChart', 'Échéances de contrat par mois en 2023',
    { cat: col('dw dim_date', 'annee_mois', 'Mois'), y: [mea('Échéances en 2023')], colors: [C.coral] }),
  anomalies: (name, pos) => chart(name, pos, 'clusteredColumnChart', 'Anomalies de contrat (cible : 0)',
    { y: [mea('CDI avec date de fin', 'CDI datés'), mea('Vacataires en CDI', 'Vacataires CDI'), mea('Contrats échus avant 2023', 'Échus'), mea('Contrats courts sans date de fin', 'Courts sans fin')],
      colors: [C.coral, C.amber, C.violet, C.slate], opts: { legend: true } }),
};

// ---------- pages
// filtre : nom affiché de la page dans la table Acteurs (sécurité par page) ; null pour l'accueil
const pages = [];
const page = (name, displayName, visuals, { hidden = true, filtre = displayName } = {}) => pages.push({ name, displayName, visuals, hidden, filtre });
const pageOf = (a, i = 0) => a.pages[i];

// Accueil : bienvenue personnalisée selon le rôle et un seul bouton vers la page de l'acteur
{
  z = 1000;
  const BW = 380, BX = Math.round((W - BW) / 2);
  page(ACCUEIL, 'Accueil', [
    textbox('v00Hero', [0, 0, W, 112], [
      para(run('PILOTAGE RH PAR LA DONNÉE', { size: 9, colorHex: C.amber, bold: true })),
      para(run('Tableau de bord RH', { size: 24, colorHex: C.white, bold: true })),
      para(run('Un seul rapport : chaque rôle ne voit que son tableau de bord · source : RH_Data_Warehouse', { size: 10, colorHex: '#C9D6E3' })),
    ], { bg: C.navy, radius: 0 }),
    textbox('v10Panneau', [MX + 140, 140, W - 2 * MX - 280, 300], [para(run(' ', { size: 8 }))], { bg: C.white, radius: 16 }),
    textCard('v11Titre', [MX + 160, 160, W - 2 * MX - 320, 56], 'Accueil titre', { size: 26, colorHex: C.navy, bold: true }),
    textCard('v12Decision', [MX + 160, 226, W - 2 * MX - 320, 36], 'Accueil décision', { size: 14, colorHex: C.ink }),
    textCard('v13Vue', [MX + 160, 266, W - 2 * MX - 320, 30], 'Accueil vue', { size: 11, colorHex: C.muted }),
    ...pill('v14Ouvrir', [BX, 330, BW, 56], 'Ouvrir mon tableau de bord   →', { measure: "Page de l'acteur" }, { bg: C.teal, fg: C.white, size: 14 }),
    textbox('v20ASavoir', [MX + 140, 470, W - 2 * MX - 280, 150], [
      para(run('À savoir avant de lire', { size: 11, colorHex: C.ink, bold: true })),
      para(run('• Chaque rôle ouvre uniquement son tableau de bord ; une autre page affiche « Accès réservé » et aucune donnée.', { size: 9, colorHex: C.muted })),
      para(run('• Les managers ne voient que leur département (sécurité par ligne).', { size: 9, colorHex: C.muted })),
      para(run('• Données synthétiques : retenir les écarts structurels, pas les signaux faibles.', { size: 9, colorHex: C.muted })),
      para(run('• Une seule photo RH : pas de tendance sur l’effectif · date de référence : 1er janvier 2023.', { size: 9, colorHex: C.muted })),
      para(run('• Pointages : techniques janvier–juin 2023, administratifs janvier–mars 2023 · seuil de retard 8 h 30 à valider.', { size: 9, colorHex: C.muted })),
    ], { bg: C.white }),
  ], { hidden: false, filtre: null });
}

// Direction générale : effectif, coûts, échéances · vue consolidée, tous départements
{
  z = 1000;
  const a = acteur('Direction générale');
  const r1 = cols(2), r2 = cols(3, [400, 330, W - 2 * MX - 2 * GAP - 730]);
  page(pageOf(a).id, pageOf(a).nom, [
    ...header(a),
    ...kpiRow([{ m: 'Effectif' }, { m: "Taux d'occupation", colorMeasure: 'Couleur occupation' }, { m: '% contrats courts' },
      { m: 'Coût total estimé', units: 0, precision: 1 }, { m: 'Écart H/F médian', colorMeasure: 'Couleur écart H/F' }, { m: 'Échéances à 90 jours', alert: true }]),
    V.effectifCapacite('v20EffectifCapacite', at(r1[0], ROW1)),
    V.coutDepartement('v21CoutDepartement', at(r1[1], ROW1)),
    V.occupation('v22Occupation', at(r2[0], ROW2)),
    V.echeancesMois('v23EcheancesMois', at(r2[1], ROW2)),
    table('v24Synthese', at(r2[2], ROW2), 'Synthèse par département',
      [DEP(), mea('Effectif'), mea("Taux d'occupation", 'Occupation'), mea('Coût total estimé', 'Coût total'), mea('Échéances à 90 jours', 'Échéances 90 j'), mea("Taux d'anomalies contractuelles", 'Anomalies')], mea('Coût total estimé')),
    note("Limites : chiffres indicatifs, ni budget ni cible · capacité de l'Administration douteuse (640 %) · aucune mesure de performance."),
  ]);
}

// DRH 1/2 : effectif, coûts, temps travaillé
{
  z = 1000;
  const a = acteur('DRH');
  const r1 = cols(3), r2 = cols(3);
  page(pageOf(a, 0).id, pageOf(a, 0).nom, [
    ...header(a, { subtitle: 'Effectif · coûts · temps travaillé', extra: pill('v02Suite', [MX + 120 + GAP, 66, 160, 34], 'Page suivante  →', pageOf(a, 1).id) }),
    ...kpiRow([{ m: 'Effectif' }, { m: "Taux d'occupation", colorMeasure: 'Couleur occupation' }, { m: '% contrats courts' },
      { m: 'Coût total estimé', units: 0, precision: 1 }, { m: 'Écart H/F médian', colorMeasure: 'Couleur écart H/F' }, { m: 'Heures par jour' }]),
    V.effectifCapacite('v20EffectifCapacite', at(r1[0], ROW1)),
    V.contrats('v21Contrats', at(r1[1], ROW1)),
    V.salaireGenre('v22SalaireGenre', at(r1[2], ROW1)),
    V.coutDepartement('v23CoutDepartement', at(r2[0], ROW2)),
    V.heuresMois('v24HeuresMois', at(r2[1], ROW2)),
    table('v25DetailTemps', at(r2[2], ROW2), 'Temps travaillé par département',
      [DEP(), mea('Heures par jour', 'Heures / jour'), mea('Taux de retard', 'Retard'), mea('% jours > 8 h')], mea('Heures par jour')),
    note('Limites : une seule photo, donc pas de tendance · turnover non mesurable · données synthétiques : écarts structurels seulement · formation, congés et échéances : page suivante.'),
  ]);
}

// DRH 2/2 : formation, congés, échéances
{
  z = 1000;
  const a = acteur('DRH');
  const r1 = cols(3), r2 = cols(3);
  page(pageOf(a, 1).id, pageOf(a, 1).nom, [
    ...header(a, { subtitle: 'Formation · congés · échéances', extra: pill('v02Retour', [MX + 120 + GAP, 66, 160, 34], '←  Page précédente', pageOf(a, 0).id) }),
    ...kpiRow([{ m: 'Couverture formation', colorMeasure: 'Couleur couverture' }, { m: 'Formations par employé' },
      { m: 'Taux de consommation des congés', label: 'Consommation des droits' }, { m: '% dernier congé maladie', alert: true },
      { m: 'Échéances à 90 jours', alert: true }, { m: "Taux d'anomalies contractuelles", colorMeasure: 'Couleur anomalies', label: "Taux d'anomalies" }]),
    V.niveaux('v20Niveaux', at(r1[0], ROW1)),
    V.couverture('v21Couverture', at(r1[1], ROW1)),
    V.typeParDep('v22TypeParDep', at(r1[2], ROW1)),
    V.consoSolde('v23ConsoSolde', at(r2[0], ROW2)),
    V.echeancesMois('v24EcheancesMois', at(r2[1], ROW2)),
    V.anomalies('v25Anomalies', at(r2[2], ROW2)),
    note('Limites : une seule photo, donc pas de tendance · administratifs sans donnée de formation · seul le dernier congé est connu, sans date ni durée · turnover non mesurable.'),
  ]);
}

// Contrôle de gestion et paie : coûts et temps travaillé
{
  z = 1000;
  const a = acteur('Contrôle de gestion et paie');
  const r1 = cols(2), r2 = cols(3, [290, 350, W - 2 * MX - 2 * GAP - 640]);
  page(pageOf(a).id, pageOf(a).nom, [
    ...header(a),
    ...kpiRow([{ m: 'Coût total estimé', units: 0, precision: 1 }, { m: 'Masse salariale', units: 0, precision: 1 }, { m: 'Coût vacataires', units: 0, precision: 1 },
      { m: 'Coût heures sup admin', units: 0, precision: 1 }, { m: 'Heures sup (h)', label: 'Heures sup pointées (h)' }, { m: 'Coût heures sup pointées', units: 0, precision: 1 }]),
    V.coutDepartement('v20CoutDepartement', at(r1[0], ROW1)),
    chart('v21HeuresSupMois', at(r1[1], ROW1), 'lineChart', 'Heures sup pointées par mois et par pôle',
      { cat: col('dw dim_date', 'annee_mois', 'Mois'), y: [mea('Heures sup (h)')], series: col('dw dim_pole', 'pole_libelle', 'Pôle'), opts: { legend: true, valueAxis: true, labels: false } }),
    V.salaireContrat('v22SalaireContrat', at(r2[0], ROW2)),
    V.plus8h('v23Plus8h', at(r2[1], ROW2)),
    table('v24DetailCouts', at(r2[2], ROW2), 'Détail par département',
      [DEP(), mea('Masse salariale'), mea('Coût total estimé', 'Coût total'), mea('% heures sup dans le coût', '% HS admin'), mea('Heures sup (h)', 'HS pointées (h)'), mea('Coût heures sup pointées', 'Coût HS pointées')], mea('Coût total estimé')),
    note('Limites : coût estimé sous hypothèses (vacataires × 35, heures sup admin × 22, période et devise à confirmer) · charges et primes absentes · heures sup pointées = au-delà de 8 h × taux, sur la période des pointages, hors coût total.'),
  ]);
}

// Resp. administration du personnel : congés et échéances · détail par employé (matricule seul)
{
  z = 1000;
  const a = acteur('Resp. administration du personnel');
  const LW = 360, xT = MX + LW + GAP;
  page(pageOf(a).id, pageOf(a).nom, [
    ...header(a),
    ...kpiRow([{ m: 'Employés avec anomalie de contrat', colorMeasure: 'Couleur anomalies', label: 'Employés en anomalie' },
      { m: "Taux d'anomalies contractuelles", colorMeasure: 'Couleur anomalies', label: "Taux d'anomalies" },
      { m: 'Échéances à 30 jours', alert: true }, { m: 'Échéances à 90 jours', alert: true }, { m: 'Solde moyen (jours)' }, { m: '% soldes élevés' }]),
    V.anomalies('v20Anomalies', [MX, ROW1[0], LW, ROW1[1]]),
    V.typeConge('v21TypeConge', [MX, ROW2[0], LW, ROW2[1]]),
    table('v22DetailEmploye', [xT, ROW1[0], W - MX - xT, ROW2[0] + ROW2[1] - ROW1[0]], 'Détail par employé (identifiant, sans nom ni e-mail)',
      [col('dw dim_employe', 'employe_bk', 'Identifiant employé'), DEP(), col('dw dim_contrat', 'type_contrat', 'Contrat'),
        mea('Date de fin de contrat', 'Fin de contrat'), mea('Anomalies de contrat (détail)', 'Anomalies'),
        col('dw dim_type_conge', 'type_conge_libelle', 'Dernier congé'), mea('Congés consommés (moyenne)', 'Pris (j)'), mea('Solde moyen (jours)', 'Solde (j)')],
      mea('Anomalies de contrat (détail)')),
    note('Limites : dates de fin peu fiables (contrats échus avant 2023, CDI datés) · congés connus par le dernier congé seulement · nom, e-mail et adresse exclus de l’analyse.'),
  ]);
}

// Resp. formation : formation
{
  z = 1000;
  const a = acteur('Resp. formation');
  const r1 = cols(3, [360, 360, W - 2 * MX - 2 * GAP - 720]), r2 = cols(2, [800, W - 2 * MX - GAP - 800]);
  page(pageOf(a).id, pageOf(a).nom, [
    ...header(a),
    ...kpiRow([{ m: 'Couverture formation', colorMeasure: 'Couleur couverture' }, { m: 'Employés formés' }, { m: 'Inscriptions' },
      { m: 'Formations par employé' }, { m: 'Cours suivis' }, { m: "Taux d'utilisation du catalogue" }]),
    V.niveaux('v20Niveaux', at(r1[0], ROW1)),
    V.couverture('v21Couverture', at(r1[1], ROW1)),
    chart('v22Universites', at(r1[2], ROW1), 'clusteredBarChart', 'Universités les plus suivies',
      { cat: col('dw dim_universite', 'universite', 'Université'), y: [mea('Inscriptions')], colors: [C.amber], sort: mea('Inscriptions') }),
    table('v23TopCours', at(r2[0], ROW2), 'Cours les plus suivis',
      [col('dw dim_cours', 'intitule', 'Cours'), col('dw dim_niveau_cours', 'niveau_libelle', 'Niveau'), mea('Inscriptions'), mea('% des inscriptions')], mea('Inscriptions')),
    chart('v24ParEmploye', at(r2[1], ROW2), 'clusteredBarChart', 'Formations par employé formé',
      { cat: DEP(), y: [mea('Formations par employé')], colors: [C.teal], sort: mea('Formations par employé') }),
    note('Limites : ni date, ni coût, ni réussite des formations · administratifs non couverts · table de correspondance compétences à construire · aucun cours ne dépasse 0,25 % des inscriptions.'),
  ]);
}

// Resp. recrutement : effectif et canaux · vue agrégée
{
  z = 1000;
  const a = acteur('Resp. recrutement');
  const r1 = cols(2), r2 = cols(3, [560, 330, W - 2 * MX - 2 * GAP - 890]);
  page(pageOf(a).id, pageOf(a).nom, [
    ...header(a),
    ...kpiRow([{ m: 'Effectif' }, { m: 'Capacité' }, { m: "Taux d'occupation", colorMeasure: 'Couleur occupation' },
      { m: '% contrats courts' }, { m: 'Ancienneté moyenne (ans)' }, { m: '% ancienneté < 1 an' }]),
    V.canal('v20Canal', at(r1[0], ROW1)),
    V.entreesAnnee('v21Entrees', at(r2[0], ROW2)),
    chart('v22CanalParDep', at(r1[1], ROW1), 'hundredPercentStackedBarChart', 'Canal de recrutement par département',
      { cat: DEP(), y: [mea('Effectif')], series: col('dw dim_canal_recrutement', 'canal_libelle', 'Canal'), opts: { legend: true, stacked: true } }),
    V.effectifCapacite('v23EffectifCapacite', at(r2[1], ROW2)),
    V.contrats('v24Contrats', at(r2[2], ROW2)),
    note('Limites : entrées seules, sans sorties · ni coût ni qualité par canal · vue agrégée, sans détail par employé.'),
  ]);
}

// Managers de département : charge, assiduité, congés, échéances · limitée à leur département (rôles « Manager … »)
{
  z = 1000;
  const a = acteur('Managers de département');
  const r1 = cols(2, [800, W - 2 * MX - GAP - 800]), r2 = cols(3);
  page(pageOf(a).id, pageOf(a).nom, [
    ...header(a),
    ...kpiRow([{ m: 'Effectif' }, { m: "Taux d'occupation", colorMeasure: 'Couleur occupation' }, { m: 'Heures par jour' },
      { m: 'Taux de retard', alert: true }, { m: 'Taux de consommation des congés', label: 'Consommation des droits' }, { m: 'Échéances à 90 jours', alert: true }]),
    V.heuresMois('v20HeuresMois', at(r1[0], ROW1)),
    V.arrivees('v21Arrivees', at(r1[1], ROW1)),
    V.contrats('v22Contrats', at(r2[0], ROW2)),
    V.typeConge('v23TypeConge', at(r2[1], ROW2)),
    V.echeancesMois('v24EcheancesMois', at(r2[2], ROW2)),
    note('Limites : pointages admin sur 3 mois · seuil de retard (8 h 30) non validé · aucun motif d’absence.'),
  ]);
}

// ---------- écriture
// L'ancienne « Page 1 » vide est retirée (copie dans la sauvegarde).
for (const d of readdirSync(PAGES, { withFileTypes: true })) {
  if (d.isDirectory() && !pages.some(p => p.name === d.name)) rmSync(join(PAGES, d.name), { recursive: true });
}
for (const p of pages) {
  const dir = join(PAGES, p.name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'visuals'), { recursive: true });
  writeFileSync(join(dir, 'page.json'), JSON.stringify({
    $schema: PAGE_SCHEMA, name: p.name, displayName: p.displayName, displayOption: 'FitToPage', height: H, width: W,
    // Page d'acteur : masquée (on n'y entre que par le bouton de l'accueil)
    ...(p.hidden ? { visibility: 'HiddenInViewMode' } : {}),
    // Sécurité par page : Acteurs[page] = cette page (filtre masqué et verrouillé). Vide pour un autre rôle → [Accès page] = 0
    ...(p.filtre ? { filterConfig: { filters: [{
      name: `acces_${p.name}`,
      field: { Column: { Expression: { SourceRef: { Entity: 'Acteurs' } }, Property: 'page' } },
      type: 'Categorical',
      filter: {
        Version: 2,
        From: [{ Name: 'a', Entity: 'Acteurs', Type: 0 }],
        Where: [{ Condition: { In: {
          Expressions: [{ Column: { Expression: { SourceRef: { Source: 'a' } }, Property: 'page' } }],
          Values: [[{ Literal: { Value: `'${p.filtre.replace(/'/g, "''")}'` } }]],
        } } }],
      },
      howCreated: 'User', isHiddenInViewMode: true, isLockedInViewMode: true,
    }] } } : {}),
    objects: { background: [{ properties: { color: color(C.bg), transparency: n(0) } }] },
  }, null, 2));
  const names = new Set();
  for (const v of p.visuals) {
    if (names.has(v.name)) throw new Error(`Nom de visuel en double sur ${p.name} : ${v.name}`);
    names.add(v.name);
    mkdirSync(join(dir, 'visuals', v.name), { recursive: true });
    writeFileSync(join(dir, 'visuals', v.name, 'visual.json'), JSON.stringify(v, null, 2));
  }
}
writeFileSync(join(PAGES, 'pages.json'), JSON.stringify({
  $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json',
  pageOrder: pages.map(p => p.name), activePageName: pages[0].name,
}, null, 2));

// Thème du rapport
const theme = {
  name: 'RH Pilotage',
  dataColors: [C.navy, C.teal, C.amber, C.coral, C.blue, C.violet, C.green, C.slate, '#F28C52', '#4FB3BF'],
  background: C.white, foreground: C.ink, tableAccent: C.navy,
  good: C.green, neutral: C.amber, bad: C.coral, maximum: C.navy, center: C.blue, minimum: '#DCE6F2',
  textClasses: {
    callout: { fontSize: 24, fontFace: 'Segoe UI Semibold', color: C.navy },
    title: { fontSize: 12, fontFace: 'Segoe UI Semibold', color: C.ink },
    header: { fontSize: 12, fontFace: 'Segoe UI Semibold', color: C.ink },
    label: { fontSize: 10, fontFace: 'Segoe UI', color: C.muted },
  },
};
const themeName = 'RH_Pilotage.json';
mkdirSync(join(REPORT, 'StaticResources', 'RegisteredResources'), { recursive: true });
writeFileSync(join(REPORT, 'StaticResources', 'RegisteredResources', themeName), JSON.stringify(theme, null, 2));
const reportPath = join(DEF, 'report.json');
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
report.themeCollection.customTheme = { name: themeName, reportVersionAtImport: report.themeCollection.baseTheme.reportVersionAtImport, type: 'RegisteredResources' };
report.resourcePackages = report.resourcePackages.filter(r => r.name !== 'RegisteredResources');
report.resourcePackages.push({ name: 'RegisteredResources', type: 'RegisteredResources', items: [{ name: themeName, path: themeName, type: 'CustomTheme' }] });
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(pages.map(p => `${p.name} : ${p.visuals.length} visuels`).join('\n'));
