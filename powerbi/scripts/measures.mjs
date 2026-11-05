// Mesures du rapport RH : une seule source pour le test DAX et pour l'écriture TMDL.
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

export const measures = [
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
  { f: 'OM1 Effectif', n: 'Contrats courts', fmt: INT, e: `CALCULATE([Effectif], ${CTR}[est_contrat_court] = TRUE())` },
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
  { f: 'OM2 Coûts', n: 'Salaire médian femmes', fmt: MONEY, e: `CALCULATE([Salaire médian], 'dw dim_employe'[genre] = "F")` },
  { f: 'OM2 Coûts', n: 'Salaire médian hommes', fmt: MONEY, e: `CALCULATE([Salaire médian], 'dw dim_employe'[genre] = "M")` },
  { f: 'OM2 Coûts', n: 'Écart H/F médian', fmt: PCT, e: `DIVIDE([Salaire médian hommes] - [Salaire médian femmes], [Salaire médian hommes])`,
    d: '(médiane hommes − médiane femmes) / médiane hommes. Cible : ≤ 2 %' },
  { f: 'OM2 Coûts', n: 'Couleur écart H/F', e: `IF(ABS([Écart H/F médian]) <= 0.02, "#44C088", "#ED7373")` },
  { f: 'OM2 Coûts', n: 'Coût par heure travaillée', fmt: '#,##0.00', e: `DIVIDE([Coût total estimé], [Heures travaillées])`,
    d: 'Proxy : coût mensuel ÷ heures pointées sur la période (périodes différentes)' },

  // ---------- OM3
  { f: 'OM3 Temps', n: 'Jours pointés', fmt: INT, e: `SUM(${PT}[nb_pointages])` },
  { f: 'OM3 Temps', n: 'Heures travaillées', fmt: INT, e: `DIVIDE(SUM(${PT}[minutes_travaillees]), 60)` },
  { f: 'OM3 Temps', n: 'Heures par jour', fmt: '0.00', e: `DIVIDE([Heures travaillées], [Jours pointés])` },
  { f: 'OM3 Temps', n: 'Taux de retard', fmt: PCT, e: `DIVIDE(CALCULATE([Jours pointés], 'dw dim_heure'[est_apres_8h30] = TRUE()), [Jours pointés])`,
    d: 'Arrivée après 8 h 30 (seuil choisi par l’équipe, à valider)' },
  { f: 'OM3 Temps', n: '% jours > 8 h', fmt: PCT, e: `DIVIDE(CALCULATE([Jours pointés], ${PT}[minutes_travaillees] > 480), [Jours pointés])` },
  { f: 'OM3 Temps', n: 'Écart-type heures par jour', fmt: '0.00', e: `STDEVX.P(${PT}, ${PT}[minutes_travaillees] / 60)`,
    d: 'Régularité des horaires : plus il est élevé, plus les journées sont irrégulières' },
  { f: 'OM3 Temps', n: 'Heures sup (h)', fmt: INT, e: `DIVIDE(SUM(${PT}[minutes_sup]), 60)` },
  { f: 'OM3 Temps', n: 'Coût heures sup pointées', fmt: MONEY, e: `SUM(${PT}[cout_heures_sup])` },

  // ---------- OM4
  { f: 'OM4 Formation', n: 'Inscriptions', fmt: INT, e: snap(`SUM(${INS}[nb_inscriptions])`, INS) },
  { f: 'OM4 Formation', n: 'Employés formés', fmt: INT, e: snap(`DISTINCTCOUNT(${INS}[employe_sk])`, INS) },
  { f: 'OM4 Formation', n: 'Effectif technique', fmt: INT, e: `CALCULATE([Effectif], 'dw dim_pole'[pole_libelle] = "Technique")` },
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
  { f: 'OM5 Congés', n: '% dernier congé maladie', fmt: PCT, e: `DIVIDE(CALCULATE([Effectif], 'dw dim_type_conge'[type_conge_code] = "sick"), [Effectif])`,
    d: 'Proxy fragile d’absentéisme : seul le dernier congé est connu, sans date ni durée' },

  // ---------- OM6
  { f: 'OM6 Échéances', n: 'Échéances (date de fin)', fmt: INT, e: `CALCULATE([Effectif], USERELATIONSHIP(${EFF}[date_fin_contrat_sk], ${DAT}[date_sk]))`,
    d: 'Contrats par date de fin (à croiser avec dw dim_date)' },
  { f: 'OM6 Échéances', n: 'Échéances en 2023', fmt: INT, e: `CALCULATE([Échéances (date de fin)], ${DAT}[annee] = 2023)` },
  { f: 'OM6 Échéances', n: 'Échéances à 30 jours', fmt: INT, e: echeance(30) },
  { f: 'OM6 Échéances', n: 'Échéances à 90 jours', fmt: INT, e: echeance(90) },
  { f: 'OM6 Échéances', n: 'Échéances à 180 jours', fmt: INT, e: echeance(180) },
  { f: 'OM6 Échéances', n: 'CDI avec date de fin', fmt: INT, e: `CALCULATE([Effectif], ${CTR}[type_contrat] = "CDI", NOT ISBLANK(${EFF}[date_fin_contrat_sk]))` },
  { f: 'OM6 Échéances', n: 'Vacataires en CDI', fmt: INT, e: `CALCULATE([Effectif], ${CTR}[type_contrat] = "CDI", ${CTR}[statut_emploi] = "Vacataire")` },
  { f: 'OM6 Échéances', n: 'Contrats échus avant 2023', fmt: INT, e: `CALCULATE([Effectif], NOT ISBLANK(${EFF}[date_fin_contrat_sk]), ${EFF}[date_fin_contrat_sk] < 20230101)` },
  { f: 'OM6 Échéances', n: 'Contrats courts sans date de fin', fmt: INT, e: `CALCULATE([Effectif], ${CTR}[est_contrat_court] = TRUE(), ISBLANK(${EFF}[date_fin_contrat_sk]))` },
  { f: 'OM6 Échéances', n: 'Employés avec anomalie de contrat', fmt: INT, e: snap(
    `COUNTROWS(FILTER(${EFF},\n    VAR _type = RELATED(${CTR}[type_contrat])\n    VAR _fin = ${EFF}[date_fin_contrat_sk]\n    RETURN (_type = "CDI" && NOT ISBLANK(_fin))\n        || (_type = "CDI" && RELATED(${CTR}[statut_emploi]) = "Vacataire")\n        || (RELATED(${CTR}[est_contrat_court]) && ISBLANK(_fin))\n        || (NOT ISBLANK(_fin) && _fin < 20230101)))`) },
  { f: 'OM6 Échéances', n: "Taux d'anomalies contractuelles", fmt: PCT, e: `DIVIDE([Employés avec anomalie de contrat], [Effectif])`,
    d: 'CDI datés, vacataires en CDI, contrats courts sans fin, contrats échus avant 2023. Cible : 0' },
  { f: 'OM6 Échéances', n: 'Couleur anomalies', e: `IF([Employés avec anomalie de contrat] = 0, "#44C088", "#ED7373")` },
];

function echeance(jours) {
  return snap(`COUNTROWS(FILTER(${EFF},\n    VAR _fin = ${EFF}[date_fin_contrat_sk]\n    VAR _ref = [Date de référence]\n    RETURN NOT ISBLANK(_fin)\n        && ${skToDate('_fin')} >= _ref\n        && ${skToDate('_fin')} < _ref + ${jours}))`);
}
