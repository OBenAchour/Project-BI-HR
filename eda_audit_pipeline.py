#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
eda_audit_pipeline.py
=====================
Audit qualité des 7 fichiers RH, en lecture seule, avant le chargement SSIS / DW.

- Aucun fichier source n'est modifié.
- Chaque fichier est lu avec son format réel (pas de détection automatique ambiguë) :
    emp_data.xlsx / administration_data.xlsx     dates ISO (AAAA-MM-JJ)
    attendance_dataset_2023.csv                  date M/J/AAAA, heures H:MM:SS
    Administration_attendance.xlsx               date AAAA-MM-JJ, heures HH:MM
- Les contrôles portent sur trois niveaux :
    1. cohérence entre fichiers (mêmes notions décrites différemment) ;
    2. qualité intrinsèque (vides, doublons, clés, références) ;
    3. règles métier (contrats, ancienneté, congés, pointages, capacités, catalogue).
- Le rapport HTML est autonome (CSS et graphiques intégrés).

Usage : python eda_audit_pipeline.py [--input-dir DataSet] [--output eda_audit_report.html]
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

import matplotlib
import pandas as pd

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Date de référence des contrôles : début de la période de pointage observée.
REF_DATE = pd.Timestamp("2023-01-01")
# Fêtes nationales tunisiennes à date fixe comprises dans la période de pointage (janv.-juin 2023).
FIXED_HOLIDAYS_2023 = {
    pd.Timestamp("2023-03-20"): "Fête de l'Indépendance",
    pd.Timestamp("2023-04-09"): "Journée des Martyrs",
    pd.Timestamp("2023-05-01"): "Fête du Travail",
}
SEVERITY_ORDER = {"Critique": 0, "Avertissement": 1, "Info": 2}


# ----------------------------------------------------------------------------- chargement

def load_sources(root: Path) -> dict:
    """Charge les 7 sources en conservant les valeurs brutes."""
    def need(name):
        path = root / name
        if not path.exists():
            sys.exit(f"ERREUR : fichier introuvable : {path}")
        return path

    src = {
        "emp": pd.read_excel(need("emp_data.xlsx"), dtype=str),
        "adm": pd.read_excel(need("administration_data.xlsx"), dtype=str),
        "att_tech": pd.read_csv(need("attendance_dataset_2023.csv"), dtype=str, keep_default_na=False),
        "att_adm": pd.read_excel(need("Administration_attendance.xlsx"), dtype=str),
        "courses": pd.read_csv(need("Coursera_trainings.csv"), dtype=str, keep_default_na=False),
        "dep": pd.read_excel(need("departments.ods"), engine="odf", dtype=str),
        "params_raw": need("extrainfos.txt").read_text(encoding="utf-8"),
        "courses_raw": need("Coursera_trainings.csv").read_bytes(),
    }
    return src


def num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def iso_date(s: pd.Series) -> pd.Series:
    """Dates des fiches : texte ISO (admin) ou date Excel exportée en 'AAAA-MM-JJ hh:mm:ss' (tech)."""
    return pd.to_datetime(s.str.slice(0, 10), format="%Y-%m-%d", errors="coerce")


def minutes(s: pd.Series, fmt: str) -> pd.Series:
    t = pd.to_datetime(s.str.strip(), format=fmt, errors="coerce")
    return t.dt.hour * 60 + t.dt.minute


def prepare(src: dict) -> dict:
    """Ajoute des colonnes typées (préfixe _) sur des copies, sans toucher aux sources."""
    emp, adm = src["emp"].copy(), src["adm"].copy()
    for df in (emp, adm):
        for c in ["STARTING_DATE", "CONTRACT_START", "CONTRACT_END"]:
            df["_" + c] = iso_date(df[c])
        for c in ["SALARY", "EXP_YEARS", "LEAVE_CONSUMED", "LEAVE_BALANCE", "TENURE"]:
            df["_" + c] = num(df[c])
    emp["_HOURS"] = num(emp["HOURS"])
    adm["_extra_hour"] = num(adm["extra_hour"])
    emp["_ID"], adm["_ID"] = emp["CODE"], adm["ID_Employee"]
    adm_rows = adm[adm["_ID"].notna()]  # la ligne entièrement vide est signalée à part

    att = []
    for key, date_fmt, time_fmt, label in [("att_tech", "%m/%d/%Y", "%H:%M:%S", "Technique"),
                                           ("att_adm", "%Y-%m-%d", "%H:%M", "Admin")]:
        df = src[key].copy()
        df["_date"] = pd.to_datetime(df["Date"].str.strip(), format=date_fmt, errors="coerce")
        for c in ["StartTime", "BreakTime", "ResumeTime", "EndTime"]:
            df["_" + c] = minutes(df[c], time_fmt)
        df["_pause"] = df["_ResumeTime"] - df["_BreakTime"]
        df["_worked_h"] = (df["_EndTime"] - df["_StartTime"] - df["_pause"]) / 60
        df["_source"] = label
        src[key + "_p"] = df
        att.append(df)
    src.update(emp_p=emp, adm_p=adm_rows, adm_all=adm)
    return src


# ----------------------------------------------------------------------------- anomalies

class Audit:
    def __init__(self):
        self.items, self.passed = [], []

    def add(self, theme, fichier, colonnes, titre, n, severite, constat, impact, action, exemples=None):
        if n == 0:
            self.passed.append(f"{fichier} — {titre}")
            return
        ex = exemples if exemples is not None else pd.DataFrame()
        self.items.append(dict(theme=theme, fichier=fichier, colonnes=colonnes, titre=titre, n=int(n),
                               severite=severite, constat=constat, impact=impact, action=action,
                               exemples=ex.head(15)))

    def ok(self, label):
        self.passed.append(label)


def sample(df: pd.DataFrame, mask, cols) -> pd.DataFrame:
    return df.loc[mask, cols]


# 1. Cohérence entre emp_data et administration_data ----------------------------------------

def check_cross_file(a: Audit, s: dict):
    emp, adm = s["emp_p"], s["adm_p"]
    T = "1. Cohérence entre fichiers"

    a.add(T, "emp_data + administration_data", "CODE / ID_Employee, ADRESS / ADDRESS, LEAVE_TYPE / LAST_LEAVE_TYPE, GRADE / Grade",
          "Mêmes informations sous des noms de colonnes différents", 4, "Avertissement",
          "La clé employé s'appelle CODE d'un côté et ID_Employee de l'autre ; l'adresse ADRESS / ADDRESS ; "
          "le congé LEAVE_TYPE / LAST_LEAVE_TYPE ; le grade GRADE / Grade.",
          "Une union des deux fichiers sans mapping explicite perd ou décale des colonnes.",
          "Définir un schéma cible unique (employe_bk, adresse, type_conge, …) et mapper chaque source vers lui.",
          pd.DataFrame({"emp_data": ["CODE", "ADRESS", "LEAVE_TYPE", "GRADE"],
                        "administration_data": ["ID_Employee", "ADDRESS", "LAST_LEAVE_TYPE", "Grade"]}))

    pos_emp, pos_adm = emp["POSITION"].value_counts().to_dict(), adm["POSITION"].value_counts().to_dict()
    a.add(T, "emp_data + administration_data", "POSITION", "POSITION n'a pas le même sens dans les deux fichiers",
          len(adm), "Critique",
          f"emp_data : statut d'emploi {pos_emp}. administration_data : {pos_adm}, c'est-à-dire la population, pas un statut. "
          "Le type de contrat (TYPE_CONTRACT = CDD / CDI / CIVP) est, lui, identique dans les deux fichiers.",
          "Un axe « statut » mélangerait Permanent, Vacataire et Administration : impossible de comparer permanents et vacataires "
          "entre populations, et les administratifs (tous salariés) n'ont pas de statut.",
          "Séparer deux attributs : population (Technique / Administratif) et statut d'emploi (Permanent / Vacataire). "
          "Statut des administratifs à faire valider (ils ont tous un salaire, donc a priori Permanent).",
          pd.DataFrame({"fichier": ["emp_data"] * len(pos_emp) + ["administration_data"] * len(pos_adm),
                        "POSITION": list(pos_emp) + list(pos_adm),
                        "lignes": list(pos_emp.values()) + list(pos_adm.values())}))

    d_emp, d_adm = emp["TYPE_DIPLOMA"].value_counts().to_dict(), adm["TYPE_DIPLOMA"].value_counts().to_dict()
    a.add(T, "emp_data + administration_data", "TYPE_DIPLOMA", "Référentiel de diplômes différent (et faute de frappe)",
          int(emp["TYPE_DIPLOMA"].eq("Ingeneering").sum() + adm["TYPE_DIPLOMA"].eq("Engineer").sum()), "Avertissement",
          f"emp_data : {d_emp}. administration_data : {d_adm}. « Ingeneering » (faute) et « Engineer » désignent le même diplôme ; "
          "Doctoral n'existe que côté technique, Licence que côté administratif.",
          "Deux libellés pour un même diplôme faussent toute répartition par diplôme.",
          "Table de correspondance : Ingeneering, Engineer → Ingénieur ; Doctoral → Doctorat ; Licence ; Master.")

    a.add(T, "emp_data + administration_data", "GRADE / Grade", "GRADE ne désigne pas la même chose",
          emp["GRADE"].nunique() + adm["Grade"].nunique(), "Avertissement",
          f"emp_data.GRADE contient {emp['GRADE'].nunique()} intitulés de métier libres (ex. « {emp['GRADE'].dropna().iloc[1]} », "
          f"« {emp['GRADE'].dropna().iloc[6]} »). administration_data.Grade contient 5 fonctions : {sorted(adm['Grade'].unique())}. "
          "RANK (1 à 10) n'existe que côté technique.",
          "Une même colonne « grade » mélangerait métiers et fonctions administratives.",
          "Deux attributs distincts : intitulé de métier (technique) et fonction administrative ; rang technique à part.")

    for col_emp, col_adm, label in [("LEAVE_TYPE", "LAST_LEAVE_TYPE", "Types de congé"),
                                    ("SOURCE_of_employment", "SOURCE_of_employment", "Canaux de recrutement"),
                                    ("LANGUAGE", "LANGUAGE", "Langues")]:
        ve = sorted({t.strip() for v in emp[col_emp].dropna() for t in v.split(",")})
        va = sorted({t.strip() for v in adm[col_adm].dropna() for t in v.split(",")})
        a.add(T, "emp_data + administration_data", f"{col_emp} / {col_adm}", f"{label} : libellés écrits différemment",
              len(set(ve) ^ set(va)), "Avertissement",
              f"emp_data : {ve}. administration_data : {va}.",
              "Sans normalisation, une même catégorie apparaît deux fois (ex. « sick » et « Sick »).",
              "Normaliser : minuscules, espaces remplacés par « _ » ; « ex-vacataire » n'existe que côté technique.")

    a.add(T, "emp_data + administration_data", "LEAVE_CONSUMED, LEAVE_BALANCE", "Congés : jours décimaux d'un côté, entiers de l'autre",
          int((emp["_LEAVE_CONSUMED"] % 1 != 0).sum()), "Info",
          f"emp_data : valeurs décimales (ex. {emp['LEAVE_CONSUMED'].iloc[0]}). administration_data : entiers (ex. {adm['LEAVE_CONSUMED'].iloc[0]}).",
          "Les jours de congé techniques ne sont pas arrondis : unité ou précision différente selon la source.",
          "Arrondir à 0,5 jour au chargement, ou confirmer l'unité auprès de la source.")


# 2. Qualité intrinsèque --------------------------------------------------------------------

def check_quality(a: Audit, s: dict):
    emp, adm_all = s["emp_p"], s["adm_all"]
    T = "2. Qualité des données"

    empty_adm = adm_all.drop(columns=[c for c in adm_all if c.startswith("_")]).isna().all(axis=1)
    a.add(T, "administration_data", "toutes", "Ligne entièrement vide", int(empty_adm.sum()), "Avertissement",
          "Une ligne ne contient aucune valeur.", "Elle crée un employé vide si elle est chargée.",
          "Filtrer les lignes sans identifiant.")

    structural = {"SALARY": "vide pour les vacataires (payés à l'heure)", "HOURS": "vide pour les permanents (salariés)",
                  "CONTRACT_END": "vide = contrat sans date de fin", "ADRESSE_MISSION": "vide = pas de mission"}
    rows = []
    for name, df in [("emp_data", emp), ("administration_data", s["adm_p"])]:
        for c, v in df.drop(columns=[c for c in df if c.startswith("_")]).isna().sum().items():
            if v:
                rows.append({"fichier": name, "colonne": c, "vides": int(v), "nature": structural.get(c, "vide réel")})
    miss = pd.DataFrame(rows)
    real = miss[miss["nature"] == "vide réel"]
    a.add(T, "emp_data", ", ".join(real["colonne"]), "Valeurs réellement manquantes", int(real["vides"].sum()), "Avertissement",
          "Valeurs absentes sans explication métier (les vides attendus, comme SALARY des vacataires, sont exclus du total).",
          "Lignes incomplètes : écartées au chargement du DW ou KPI faussés (ex. 4 employés sans département).",
          "Remonter les cas à la source ; au chargement, écarter les lignes dont une valeur obligatoire manque.", miss)

    for name, df, key in [("emp_data", emp, "CODE"), ("administration_data", s["adm_p"], "ID_Employee")]:
        a.add(T, name, key, "Identifiant employé en double", int(df[key].duplicated().sum()), "Critique",
              "Plusieurs lignes ont le même identifiant.", "Clé métier non unique.", "Dédoublonner à la source.")
        a.add(T, name, "REGISTRATION_NUMBER", "Matricule en double", int(df["REGISTRATION_NUMBER"].dropna().duplicated().sum()),
              "Avertissement", "Matricule partagé.", "Matricule non fiable.", "Vérifier à la source.")
        dup = df["EMAIL"].notna() & df["EMAIL"].duplicated(keep=False)
        a.add(T, name, "EMAIL", "E-mail partagé par plusieurs employés", int(dup.sum()), "Info",
              f"{int(dup.sum())} lignes partagent un e-mail avec un autre employé (identifiants différents).",
              "L'e-mail ne peut pas servir de clé.", "Utiliser l'identifiant comme seule clé.",
              sample(df, dup, [key, "NAME_EMP", "EMAIL"]).sort_values("EMAIL"))

    common = set(emp["CODE"]) & set(s["adm_p"]["ID_Employee"])
    a.add(T, "emp_data + administration_data", "CODE / ID_Employee", "Employé présent dans les deux fichiers", len(common),
          "Critique", "Un même identifiant dans les deux populations.", "Double comptage.", "Arbitrer la population.")

    for key, label, fmt in [("att_tech_p", "attendance_dataset_2023.csv", "%H:%M:%S"),
                            ("att_adm_p", "Administration_attendance.xlsx", "%H:%M")]:
        df = s[key]
        bad_date = df["_date"].isna()
        a.add(T, label, "Date", "Date de pointage illisible", int(bad_date.sum()), "Avertissement",
              f"Format attendu : {'M/J/AAAA' if 'tech' in key else 'AAAA-MM-JJ'}.", "Ligne non rattachable à un jour.",
              "Rejeter la ligne ou la corriger à la source.", sample(df, bad_date, ["ID_Employee", "Date"]))
        bad_t = df[["_StartTime", "_BreakTime", "_ResumeTime", "_EndTime"]].isna().any(axis=1) & ~bad_date
        a.add(T, label, "StartTime, BreakTime, ResumeTime, EndTime", "Heure manquante ou illisible", int(bad_t.sum()),
              "Avertissement", f"Au moins une des 4 heures est vide ou hors format {fmt}.",
              "Durée travaillée incalculable pour ces journées.", "Indicateur « heure illisible » ; mesures à NULL.",
              sample(df, bad_t, ["ID_Employee", "Date", "StartTime", "BreakTime", "ResumeTime", "EndTime"]))
        a.add(T, label, "ID_Employee + Date", "Pointage en double le même jour",
              int(df.duplicated(["ID_Employee", "_date"]).sum()), "Critique", "Deux pointages pour un même jour.",
              "Heures comptées deux fois.", "Dédoublonner.")

    att_adm = s["att_adm_p"]
    orphan = ~att_adm["ID_Employee"].isin(s["adm_p"]["ID_Employee"])
    a.add(T, "Administration_attendance.xlsx", "ID_Employee", "Pointages d'un employé absent des fiches",
          int(orphan.sum()), "Critique",
          f"{att_adm.loc[orphan, 'ID_Employee'].nunique()} identifiant(s) pointe(nt) sans fiche dans administration_data : "
          f"{sorted(att_adm.loc[orphan, 'ID_Employee'].unique())}.",
          "Ces heures ne sont rattachées à aucun employé ni département connu.", "Écarter ces pointages au chargement du DW et signaler l'employé à la source.")
    orphan_t = ~s["att_tech_p"]["ID_Employee"].isin(emp["CODE"])
    a.add(T, "attendance_dataset_2023.csv", "ID_Employee", "Pointages d'un employé absent des fiches", int(orphan_t.sum()),
          "Critique", "Identifiant sans fiche.", "Heures non rattachées.", "Signaler à la source.")
    no_att = ~emp["CODE"].isin(s["att_tech_p"]["ID_Employee"])
    a.add(T, "emp_data", "CODE", "Employé technique sans aucun pointage", int(no_att.sum()), "Info",
          "Employé présent dans les fiches mais absent des pointages.", "Assiduité non mesurable pour lui.",
          "Vérifier s'il est sorti ou en absence longue.", sample(emp, no_att, ["CODE", "NAME_EMP", "POSITION", "TYPE_CONTRACT"]))

    deps = set(s["dep"]["ID_DEP"])
    for name, df in [("emp_data", emp), ("administration_data", s["adm_p"])]:
        bad = df["DEP_ID"].notna() & ~df["DEP_ID"].isin(deps)
        a.add(T, name, "DEP_ID", "Département inexistant dans departments.ods", int(bad.sum()), "Critique",
              "Code département absent du référentiel.", "Employé non rattachable.", "Corriger le code.")


# 3. Règles métier ---------------------------------------------------------------------------

def check_contracts(a: Audit, s: dict):
    T = "3. Règles métier : contrats et carrière"
    emp, adm = s["emp_p"], s["adm_p"]
    both = pd.concat([emp.assign(_file="emp_data"), adm.assign(_file="administration_data")], ignore_index=True)
    cols = ["_file", "_ID", "TYPE_CONTRACT", "POSITION", "CONTRACT_START", "CONTRACT_END"]

    m = both["TYPE_CONTRACT"].isna()
    a.add(T, "emp_data", "TYPE_CONTRACT", "Type de contrat manquant", int(m.sum()), "Avertissement",
          "Employés sans type de contrat.", "Exclus des KPI par type de contrat.", "Compléter à la source.", sample(both, m, cols))

    m = both["TYPE_CONTRACT"].eq("CDI") & both["_CONTRACT_END"].notna()
    a.add(T, "emp_data + administration_data", "TYPE_CONTRACT / CONTRACT_END", "CDI avec une date de fin", int(m.sum()), "Critique",
          f"{int(m.sum())} CDI portent une date de fin (emp_data {int(m[both._file == 'emp_data'].sum())}, "
          f"administration_data {int(m[both._file == 'administration_data'].sum())}). Un CDI n'a pas de terme.",
          "Échéances de contrat faussées ; risque de compter des départs inexistants.",
          "Indicateur d'anomalie ; correction à la source (soit le type, soit la date est fausse).", sample(both, m, cols))

    m = both["TYPE_CONTRACT"].isin(["CDD", "CIVP"]) & both["_CONTRACT_END"].isna()
    a.add(T, "emp_data + administration_data", "TYPE_CONTRACT / CONTRACT_END", "CDD ou CIVP sans date de fin", int(m.sum()),
          "Critique", f"{int(m.sum())} contrats à durée déterminée n'ont pas de date de fin.",
          "Impossible d'anticiper ces échéances (OM6).", "Compléter la date de fin à la source.", sample(both, m, cols))

    m = emp["POSITION"].eq("Vacataire") & emp["TYPE_CONTRACT"].eq("CDI")
    a.add(T, "emp_data", "POSITION / TYPE_CONTRACT", "Vacataire déclaré en CDI", int(m.sum()), "Critique",
          "Un vacataire (payé à l'heure, sans salaire) est déclaré en CDI.", "Statut et contrat contradictoires.",
          "Faire valider la règle par les RH ; indicateur d'anomalie en attendant.",
          sample(emp, m, ["CODE", "POSITION", "TYPE_CONTRACT", "HOURS", "SALARY"]))

    m = emp["POSITION"].eq("Vacataire") & (emp["_SALARY"].notna() | emp["_HOURS"].isna())
    m |= emp["POSITION"].eq("Permanent") & (emp["_HOURS"].notna() | emp["_SALARY"].isna())
    a.add(T, "emp_data", "POSITION / SALARY / HOURS", "Rémunération incohérente avec le statut", int(m.sum()), "Critique",
          "Vacataire avec salaire ou sans heures, permanent avec heures ou sans salaire.", "Coût faux.", "Corriger à la source.")

    for name, df in [("emp_data", emp), ("administration_data", adm)]:
        m = df["_CONTRACT_END"] < df["_CONTRACT_START"]
        a.add(T, name, "CONTRACT_START / CONTRACT_END", "Contrat qui finit avant de commencer", int(m.sum()), "Critique",
              "Date de fin antérieure au début.", "Durée négative.", "Corriger les dates.")
        m = df["_CONTRACT_START"] < df["_STARTING_DATE"]
        a.add(T, name, "STARTING_DATE / CONTRACT_START", "Contrat commencé avant l'entrée dans l'entreprise", int(m.sum()),
              "Avertissement", "Début de contrat antérieur à la date d'entrée.", "Chronologie incohérente.", "Corriger les dates.")

    seniority = (REF_DATE - both["_STARTING_DATE"]).dt.days / 365.25
    m = both["_EXP_YEARS"] < (seniority - 1)
    a.add(T, "emp_data + administration_data", "EXP_YEARS / STARTING_DATE", "Expérience inférieure à l'ancienneté", int(m.sum()),
          "Avertissement",
          f"{int(m.sum())} employés ont moins d'années d'expérience que d'années passées dans l'entreprise au 01/01/2023 "
          "(tolérance d'un an).",
          "EXP_YEARS n'est pas l'expérience totale, ou les dates d'entrée sont fausses : la variable n'est pas exploitable telle quelle.",
          "Faire préciser la définition d'EXP_YEARS ; utiliser STARTING_DATE pour l'ancienneté.",
          both.loc[m, ["_file", "_ID", "STARTING_DATE", "EXP_YEARS"]].assign(anciennete=seniority[m].round(1)))

    by_tenure = both.groupby("TENURE")["_STARTING_DATE"].apply(lambda d: round(((REF_DATE - d).dt.days / 365.25).mean(), 1)).to_dict()
    a.add(T, "emp_data + administration_data", "TENURE", "Signification de TENURE inconnue", int(both["TENURE"].notna().sum()), "Info",
          f"TENURE vaut 0 ou 1 ; l'ancienneté moyenne est quasi identique dans les deux groupes {by_tenure}. "
          "Ce n'est donc ni « moins d'un an d'ancienneté » ni une ancienneté calculée.",
          "Toute interprétation (titularisation, ancienneté) est une hypothèse non démontrée.",
          "Faire confirmer le sens de TENURE ; ne pas l'utiliser comme mesure d'ancienneté.")

    total = both["_LEAVE_CONSUMED"] + both["_LEAVE_BALANCE"]
    a.add(T, "emp_data + administration_data", "LEAVE_CONSUMED + LEAVE_BALANCE", "Droits à congé non constants",
          int(total.notna().sum()), "Info",
          f"Consommé + solde varie de {total.min():.1f} à {total.max():.1f} jours (moyenne {total.mean():.1f}).",
          "Le taux de consommation « sur 30 jours » est une hypothèse.", "Obtenir le droit annuel de chaque employé.")


def check_attendance(a: Audit, s: dict):
    T = "4. Règles métier : pointages"
    contracts = pd.concat([s["emp_p"][["_ID", "_CONTRACT_END", "_STARTING_DATE"]],
                           s["adm_p"][["_ID", "_CONTRACT_END", "_STARTING_DATE"]]])
    for key, label in [("att_tech_p", "attendance_dataset_2023.csv"), ("att_adm_p", "Administration_attendance.xlsx")]:
        df = s[key]
        cols = ["ID_Employee", "Date", "StartTime", "BreakTime", "ResumeTime", "EndTime"]
        m = df["_EndTime"] < df["_ResumeTime"]
        a.add(T, label, "ResumeTime / EndTime", "Fin de journée avant la reprise de l'après-midi", int(m.sum()), "Critique",
              "EndTime est antérieur à ResumeTime.", "Durée de l'après-midi négative.", "Indicateur d'anomalie.",
              sample(df, m, cols))
        m = (df["_BreakTime"] < df["_StartTime"]) | (df["_ResumeTime"] < df["_BreakTime"])
        a.add(T, label, "StartTime / BreakTime / ResumeTime", "Heures du matin dans le désordre", int(m.sum()), "Critique",
              "Pause avant l'arrivée ou reprise avant la pause.", "Durée faussée.", "Indicateur d'anomalie.")
        m = df["_worked_h"] < 0
        a.add(T, label, "durée calculée", "Durée travaillée négative", int(m.sum()), "Critique",
              "(fin − début) − pause < 0.", "Heures négatives dans les totaux.", "Exclure des mesures ; indicateur.",
              sample(df, m, cols).assign(heures=df.loc[m, "_worked_h"].round(2)))
        m = df["_pause"] > 180
        a.add(T, label, "BreakTime / ResumeTime", "Pause de plus de 3 heures", int(m.sum()), "Avertissement",
              f"{int(m.sum())} journées ({m.mean():.1%}) ont une pause de plus de 3 h (max {df['_pause'].max() / 60:.1f} h).",
              "Pause irréaliste : les heures de pause ou de reprise ne sont pas fiables.",
              "Indicateur d'anomalie ; seuil à valider par les RH.", sample(df, m, cols))
        m = df["_worked_h"].between(0, 1, inclusive="left")
        a.add(T, label, "durée calculée", "Journée de moins d'une heure", int(m.sum()), "Avertissement",
              "Moins d'une heure travaillée.", "Journées quasi vides.", "Indicateur d'anomalie.")
        m = df["_worked_h"] > 10
        a.add(T, label, "durée calculée", "Journée de plus de 10 heures", int(m.sum()), "Avertissement",
              f"Plus de 10 h travaillées (max {df['_worked_h'].max():.1f} h).", "Charge excessive ou erreur de saisie.",
              "Vérifier ; indicateur.")
        m = df["_date"].dt.dayofweek >= 5
        a.add(T, label, "Date", "Pointage le week-end", int(m.sum()), "Info", "Pointage un samedi ou un dimanche.", "—", "—")
        hol = df["_date"].isin(FIXED_HOLIDAYS_2023)
        detail = df.loc[hol, "_date"].map(FIXED_HOLIDAYS_2023).value_counts().to_dict()
        a.add(T, label, "Date", "Pointage un jour férié", int(hol.sum()), "Avertissement",
              f"Pointages lors de fêtes nationales tunisiennes à date fixe : {detail}.",
              "Soit le calendrier n'est pas tunisien, soit les données sont générées sans calendrier.",
              "Confirmer le calendrier de référence.")

        mg = df[["ID_Employee", "_date"]].merge(contracts, left_on="ID_Employee", right_on="_ID", how="left")
        m = (mg["_date"] > mg["_CONTRACT_END"]).to_numpy()
        a.add(T, label, "Date / CONTRACT_END", "Pointage après la fin du contrat", int(m.sum()), "Critique",
              f"{int(m.sum())} pointages de {mg.loc[m, 'ID_Employee'].nunique()} employés sont postérieurs à leur date de fin de contrat.",
              "Soit les dates de fin sont fausses, soit des personnes sorties pointent encore.",
              "Indicateur « pointage hors contrat » ; arbitrage RH sur les dates de fin.",
              mg.loc[m, ["ID_Employee", "_date", "_CONTRACT_END"]].rename(columns={"_date": "Date", "_CONTRACT_END": "fin_contrat"}))
        m = (mg["_date"] < mg["_STARTING_DATE"]).to_numpy()
        a.add(T, label, "Date / STARTING_DATE", "Pointage avant l'entrée dans l'entreprise", int(m.sum()), "Critique",
              "Pointage antérieur à la date d'entrée.", "Chronologie impossible.", "Corriger.")

    tech, adm = s["att_tech_p"], s["att_adm_p"]
    a.add(T, "attendance_dataset_2023.csv + Administration_attendance.xlsx", "Date", "Périodes de pointage différentes", 1, "Info",
          f"Techniques : {tech['_date'].min():%d/%m/%Y} au {tech['_date'].max():%d/%m/%Y}. "
          f"Administratifs : {adm['_date'].min():%d/%m/%Y} au {adm['_date'].max():%d/%m/%Y}.",
          "Toute comparaison entre populations sur des cumuls est biaisée.", "Comparer sur janvier-mars ou sur des moyennes journalières.")
    a.add(T, "attendance_dataset_2023.csv + Administration_attendance.xlsx", "Date, heures", "Formats de date et d'heure différents", 1, "Info",
          f"Techniques : « {tech['Date'].iloc[0]} » et « {tech['StartTime'].iloc[0]} ». Administratifs : « {adm['Date'].iloc[0]} » et « {adm['StartTime'].iloc[0]} ».",
          "Un parseur unique « automatique » inverse jour et mois (1/2/2023 lu comme le 1er février).",
          "Format explicite par fichier : M/J/AAAA + H:MM:SS d'un côté, AAAA-MM-JJ + HH:MM de l'autre.")


def check_departments_courses(a: Audit, s: dict):
    T = "5. Référentiels : départements, catalogue, taux"
    dep = s["dep"].copy()
    dep["_cap"] = num(dep["CAPACITY"])
    hc = pd.concat([s["emp_p"]["DEP_ID"], s["adm_p"]["DEP_ID"]]).value_counts()
    dep["effectif"] = dep["ID_DEP"].map(hc).fillna(0).astype(int)
    dep["occupation"] = (dep["effectif"] / dep["_cap"] * 100).round(0).astype(int).astype(str) + " %"
    over = dep["effectif"] > dep["_cap"]
    a.add(T, "departments.ods", "CAPACITY", "Effectif supérieur à la capacité", int(over.sum()), "Avertissement",
          "Départements dont l'effectif dépasse la capacité déclarée.",
          "Le taux d'occupation (OM1) dépasse 100 % ; la capacité de l'Administration semble obsolète.",
          "Faire valider les capacités.", dep[["ID_DEP", "DEP", "CAPACITY", "effectif", "occupation"]])

    c, raw = s["courses"], s["courses_raw"]
    fffd = raw.count(b"\xef\xbf\xbd")
    a.add(T, "Coursera_trainings.csv", "Course Name, Course Description, Skills", "Caractères perdus (�) dans le fichier source",
          fffd, "Avertissement",
          f"Le fichier contient {fffd} caractères de remplacement « � » (octets EF BF BD), surtout à la place des apostrophes (« You�ll »).",
          "Le caractère d'origine est perdu avant même le chargement ; le texte affiché est altéré.",
          "Remplacer « � » par « ' » au chargement (hypothèse), ou récupérer un export propre.",
          c.loc[c["Course Name"].str.contains("�") | c["Course Description"].str.contains("�"), ["course_id", "Course Name"]])
    empty = c.drop(columns=["id_course"]).eq("").all(axis=1)
    a.add(T, "Coursera_trainings.csv", "toutes", "Lignes entièrement vides", int(empty.sum()), "Avertissement",
          "Lignes sans aucune valeur.", "Cours vides si chargées.", "Filtrer les lignes sans course_id.")
    a.add(T, "Coursera_trainings.csv", "id_course", "Colonne id_course toujours vide", int(c["id_course"].eq("").sum()), "Info",
          "id_course n'est jamais renseignée ; la vraie clé est course_id.",
          "Un contrôle qui utilise id_course déclare toutes les formations orphelines.", "Utiliser course_id ; ignorer id_course.")
    real = c[~empty]
    dup = real["Course Name"].duplicated(keep=False)
    a.add(T, "Coursera_trainings.csv", "Course Name", "Même cours sous plusieurs course_id", int(dup.sum()), "Avertissement",
          f"{int(dup.sum())} lignes partagent un intitulé avec un autre course_id ({real.loc[dup, 'Course Name'].nunique()} intitulés).",
          "Les inscriptions à un même cours sont dispersées ; le « cours le plus suivi » est sous-estimé.",
          "Regrouper par intitulé + université pour les analyses de popularité.",
          real.loc[dup, ["course_id", "Course Name", "University"]].sort_values("Course Name"))
    lvl = real["Difficulty Level"].value_counts().to_dict()
    odd = ~real["Difficulty Level"].isin(["Beginner", "Intermediate", "Advanced"])
    a.add(T, "Coursera_trainings.csv", "Difficulty Level", "Niveaux de difficulté hors échelle", int(odd.sum()), "Info",
          f"Répartition : {lvl}. « Conversant » et « Not Calibrated » sortent de l'échelle Beginner / Intermediate / Advanced.",
          "Les répartitions par niveau doivent les traiter à part.", "Les garder comme catégories distinctes, documentées.")
    nr = real["Course Rating"].ne("") & num(real["Course Rating"]).isna()
    a.add(T, "Coursera_trainings.csv", "Course Rating", "Note non numérique", int(nr.sum()), "Info",
          f"Valeurs : {real.loc[nr, 'Course Rating'].value_counts().to_dict()}.", "Note inutilisable.", "Mettre à NULL.")

    known = set(real["course_id"])
    ids = [(r.CODE, str(x)) for r in s["emp_p"][["CODE", "ID_TRAINING"]].dropna().itertuples() for x in json.loads(r.ID_TRAINING)]
    unknown = [(e, x) for e, x in ids if x not in known]
    a.add(T, "emp_data → Coursera_trainings.csv", "ID_TRAINING → course_id", "Inscription à un cours absent du catalogue",
          len(unknown), "Avertissement",
          f"{len(unknown)} inscriptions sur {len(ids)} visent un identifiant absent : {sorted({x for _, x in unknown})}.",
          "Inscriptions non rattachables à un cours.", "Écarter ces inscriptions au chargement du DW.",
          pd.DataFrame(unknown, columns=["CODE", "course_id"]))

    p = s["params_raw"]
    rates = re.findall(r'"([^"]+)"\s*:\s*([0-9]+(?:[.,][0-9]+)?)', p)
    a.add(T, "extrainfos.txt", "texte", "Fichier de paramètres non structuré", 1, "Info",
          f"Taux lus : {dict(rates)}. Format libre (espaces irréguliers, « permenant » mal orthographié, ligne vide finale).",
          "Lecture fragile : un changement de mise en forme casse l'extraction.",
          "Transformer en table clé / valeur (code_taux, valeur) ; corriger « permenant ».")


# ----------------------------------------------------------------------------- graphiques

def png(fig) -> str:
    buf = io.BytesIO()
    fig.tight_layout()
    fig.savefig(buf, format="png", dpi=110)
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def charts(s: dict) -> list:
    out = []
    fig, ax = plt.subplots(figsize=(7, 3.2))
    for key, label in [("att_tech_p", "Techniques"), ("att_adm_p", "Administratifs")]:
        ax.hist(s[key]["_worked_h"].dropna(), bins=40, alpha=0.6, label=label)
    ax.set_xlabel("Heures travaillées par jour"); ax.set_ylabel("Journées"); ax.legend()
    ax.set_title("Les pointages administratifs sont beaucoup plus dispersés")
    out.append(("Heures travaillées par jour", png(fig)))

    dep = s["dep"].copy()
    hc = pd.concat([s["emp_p"]["DEP_ID"], s["adm_p"]["DEP_ID"]]).value_counts()
    dep["effectif"] = dep["ID_DEP"].map(hc).fillna(0)
    fig, ax = plt.subplots(figsize=(7, 3.2))
    x = range(len(dep))
    ax.bar([i - 0.2 for i in x], num(dep["CAPACITY"]), width=0.4, label="Capacité")
    ax.bar([i + 0.2 for i in x], dep["effectif"], width=0.4, label="Effectif")
    ax.set_xticks(list(x)); ax.set_xticklabels(dep["DEP"]); ax.legend()
    ax.set_title("Télécom et Administration dépassent leur capacité")
    out.append(("Effectif et capacité par département", png(fig)))

    fig, ax = plt.subplots(figsize=(7, 3.2))
    ax.boxplot([s["emp_p"]["_SALARY"].dropna(), s["adm_p"]["_SALARY"].dropna()], orientation="horizontal",
               tick_labels=["Permanents techniques", "Administratifs"])
    ax.set_xlabel("Salaire mensuel"); ax.set_title("Salaires : même ordre de grandeur, dispersion plus forte côté administratif")
    out.append(("Salaires", png(fig)))
    return out


# ----------------------------------------------------------------------------- rapport HTML

def fmt(n) -> str:
    return f"{n:,}".replace(",", " ")


def esc(v) -> str:
    return (str(v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;"))


def render(a: Audit, s: dict, figs: list, out: Path):
    items = sorted(a.items, key=lambda x: (x["theme"], SEVERITY_ORDER[x["severite"]], -x["n"]))
    counts = Counter(x["severite"] for x in items)
    sources = [("emp_data.xlsx", s["emp"]), ("administration_data.xlsx", s["adm"]),
               ("attendance_dataset_2023.csv", s["att_tech"]), ("Administration_attendance.xlsx", s["att_adm"]),
               ("Coursera_trainings.csv", s["courses"]), ("departments.ods", s["dep"])]
    src_rows = "".join(f"<tr><td>{n}</td><td>{fmt(len(d))}</td><td>{len(d.columns)}</td></tr>" for n, d in sources)
    src_rows += f"<tr><td>extrainfos.txt</td><td>{len(s['params_raw'].strip().splitlines())} lignes de texte</td><td>—</td></tr>"

    summary = "".join(
        f"<tr><td>{esc(x['theme'])}</td><td><a href='#a{i}'>{esc(x['titre'])}</a></td><td>{esc(x['fichier'])}</td>"
        f"<td class='n'>{fmt(x['n'])}</td><td><span class='b {x['severite'][:4]}'>{x['severite']}</span></td></tr>"
        for i, x in enumerate(items))
    cards = []
    for i, x in enumerate(items):
        ex = x["exemples"]
        ex_html = (f"<details><summary>Exemples ({min(len(ex), 15)} premières lignes)</summary>"
                   f"{ex.to_html(index=False, border=0, classes='t', na_rep='')}</details>") if len(ex) else ""
        cards.append(f"""<article id="a{i}" class="{x['severite'][:4]}">
<h3>{esc(x['titre'])} <span class="b {x['severite'][:4]}">{x['severite']}</span></h3>
<p class="meta">{esc(x['fichier'])} · {esc(x['colonnes'])} · <b>{fmt(x['n'])}</b></p>
<p><b>Constat :</b> {esc(x['constat'])}</p><p><b>Impact :</b> {esc(x['impact'])}</p>
<p><b>Traitement proposé :</b> {esc(x['action'])}</p>{ex_html}</article>""")
    figs_html = "".join(f"<figure><figcaption>{esc(t)}</figcaption><img alt='{esc(t)}' src='data:image/png;base64,{b}'></figure>"
                        for t, b in figs)
    passed = "".join(f"<li>{esc(p)}</li>" for p in sorted(set(a.passed)))

    html = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Audit qualité RH</title><style>
:root{{--bg:#f5f7fb;--card:#fff;--ink:#182230;--muted:#667085;--line:#d8dee9;--blue:#2457a7}}
body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 "Segoe UI",Arial,sans-serif}}
header{{padding:28px 5%;background:#13294b;color:#fff}}header h1{{margin:0 0 6px}}header p{{margin:2px 0;color:#d0d9e8}}
nav{{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);padding:10px 5%;display:flex;gap:8px;flex-wrap:wrap;z-index:2}}
nav a{{color:var(--blue);text-decoration:none;border:1px solid var(--line);border-radius:20px;padding:4px 12px}}
main{{max-width:1200px;margin:auto;padding:20px}}section{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:20px}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}}.kpi{{border:1px solid var(--line);border-radius:10px;padding:12px}}
.kpi strong{{display:block;font-size:24px;color:var(--blue)}}table{{border-collapse:collapse;width:100%;font-size:12.5px;margin:8px 0}}
th,td{{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}}th{{background:#edf2f8}}td.n{{text-align:right}}
article{{border:1px solid var(--line);border-left:5px solid #667085;border-radius:8px;padding:14px 16px;margin:12px 0;scroll-margin-top:60px}}
article.Crit{{border-left-color:#b42318}}article.Aver{{border-left-color:#b7791f}}article.Info{{border-left-color:#175cd3}}
.b{{border-radius:20px;padding:2px 9px;font-size:11px;font-weight:600}}.b.Crit{{background:#fee4e2;color:#b42318}}.b.Aver{{background:#fef0c7;color:#93370d}}.b.Info{{background:#dbeafe;color:#1849a9}}
.meta{{color:var(--muted);margin:0 0 6px}}summary{{cursor:pointer;color:var(--blue)}}figure{{margin:14px 0}}figure img{{max-width:100%}}figcaption{{font-weight:600}}
.t td,.t th{{font-size:12px}}
</style></head><body>
<header><h1>Audit qualité des données RH</h1><p>7 fichiers sources · lecture seule · préparation du chargement SSIS / Data Warehouse</p>
<p>Généré le {datetime.now():%d/%m/%Y à %H:%M}</p></header>
<nav><a href="#synthese">Synthèse</a><a href="#sources">Sources</a><a href="#graphiques">Graphiques</a><a href="#anomalies">Anomalies</a><a href="#ok">Contrôles réussis</a><a href="#methode">Méthode</a></nav>
<main>
<section id="synthese"><h2>Synthèse</h2>
<p>Les deux fichiers d'employés ne décrivent pas les mêmes notions de la même façon (statut, diplôme, grade, libellés), et plusieurs règles
métier sont violées (CDI datés, pointages après la fin du contrat, pointages administratifs incohérents). Chaque anomalie ci-dessous donne
son volume, son impact et le traitement proposé pour le chargement.</p>
<div class="kpis"><div class="kpi"><strong>{len(items)}</strong>anomalies</div>
<div class="kpi"><strong>{counts.get('Critique', 0)}</strong>critiques</div><div class="kpi"><strong>{counts.get('Avertissement', 0)}</strong>avertissements</div>
<div class="kpi"><strong>{counts.get('Info', 0)}</strong>informations</div><div class="kpi"><strong>{len(set(a.passed))}</strong>contrôles réussis</div></div>
<table><thead><tr><th>Thème</th><th>Anomalie</th><th>Fichier</th><th>Volume</th><th>Sévérité</th></tr></thead><tbody>{summary}</tbody></table></section>
<section id="sources"><h2>Sources</h2><table><thead><tr><th>Fichier</th><th>Lignes</th><th>Colonnes</th></tr></thead><tbody>{src_rows}</tbody></table></section>
<section id="graphiques"><h2>Graphiques</h2>{figs_html}</section>
<section id="anomalies"><h2>Anomalies détaillées</h2>{''.join(cards)}</section>
<section id="ok"><h2>Contrôles réussis (0 anomalie)</h2><ul>{passed}</ul></section>
<section id="methode"><h2>Méthode et limites</h2><ul>
<li>Lecture seule : les fichiers sources ne sont jamais modifiés.</li>
<li>Formats explicites par fichier (dates ISO pour les fiches, M/J/AAAA et H:MM:SS pour les pointages techniques, AAAA-MM-JJ et HH:MM pour les pointages administratifs). Aucun parseur « automatique » n'est utilisé, car il inverse jour et mois.</li>
<li>Les vides attendus (SALARY des vacataires, HOURS des permanents, CONTRACT_END d'un contrat sans terme, ADRESSE_MISSION) ne sont pas comptés comme manquants.</li>
<li>Ancienneté calculée au 01/01/2023, début de la période de pointage.</li>
<li>Jours fériés : fêtes nationales tunisiennes à date fixe uniquement ; les fêtes religieuses (mobiles) ne sont pas contrôlées.</li>
<li>Une anomalie est un signal à arbitrer avec les RH, pas une correction automatique.</li></ul></section>
</main></body></html>"""
    out.write_text(html, encoding="utf-8")


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description="Audit qualité des données RH (lecture seule) ; produit un rapport HTML autonome.")
    ap.add_argument("--input-dir", default=str(here / "DataSet"), help="Dossier des 7 fichiers sources (défaut : DataSet/).")
    ap.add_argument("--output", default=str(here / "eda_audit_report.html"), help="Rapport HTML produit.")
    args = ap.parse_args()

    s = prepare(load_sources(Path(args.input_dir)))
    a = Audit()
    check_cross_file(a, s)
    check_quality(a, s)
    check_contracts(a, s)
    check_attendance(a, s)
    check_departments_courses(a, s)
    render(a, s, charts(s), Path(args.output))

    c = Counter(x["severite"] for x in a.items)
    print(f"{len(a.items)} anomalies (critiques {c.get('Critique', 0)}, avertissements {c.get('Avertissement', 0)}, "
          f"infos {c.get('Info', 0)}), {len(set(a.passed))} contrôles réussis.")
    for x in sorted(a.items, key=lambda x: (x["theme"], SEVERITY_ORDER[x["severite"]])):
        print(f"  [{x['severite'][:4]}] {x['titre']} — {x['fichier']} : {x['n']}")
    print(f"Rapport : {args.output}")


if __name__ == "__main__":
    main()
