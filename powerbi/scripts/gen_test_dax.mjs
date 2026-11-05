// Génère une requête DAX qui définit toutes les mesures et les évalue (test sans rien écrire dans le modèle).
import { writeFileSync } from 'fs';
import { measures } from './measures.mjs';

const live = process.argv[2] === 'live';   // live = noms actuels du .pbix (suffixe « (2) »)
const fix = (s) => live ? s.replace(/'dw dim_contrat'/g, "'dw dim_contrat (2)'").replace(/'dw dim_canal_recrutement'/g, "'dw dim_canal_recrutement (2)'") : s;
const host = live ? "'dw fact_effectif_snapshot'" : "'Mesures'";

const defs = measures.map(m => `MEASURE ${host}[${m.n}] =\n${fix(m.e)}`).join('\n');
const values = measures.filter(m => m.fmt).map(m => `"${m.n}", [${m.n}]`).join(',\n  ');
writeFileSync('test_total.dax', `DEFINE\n${defs}\nEVALUATE ROW(\n  ${values}\n)\n`, 'utf8');

const byDep = ['Effectif', "Taux d'occupation", '% contrats courts', 'Ancienneté moyenne (ans)', 'Coût total estimé', 'Salaire médian',
  'Heures par jour', 'Taux de retard', '% jours > 8 h', 'Couverture formation', 'Formations par employé', 'Taux de consommation des congés',
  'Échéances à 90 jours', "Taux d'anomalies contractuelles"];
writeFileSync('test_dep.dax', `DEFINE\n${defs}\nEVALUATE SUMMARIZECOLUMNS('dw dim_departement'[departement],\n  ${byDep.map(n => `"${n}", [${n}]`).join(',\n  ')}\n)\n`, 'utf8');
console.log(`${measures.length} mesures`);
