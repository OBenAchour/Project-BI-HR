// Test complet du rapport RH, rôle par rôle, sur le modèle ouvert dans Power BI Desktop.
// Pour chaque rôle (et sans rôle) et chaque page, rejoue la requête de chaque visuel (mêmes champs, même filtre de page) et vérifie :
//   - aucune erreur DAX ;
//   - page du rôle : des données ; page d'un autre rôle : aucune donnée, bandeau « Accès non autorisé », cartes en blanc ;
//   - managers : un seul département visible ;
//   - accueil : bienvenue et destination du bouton propres au rôle.
// Usage : node powerbi/scripts/test_report.mjs <port>   (port : msmdsrv.port.txt du dossier AnalysisServicesWorkspaces)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { ACTEURS } from './acteurs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGES = join(HERE, '..', '..', 'RH_Report.Report', 'definition', 'pages');
const port = process.argv[2];
if (!port) throw new Error('Usage : node test_report.mjs <port>');
const json = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));
const dq = (v) => `"${String(v).replace(/"/g, '""')}"`;
const colRef = (e, p) => `'${e.replace(/'/g, "''")}'[${p}]`;
const meaRef = (p) => `[${p.replace(/]/g, ']]')}]`;

// ---------- pages et visuels
const order = json(join(PAGES, 'pages.json')).pageOrder;
const pages = order.map(id => {
  const pg = json(join(PAGES, id, 'page.json'));
  const unq = (v) => v.slice(1, -1).replace(/''/g, "'");
  const filters = (pg.filterConfig?.filters || []).map(f => ({
    entity: f.field.Column.Expression.SourceRef.Entity, prop: f.field.Column.Property,
    values: f.filter.Where[0].Condition.In.Values.map(v => unq(v[0].Literal.Value)),
  }));
  const acces = filters.find(f => f.entity === 'Acteurs' && f.prop === 'page');
  const filtre = acces ? acces.values[0] : null;
  const autres = filters.filter(f => f !== acces);
  const visuals = [];
  const vdir = join(PAGES, id, 'visuals');
  for (const name of readdirSync(vdir)) {
    const v = json(join(vdir, name, 'visual.json'));
    const qs = v.visual.query?.queryState || {};
    const cols = [], meas = [];
    for (const st of Object.values(qs)) for (const pr of st.projections || []) {
      if (pr.field.Column) cols.push([pr.field.Column.Expression.SourceRef.Entity, pr.field.Column.Property]);
      if (pr.field.Measure) meas.push(pr.field.Measure.Property);
    }
    // mesures de mise en forme (couleurs) et de destination de bouton
    const fmt = new Set();
    const walk = (o) => { if (o && typeof o === 'object') { if (o.Measure?.Property && o.Measure.Expression?.SourceRef?.Entity === 'Mesures') fmt.add(o.Measure.Property); Object.values(o).forEach(walk); } };
    walk(v.visual.objects); walk(v.visual.visualContainerObjects);
    visuals.push({ name, type: v.visual.visualType, cols, meas, fmt: [...fmt] });
  }
  return { id, nom: pg.displayName, hidden: pg.visibility === 'HiddenInViewMode', filtre, autres, visuals };
});

// ---------- rôles
const roles = [{ nom: '', acteur: null }];
for (const a of ACTEURS) for (const r of a.roles) roles.push({ nom: r.nom, acteur: a, deptBk: r.deptBk });
const allowed = (role, page) => !page.filtre || !role.acteur || role.acteur.pages.some(p => p.nom === page.filtre);

// ---------- requêtes
const tests = [];
const add = (id, role, query, meta) => tests.push({ id, roles: role.nom, query, meta });
for (const role of roles) {
  add(`dept|${role.nom}`, role, `EVALUATE VALUES('dw dim_departement'[departement_libelle])`, { kind: 'dept', role });
  add(`accueil|${role.nom}`, role, `EVALUATE ROW("titre", [Accueil titre], "decision", [Accueil décision], "vue", [Accueil vue], "page", [Page de l'acteur], "acteur", [Acteur])`, { kind: 'accueil', role });
  for (const page of pages) {
    const f = [
      ...(page.filtre ? [`TREATAS({${dq(page.filtre)}}, Acteurs[page])`] : []),
      ...page.autres.map(o => `TREATAS({${o.values.map(dq).join(', ')}}, ${colRef(o.entity, o.prop)})`),
    ].join(', ') || null;
    for (const v of page.visuals) {
      if (v.meas.length) {
        const args = [...v.cols.map(([e, p]) => colRef(e, p)), ...(f ? [f] : []), ...v.meas.map((m, i) => `${dq('m' + i)}, ${meaRef(m)}`)];
        add(`v|${role.nom}|${page.id}|${v.name}`, role, `EVALUATE SUMMARIZECOLUMNS(${args.join(', ')})`, { kind: 'visual', role, page, v });
      }
      for (const m of v.fmt) {
        if (m === "Page de l'acteur") continue;
        const expr = f ? `CALCULATE(${meaRef(m)}, ${f})` : meaRef(m);
        add(`f|${role.nom}|${page.id}|${v.name}|${m}`, role, `EVALUATE ROW("c", ${expr})`, { kind: 'fmt', role, page, v, m });
      }
    }
  }
}

// ---------- exécution
const tin = join(tmpdir(), 'rh_tests.json'), tout = join(tmpdir(), 'rh_results.json');
writeFileSync(tin, JSON.stringify(tests.map(({ id, roles, query }) => ({ id, roles, query }))), 'utf8');
const t0 = Date.now();
console.log(execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, 'run_dax.ps1'), '-Port', port, '-TestsFile', tin, '-OutFile', tout], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim());
const res = new Map(json(tout).map(r => [r.id, r]));

// ---------- vérifications
const fails = [], warns = [];
const deptName = new Map();
const isBlank = (x) => x === null || x === undefined || x === '';
for (const t of tests) {
  const r = res.get(t.id), m = t.meta, who = m.role.nom || '(aucun rôle)';
  if (!r.ok) { fails.push(`${who} · ${m.page?.nom || m.kind} · ${m.v?.name || ''} : erreur DAX ${r.error}`); continue; }
  if (m.kind === 'dept') {
    const ds = r.rows.map(x => x[0]);
    if (m.role.deptBk) { if (ds.length !== 1) fails.push(`${who} : ${ds.length} départements visibles au lieu de 1`); deptName.set(m.role.nom, ds[0]); }
    else if (ds.length !== 4) fails.push(`${who} : ${ds.length} départements visibles au lieu de 4`);
  } else if (m.kind === 'accueil') {
    const [titre, , , pageDest, act] = r.rows[0] || [];
    if (!m.role.acteur) {
      const first = [...ACTEURS].sort((x, y) => x.ordre - y.ordre)[0].pages[0].nom;
      if (pageDest !== first) fails.push(`sans rôle : bouton vers « ${pageDest} » au lieu de « ${first} »`);
      if (titre !== 'Bienvenue') fails.push(`sans rôle : titre d'accueil « ${titre} »`);
    }
    else {
      if (act !== m.role.acteur.acteur) fails.push(`${who} : acteur « ${act} » au lieu de « ${m.role.acteur.acteur} »`);
      if (pageDest !== m.role.acteur.pages[0].nom) fails.push(`${who} : bouton vers « ${pageDest} » au lieu de « ${m.role.acteur.pages[0].nom} »`);
      if (!pages.some(p => p.nom === pageDest)) fails.push(`${who} : la destination « ${pageDest} » n'est pas une page du rapport`);
      if (!String(titre).includes(m.role.acteur.acteur)) fails.push(`${who} : titre d'accueil « ${titre} »`);
    }
  } else if (m.kind === 'visual') {
    const ok = allowed(m.role, m.page);
    const mi = r.columns.map((c, i) => [c, i]).filter(([c]) => /\[m\d+\]$/.test(c)).map(([, i]) => i);
    const di = r.columns.findIndex(c => c === "'dw dim_departement'[departement_libelle]" || c === 'dw dim_departement[departement_libelle]');
    const where = `${who} · ${m.page.nom} · ${m.v.name}`;
    const onlyMsg = m.v.meas.every(x => x === 'Message accès' || x === 'Périmètre');
    if (onlyMsg) {
      const val = r.rows[0]?.[mi[0]];
      if (m.v.meas[0] === 'Message accès') {
        if (ok && val !== ' ') fails.push(`${where} : bandeau d'accès visible sur une page autorisée (« ${val} »)`);
        if (!ok && !String(val || '').startsWith('Accès non autorisé')) fails.push(`${where} : bandeau « Accès non autorisé » absent`);
      } else if (ok && m.role.deptBk && val !== `Département : ${deptName.get(m.role.nom)}`) fails.push(`${where} : périmètre « ${val} »`);
      continue;
    }
    const nonBlank = r.rows.some(row => mi.some(i => !isBlank(row[i])));
    if (ok && !nonBlank) warns.push(`${where} : visuel vide`);
    if (!ok && nonBlank) fails.push(`${where} : des données sont visibles sur une page d'un autre rôle`);
    if (ok && m.role.deptBk && di >= 0) {
      const other = r.rows.filter(row => row[di] !== deptName.get(m.role.nom));
      if (other.length) fails.push(`${where} : départements hors périmètre visibles (${[...new Set(other.map(o => o[di]))].join(', ')})`);
    }
    if (r.ms > 5000) warns.push(`${where} : requête lente (${r.ms} ms)`);
  } else if (m.kind === 'fmt') {
    const ok = allowed(m.role, m.page), c = r.rows[0]?.[0];
    const where = `${who} · ${m.page.nom} · ${m.v.name} · ${m.m}`;
    if (!ok && c !== '#FFFFFF') fails.push(`${where} : couleur ${c} au lieu de blanc sur une page verrouillée`);
    if (ok && (c === '#FFFFFF' || isBlank(c)) && m.m.startsWith('Couleur KPI')) fails.push(`${where} : carte invisible sur une page autorisée`);
  }
}

// ---------- rapport
const visualTests = tests.filter(t => t.meta.kind === 'visual').length;
const lines = [
  `Tests : ${tests.length} requêtes (${visualTests} requêtes de visuels) · ${roles.length} profils (10 rôles + sans rôle) · ${pages.length} pages · ${Math.round((Date.now() - t0) / 1000)} s`,
  `Échecs : ${fails.length}`, ...fails.map(x => '  ✗ ' + x),
  `Avertissements : ${warns.length}`, ...warns.map(x => '  ! ' + x),
];
writeFileSync(join(tmpdir(), 'rh_test_report.txt'), lines.join('\n'), 'utf8');
console.log(lines.slice(0, 2).join('\n') + `\nAvertissements : ${warns.length}\nDétail : ${join(tmpdir(), 'rh_test_report.txt')}`);
process.exitCode = fails.length ? 1 : 0;
