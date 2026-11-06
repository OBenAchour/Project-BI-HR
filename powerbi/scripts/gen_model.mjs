// Écrit dans le modèle sémantique (TMDL) :
//   - la table Mesures, depuis measures.mjs (les lineageTag existants sont conservés) ;
//   - la table cachée Acteurs (une ligne par page d'acteur), depuis acteurs.mjs ;
//   - les 10 rôles : un par acteur, 4 pour les managers (sécurité par ligne sur le département).
// Power BI Desktop doit être fermé (sinon il écrase les fichiers en enregistrant).
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { measures } from './measures.mjs';
import { ACTEURS } from './acteurs.mjs';

const DEF = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'RH_Report.SemanticModel', 'definition');
const NL = '\r\n';
const q = (n) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : `'${n.replace(/'/g, "''")}'`;
const str = (v) => `"${String(v).replace(/"/g, '""')}"`;
const read = (f) => readFileSync(f, 'utf8').replace(/^﻿/, '');

// ---------- Mesures
{
  const file = join(DEF, 'tables', 'Mesures.tmdl');
  const old = read(file);
  const tags = new Map();
  for (const m of old.matchAll(/^\tmeasure ('(?:[^']|'')+'|\S+) =[\s\S]*?^\t\tlineageTag: (\S+)/gm)) {
    tags.set(m[1].replace(/^'|'$/g, '').replace(/''/g, "'"), m[2]);
  }
  const head = old.slice(0, old.search(/^\t(\/\/\/|measure )/m));
  const tail = old.slice(old.search(/^\tcolumn /m));
  const body = measures.map(m => {
    const L = [];
    if (m.d) L.push(`\t/// ${m.d}`);
    const lines = m.e.split('\n');
    if (lines.length === 1) L.push(`\tmeasure ${q(m.n)} = ${lines[0]}`);
    else { L.push(`\tmeasure ${q(m.n)} =`); for (const l of lines) L.push(`\t\t\t${l}`); }
    if (m.fmt) L.push(`\t\tformatString: ${m.fmt}`);
    L.push(`\t\tdisplayFolder: ${m.f}`);
    L.push(`\t\tlineageTag: ${tags.get(m.n) || randomUUID()}`);
    return L.join(NL) + NL + NL;
  }).join('');
  writeFileSync(file, head.replace(/\r?\n/g, NL) + body + tail.replace(/\r?\n/g, NL), 'utf8');
}

// ---------- Table Acteurs (calculée, cachée)
{
  const file = join(DEF, 'tables', 'Acteurs.tmdl');
  const old = existsSync(file) ? read(file) : '';
  const tag = (key) => (old.match(new RegExp(`^\\t${key}\\r?\\n(?:\\t\\t.*\\r?\\n)*?\\t\\tlineageTag: (\\S+)`, 'm')) || [])[1] || randomUUID();
  const tableTag = (old.match(/^table Acteurs\r?\n(?:\t.*\r?\n)*?\tlineageTag: (\S+)/m) || [])[1] || randomUUID();
  const cols = [['acteur', 'string', 'STRING'], ['page', 'string', 'STRING'], ['ordre', 'int64', 'INTEGER'], ['decide', 'string', 'STRING'], ['vue', 'string', 'STRING']];
  const rows = ACTEURS.flatMap(a => a.pages.map((p, i) => `{ ${[str(a.acteur), str(p.nom), a.ordre * 10 + i, str(a.decide), str(a.vue)].join(', ')} }`));
  const L = [
    '/// Sécurité par page : une ligne par page d\'acteur. Chaque rôle ne voit que ses lignes ; chaque page d\'acteur filtre [page] sur elle-même.',
    'table Acteurs',
    '\tisHidden',
    `\tlineageTag: ${tableTag}`,
    '',
  ];
  for (const [c, t] of cols) {
    L.push(`\tcolumn ${c}`, `\t\tdataType: ${t}`, '\t\tisHidden', ...(t === 'int64' ? ['\t\tformatString: 0'] : []),
      `\t\tlineageTag: ${tag(`column ${c}`)}`, '\t\tsummarizeBy: none', '\t\tisNameInferred', `\t\tsourceColumn: [${c}]`, '',
      '\t\tannotation SummarizationSetBy = Automatic', '');
  }
  L.push('\tpartition Acteurs = calculated', '\t\tmode: import', '\t\tsource =',
    `\t\t\t\tDATATABLE(`,
    `\t\t\t\t    ${cols.map(([c, , d]) => `${str(c)}, ${d}`).join(', ')},`,
    `\t\t\t\t    {`,
    ...rows.map((r, i) => `\t\t\t\t        ${r}${i < rows.length - 1 ? ',' : ''}`),
    `\t\t\t\t    }`,
    `\t\t\t\t)`, '', '');
  writeFileSync(file, L.join(NL), 'utf8');
}

// ---------- Tables calculées : profils (segmentation K-means, ml/) et parcours de recrutement (Sankey)
const calcTable = (name, { description, hidden = false, cols, source }) => {
  const file = join(DEF, 'tables', `${name}.tmdl`);
  const old = existsSync(file) ? read(file) : '';
  const tag = (key) => (old.match(new RegExp(`^\\t${key}\\r?\\n(?:\\t\\t.*\\r?\\n)*?\\t\\tlineageTag: (\\S+)`, 'm')) || [])[1] || randomUUID();
  const tableTag = (old.match(new RegExp(`^table ${q(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\r?\\n(?:\\t.*\\r?\\n)*?\\tlineageTag: (\\S+)`, 'm')) || [])[1] || randomUUID();
  const L = [`/// ${description}`, `table ${q(name)}`, ...(hidden ? ['\tisHidden'] : []), `\tlineageTag: ${tableTag}`, ''];
  for (const c of cols) {
    L.push(`\tcolumn ${c.n}`, `\t\tdataType: ${c.t}`, ...((hidden || c.hidden) ? ['\t\tisHidden'] : []), ...(c.t === 'int64' ? ['\t\tformatString: 0'] : []),
      `\t\tlineageTag: ${tag(`column ${c.n}`)}`, '\t\tsummarizeBy: none', '\t\tisNameInferred', `\t\tsourceColumn: [${c.n}]`,
      ...(c.sortBy ? [`\t\tsortByColumn: ${c.sortBy}`] : []), '', '\t\tannotation SummarizationSetBy = Automatic', '');
  }
  L.push(`\tpartition ${q(name)} = calculated`, '\t\tmode: import', '\t\tsource =', ...source.split('\n').map(l => `\t\t\t\t${l}`), '', '');
  writeFileSync(file, L.join(NL), 'utf8');
};
{
  const ML = JSON.parse(read(join(DEF, '..', '..', 'ml', 'profils_resume.json')));
  const lignes = read(join(DEF, '..', '..', 'ml', 'profils_employes.csv')).trim().split(/\r?\n/).slice(1).map(l => l.split(','));
  calcTable('Profils', {
    description: `Profils des collaborateurs : segmentation K-means (k = ${ML.k_retenu}, silhouette ${ML.silhouette}), voir ml/segmentation_employes.py`,
    cols: [{ n: 'profil_ordre', t: 'int64', hidden: true }, { n: 'profil', t: 'string', sortBy: 'profil_ordre' }, { n: 'description', t: 'string' }],
    source: ['DATATABLE(', '    "profil_ordre", INTEGER, "profil", STRING, "description", STRING,', '    {',
      ...ML.profils.map((p, i) => `        { ${p.ordre}, ${str(p.profil)}, ${str(p.description)} }${i < ML.profils.length - 1 ? ',' : ''}`), '    }', ')'].join('\n'),
  });
  calcTable('Profils employés', {
    description: 'Profil de chaque collaborateur (ml/profils_employes.csv) ; relié à dw dim_employe par employe_bk',
    hidden: true,
    cols: [{ n: 'employe_bk', t: 'string' }, { n: 'profil_ordre', t: 'int64' }],
    source: ['DATATABLE(', '    "employe_bk", STRING, "profil_ordre", INTEGER,', '    {',
      ...lignes.map(([bk, o], i) => `        { ${str(bk)}, ${o} }${i < lignes.length - 1 ? ',' : ''}`), '    }', ')'].join('\n'),
  });
  calcTable('Flux recrutement', {
    description: 'Liens du parcours de recrutement pour le Sankey : étape 1 canal → département, étape 2 département → type de contrat',
    hidden: true,
    cols: [{ n: 'etape', t: 'int64' }, { n: 'source', t: 'string' }, { n: 'destination', t: 'string' }],
    source: [
      'UNION(',
      '    SELECTCOLUMNS(',
      "        CROSSJOIN(VALUES('dw dim_canal_recrutement'[canal_libelle]), VALUES('dw dim_departement'[departement_libelle])),",
      `        "etape", 1, "source", 'dw dim_canal_recrutement'[canal_libelle], "destination", 'dw dim_departement'[departement_libelle]),`,
      '    SELECTCOLUMNS(',
      "        CROSSJOIN(VALUES('dw dim_departement'[departement_libelle]), VALUES('dw dim_contrat'[type_contrat])),",
      `        "etape", 2, "source", 'dw dim_departement'[departement_libelle], "destination", 'dw dim_contrat'[type_contrat])`,
      ')'].join('\n'),
  });
  // Relations : Profils → Profils employés → dw dim_employe (filtre à sens unique vers les faits)
  const rf = join(DEF, 'relationships.tmdl');
  let rel = read(rf).replace(/\r?\n/g, NL);
  const ensure = (from, to) => {
    if (rel.includes(`fromColumn: ${from}${NL}`)) return;
    rel = rel.replace(/(\r\n)*$/, '') + `${NL}${NL}relationship ${randomUUID()}${NL}\tfromColumn: ${from}${NL}\ttoColumn: ${to}${NL}`;
  };
  ensure("'dw dim_employe'.employe_bk", "'Profils employés'.employe_bk");
  ensure("'Profils employés'.profil_ordre", 'Profils.profil_ordre');
  writeFileSync(rf, rel.replace(/(\r\n)*$/, '') + NL, 'utf8');
}

// ---------- Libellé lisible du département (colonne calculée : la source donne INFORMATIQUE, TELECOM, COMMUN, ADMINISTRATION)
{
  const file = join(DEF, 'tables', 'dw dim_departement.tmdl');
  let t = read(file).replace(/\r?\n/g, NL);
  const tag = (t.match(/^\tcolumn departement_libelle =[\s\S]*?^\t\tlineageTag: (\S+)/m) || [])[1] || randomUUID();
  t = t.replace(/^\t(\/\/\/[^\r\n]*\r\n\t)?column departement_libelle =[\s\S]*?(?=^\t(column|partition|\/\/\/) )/m, '');
  const labels = [['DEP_INF00', 'Informatique'], ['DEP_TEL00', 'Télécom'], ['DEP_COM01', 'Communication'], ['DEP_ADMIN00', 'Administration']];
  const block = [
    '\t/// Libellé affiché dans le rapport ; la colonne departement garde la valeur de la source',
    `\tcolumn departement_libelle = SWITCH('dw dim_departement'[departement_bk], ${labels.map(([k, v]) => `${str(k)}, ${str(v)}`).join(', ')}, 'dw dim_departement'[departement])`,
    '\t\tdataType: string',
    `\t\tlineageTag: ${tag}`,
    '\t\tsummarizeBy: none',
    '',
    '\t\tannotation SummarizationSetBy = Automatic',
    '', '',
  ].join(NL);
  t = t.replace(/^\tpartition /m, block + '\tpartition ');
  writeFileSync(file, t, 'utf8');
}

// ---------- Rôles
{
  const dir = join(DEF, 'roles');
  const ids = new Map();
  for (const f of readdirSync(dir)) {
    const t = read(join(dir, f));
    const name = (t.match(/^role ('(?:[^']|'')+'|\S+)/m) || [])[1];
    const id = (t.match(/annotation PBI_Id = (\S+)/) || [])[1];
    if (name && id) ids.set(name.replace(/^'|'$/g, '').replace(/''/g, "'"), id);
    rmSync(join(dir, f));
  }
  const names = [];
  for (const a of ACTEURS) {
    for (const r of a.roles) {
      names.push(r.nom);
      const L = [
        r.deptBk
          ? `/// ${a.acteur} : voit uniquement ${r.dept} (${r.deptBk}) et la page « ${a.pages[0].nom} ». PPTX slides 20 à 22.`
          : `/// ${a.acteur} : voit uniquement ${a.pages.length > 1 ? 'les pages' : 'la page'} ${a.pages.map(p => `« ${p.nom} »`).join(' et ')}, tous départements. PPTX slides 20 à 22.`,
        `role ${q(r.nom)}`,
        '\tmodelPermission: read',
        '',
        `\ttablePermission Acteurs = Acteurs[acteur] = ${str(a.acteur)}`,
        '',
      ];
      if (r.deptBk) {
        L.push(`\ttablePermission 'dw dim_departement' = 'dw dim_departement'[departement_bk] = ${str(r.deptBk)}`, '',
          `\ttablePermission 'dw dim_employe' = 'dw dim_employe'[departement_sk] = LOOKUPVALUE('dw dim_departement'[departement_sk], 'dw dim_departement'[departement_bk], ${str(r.deptBk)})`, '');
      }
      L.push(`\tannotation PBI_Id = ${ids.get(r.nom) || randomUUID().replace(/-/g, '')}`, '', '');
      writeFileSync(join(dir, `${r.nom}.tmdl`), L.join(NL), 'utf8');
    }
  }
  // model.tmdl : références de la table Acteurs et des rôles
  const mf = join(DEF, 'model.tmdl');
  let m = read(mf).replace(/^ref role .*\r?\n/gm, '');
  for (const t of ['Flux recrutement', 'Profils employés', 'Profils', 'Acteurs']) {
    const ref = `ref table ${q(t)}`;
    if (!m.split(/\r?\n/).includes(ref)) m = m.replace(/^(ref table Mesures\r?\n)/m, `$1${ref}${NL}`);
  }
  m = m.replace(/^(ref cultureInfo)/m, names.map(n => `ref role ${q(n)}${NL}`).join('') + NL + '$1').replace(/(\r?\n){3,}ref role/, `${NL}${NL}ref role`);
  writeFileSync(mf, m, 'utf8');
  console.log(`${measures.length} mesures · ${ACTEURS.reduce((s, a) => s + a.pages.length, 0)} lignes Acteurs · ${names.length} rôles`);
}
