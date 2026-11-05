// Génère les pages PBIR du rapport RH : accueil + une page par objectif métier (OM1 à OM6).
import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { measures } from './measures.mjs';

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
const OM_COLORS = { OM1: C.blue, OM2: C.teal, OM3: C.violet, OM4: C.amber, OM5: C.green, OM6: C.coral };

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
const DEP = () => col('dw dim_departement', 'departement', 'Département');

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
  categoryAxis: [{ properties: { fontSize: n(9), labelColor: color(C.muted), showAxisTitle: b(false), ...(extra.categorical ? { axisType: s('Categorical') } : {}) } }],
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

const slicerDep = (name, pos) => visual(name, pos, {
  visualType: 'slicer',
  query: { queryState: { Values: { projections: [DEP()] } } },
  objects: {
    data: [{ properties: { mode: s('Dropdown') } }],
    header: [{ properties: { show: b(true), text: s('Département'), fontColor: color(C.muted), textSize: n(9) } }],
    items: [{ properties: { textSize: n(10), fontColor: color(C.ink) } }],
  },
  visualContainerObjects: { ...container(null, { shadow: false }), padding: [{ properties: { top: n(2), bottom: n(2), left: n(8), right: n(8) } }] },
});

const navigator = (name, pos) => visual(name, pos, {
  visualType: 'pageNavigator',
  visualContainerObjects: {
    background: [{ properties: { show: b(false) } }],
    title: [{ properties: { show: b(false) } }],
  },
});

// Bouton invisible posé sur une tuile (le texte et la couleur sont portés par des zones de texte en dessous) :
// interrupteurs « show » sans sélecteur, propriétés d'état sous { id: 'default' } / { id: 'hover' }.
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
      visualLink: [{ properties: { show: b(true), type: s('PageNavigation'), navigationSection: s(target) } }],
    },
  }),
  howCreated: 'InsertVisualButton',
});

// ---------- gabarit commun des pages OM
const W = 1280, H = 720, MX = 16, GAP = 12;
const header = (om, title, question) => [
  textbox('v00Entete', [0, 0, W, 56], [
    para(run(`${om} · `, { size: 16, colorHex: OM_COLORS[om] || C.amber, bold: true }), run(title, { size: 16, colorHex: C.white, bold: true }),
      run(`   ${question}`, { size: 10, colorHex: '#C9D6E3' })),
  ], { bg: C.navy, radius: 0 }),
  navigator('v01Navigation', [MX, 62, 960, 38]),
  slicerDep('v02FiltreDepartement', [W - MX - 260, 58, 260, 50]),
];
const kpiRow = (items, y = 112, h = 88) => {
  const w = (W - 2 * MX - (items.length - 1) * GAP) / items.length;
  return items.map((it, i) => card(`v1${i}Kpi`, [Math.round(MX + i * (w + GAP)), y, Math.round(w), h], it.m, it));
};
const ROW1 = [212, 236], ROW2 = [460, 228];
const cols = (k, widths = null) => {
  const ws = widths || Array(k).fill((W - 2 * MX - (k - 1) * GAP) / k);
  let x = MX;
  return ws.map(w => { const r = [Math.round(x), Math.round(w)]; x += w + GAP; return r; });
};
const at = (c, row) => [c[0], row[0], c[1], row[1]];
const note = (text) => textbox('v99Note', [MX, 692, W - 2 * MX, 26], [para(run(text, { size: 8, colorHex: C.muted }))]);

// ---------- pages
const pages = [];
const page = (name, displayName, visuals) => pages.push({ name, displayName, visuals });

// Accueil
{
  z = 1000;
  const tiles = [
    ['OM1', 'pg02Effectif', 'Aligner effectif et capacité', "L'effectif colle-t-il à la capacité des départements ?", "Taux d'occupation · contrats courts · ancienneté · entrées"],
    ['OM2', 'pg03Couts', 'Maîtriser coûts et équité', 'La masse salariale est-elle maîtrisée et équitable ?', 'Coût mensuel · salaire médian · écart H/F'],
    ['OM3', 'pg04Temps', 'Mesurer le temps travaillé', 'Quel temps est réellement travaillé ?', 'Heures par jour · retards · jours > 8 h · régularité'],
    ['OM4', 'pg05Formation', 'Renforcer les compétences', 'Les compétences se développent-elles ?', 'Couverture · formations par employé · niveaux'],
    ['OM5', 'pg06Conges', 'Maîtriser les congés', 'Les congés sont-ils maîtrisés ?', 'Consommation · solde · types de congé'],
    ['OM6', 'pg07Echeances', 'Anticiper les échéances', 'Quelles échéances anticiper, sur quelles données ?', 'Échéances 30 / 90 / 180 j · anomalies de contrat'],
  ];
  const v = [
    textbox('v00Hero', [0, 0, W, 112], [
      para(run('PILOTAGE RH PAR LA DONNÉE', { size: 9, colorHex: C.amber, bold: true })),
      para(run('Tableau de bord RH', { size: 24, colorHex: C.white, bold: true })),
      para(run('Effectifs, coûts, assiduité, formation, congés et échéances · 4 départements · source : RH_Data_Warehouse', { size: 10, colorHex: '#C9D6E3' })),
    ], { bg: C.navy, radius: 0 }),
    slicerDep('v01FiltreDepartement', [W - MX - 260, 30, 260, 52]),
    ...kpiRow([
      { m: 'Effectif' }, { m: "Taux d'occupation", colorMeasure: 'Couleur occupation' }, { m: 'Coût total estimé', units: 0, precision: 1 },
      { m: 'Heures par jour' }, { m: 'Couverture formation', colorMeasure: 'Couleur couverture' }, { m: 'Échéances à 90 jours', accent: C.coral },
    ], 128, 92),
  ];
  const tw = (W - 2 * MX - 2 * GAP) / 3;
  tiles.forEach(([om, target, title, question, kpis], i) => {
    const x = Math.round(MX + (i % 3) * (tw + GAP));
    const y = 236 + Math.floor(i / 3) * 142;
    v.push(textbox(`v2${i}Titre${om}`, [x, y, Math.round(tw), 48], [
      para(run(`${om} · ${title}`, { size: 13, colorHex: C.white, bold: true }), run('   →', { size: 13, colorHex: C.white, bold: true })),
    ], { bg: OM_COLORS[om] }));
    v.push(textbox(`v3${i}Texte${om}`, [x, y + 52, Math.round(tw), 78], [
      para(run(question, { size: 10, colorHex: C.ink, bold: true })),
      para(run(kpis, { size: 9, colorHex: C.muted })),
      para(run('Cliquer pour ouvrir la page', { size: 8, colorHex: OM_COLORS[om] })),
    ], { bg: C.white }));
  });
  // Boutons posés après les zones de texte : ils sont au-dessus (z plus grand) et reçoivent le clic
  tiles.forEach(([om, target], i) => {
    const x = Math.round(MX + (i % 3) * (tw + GAP));
    const y = 236 + Math.floor(i / 3) * 142;
    v.push(button(`v5${i}Lien${om}`, [x, y, Math.round(tw), 130], target));
  });
  const [c1, c2] = cols(2, [736, W - 2 * MX - GAP - 736]);
  v.push(chart('v40EffectifCapacite', [c1[0], 526, c1[1], 186], 'clusteredBarChart', 'Effectif et capacité par département',
    { cat: DEP(), y: [mea('Effectif'), mea('Capacité')], colors: [C.navy, '#C9D6E3'], sort: mea('Effectif'), opts: { legend: true } }));
  v.push(textbox('v41ASavoir', [c2[0], 526, c2[1], 186], [
    para(run('À savoir avant de lire', { size: 11, colorHex: C.ink, bold: true })),
    para(run('• Données synthétiques : retenir les écarts structurels, pas les signaux faibles.', { size: 9, colorHex: C.muted })),
    para(run('• Une seule photo RH à la fois : pas de tendance sur l’effectif.', { size: 9, colorHex: C.muted })),
    para(run('• Pointages : techniques janvier–juin 2023, administratifs janvier–mars 2023.', { size: 9, colorHex: C.muted })),
    para(run('• Date de référence : 1er janvier 2023. Seuil de retard 8 h 30 à valider.', { size: 9, colorHex: C.muted })),
    para(run('• Managers : vue limitée à leur département (sécurité par ligne).', { size: 9, colorHex: C.muted })),
  ], { bg: C.white }));
  page('pg01Accueil', 'Accueil', v);
}

// OM1
{
  z = 1000;
  const r1 = cols(2), r2 = cols(3);
  page('pg02Effectif', 'OM1 · Effectif', [
    ...header('OM1', 'Aligner effectif et capacité', "L'effectif colle-t-il à la capacité des départements ?"),
    ...kpiRow([{ m: 'Effectif' }, { m: 'Capacité' }, { m: "Taux d'occupation", colorMeasure: 'Couleur occupation' },
      { m: '% contrats courts' }, { m: 'Ancienneté moyenne (ans)' }, { m: '% ancienneté < 1 an' }]),
    chart('v20EffectifCapacite', at(r1[0], ROW1), 'clusteredBarChart', 'Effectif et capacité par département',
      { cat: DEP(), y: [mea('Effectif'), mea('Capacité')], colors: [C.navy, '#C9D6E3'], sort: mea('Effectif'), opts: { legend: true } }),
    chart('v21Occupation', at(r1[1], ROW1), 'clusteredBarChart', "Taux d'occupation par département (rouge > 110 %, orange < 60 %)",
      { cat: DEP(), y: [mea("Taux d'occupation")], colorMeasure: 'Couleur occupation', sort: mea("Taux d'occupation") }),
    donut('v22Contrats', at(r2[0], ROW2), 'Répartition des contrats', col('dw dim_contrat', 'type_contrat', 'Contrat'), mea('Effectif')),
    chart('v23Entrees', at(r2[1], ROW2), 'clusteredColumnChart', "Entrées par année d'embauche",
      { cat: col('dw dim_date', 'annee', 'Année'), y: [mea('Entrées')], colors: [C.blue], opts: { categorical: true } }),
    chart('v24Canal', at(r2[2], ROW2), 'clusteredBarChart', 'Entrées par canal de recrutement',
      { cat: col('dw dim_canal_recrutement', 'canal_libelle', 'Canal'), y: [mea('Effectif')], colors: [C.teal], sort: mea('Effectif') }),
    note("Taux d'occupation = effectif ÷ capacité (departments.ods) · la capacité de l'Administration paraît obsolète (640 %) · entrées seules : aucune sortie n'est connue."),
  ]);
}

// OM2
{
  z = 1000;
  const r1 = cols(2), r2 = cols(3, [300, 300, W - 2 * MX - 2 * GAP - 600]);
  page('pg03Couts', 'OM2 · Coûts', [
    ...header('OM2', 'Maîtriser coûts et équité', 'La masse salariale est-elle maîtrisée et équitable ?'),
    ...kpiRow([{ m: 'Coût total estimé', units: 0, precision: 1 }, { m: 'Masse salariale', units: 0, precision: 1 }, { m: 'Coût vacataires', units: 0, precision: 1 },
      { m: 'Coût heures sup admin', units: 0, precision: 1 }, { m: 'Salaire médian' }, { m: 'Écart H/F médian', colorMeasure: 'Couleur écart H/F' }]),
    chart('v20CoutDepartement', at(r1[0], ROW1), 'columnChart', 'Coût mensuel estimé par département et composante',
      { cat: DEP(), y: [mea('Masse salariale'), mea('Coût vacataires'), mea('Coût heures sup admin')], colors: [C.navy, C.teal, C.amber], opts: { legend: true, units: 0, precision: 1 } }),
    chart('v21SalaireGenre', at(r1[1], ROW1), 'clusteredColumnChart', 'Salaire médian femmes / hommes par département',
      { cat: DEP(), y: [mea('Salaire médian femmes'), mea('Salaire médian hommes')], colors: [C.coral, C.blue], opts: { legend: true } }),
    chart('v22SalaireDiplome', at(r2[0], ROW2), 'clusteredBarChart', 'Salaire médian par diplôme',
      { cat: col('dw dim_diplome', 'diplome_libelle', 'Diplôme'), y: [mea('Salaire médian')], colors: [C.teal], sort: mea('Salaire médian') }),
    chart('v23SalaireContrat', at(r2[1], ROW2), 'clusteredBarChart', 'Salaire médian par contrat',
      { cat: col('dw dim_contrat', 'type_contrat', 'Contrat'), y: [mea('Salaire médian')], colors: [C.navy], sort: mea('Salaire médian') }),
    table('v24DetailCouts', at(r2[2], ROW2), 'Détail par département',
      [DEP(), mea('Effectif'), mea('Masse salariale'), mea('Coût total estimé', 'Coût total'), mea('% heures sup dans le coût', '% heures sup')], mea('Coût total estimé')),
    note('Hypothèses à valider : heures des vacataires (× 35) et heures sup admin (× 22) mensuelles, devise non précisée · écart H/F = (médiane H − médiane F) / médiane H, cible ≤ 2 %.'),
  ]);
}

// OM3
{
  z = 1000;
  const r1 = cols(2, [800, W - 2 * MX - GAP - 800]), r2 = cols(3, [400, 300, W - 2 * MX - 2 * GAP - 700]);
  page('pg04Temps', 'OM3 · Temps', [
    ...header('OM3', 'Mesurer le temps travaillé', 'Quel temps est réellement travaillé ?'),
    ...kpiRow([{ m: 'Jours pointés' }, { m: 'Heures par jour' }, { m: 'Taux de retard', accent: C.coral },
      { m: '% jours > 8 h' }, { m: 'Écart-type heures par jour' }, { m: 'Heures sup (h)' }]),
    chart('v20HeuresMois', at(r1[0], ROW1), 'lineChart', 'Heures travaillées par jour, par mois et par pôle',
      { cat: col('dw dim_date', 'annee_mois', 'Mois'), y: [mea('Heures par jour')], series: col('dw dim_pole', 'pole_libelle', 'Pôle'), opts: { legend: true, valueAxis: true, labels: false } }),
    chart('v21Plus8h', at(r1[1], ROW1), 'clusteredBarChart', '% de jours au-delà de 8 h',
      { cat: DEP(), y: [mea('% jours > 8 h')], colors: [C.violet], sort: mea('% jours > 8 h') }),
    chart('v22Arrivees', at(r2[0], ROW2), 'clusteredColumnChart', "Arrivées par tranche de 15 minutes",
      { cat: col('dw dim_heure', 'tranche_15min', 'Tranche'), y: [mea('Jours pointés')], colors: [C.navy] }),
    chart('v23Retard', at(r2[1], ROW2), 'clusteredBarChart', 'Taux de retard (après 8 h 30)',
      { cat: DEP(), y: [mea('Taux de retard')], colors: [C.coral], sort: mea('Taux de retard') }),
    table('v24DetailTemps', at(r2[2], ROW2), 'Détail par département',
      [DEP(), mea('Heures par jour', 'Heures / jour'), mea('Écart-type heures par jour', 'Écart-type'), mea('Taux de retard', 'Retard'), mea('% jours > 8 h')], mea('Heures par jour')),
    note('Pointages administratifs : janvier–mars 2023, techniques : janvier–juin 2023 → comparer les pôles sur janvier–mars · seuil de retard 8 h 30 choisi par l’équipe · journées incohérentes écartées au chargement.'),
  ]);
}

// OM4
{
  z = 1000;
  const r1 = cols(3), r2 = cols(2, [800, W - 2 * MX - GAP - 800]);
  page('pg05Formation', 'OM4 · Formation', [
    ...header('OM4', 'Renforcer les compétences', 'Les compétences se développent-elles ?'),
    ...kpiRow([{ m: 'Couverture formation', colorMeasure: 'Couleur couverture' }, { m: 'Employés formés' }, { m: 'Inscriptions' },
      { m: 'Formations par employé' }, { m: 'Cours suivis' }, { m: "Taux d'utilisation du catalogue" }]),
    donut('v20Niveaux', at(r1[0], ROW1), 'Inscriptions par niveau de difficulté', col('dw dim_niveau_cours', 'niveau_libelle', 'Niveau'), mea('Inscriptions')),
    chart('v21Couverture', at(r1[1], ROW1), 'clusteredBarChart', 'Couverture formation (cible ≥ 95 %)',
      { cat: DEP(), y: [mea('Couverture formation')], colorMeasure: 'Couleur couverture', sort: mea('Couverture formation') }),
    chart('v22Universites', at(r1[2], ROW1), 'clusteredBarChart', 'Universités les plus suivies',
      { cat: col('dw dim_universite', 'universite', 'Université'), y: [mea('Inscriptions')], colors: [C.amber], sort: mea('Inscriptions') }),
    table('v23TopCours', at(r2[0], ROW2), 'Cours les plus suivis',
      [col('dw dim_cours', 'intitule', 'Cours'), col('dw dim_niveau_cours', 'niveau_libelle', 'Niveau'), mea('Inscriptions'), mea('% des inscriptions')], mea('Inscriptions')),
    chart('v24ParEmploye', at(r2[1], ROW2), 'clusteredBarChart', 'Formations par employé formé',
      { cat: DEP(), y: [mea('Formations par employé')], colors: [C.teal], sort: mea('Formations par employé') }),
    note('Les administratifs n’ont aucune donnée de formation · formations sans date ni coût ni réussite : pas de taux annuel · aucun cours ne dépasse 0,25 % des inscriptions.'),
  ]);
}

// OM5
{
  z = 1000;
  const r1 = cols(2), r2 = cols(2, [800, W - 2 * MX - GAP - 800]);
  page('pg06Conges', 'OM5 · Congés', [
    ...header('OM5', 'Maîtriser les congés', 'Les congés sont-ils maîtrisés ?'),
    ...kpiRow([{ m: 'Taux de consommation des congés', label: 'Consommation des droits' }, { m: 'Congés consommés (moyenne)', label: 'Congés pris (moyenne)' }, { m: 'Solde moyen (jours)' },
      { m: '% soldes élevés' }, { m: '% dernier congé maladie', accent: C.coral }, { m: 'Effectif' }]),
    chart('v20TypeConge', at(r1[0], ROW1), 'clusteredBarChart', 'Dernier congé pris (normalisé)',
      { cat: col('dw dim_type_conge', 'type_conge_libelle', 'Type de congé'), y: [mea('Effectif')], colors: [C.green], sort: mea('Effectif') }),
    chart('v21ConsoSolde', at(r1[1], ROW1), 'clusteredColumnChart', 'Congés consommés et solde moyen (jours)',
      { cat: DEP(), y: [mea('Congés consommés (moyenne)'), mea('Solde moyen (jours)')], colors: [C.green, '#C9D6E3'], opts: { legend: true } }),
    chart('v22TypeParDep', at(r2[0], ROW2), 'hundredPercentStackedBarChart', 'Dernier congé par département',
      { cat: DEP(), y: [mea('Effectif')], series: col('dw dim_type_conge', 'type_conge_libelle', 'Type de congé'), opts: { legend: true, stacked: true } }),
    chart('v23TauxConso', at(r2[1], ROW2), 'clusteredBarChart', 'Taux de consommation des droits',
      { cat: DEP(), y: [mea('Taux de consommation des congés')], colors: [C.teal], sort: mea('Taux de consommation des congés') }),
    note('Taux de consommation = congés pris ÷ (pris + solde) · seul le dernier congé est connu, sans date ni durée : la part « maladie » est un proxy fragile d’absentéisme · soldes élevés : ≥ 20 jours (seuil à valider).'),
  ]);
}

// OM6
{
  z = 1000;
  const r1 = cols(2, [800, W - 2 * MX - GAP - 800]), r2 = cols(3, [300, 300, W - 2 * MX - 2 * GAP - 600]);
  page('pg07Echeances', 'OM6 · Échéances', [
    ...header('OM6', 'Anticiper les échéances', 'Quelles échéances anticiper, sur quelles données ?'),
    ...kpiRow([{ m: 'Échéances à 30 jours', accent: C.coral }, { m: 'Échéances à 90 jours', accent: C.coral }, { m: 'Échéances à 180 jours', accent: C.coral },
      { m: 'Échéances en 2023' }, { m: 'Employés avec anomalie de contrat', colorMeasure: 'Couleur anomalies', label: 'Employés en anomalie' }, { m: "Taux d'anomalies contractuelles", colorMeasure: 'Couleur anomalies', label: "Taux d'anomalies" }]),
    chart('v20EcheancesMois', at(r1[0], ROW1), 'clusteredColumnChart', 'Échéances de contrat par mois en 2023',
      { cat: col('dw dim_date', 'annee_mois', 'Mois'), y: [mea('Échéances en 2023')], colors: [C.coral] }),
    chart('v21Anomalies', at(r1[1], ROW1), 'clusteredBarChart', 'Anomalies de contrat (cible : 0)',
      { y: [mea('CDI avec date de fin', 'CDI datés'), mea('Vacataires en CDI', 'Vacataires CDI'), mea('Contrats échus avant 2023', 'Échus < 2023'), mea('Contrats courts sans date de fin', 'Courts sans fin')],
        colors: [C.coral, C.amber, C.violet, C.slate], opts: { legend: true } }),
    chart('v22Echeances90', at(r2[0], ROW2), 'clusteredBarChart', 'Échéances à 90 jours',
      { cat: DEP(), y: [mea('Échéances à 90 jours')], colors: [C.coral], sort: mea('Échéances à 90 jours') }),
    chart('v23EcheancesContrat', at(r2[1], ROW2), 'clusteredBarChart', 'Échéances 2023 par contrat',
      { cat: col('dw dim_contrat', 'type_contrat', 'Contrat'), y: [mea('Échéances en 2023')], colors: [C.navy], sort: mea('Échéances en 2023') }),
    table('v24DetailEcheances', at(r2[2], ROW2), 'Détail par département',
      [DEP(), mea('Échéances à 90 jours', 'Échéances 90 j'), mea('CDI avec date de fin', 'CDI datés'), mea('Vacataires en CDI', 'Vacataires CDI'), mea("Taux d'anomalies contractuelles", 'Taux anomalies')], mea('Échéances à 90 jours')),
    note('Date de référence : 1er janvier 2023 (début des pointages) · une date de fin n’est pas un départ, c’est une échéance à piloter · taux de rotation non mesurable : aucun historique de sorties.'),
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
