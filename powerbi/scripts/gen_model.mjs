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
  if (!/^ref table Acteurs\r?$/m.test(m)) m = m.replace(/^(ref table Mesures\r?\n)/m, `$1ref table Acteurs${NL}`);
  m = m.replace(/^(ref cultureInfo)/m, names.map(n => `ref role ${q(n)}${NL}`).join('') + NL + '$1').replace(/(\r?\n){3,}ref role/, `${NL}${NL}ref role`);
  writeFileSync(mf, m, 'utf8');
  console.log(`${measures.length} mesures · ${ACTEURS.reduce((s, a) => s + a.pages.length, 0)} lignes Acteurs · ${names.length} rôles`);
}
