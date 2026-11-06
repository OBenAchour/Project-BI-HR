// Mesures du rapport RH : une seule source pour le test DAX et pour l'écriture TMDL.
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
// Résumé de la segmentation (ml/segmentation_employes.py) : score de silhouette et nombre de profils
const ML = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ml', 'profils_resume.json'), 'utf8'));
// Tables : noms finaux du modèle (sans le suffixe « (2) »).
const EFF = "'dw fact_effectif_snapshot'";
const PT = "'dw fact_pointage'";
const INS = "'dw fact_inscription_formation'";
const CTR = "'dw dim_contrat'";
const DAT = "'dw dim_date'";

// Mesure de photo : la dernière photo (snapshot) visible dans le contexte.
const snap = (expr, f = EFF) =>
  `VAR _photo = MAX(${f}[date_snapshot_sk])\nRETURN CALCULATE(${expr}, ${f}[date_snapshot_sk] = _photo)`;

// Clé AAAAMMJJ -> date
const skToDate = (col) => `DATE(INT(${col} / 10000), MOD(INT(${col} / 100), 100), MOD(${col}, 100))`;

const PCT = '0.0%';
const INT = '#,##0';
const DEC1 = '#,##0.0';
const MONEY = '#,##0';

const base = [
  // ---------- Général
  { f: 'Général', n: 'Date de référence', fmt: 'dd/mm/yyyy', e: `DATE(2023, 1, 1)`,
    d: "Début de la période de pointage : sert de « aujourd'hui » pour l'ancienneté et les échéances" },
  { f: 'Général', n: 'Date de la photo', fmt: 'dd/mm/yyyy', e: skToDate(`MAX(${EFF}[date_snapshot_sk])`) },
  { f: 'Général', n: 'Titre accueil', e: `"Pilotage RH · photo du " & FORMAT([Date de la photo], "dd/mm/yyyy")` },

  // ---------- OM1
  { f: 'OM1 Effectif', n: 'Effectif', fmt: INT, e: snap(`SUM(${EFF}[nb_employes])`) },
  { f: 'OM1 Effectif', n: 'Capacité', fmt: INT, e: `SUM('dw dim_departement'[capacite])` },
  { f: 'OM1 Effectif', n: "Taux d'occupation", fmt: PCT, e: `DIVIDE([Effectif], [Capacité])` },
  { f: 'OM1 Effectif', n: "Couleur occupation", e:
    `VAR t = [Taux d'occupation]\nRETURN SWITCH(TRUE(), ISBLANK(t), "#8A94A6", t > 1.1, "#ED7373", t < 0.6, "#F2B84B", "#44C088")` },
  { f: 'OM1 Effectif', n: 'Contrats courts', fmt: INT, e: `CALCULATE([Effectif], KEEPFILTERS(${CTR}[est_contrat_court] = TRUE()))` },
  { f: 'OM1 Effectif', n: '% contrats courts', fmt: PCT, e: `DIVIDE([Contrats courts], [Effectif])` },
  { f: 'OM1 Effectif', n: 'Ancienneté moyenne (ans)', fmt: DEC1, e:
    snap(`AVERAGEX(${EFF}, DATEDIFF(${skToDate(`${EFF}[date_embauche_sk]`)}, [Date de référence], DAY)) / 365.25`) },
  { f: 'OM1 Effectif', n: '% ancienneté < 1 an', fmt: PCT, e:
    `DIVIDE(\n  ${snap(`COUNTROWS(FILTER(${EFF}, DATEDIFF(${skToDate(`${EFF}[date_embauche_sk]`)}, [Date de référence], DAY) < 365))`).replace(/\n/g, '\n  ')},\n  [Effectif])` },
  { f: 'OM1 Effectif', n: 'Entrées', fmt: INT, e: `CALCULATE([Effectif], USERELATIONSHIP(${EFF}[date_embauche_sk], ${DAT}[date_sk]))`,
    d: "Employés par date d'embauche (à croiser avec dw dim_date)" },

  // ---------- OM2
  { f: 'OM2 Coûts', n: 'Masse salariale', fmt: MONEY, e: snap(`SUM(${EFF}[salaire_mensuel])`) },
  { f: 'OM2 Coûts', n: 'Coût vacataires', fmt: MONEY, e: snap(`SUM(${EFF}[cout_vacataire])`) },
  { f: 'OM2 Coûts', n: 'Coût heures sup admin', fmt: MONEY, e: snap(`SUM(${EFF}[cout_hs_admin])`) },
  { f: 'OM2 Coûts', n: 'Coût total estimé', fmt: MONEY, e: snap(`SUM(${EFF}[cout_total_estime])`) },
  { f: 'OM2 Coûts', n: '% heures sup dans le coût', fmt: PCT, e: `DIVIDE([Coût heures sup admin], [Coût total estimé])` },
  { f: 'OM2 Coûts', n: 'Salaire médian', fmt: MONEY, e: snap(`MEDIAN(${EFF}[salaire_mensuel])`),
    d: 'Permanents et administratifs : les vacataires, payés à l’heure, n’ont pas de salaire' },
  { f: 'OM2 Coûts', n: 'Salaire médian femmes', fmt: MONEY, e: `CALCULATE([Salaire médian], KEEPFILTERS('dw dim_employe'[genre] = "F"))` },
  { f: 'OM2 Coûts', n: 'Salaire médian hommes', fmt: MONEY, e: `CALCULATE([Salaire médian], KEEPFILTERS('dw dim_employe'[genre] = "M"))` },
  { f: 'OM2 Coûts', n: 'Écart H/F médian', fmt: PCT, e: `DIVIDE([Salaire médian hommes] - [Salaire médian femmes], [Salaire médian hommes])`,
    d: '(médiane hommes − médiane femmes) / médiane hommes. Cible : ≤ 2 %' },
  { f: 'OM2 Coûts', n: 'Couleur écart H/F', e: `IF(ABS([Écart H/F médian]) <= 0.02, "#44C088", "#ED7373")` },
  { f: 'OM2 Coûts', n: 'Coût par heure travaillée', fmt: '#,##0.00', e: `DIVIDE([Coût total estimé], [Heures travaillées])`,
    d: 'Proxy : coût mensuel ÷ heures pointées sur la période (périodes différentes)' },

  // ---------- OM3
  { f: 'OM3 Temps', n: 'Jours pointés', fmt: INT, e: `SUM(${PT}[nb_pointages])` },
  { f: 'OM3 Temps', n: 'Heures travaillées', fmt: INT, e: `DIVIDE(SUM(${PT}[minutes_travaillees]), 60)` },
  { f: 'OM3 Temps', n: 'Heures par jour', fmt: '0.00', e: `DIVIDE([Heures travaillées], [Jours pointés])` },
  { f: 'OM3 Temps', n: 'Taux de retard', fmt: PCT, e: `DIVIDE(CALCULATE([Jours pointés], KEEPFILTERS('dw dim_heure'[est_apres_8h30] = TRUE())), [Jours pointés])`,
    d: 'Arrivée après 8 h 30 (seuil choisi par l’équipe, à valider)' },
  { f: 'OM3 Temps', n: '% jours > 8 h', fmt: PCT, e: `DIVIDE(CALCULATE([Jours pointés], KEEPFILTERS(${PT}[minutes_travaillees] > 480)), [Jours pointés])` },
  { f: 'OM3 Temps', n: 'Écart-type heures par jour', fmt: '0.00', e: `STDEVX.P(${PT}, ${PT}[minutes_travaillees] / 60)`,
    d: 'Régularité des horaires : plus il est élevé, plus les journées sont irrégulières' },
  { f: 'OM3 Temps', n: 'Heures sup (h)', fmt: INT, e: `DIVIDE(SUM(${PT}[minutes_sup]), 60)` },
  { f: 'OM3 Temps', n: 'Coût heures sup pointées', fmt: MONEY, e: `SUM(${PT}[cout_heures_sup])` },

  // ---------- OM4
  { f: 'OM4 Formation', n: 'Inscriptions', fmt: INT, e: snap(`SUM(${INS}[nb_inscriptions])`, INS) },
  { f: 'OM4 Formation', n: 'Employés formés', fmt: INT, e: snap(`DISTINCTCOUNT(${INS}[employe_sk])`, INS) },
  { f: 'OM4 Formation', n: 'Effectif technique', fmt: INT, e: `CALCULATE([Effectif], KEEPFILTERS('dw dim_pole'[pole_libelle] = "Technique"))` },
  { f: 'OM4 Formation', n: 'Couverture formation', fmt: PCT, e: `DIVIDE([Employés formés], [Effectif technique])`,
    d: 'Techniques ayant au moins un cours. Cible : ≥ 95 %. Les administratifs n’ont aucune donnée de formation' },
  { f: 'OM4 Formation', n: 'Couleur couverture', e: `IF([Couverture formation] >= 0.95, "#44C088", "#ED7373")` },
  { f: 'OM4 Formation', n: 'Formations par employé', fmt: DEC1, e: `DIVIDE([Inscriptions], [Employés formés])` },
  { f: 'OM4 Formation', n: 'Cours suivis', fmt: INT, e: snap(`DISTINCTCOUNT(${INS}[cours_sk])`, INS) },
  { f: 'OM4 Formation', n: "Taux d'utilisation du catalogue", fmt: PCT, e: `DIVIDE([Cours suivis], COUNTROWS(ALL('dw dim_cours')))` },
  { f: 'OM4 Formation', n: '% des inscriptions', fmt: '0.00%', e: `DIVIDE([Inscriptions], CALCULATE([Inscriptions], ALLSELECTED('dw dim_cours'), ALLSELECTED('dw dim_niveau_cours'), ALLSELECTED('dw dim_universite')))` },

  // ---------- OM5
  { f: 'OM5 Congés', n: 'Congés consommés (moyenne)', fmt: DEC1, e: snap(`AVERAGE(${EFF}[conges_consommes])`) },
  { f: 'OM5 Congés', n: 'Solde moyen (jours)', fmt: DEC1, e: snap(`AVERAGE(${EFF}[solde_conges])`) },
  { f: 'OM5 Congés', n: 'Taux de consommation des congés', fmt: PCT, e:
    snap(`DIVIDE(SUM(${EFF}[conges_consommes]), SUM(${EFF}[conges_consommes]) + SUM(${EFF}[solde_conges]))`) },
  { f: 'OM5 Congés', n: '% soldes élevés', fmt: PCT, e: `DIVIDE(${snap(`COUNTROWS(FILTER(${EFF}, ${EFF}[solde_conges] >= 20))`)}, [Effectif])`,
    d: 'Part des employés avec 20 jours de solde ou plus (seuil à valider)' },
  { f: 'OM5 Congés', n: '% dernier congé maladie', fmt: PCT, e: `DIVIDE(CALCULATE([Effectif], KEEPFILTERS('dw dim_type_conge'[type_conge_code] = "sick")), [Effectif])`,
    d: 'Proxy fragile d’absentéisme : seul le dernier congé est connu, sans date ni durée' },

  // ---------- OM6
  { f: 'OM6 Échéances', n: 'Échéances (date de fin)', fmt: INT, e: `CALCULATE([Effectif], USERELATIONSHIP(${EFF}[date_fin_contrat_sk], ${DAT}[date_sk]))`,
    d: 'Contrats par date de fin (à croiser avec dw dim_date)' },
  { f: 'OM6 Échéances', n: 'Échéances en 2023', fmt: INT, e: `CALCULATE([Échéances (date de fin)], KEEPFILTERS(${DAT}[annee] = 2023))` },
  { f: 'OM6 Échéances', n: 'Échéances à 30 jours', fmt: INT, e: echeance(30) },
  { f: 'OM6 Échéances', n: 'Échéances à 90 jours', fmt: INT, e: echeance(90) },
  { f: 'OM6 Échéances', n: 'Échéances à 180 jours', fmt: INT, e: echeance(180) },
  { f: 'OM6 Échéances', n: 'CDI avec date de fin', fmt: INT, e: `CALCULATE([Effectif], KEEPFILTERS(${CTR}[type_contrat] = "CDI"), KEEPFILTERS(NOT ISBLANK(${EFF}[date_fin_contrat_sk])))` },
  { f: 'OM6 Échéances', n: 'Vacataires en CDI', fmt: INT, e: `CALCULATE([Effectif], KEEPFILTERS(${CTR}[type_contrat] = "CDI"), KEEPFILTERS(${CTR}[statut_emploi] = "Vacataire"))` },
  { f: 'OM6 Échéances', n: 'Contrats échus avant 2023', fmt: INT, e: `CALCULATE([Effectif], KEEPFILTERS(NOT ISBLANK(${EFF}[date_fin_contrat_sk]) && ${EFF}[date_fin_contrat_sk] < 20230101))` },
  { f: 'OM6 Échéances', n: 'Contrats courts sans date de fin', fmt: INT, e: `CALCULATE([Effectif], KEEPFILTERS(${CTR}[est_contrat_court] = TRUE()), KEEPFILTERS(ISBLANK(${EFF}[date_fin_contrat_sk])))` },
  { f: 'OM6 Échéances', n: 'Employés avec anomalie de contrat', fmt: INT, e: snap(
    `COUNTROWS(FILTER(${EFF},\n    VAR _type = RELATED(${CTR}[type_contrat])\n    VAR _fin = ${EFF}[date_fin_contrat_sk]\n    RETURN (_type = "CDI" && NOT ISBLANK(_fin))\n        || (_type = "CDI" && RELATED(${CTR}[statut_emploi]) = "Vacataire")\n        || (RELATED(${CTR}[est_contrat_court]) && ISBLANK(_fin))\n        || (NOT ISBLANK(_fin) && _fin < 20230101)))`) },
  { f: 'OM6 Échéances', n: "Taux d'anomalies contractuelles", fmt: PCT, e: `DIVIDE([Employés avec anomalie de contrat], [Effectif])`,
    d: 'CDI datés, vacataires en CDI, contrats courts sans fin, contrats échus avant 2023. Cible : 0' },
  { f: 'OM6 Échéances', n: 'Couleur anomalies', e: `IF([Employés avec anomalie de contrat] = 0, "#44C088", "#ED7373")` },
  // ---------- Profils des collaborateurs (segmentation K-means, voir ml/)
  { f: 'Profils', n: 'Nombre de profils', fmt: INT, e: `${ML.k_retenu}`, d: 'Nombre de profils retenus par la segmentation (K-means)' },
  { f: 'Profils', n: 'Score de silhouette', fmt: '0.00', e: `${ML.silhouette}`,
    d: 'Qualité de la segmentation : de -1 à 1, au-dessus de 0,25 la structure est réelle mais modérée' },
  { f: 'Profils', n: "Part de l'effectif", fmt: PCT, e: `DIVIDE([Effectif], CALCULATE([Effectif], ALL('Profils')))` },
  { f: 'Profils', n: 'Coût moyen par employé', fmt: MONEY, e: `DIVIDE([Coût total estimé], [Effectif])` },
  { f: 'Profils', n: 'Expérience moyenne (ans)', fmt: DEC1, e: snap(`AVERAGE(${EFF}[annees_experience])`) },
  // ---------- Parcours de recrutement (Sankey : canal → département → contrat)
  { f: 'OM1 Effectif', n: 'Flux recrutement', fmt: INT, e:
    `VAR _etape = SELECTEDVALUE('Flux recrutement'[etape])\nVAR _source = SELECTEDVALUE('Flux recrutement'[source])\nVAR _destination = SELECTEDVALUE('Flux recrutement'[destination])\nRETURN SWITCH(_etape,\n    1, CALCULATE([Effectif], 'dw dim_canal_recrutement'[canal_libelle] = _source, 'dw dim_departement'[departement_libelle] = _destination),\n    2, CALCULATE([Effectif], 'dw dim_departement'[departement_libelle] = _source, ${CTR}[type_contrat] = _destination))`,
    d: 'Effectif par lien du parcours : canal de recrutement → département, puis département → type de contrat' },
  { f: 'OM6 Échéances', n: 'Date de fin de contrat', fmt: 'dd/mm/yyyy', e:
    `VAR _photo = MAX(${EFF}[date_snapshot_sk])\nVAR _fin = CALCULATE(MAX(${EFF}[date_fin_contrat_sk]), ${EFF}[date_snapshot_sk] = _photo)\nRETURN IF(HASONEVALUE('dw dim_employe'[employe_bk]) && NOT ISBLANK(_fin), ${skToDate('_fin')})`,
    d: "Détail par employé (vide sur un total ou sans date de fin)" },
  { f: 'OM6 Échéances', n: 'Anomalies de contrat (détail)', e:
    `IF(HASONEVALUE('dw dim_employe'[employe_bk]) && [Effectif] > 0,\n    CONCATENATEX(\n        FILTER({\n            ("CDI daté", [CDI avec date de fin]),\n            ("Vacataire en CDI", [Vacataires en CDI]),\n            ("Échu avant 2023", [Contrats échus avant 2023]),\n            ("Contrat court sans fin", [Contrats courts sans date de fin])\n        }, [Value2] > 0),\n        [Value1], " · "))`,
    d: "Détail par employé : liste des anomalies de contrat de l'employé (vide = aucune)" },
];

// ---------- Sécurité par page
// Table cachée Acteurs : une ligne par page d'acteur. Chaque rôle n'en voit que ses lignes (RLS),
// et chaque page d'acteur filtre Acteurs[page] sur elle-même (filtre de page verrouillé et masqué).
// Acteurs non vide = la page appartient au rôle. Sans rôle (propriétaire du rapport), toutes les pages sont ouvertes.
const ACT = 'Acteurs';
const security = [
  { f: 'Sécurité', n: 'Accès page', fmt: '0', e: `IF(ISEMPTY(${ACT}), 0, 1)`,
    d: "1 si la page appartient au rôle de l'utilisateur, 0 sinon. Toutes les mesures métier renvoient vide quand elle vaut 0" },
  { f: 'Sécurité', n: 'Acteur', e: `IF(HASONEVALUE(${ACT}[acteur]), VALUES(${ACT}[acteur]))`,
    d: "Acteur du rôle actif (vide sans rôle ou avec plusieurs rôles)" },
  { f: 'Sécurité', n: "Page de l'acteur", e: `MINX(TOPN(1, ${ACT}, ${ACT}[ordre], ASC), ${ACT}[page])`,
    d: "Nom affiché de la première page visible : destination du bouton de l'accueil (accès complet : Direction générale)" },
  { f: 'Sécurité', n: 'Accueil titre', e: `IF(ISBLANK([Acteur]), "Bienvenue", "Bienvenue · " & [Acteur])` },
  { f: 'Sécurité', n: 'Accueil décision', e: `IF(ISBLANK([Acteur]), "Accès complet à l'ensemble des tableaux de bord RH", "Vos décisions : " & MAX(${ACT}[decide]))` },
  { f: 'Sécurité', n: 'Accueil vue', e: `IF(ISBLANK([Acteur]), "Vue consolidée · 4 départements", MAX(${ACT}[vue]))` },
  { f: 'Sécurité', n: 'Message accès', e: `IF([Accès page] = 1, " ", "Accès non autorisé pour votre profil · retour à l'accueil")`,
    d: "Bandeau affiché sur une page qui n'appartient pas au rôle (une espace sinon, pour rester invisible)" },
  { f: 'Sécurité', n: 'Périmètre', e: `IF([Accès page] = 0, " ", IF(HASONEVALUE('dw dim_departement'[departement_libelle]), "Département : " & VALUES('dw dim_departement'[departement_libelle]), "Périmètre : les 4 départements"))`,
    d: "Département visible par le rôle : un seul pour un manager (RLS)" },
  { f: 'Sécurité', n: 'Couleur KPI', e: `IF([Accès page] = 1, "#0C3549", "#FFFFFF")`, d: 'Couleur des cartes : blanc sur blanc quand la page est verrouillée' },
  { f: 'Sécurité', n: 'Couleur KPI alerte', e: `IF([Accès page] = 1, "#ED7373", "#FFFFFF")` },
];

// Verrou : chaque mesure métier renvoie vide (ou blanc pour une couleur) hors des pages du rôle.
const indent = (e) => e.split('\n').join('\n    ');
const gate = (m) => {
  if (m.f === 'Général' || m.f === 'Sécurité') return m;
  const isColor = m.n.startsWith('Couleur');
  return { ...m, e: isColor ? `IF([Accès page] = 1,\n    ${indent(m.e)},\n    "#FFFFFF")` : `IF([Accès page] = 1,\n    ${indent(m.e)})` };
};
export const measures = [...security, ...base.map(gate)];

function echeance(jours) {
  return snap(`COUNTROWS(FILTER(${EFF},\n    VAR _fin = ${EFF}[date_fin_contrat_sk]\n    VAR _ref = [Date de référence]\n    RETURN NOT ISBLANK(_fin)\n        && ${skToDate('_fin')} >= _ref\n        && ${skToDate('_fin')} < _ref + ${jours}))`);
}
