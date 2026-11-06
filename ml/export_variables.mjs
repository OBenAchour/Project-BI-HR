// Exporte une ligne par employé (dernière photo RH) depuis le modèle ouvert dans Power BI Desktop :
// attributs descriptifs + variables numériques utilisées par la segmentation.
// Usage : node ml/export_variables.mjs <port>   → ml/variables_employes.csv
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';

const HERE = dirname(fileURLToPath(import.meta.url));
const port = process.argv[2];
if (!port) throw new Error('Usage : node ml/export_variables.mjs <port>');

const EFF = "'dw fact_effectif_snapshot'";
const query = `
EVALUATE
VAR _photo = MAX(${EFF}[date_snapshot_sk])
RETURN
ADDCOLUMNS(
    CALCULATETABLE(VALUES('dw dim_employe'[employe_bk]), ${EFF}[date_snapshot_sk] = _photo),
    "departement", CALCULATE(MAXX(${EFF}, RELATED('dw dim_departement'[departement_libelle])), ${EFF}[date_snapshot_sk] = _photo),
    "pole", CALCULATE(MAXX(${EFF}, RELATED('dw dim_pole'[pole_libelle])), ${EFF}[date_snapshot_sk] = _photo),
    "type_contrat", CALCULATE(MAXX(${EFF}, RELATED('dw dim_contrat'[type_contrat])), ${EFF}[date_snapshot_sk] = _photo),
    "statut_emploi", CALCULATE(MAXX(${EFF}, RELATED('dw dim_contrat'[statut_emploi])), ${EFF}[date_snapshot_sk] = _photo),
    "anciennete_ans", [Ancienneté moyenne (ans)],
    "experience_ans", CALCULATE(AVERAGE(${EFF}[annees_experience]), ${EFF}[date_snapshot_sk] = _photo),
    "cout_mensuel", [Coût total estimé],
    "heures_jour", [Heures par jour],
    "pct_jours_8h", [% jours > 8 h],
    "taux_retard", [Taux de retard],
    "conges_pris", [Congés consommés (moyenne)],
    "solde_conges", [Solde moyen (jours)],
    "nb_formations", [Inscriptions]
)`;

const tin = join(tmpdir(), 'rh_export.json'), tout = join(tmpdir(), 'rh_export_out.json');
writeFileSync(tin, JSON.stringify([{ id: 'variables', roles: '', query }]), 'utf8');
// run_dax.ps1 garde les 50 premières lignes : on lui demande ici toutes les lignes via -AllRows
execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(HERE, '..', 'powerbi', 'scripts', 'run_dax.ps1'),
  '-Port', port, '-TestsFile', tin, '-OutFile', tout, '-AllRows'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const [r] = JSON.parse(readFileSync(tout, 'utf8').replace(/^﻿/, ''));
if (!r.ok) throw new Error(r.error);
const cols = r.columns.map(c => c.replace(/^.*\[|\]$/g, ''));
const esc = (v) => v === null ? '' : /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
const csv = [cols.join(','), ...r.rows.map(row => row.map(esc).join(','))].join('\n') + '\n';
writeFileSync(join(HERE, 'variables_employes.csv'), csv, 'utf8');
console.log(`${r.rows.length} employés · ${cols.length} colonnes → ml/variables_employes.csv`);
