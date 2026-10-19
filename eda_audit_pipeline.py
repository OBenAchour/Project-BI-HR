#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
eda_audit_pipeline.py
=====================
Audit qualité RH en lecture seule, destiné à préparer un futur pipeline SSIS/DW.

IMPORTANT
- Ce programme ne modifie jamais les fichiers sources.
- Toutes les colonnes sont chargées comme chaînes (dtype=str).
- Les conversions numériques/dates sont réalisées sur des séries temporaires uniquement.
- Le rapport HTML contient les anomalies détaillées, les valeurs/identifiants concernés,
  leur explication, une recommandation et une piste de règle SSIS.
- Les données sources doivent être placées dans --input-dir (par défaut : ./data).
- Les noms de colonnes peuvent varier : le script cherche des variantes courantes.
"""

from __future__ import annotations

import argparse
import base64
import csv
import io
import os
import re
import sys
import warnings
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

# Matplotlib est utilisé sans imposer de palette de couleurs.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

try:
    import missingno as msno
except ImportError:
    msno = None

try:
    from odf.opendocument import load as load_ods
    from odf.table import Table, TableRow, TableCell
    from odf.text import P
    from odf.teletype import extractText
except ImportError:
    load_ods = None


FILES = {
    "emp": "emp_data.xlsx",
    "admin": "administration_data.xlsx",
    "admin_att": "Administration_attendance.xlsx",
    "attendance": "attendance_dataset_2023.csv",
    "courses": "Coursera_trainings.csv",
    "departments": "departments.ods",
    "params": "extrainfos.txt",
}
FALSE_EMPTY = {"NULL", "null", "N/A", "na", "NaN", " ", "", "-", "?", "."}
NUMERIC_COLS = [
    "SALARY", "EXP_YEARS", "HOURS", "extra_hour", "LEAVE_CONSUMED",
    "LEAVE_BALANCE", "TENURE", "CAPACITY", "Course Rating",
]
DATE_COLS = [
    "STARTING_DATE", "CONTRACT_START", "CONTRACT_END", "Date",
    "StartTime", "BreakTime", "ResumeTime", "EndTime",
]
CATEGORY_COLS = [
    "GENDER", "TYPE_CONTRACT", "TYPE_DIPLOMA", "LANGUAGE",
    "MARITAL_STATUS", "Difficulty Level", "SOURCE_of_employment",
    "LAST_LEAVE_TYPE", "LEAVE_TYPE", "GRADE", "RANK",
]
MISSING_TOKENS_NORMALIZED = {x.strip().casefold() for x in FALSE_EMPTY}


def safe_text(value: Any) -> str:
    """Convertit une valeur en texte affichable sans faire de conversion source."""
    if pd.isna(value):
        return ""
    return str(value)


def norm_col(name: Any) -> str:
    """Normalisation uniquement pour retrouver une colonne, pas pour modifier les données."""
    return re.sub(r"[^a-z0-9]+", "", str(name).casefold())


def find_col(df: pd.DataFrame, candidates: list[str]) -> Optional[str]:
    """Retourne le nom réel d'une colonne correspondant à l'une des variantes."""
    lookup = {norm_col(c): c for c in df.columns}
    for candidate in candidates:
        if norm_col(candidate) in lookup:
            return lookup[norm_col(candidate)]
    # Recherche moins stricte, utile pour des noms de colonnes préfixés.
    for candidate in candidates:
        key = norm_col(candidate)
        for actual_norm, actual in lookup.items():
            if key and (key in actual_norm or actual_norm in key):
                return actual
    return None


def html_escape(value: Any) -> str:
    s = safe_text(value)
    return (s.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;"))


def read_csv_robust(path: Path) -> tuple[pd.DataFrame, str, str]:
    """Détecte séparateur et encodage par essais; toutes les colonnes restent en str."""
    encodings = ["utf-8-sig", "utf-8", "cp1252", "latin1"]
    last_error = None
    for enc in encodings:
        try:
            sample = path.read_text(encoding=enc, errors="strict")[:100_000]
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=",;\\t|")
                sep = dialect.delimiter
            except csv.Error:
                counts = {d: sample.count(d) for d in [",", ";", "\\t", "|"]}
                sep = max(counts, key=counts.get)
                if counts[sep] == 0:
                    sep = ","
            df = pd.read_csv(path, sep=sep, encoding=enc, dtype=str, keep_default_na=False,
                             na_filter=False, engine="python", on_bad_lines="warn")
            return df, enc, repr(sep).strip("'")
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Impossible de lire {path.name}: {last_error}")


def read_ods_all_sheets(path: Path) -> dict[str, pd.DataFrame]:
    """Lit les onglets ODS via pandas/odf; les valeurs sont conservées en chaînes."""
    try:
        book = pd.ExcelFile(path, engine="odf")
        return {sheet: pd.read_excel(path, sheet_name=sheet, engine="odf", dtype=str,
                                     keep_default_na=False) for sheet in book.sheet_names}
    except Exception as exc:
        raise RuntimeError(f"Lecture ODS impossible ({path.name}): {exc}") from exc


def load_workbook(path: Path) -> dict[str, pd.DataFrame]:
    """Charge tous les onglets Excel, sans inférence de types."""
    book = pd.ExcelFile(path, engine="openpyxl")
    return {sheet: pd.read_excel(path, sheet_name=sheet, dtype=str, keep_default_na=False)
            for sheet in book.sheet_names}


def parse_param_file(path: Path) -> tuple[str, dict[str, str]]:
    """Lit les paramètres en texte brut et extrait les taux reconnaissables."""
    raw = path.read_text(encoding="utf-8", errors="replace")
    params = {}
    for line in raw.splitlines():
        m = re.search(r"(.+?)\\s*[:=]\\s*([-+]?[0-9]+(?:[.,][0-9]+)?)", line)
        if m:
            params[re.sub(r"[^a-z0-9]+", "_", m.group(1).strip().casefold()).strip("_")] = m.group(2).replace(",", ".")
    return raw, params


def dataframe_to_html(df: pd.DataFrame, max_rows: int = 30) -> str:
    if df.empty:
        return '<p class="muted">Aucun enregistrement à afficher.</p>'
    shown = df.head(max_rows).copy()
    return shown.to_html(index=False, escape=True, border=0, classes="data-table")


def make_chart_bytes(fig) -> str:
    buffer = io.BytesIO()
    fig.tight_layout()
    fig.savefig(buffer, format="png", dpi=120, bbox_inches="tight")
    plt.close(fig)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def add_anomaly(anomalies: list[dict], file_name: str, column: str, kind: str,
                rows: pd.DataFrame, severity: str, explanation: str,
                recommendation: str, ssis_rule: str, index_col: str = "_row_number",
                details: Optional[list[str]] = None):
    """Enregistre un problème et ses exemples. Aucune correction n'est appliquée."""
    if rows is None or rows.empty:
        return
    examples = []
    for _, row in rows.head(100).iterrows():
        item = {"ligne_source": safe_text(row.get(index_col, ""))}
        for c in rows.columns:
            if c != index_col:
                item[c] = safe_text(row[c])
        examples.append(item)
    anomalies.append({
        "fichier": file_name, "colonne": column, "type": kind,
        "nb_lignes": int(len(rows)), "index": ", ".join(safe_text(x) for x in rows.get(index_col, pd.Series(dtype=str)).head(100).tolist()),
        "severite": severity, "explication": explanation,
        "recommandation": recommendation, "ssis": ssis_rule,
        "exemples": examples, "details": details or [],
    })


def matching_rows(df: pd.DataFrame, mask: pd.Series) -> pd.DataFrame:
    return df.loc[mask.fillna(False)].copy()


def temp_numeric(series: pd.Series) -> pd.Series:
    """Conversion temporaire tolérante aux virgules décimales."""
    return pd.to_numeric(series.astype(str).str.strip().str.replace(",", ".", regex=False), errors="coerce")


def temp_dates(series: pd.Series) -> pd.Series:
    """Parse des dates en mémoire uniquement; dayfirst=True pour les formats francophones."""
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return pd.to_datetime(series.astype(str).str.strip(), errors="coerce", dayfirst=True, format="mixed")


def quality_score(anomalies: list[dict], total_rows: int, total_cells: int) -> float:
    """Score indicatif, pénalisant davantage les anomalies critiques."""
    if total_cells <= 0:
        return 0.0
    weights = {"Critique": 3.0, "Avertissement": 1.5, "Info": 0.3}
    penalty = sum(weights.get(a["severite"], 1.0) * min(a["nb_lignes"], max(total_rows, 1))
                  for a in anomalies)
    # Normalisation pour que le score reste entre 0 et 100 et ne dépende pas uniquement du volume.
    return round(max(0.0, 100.0 * (1.0 - penalty / max(total_cells * 0.25, 1))), 1)


def audit_missing(df: pd.DataFrame, filename: str, anomalies: list[dict], charts: list[dict]):
    # _row_number est une métadonnée de traçabilité et ne doit pas compter comme colonne source.
    source_cols = [c for c in df.columns if c != "_row_number"]
    real_counts = df[source_cols].isna().sum()
    fake_counts = {}
    rows_for_bar = []
    total_fake = 0
    for col in source_cols:
        values = df[col].astype(str)
        mask = values.str.strip().str.casefold().isin(MISSING_TOKENS_NORMALIZED)
        fake_counts[col] = int(mask.sum())
        total_fake += int(mask.sum())
        rows_for_bar.append((col, float((real_counts[col] + mask.sum()) / max(len(df), 1) * 100)))
        if mask.any():
            bad = df.loc[mask].copy()
            add_anomaly(anomalies, filename, col, "Faux-vides / marqueurs de vide", bad,
                        "Avertissement" if mask.mean() <= 0.05 else "Critique",
                        f'{int(mask.sum())} valeur(s) utilisent un marqueur textuel de vide (ex. NULL, N/A, tiret). Elles ne sont pas des NaN natifs.',
                        "Définir explicitement les marqueurs reconnus comme NULL dans la couche de staging, après validation métier. Conserver la valeur brute dans une colonne de traçabilité si nécessaire.",
                        "Dans SSIS, dériver une colonne de contrôle (TRIM + comparaison insensible à la casse) et convertir en NULL uniquement selon une règle validée.")
    # Graphique pourcentage combiné manquants réels + faux-vides.
    fig, ax = plt.subplots(figsize=(max(8, len(df.columns) * 0.38), 4.5))
    if rows_for_bar:
        labels, vals = zip(*sorted(rows_for_bar, key=lambda x: x[1], reverse=True))
        ax.bar(range(len(vals)), vals)
        ax.set_xticks(range(len(vals)))
        ax.set_xticklabels(labels, rotation=75, ha="right", fontsize=8)
        ax.set_ylabel("% lignes concernées")
        ax.set_title(f"Valeurs manquantes + faux-vides — {filename}")
        ax.axhline(5, linestyle="--", linewidth=1, label="Seuil d'alerte 5 %")
        ax.legend()
    charts.append({"title": f"Manquants — {filename}", "png": make_chart_bytes(fig)})
    if msno is not None and len(df) > 0 and len(df.columns) > 0:
        try:
            fig = plt.figure(figsize=(max(8, len(df.columns) * 0.35), 4))
            sample = df.head(5000).replace(list(FALSE_EMPTY), np.nan)
            msno.matrix(sample, ax=fig.gca(), sparkline=False)
            plt.title(f"Missingno matrix — {filename} (max. 5 000 lignes)")
            charts.append({"title": f"Missingno matrix — {filename}", "png": make_chart_bytes(fig)})
        except Exception as exc:
            charts.append({"title": f"Missingno — {filename}", "note": f"Visualisation indisponible: {exc}"})
    return {"real": {c: int(real_counts[c]) for c in source_cols},
            "fake": fake_counts, "fake_total": total_fake,
            "over5": [(c, pct) for c, pct in rows_for_bar if pct > 5]}


def audit_duplicates(df: pd.DataFrame, filename: str, key_candidates: list[list[str]],
                     anomalies: list[dict], label: str):
    for candidates in key_candidates:
        cols = [find_col(df, [c]) for c in candidates]
        if any(c is None for c in cols):
            continue
        cols = list(dict.fromkeys(cols))
        dup_mask = df.duplicated(subset=cols, keep=False)
        if dup_mask.any():
            rows = df.loc[dup_mask].copy()
            key_label = " + ".join(cols)
            add_anomaly(anomalies, filename, key_label, "Doublons de clé", rows, "Critique",
                        f"{int(dup_mask.sum())} lignes appartiennent à un groupe de doublons pour {key_label}. Une clé supposée unique n'identifie donc pas une ligne de manière univoque.",
                        "Comparer les lignes du groupe avant de décider s'il s'agit de doublons exacts, d'historique légitime ou d'une clé insuffisante. Ne pas supprimer automatiquement.",
                        f"Contrôle SSIS: agréger par {key_label}, compter les occurrences et router les groupes count > 1 vers une sortie d'audit.")
    # Doublons exacts sur toutes les colonnes, séparés des doublons de clé.
    dup_exact = df.duplicated(keep=False)
    if dup_exact.any():
        rows = df.loc[dup_exact].copy()
        add_anomaly(anomalies, filename, "*", "Lignes entièrement dupliquées", rows, "Avertissement",
                    f"{int(dup_exact.sum())} lignes sont identiques sur toutes les colonnes.",
                    "Vérifier si la répétition provient d'une extraction répétée ou représente des événements réellement distincts. Préserver les lignes brutes jusqu'à arbitrage.",
                    "Dans SSIS, créer un flux de contrôle de doublons exacts basé sur l'ensemble des colonnes et consigner le résultat.")


def audit_numeric(df: pd.DataFrame, filename: str, anomalies: list[dict], charts: list[dict]):
    for requested in NUMERIC_COLS:
        col = find_col(df, [requested])
        if not col:
            continue
        raw = df[col].astype(str).str.strip()
        empty = raw.str.casefold().isin(MISSING_TOKENS_NORMALIZED)
        converted = temp_numeric(raw.mask(empty, np.nan))
        invalid = (~empty) & converted.isna()
        if invalid.any():
            rows = df.loc[invalid].copy()
            add_anomaly(anomalies, filename, col, "Valeur numérique non convertible", rows, "Avertissement",
                        f"{int(invalid.sum())} valeur(s) non vides ne peuvent pas être interprétées comme nombres. Exemples: {', '.join(raw[invalid].head(8).tolist())}.",
                        "Identifier les séparateurs décimaux, unités, espaces ou textes parasites. Valider le format cible avant conversion.",
                        f"SSIS: TRIM puis conversion TRY_CONVERT/DT_NUMERIC; router les échecs vers une table d'erreurs avec valeur brute.")
        valid = converted.dropna()
        if len(valid) > 0 and requested.casefold() in {"salary", "course rating", "exp_years", "hours", "extra_hour", "capacity", "leave_consumed", "leave_balance", "tenure"}:
            if requested.casefold() == "salary":
                q1, q3 = valid.quantile([.25, .75])
                iqr = q3 - q1
                outlier = (converted < q1 - 1.5 * iqr) | (converted > q3 + 1.5 * iqr)
                mean, std = valid.mean(), valid.std(ddof=0)
                zmask = (converted - mean).abs() / std > 3 if std and not np.isnan(std) else pd.Series(False, index=df.index)
                mask = (outlier | zmask).fillna(False)
                if mask.any():
                    rows = df.loc[mask].copy()
                    add_anomaly(anomalies, filename, col, "Outlier salaire (IQR / Z-score)", rows, "Avertissement",
                                f"{int(mask.sum())} valeur(s) signalées par IQR ou |Z-score| > 3. Un outlier statistique n'est pas nécessairement une erreur.",
                                "Vérifier devise, périodicité (mensuelle/annuelle), primes et statut du contrat avant toute correction.",
                                "SSIS: produire un indicateur d'anomalie et mettre les valeurs signalées en revue; ne pas plafonner automatiquement.")
                fig, ax = plt.subplots(figsize=(7, 3.5))
                ax.boxplot(valid, vert=False)
                ax.set_title(f"Distribution de {col} — {filename}")
                charts.append({"title": f"Boxplot {col} — {filename}", "png": make_chart_bytes(fig)})
            if requested.casefold() == "exp_years":
                mask = ((converted < 0) | (converted > 50)).fillna(False)
                if mask.any():
                    add_anomaly(anomalies, filename, col, "Ancienneté/expérience hors plage", df.loc[mask].copy(), "Avertissement",
                                "Valeur négative ou supérieure à 50 ans détectée selon le seuil demandé.",
                                "Contrôler l'unité (années/mois), les valeurs sentinelles et les erreurs de saisie.",
                                "SSIS: contrôle de plage [0, 50] avec quarantaine des valeurs hors plage.")
            elif requested.casefold() == "hours":
                mask = ((converted < 0) | (converted > 300)).fillna(False)
                if mask.any():
                    add_anomaly(anomalies, filename, col, "Heures hors plage", df.loc[mask].copy(), "Avertissement",
                                "Valeur HOURS inférieure à 0 ou supérieure à 300.",
                                "Confirmer la période représentée par HOURS (jour, mois, année) et l'unité.",
                                "SSIS: contrôle de plage métier avant chargement DW.")
            elif requested.casefold() == "extra_hour":
                mask = (converted < 0).fillna(False)
                if mask.any():
                    add_anomaly(anomalies, filename, col, "Heures supplémentaires négatives", df.loc[mask].copy(), "Avertissement",
                                "Les heures supplémentaires ne devraient généralement pas être négatives.",
                                "Vérifier si les valeurs représentent une correction/annulation ou une erreur de saisie.",
                                "SSIS: règle de plage >= 0, avec exception documentée si les corrections négatives sont autorisées.")
            elif requested.casefold() == "course rating":
                mask = ((converted < 0) | (converted > 5)).fillna(False)
                if mask.any():
                    add_anomaly(anomalies, filename, col, "Note de formation hors [0,5]", df.loc[mask].copy(), "Avertissement",
                                "La note est en dehors de l'échelle attendue 0–5.",
                                "Confirmer l'échelle de notation source et les valeurs sentinelles.",
                                "SSIS: contrainte entre 0 et 5 après conversion numérique.")
            elif requested.casefold() == "capacity":
                mask = (converted <= 0).fillna(False)
                if mask.any():
                    add_anomaly(anomalies, filename, col, "Capacité nulle ou négative", df.loc[mask].copy(), "Avertissement",
                                "La capacité d'un département est nulle ou négative.",
                                "Vérifier si zéro signifie réellement absence de capacité ou donnée inconnue.",
                                "SSIS: contrôle CAPACITY > 0, avec exception explicitement documentée.")
            elif requested.casefold() in {"leave_consumed", "leave_balance"}:
                mask = (converted < 0).fillna(False)
                if mask.any():
                    add_anomaly(anomalies, filename, col, "Solde/congé négatif", df.loc[mask].copy(), "Avertissement",
                                "Valeur négative détectée dans une mesure de congés.",
                                "Comparer au règlement RH, à la période de calcul et aux éventuelles régularisations.",
                                "SSIS: contrôle de plage et indicateur de revue métier.")


def audit_dates(df: pd.DataFrame, filename: str, anomalies: list[dict]):
    for requested in DATE_COLS:
        col = find_col(df, [requested])
        if not col:
            continue
        raw = df[col].astype(str).str.strip()
        empty = raw.str.casefold().isin(MISSING_TOKENS_NORMALIZED)
        parsed = temp_dates(raw.mask(empty, np.nan))
        invalid = (~empty) & parsed.isna()
        if invalid.any():
            vals = raw[invalid].value_counts().head(12)
            add_anomaly(anomalies, filename, col, "Format date/heure non reconnu", df.loc[invalid].copy(), "Avertissement",
                        f"{int(invalid.sum())} valeur(s) non vides n'ont pas été interprétées comme dates/heures. Valeurs fréquentes: {dict(vals)}.",
                        "Lister les formats source distincts, confirmer jour/mois, fuseau et formats horaires avant de choisir une conversion.",
                        "SSIS: tenter les formats explicitement identifiés; utiliser une sortie d'erreur pour les valeurs non convertibles plutôt qu'une conversion silencieuse.")
        if requested.casefold() == "date":
            year_mask = parsed.notna() & (parsed.dt.year != 2023)
            if year_mask.any():
                add_anomaly(anomalies, filename, col, "Date de pointage hors 2023", df.loc[year_mask].copy(), "Avertissement",
                            f"{int(year_mask.sum())} date(s) interprétée(s) hors de l'année 2023.",
                            "Confirmer si le fichier doit exclusivement contenir 2023 ou s'il couvre une période plus large.",
                            "SSIS: règle de plage temporelle configurable et journalisation des lignes hors période.")


def audit_categories(df: pd.DataFrame, filename: str, anomalies: list[dict]):
    for requested in CATEGORY_COLS:
        col = find_col(df, [requested])
        if not col:
            continue
        values = df[col].astype(str)
        distinct = values[~values.str.strip().str.casefold().isin(MISSING_TOKENS_NORMALIZED)].value_counts()
        # Catégories avec variations probables de casse/espaces.
        groups = {}
        for value in distinct.index:
            key = re.sub(r"\\s+", " ", str(value).strip()).casefold()
            groups.setdefault(key, []).append(str(value))
        variants = {k: v for k, v in groups.items() if len(v) > 1}
        if variants:
            rows_mask = values.isin([v for group in variants.values() for v in group])
            add_anomaly(anomalies, filename, col, "Variantes de libellés", df.loc[rows_mask].copy(), "Info",
                        "Plusieurs libellés semblent représenter la même valeur après normalisation de la casse/espaces: " +
                        "; ".join(" / ".join(v) for v in list(variants.values())[:12]) + ".",
                        "Créer un dictionnaire de correspondance approuvé par le métier; ne pas fusionner les catégories automatiquement sans validation.",
                        "SSIS: colonne de normalisation temporaire + table de mapping versionnée; conserver la valeur source.")
        if requested.casefold() == "gender":
            unexpected = ~values.str.strip().str.upper().isin(["M", "F", "MALE", "FEMALE", "HOMME", "FEMME", ""])
            unexpected &= ~values.str.strip().str.casefold().isin(MISSING_TOKENS_NORMALIZED)
            if unexpected.any():
                add_anomaly(anomalies, filename, col, "Valeur GENDER inattendue", df.loc[unexpected].copy(), "Avertissement",
                            "Valeurs autres que M/F et quelques libellés courants attendus détectées.",
                            "Faire confirmer la nomenclature autorisée. Éviter d'inférer le genre à partir du prénom comme règle de nettoyage.",
                            "SSIS: référentiel de valeurs autorisées; router les valeurs inconnues vers une table de rejets.")
        if requested.casefold() == "marital_status":
            unexpected = ~values.str.strip().isin(["0", "1", ""])
            unexpected &= ~values.str.strip().str.casefold().isin(MISSING_TOKENS_NORMALIZED)
            if unexpected.any():
                add_anomaly(anomalies, filename, col, "MARITAL_STATUS hors 0/1", df.loc[unexpected].copy(), "Avertissement",
                            "La colonne contient des valeurs autres que 0/1 (en dehors des marqueurs de vide).",
                            "Confirmer la signification de 0 et 1, ainsi que la gestion des valeurs inconnues.",
                            "SSIS: validation de domaine 0/1 et sortie d'erreur pour les autres valeurs.")
        if requested.casefold() == "difficulty level":
            allowed = {"beginner", "intermediate", "advanced"}
            unexpected = ~values.str.strip().str.casefold().isin(allowed | {""})
            unexpected &= ~values.str.strip().str.casefold().isin(MISSING_TOKENS_NORMALIZED)
            if unexpected.any():
                add_anomaly(anomalies, filename, col, "Difficulty Level inattendu", df.loc[unexpected].copy(), "Avertissement",
                            "Valeurs hors Beginner/Intermediate/Advanced détectées.",
                            "Valider la liste de catégories autorisées avec la source Coursera.",
                            "SSIS: contrôle de domaine basé sur une table de référence.")


def audit_cross_file(dfs: dict[str, pd.DataFrame], anomalies: list[dict], params: dict[str, str]):
    emp, admin = dfs.get("emp"), dfs.get("admin")
    depts, courses = dfs.get("departments"), dfs.get("courses")
    admin_att, attendance = dfs.get("admin_att"), dfs.get("attendance")

    def ref_check(source_key, source_candidates, target_key, target_candidates, label):
        source, target = dfs.get(source_key), dfs.get(target_key)
        if source is None or target is None:
            return
        sc, tc = find_col(source, source_candidates), find_col(target, target_candidates)
        if not sc or not tc:
            return
        target_values = set(target[tc].astype(str).str.strip())
        source_vals = source[sc].astype(str).str.strip()
        missing = ~source_vals.isin(target_values)
        missing &= ~source_vals.str.casefold().isin(MISSING_TOKENS_NORMALIZED)
        if missing.any():
            rows = source.loc[missing].copy()
            examples = source_vals[missing].value_counts().head(50)
            add_anomaly(anomalies, FILES[source_key], sc, f"Violation référentielle: {label}", rows, "Critique",
                        f"{int(missing.sum())} ligne(s) contiennent une référence absente de {FILES[target_key]}.{tc}. Identifiants distincts introuvables (jusqu'à 50): {list(examples.index)}.",
                        "Vérifier les espaces/casse, les décalages de format UUID, les données manquantes du référentiel et la correspondance entre clés. Ne pas fabriquer de clé cible.",
                        f"SSIS: Left Outer Join sur {sc} vers {tc}; router les lignes où la clé cible est NULL dans une table de rejets référentiels.",
                        details=[f"{k} (occurrences source: {v})" for k, v in examples.items()])

    ref_check("emp", ["DEP_ID", "ID_DEP"], "departments", ["ID_DEP"], "DEP_ID employé → département")
    ref_check("admin", ["DEP_ID", "ID_DEP"], "departments", ["ID_DEP"], "DEP_ID administration → département")
    ref_check("admin_att", ["ID_Employee", "Employee_ID", "CODE"], "admin", ["ID_Employee"], "pointage → employé administration")
    ref_check("emp", ["ID_Training", "ID_TRAINING", "Training_ID"], "courses", ["id_course", "course_id"], "formation employé → catalogue Coursera")

    # UUID présents dans les deux fichiers : peut être légitime, mais doit être documenté.
    if emp is not None and admin is not None:
        ec, ac = find_col(emp, ["CODE"]), find_col(admin, ["ID_Employee"])
        if ec and ac:
            ev = set(emp[ec].astype(str).str.strip())
            av = set(admin[ac].astype(str).str.strip())
            common = sorted((ev & av) - MISSING_TOKENS_NORMALIZED)
            if common:
                rows = emp[emp[ec].astype(str).str.strip().isin(common)].copy()
                add_anomaly(anomalies, FILES["emp"], ec, "UUID commun aux deux fichiers employés", rows, "Info",
                            f"{len(common)} UUID distinct(s) existent à la fois dans emp_data.CODE et administration_data.ID_Employee. Cela peut indiquer une population commune ou un schéma partagé; ce n'est pas automatiquement une erreur.",
                            "Confirmer si les deux fichiers décrivent la même population, des rôles différents ou des référentiels distincts. Documenter la clé métier et la relation attendue.",
                            "SSIS: profiler l'intersection des clés; ne pas supprimer ni fusionner les lignes sans règle métier.",
                            details=[f"UUID commun: {x}" for x in common[:200]])

    # Cohérence des rangs / grades.
    if emp is not None and admin is not None:
        rc, gc = find_col(emp, ["RANK"]), find_col(admin, ["GRADE"])
        if rc and gc:
            rank_vals = set(emp[rc].astype(str).str.strip().str.casefold())
            grade_vals = set(admin[gc].astype(str).str.strip().str.casefold())
            only_rank = sorted(rank_vals - grade_vals - MISSING_TOKENS_NORMALIZED)
            only_grade = sorted(grade_vals - rank_vals - MISSING_TOKENS_NORMALIZED)
            if only_rank or only_grade:
                add_anomaly(anomalies, "emp_data.xlsx + administration_data.xlsx", "RANK / GRADE",
                            "Valeurs de référentiel différentes", emp[[rc]].drop_duplicates().copy(), "Info",
                            f"Valeurs uniquement dans RANK: {only_rank[:50]}; uniquement dans GRADE: {only_grade[:50]}. Les champs peuvent avoir des sémantiques différentes.",
                            "Confirmer si RANK et GRADE sont comparables avant de construire un mapping.",
                            "DW: utiliser une dimension de correspondance validée plutôt qu'une égalité implicite.")

    # Cohérence des heures de présence.
    for key in ["admin_att", "attendance"]:
        df = dfs.get(key)
        if df is None:
            continue
        start, end = find_col(df, ["StartTime"]), find_col(df, ["EndTime"])
        brk, resume = find_col(df, ["BreakTime"]), find_col(df, ["ResumeTime"])
        if start and end:
            st, en = temp_dates(df[start]), temp_dates(df[end])
            # Si les valeurs sont des heures seules, pandas peut les parser sur une date de référence commune.
            mask = st.notna() & en.notna() & (st > en)
            if mask.any():
                add_anomaly(anomalies, FILES[key], f"{start} / {end}", "Heure de fin avant heure de début",
                            df.loc[mask].copy(), "Avertissement",
                            f"{int(mask.sum())} ligne(s) ont StartTime > EndTime selon le parsing. Les postes traversant minuit doivent être distingués des erreurs.",
                            "Vérifier les équipes de nuit et la présence d'une date de fin distincte avant de considérer ces lignes comme invalides.",
                            "SSIS: comparer les heures après application d'une règle explicite pour les shifts traversant minuit.")
        if brk and resume:
            bt, rt = temp_dates(df[brk]), temp_dates(df[resume])
            mask = bt.notna() & rt.notna() & (bt > rt)
            if mask.any():
                add_anomaly(anomalies, FILES[key], f"{brk} / {resume}", "Pause après reprise",
                            df.loc[mask].copy(), "Avertissement",
                            f"{int(mask.sum())} ligne(s) ont BreakTime > ResumeTime.",
                            "Confirmer les formats et vérifier si une pause traverse minuit.",
                            "SSIS: règle temporelle BreakTime <= ResumeTime avec gestion documentée des cas nocturnes.")

    # Contrats, salaire/heures et dates sur les fichiers employés.
    for key in ["emp", "admin"]:
        df = dfs.get(key)
        if df is None:
            continue
        contract = find_col(df, ["TYPE_CONTRACT", "Type_Contract", "Contract_Type"])
        salary = find_col(df, ["SALARY"])
        hours = find_col(df, ["HOURS"])
        start = find_col(df, ["CONTRACT_START"])
        end = find_col(df, ["CONTRACT_END"])
        starting = find_col(df, ["STARTING_DATE"])
        if contract:
            c = df[contract].astype(str).str.strip().str.casefold()
            empty = c.eq("") | c.isin(MISSING_TOKENS_NORMALIZED)
            if empty.any():
                add_anomaly(anomalies, FILES[key], contract, "Statut contractuel manquant", df.loc[empty].copy(), "Critique",
                            f"{int(empty.sum())} employé(s) n'ont pas de TYPE_CONTRACT exploitable.",
                            "Récupérer le statut auprès de la source RH faisant autorité; ne pas déduire un contrat par défaut.",
                            "SSIS: contrôle NOT NULL métier et table de rejets pour les lignes sans statut.")
            if salary and hours:
                s = temp_numeric(df[salary]); hraw = df[hours].astype(str).str.strip()
                hmissing = hraw.str.casefold().isin(MISSING_TOKENS_NORMALIZED)
                vac = c.str.contains("vacataire", na=False)
                permanent = c.str.contains("permanent", na=False)
                mask = (vac & s.notna() & hmissing) | (vac & s.isna() & ~hmissing) | (permanent & ~hmissing & hraw.ne(""))
                if mask.any():
                    add_anomaly(anomalies, FILES[key], f"{contract} / {salary} / {hours}",
                                "Contrat incohérent avec salaire/heures", df.loc[mask].copy(), "Avertissement",
                                f"{int(mask.sum())} ligne(s) signalées selon les règles proposées: vacataire salaire renseigné/heures absentes, vacataire salaire absent/heures présentes, ou permanent avec HOURS renseigné.",
                                "Faire confirmer la définition des statuts et si HOURS désigne un volume contractuel, des heures travaillées ou des heures supplémentaires.",
                                "SSIS: règles conditionnelles par TYPE_CONTRACT, à activer après validation métier.")
        if start and end:
            s, e = temp_dates(df[start]), temp_dates(df[end])
            mask = s.notna() & e.notna() & (s > e)
            if mask.any():
                add_anomaly(anomalies, FILES[key], f"{start} / {end}", "Début de contrat après fin",
                            df.loc[mask].copy(), "Critique",
                            f"{int(mask.sum())} contrat(s) ont une date de début postérieure à la date de fin.",
                            "Vérifier l'inversion jour/mois et les dates saisies; demander validation RH.",
                            "SSIS: contrainte CONTRACT_START <= CONTRACT_END; rejeter ou mettre en quarantaine les lignes non conformes.")
        if starting and start:
            s, e = temp_dates(df[starting]), temp_dates(df[start])
            mask = s.notna() & e.notna() & (s > e)
            if mask.any():
                add_anomaly(anomalies, FILES[key], f"{starting} / {start}", "Date d'entrée après début de contrat",
                            df.loc[mask].copy(), "Avertissement",
                            f"{int(mask.sum())} ligne(s) ont STARTING_DATE > CONTRACT_START.",
                            "Confirmer si STARTING_DATE est la date d'entrée dans l'entreprise et CONTRACT_START la date contractuelle.",
                            "SSIS: règle temporelle conditionnelle après validation de la définition des champs.")

    # Contrôle de cohérence salaire vacataire avec HOURS × taux horaire.
    if emp is not None:
        contract = find_col(emp, ["TYPE_CONTRACT", "Type_Contract"])
        salary = find_col(emp, ["SALARY"])
        hours = find_col(emp, ["HOURS"])
        rate = next((v for k, v in params.items() if "hour" in k and "vacat" in k), None)
        if contract and salary and hours and rate:
            c = emp[contract].astype(str).str.casefold()
            s, h = temp_numeric(emp[salary]), temp_numeric(emp[hours])
            r = float(rate)
            mask = c.str.contains("vacataire", na=False) & s.notna() & h.notna() & ((s - h * r).abs() > max(1.0, r * 0.05))
            if mask.any():
                add_anomaly(anomalies, FILES["emp"], f"{salary} / {hours}", "Salaire vacataire différent de HOURS × taux",
                            emp.loc[mask].copy(), "Avertissement",
                            f"{int(mask.sum())} ligne(s) diffèrent de plus de 5 % ou 1 unité du calcul HOURS × {r}. Cette règle suppose que les deux champs couvrent la même période et que SALARY est calculé au taux horaire.",
                            "Confirmer l'unité des heures, la périodicité du salaire, les arrondis et les autres éléments de rémunération.",
                            f"SSIS: calculer un montant théorique temporaire HOURS * {r}; comparer avec tolérance approuvée, sans remplacer SALARY.")


def report_html(dfs, sheet_names, meta, missing_info, anomalies, charts, params_raw, out_path: Path):
    total_rows = sum(len(df) for df in dfs.values())
    # Exclure la colonne technique de traçabilité du décompte des colonnes/cellules.
    total_cols = sum(len(df.columns) - (1 if "_row_number" in df.columns else 0) for df in dfs.values())
    total_cells = sum(len(df) * (len(df.columns) - (1 if "_row_number" in df.columns else 0)) for df in dfs.values())
    score = quality_score(anomalies, total_rows, total_cells)
    counts = Counter(a["severite"] for a in anomalies)
    # missing_info contient plusieurs structures (real, fake, fake_total, over5).
    # Seul le dictionnaire real contient les compteurs de valeurs NaN/None natifs.
    missing_real = sum(sum(v["real"].values()) for v in missing_info.values())
    fake_total = sum(v["fake_total"] for v in missing_info.values())
    dup_total = sum(a["nb_lignes"] for a in anomalies if "Doublon" in a["type"])
    ref_total = sum(a["nb_lignes"] for a in anomalies if "référentielle" in a["type"].casefold())
    temporal_total = sum(a["nb_lignes"] for a in anomalies if any(x in a["type"].casefold() for x in ["date", "heure", "pause", "temporelle"]))
    outlier_total = sum(a["nb_lignes"] for a in anomalies if "outlier" in a["type"].casefold() or "heures hors" in a["type"].casefold())
    severity = "🟢" if score >= 85 else ("🟡" if score >= 65 else "🔴")

    nav = ['<a href="#overview">Vue générale</a>', '<a href="#sources">Sources</a>',
           '<a href="#anomalies">Anomalies détaillées</a>', '<a href="#catalogue">Catalogue SSIS/DW</a>',
           '<a href="#method">Méthodologie & limites</a>']
    for i, a in enumerate(anomalies):
        pass

    source_rows = []
    for key, df in dfs.items():
        source_rows.append(f"<tr><td>{html_escape(key)}</td><td>{len(df):,}</td><td>{len(df.columns)}</td><td>{html_escape(', '.join(map(str, df.columns)))}</td></tr>")
    anomaly_cards = []
    for i, a in enumerate(anomalies, 1):
        sev_class = {"Critique": "crit", "Avertissement": "warn", "Info": "info"}.get(a["severite"], "info")
        examples_df = pd.DataFrame(a["exemples"])
        detail_html = ""
        if a["details"]:
            detail_html = "<h4>Valeurs / identifiants détaillés</h4><ul>" + "".join(f"<li>{html_escape(x)}</li>" for x in a["details"][:200]) + "</ul>"
        anomaly_cards.append(f"""
        <article class="anomaly {sev_class}" id="anomaly-{i}">
          <h3>{i}. {html_escape(a['type'])} <span class="badge {sev_class}">{html_escape(a['severite'])}</span></h3>
          <p><b>Fichier :</b> {html_escape(a['fichier'])} &nbsp; <b>Colonne(s) :</b> {html_escape(a['colonne'])}</p>
          <p><b>Lignes concernées :</b> {a['nb_lignes']:,}</p>
          <p><b>Pourquoi c'est un problème :</b> {html_escape(a['explication'])}</p>
          <p><b>Recommandation d'analyse :</b> {html_escape(a['recommandation'])}</p>
          <p><b>Piste SSIS :</b> {html_escape(a['ssis'])}</p>
          {detail_html}
          <details><summary>Afficher les exemples (maximum 100 lignes)</summary>{dataframe_to_html(examples_df, 100)}</details>
        </article>""")

    chart_html = []
    for c in charts:
        if "png" in c:
            chart_html.append(f'<figure><figcaption>{html_escape(c["title"])}</figcaption><img alt="{html_escape(c["title"])}" src="data:image/png;base64,{c["png"]}"></figure>')
        else:
            chart_html.append(f'<p class="muted">{html_escape(c["title"])} — {html_escape(c.get("note",""))}</p>')

    # Vue des colonnes dépassant le seuil de 5 %.
    over5_rows = []
    for file, info in missing_info.items():
        for col, pct in info["over5"]:
            over5_rows.append(f"<tr><td>{html_escape(file)}</td><td>{html_escape(col)}</td><td>{pct:.2f}%</td></tr>")
    over5_html = "<table><thead><tr><th>Fichier</th><th>Colonne</th><th>Manquants + faux-vides</th></tr></thead><tbody>" + "".join(over5_rows) + "</tbody></table>" if over5_rows else "<p>Aucune colonne ne dépasse le seuil de 5 % calculé sur les manquants réels + faux-vides.</p>"

    # Le HTML est entièrement autonome: CSS et images en base64.
    html = f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Audit qualité RH — Rapport détaillé</title>
    <style>
    :root{{--bg:#f5f7fb;--card:#fff;--ink:#182230;--muted:#667085;--line:#d8dee9;--blue:#2457a7;--red:#b42318;--yellow:#9a6700;--cyan:#175cd3}}
    *{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 "Segoe UI",Arial,sans-serif}}
    header{{padding:32px 5%;background:#13294b;color:white}}header h1{{margin:0 0 8px;font-size:28px}}header p{{margin:4px 0;color:#d0d9e8}}
    nav{{position:sticky;top:0;background:#fff;border-bottom:1px solid var(--line);padding:12px 5%;display:flex;gap:10px;flex-wrap:wrap;z-index:5}}nav a{{color:var(--blue);text-decoration:none;border:1px solid var(--line);border-radius:20px;padding:5px 12px}}
    main{{max-width:1400px;margin:auto;padding:24px}}section,.panel{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:22px;margin-bottom:22px;box-shadow:0 2px 8px #1018280a}}
    h2{{margin-top:0}}h3{{margin:0 0 10px}}h4{{margin-bottom:4px}}.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}}
    .kpi{{padding:16px;border:1px solid var(--line);border-radius:10px}}.kpi strong{{display:block;font-size:25px;color:var(--blue)}}.muted{{color:var(--muted)}}
    .score{{font-size:36px;font-weight:800;color:{'#16803c' if score >= 85 else '#9a6700' if score >= 65 else '#b42318'}}}
    table{{border-collapse:collapse;width:100%;font-size:12px;margin:10px 0}}th,td{{border:1px solid var(--line);padding:7px 9px;text-align:left;vertical-align:top;overflow-wrap:anywhere}}th{{background:#edf2f8}}.table-wrap{{overflow:auto}}
    figure{{margin:18px 0;padding:12px;border:1px solid var(--line);border-radius:8px}}figure img{{max-width:100%;height:auto;display:block}}figcaption{{font-weight:700;margin-bottom:8px}}
    .anomaly{{background:white;border:1px solid var(--line);border-left:5px solid #667085;border-radius:8px;padding:18px;margin:14px 0;scroll-margin-top:80px}}
    .anomaly.crit{{border-left-color:#b42318}}.anomaly.warn{{border-left-color:#b7791f}}.anomaly.info{{border-left-color:#175cd3}}
    .badge{{border-radius:20px;padding:3px 9px;font-size:11px}}.badge.crit{{background:#fee4e2;color:#b42318}}.badge.warn{{background:#fef0c7;color:#93370d}}.badge.info{{background:#dbeafe;color:#1849a9}}
    details{{margin-top:12px}}summary{{cursor:pointer;color:var(--blue);font-weight:600}}.callout{{background:#fffaeb;border:1px solid #fedf89;padding:12px;border-radius:8px}}
    code{{background:#edf2f8;padding:2px 5px;border-radius:4px}}footer{{padding:20px 5%;color:var(--muted);text-align:center}}
    </style></head><body>
    <header><h1>Rapport d'audit qualité — Données RH</h1><p>Profilage et audit en lecture seule, préparation SSIS / Staging / Data Warehouse</p>
    <p>Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M:%S')}</p></header>
    <nav>{''.join(nav)}</nav><main>
    <section id="overview"><h2>Vue générale</h2><div class="score">{score:.1f}% {severity}</div><p class="muted">Score indicatif calculé à partir du volume de cellules et de la sévérité des anomalies. Ce n'est pas une norme certifiée et il ne remplace pas l'analyse métier.</p>
    <div class="kpis">
    <div class="kpi"><strong>{len(dfs)}</strong>fichiers / sources chargés</div>
    <div class="kpi"><strong>{total_rows:,}</strong>lignes totales</div>
    <div class="kpi"><strong>{total_cols}</strong>colonnes totales</div>
    <div class="kpi"><strong>{missing_real:,}</strong>NaN/None natifs</div>
    <div class="kpi"><strong>{fake_total:,}</strong>faux-vides détectés</div>
    <div class="kpi"><strong>{dup_total:,}</strong>lignes dans anomalies de doublons</div>
    <div class="kpi"><strong>{ref_total:,}</strong>lignes avec violation référentielle</div>
    <div class="kpi"><strong>{len(anomalies)}</strong>règles/anomalies détectées</div>
    <div class="kpi"><strong>{counts.get('Critique',0)}</strong>anomalies critiques</div>
    <div class="kpi"><strong>{counts.get('Avertissement',0)}</strong>avertissements</div>
    <div class="kpi"><strong>{counts.get('Info',0)}</strong>informations</div></div>
    <p class="callout"><b>Lecture importante :</b> une anomalie détectée est un signal à examiner, pas une autorisation de modifier la source. Les exemples et recommandations sont fournis pour arbitrage métier et conception du flux SSIS.</p></section>
    <section id="sources"><h2>Sources et structure chargées</h2><p>Chaque onglet Excel/ODS est traité comme une table distincte. Les noms de colonnes sont affichés tels qu'ils sont présents dans les sources.</p>
    <div class="table-wrap"><table><thead><tr><th>Source / onglet</th><th>Lignes</th><th>Colonnes</th><th>Liste des colonnes</th></tr></thead><tbody>{''.join(source_rows)}</tbody></table></div>
    <h3>Seuil des valeurs manquantes : plus de 5 %</h3>{over5_html}
    <h3>Visualisations intégrées</h3>{''.join(chart_html)}
    <h3>Paramètres extraits de extrainfos.txt</h3><pre>{html_escape(params_raw or 'Fichier absent ou vide.')}</pre>
    </section>
    <section id="anomalies"><h2>Anomalies détaillées, explications et recommandations</h2>
    <p>Les lignes listées sont des exemples limités à 100 par anomalie; les nombres annoncés correspondent au total détecté. Pour les identifiants de référence introuvables, le détail contient jusqu'à 50 identifiants distincts avec leurs occurrences.</p>
    {''.join(anomaly_cards) if anomaly_cards else '<p>Aucune anomalie selon les règles configurées. Cela ne garantit pas l’absence de défauts non couverts.</p>'}
    </section>
    <section id="catalogue"><h2>Catalogue des anomalies pour SSIS / DW</h2><p>Ce catalogue est une proposition de contrôles de qualité. Les règles de correction ne sont pas exécutées.</p>
    <div class="table-wrap"><table><thead><tr><th>Fichier</th><th>Colonne</th><th>Type anomalie</th><th>Lignes concernées</th><th>Index / lignes source</th><th>Sévérité</th><th>Règle SSIS suggérée</th></tr></thead><tbody>
    {''.join(f"<tr><td>{html_escape(a['fichier'])}</td><td>{html_escape(a['colonne'])}</td><td>{html_escape(a['type'])}</td><td>{a['nb_lignes']}</td><td>{html_escape(a['index'][:1000])}</td><td>{html_escape(a['severite'])}</td><td>{html_escape(a['ssis'])}</td></tr>" for a in anomalies)}
    </tbody></table></div></section>
    <section id="method"><h2>Méthodologie, hypothèses et limites</h2>
    <ul>
      <li>Lecture seule : aucun fichier source n'est écrit, renommé ou modifié par ce script.</li>
      <li>Chargement en chaînes : CSV via <code>dtype=str</code>, XLSX/ODS via <code>dtype=str</code>; les faux-vides sont détectés sans remplacement dans les DataFrames sources.</li>
      <li>Les conversions numériques et dates sont temporaires et servent uniquement à détecter des problèmes.</li>
      <li>Les lignes sont numérotées à partir de 2 pour les fichiers tabulaires, en supposant que la ligne 1 est l'en-tête. Pour les onglets Excel, il s'agit d'un numéro de ligne logique, pas nécessairement du numéro physique si le fichier contient des lignes vides supprimées par pandas.</li>
      <li>Les contrôles de genre à partir du prénom ne sont pas exécutés : une heuristique de nom peut produire des inférences erronées et ne doit pas servir de règle de nettoyage RH.</li>
      <li>Le contrôle « contrat actif avec fin dans le passé » n'est pas automatique si aucune colonne de statut actif/inactif fiable n'est disponible.</li>
      <li>Le contrôle quota légal de congés n'est pas calculé sans quota explicite et applicable dans les sources/paramètres.</li>
      <li>Les contrôles de référence s'exécutent uniquement si les colonnes attendues sont trouvées. Une colonne absente est ignorée plutôt que supposée.</li>
      <li>Le fichier attendance_dataset_2023.csv est analysé localement si présent. Aucun fichier n'est téléchargé par le script.</li>
      <li>Score qualité : indicateur synthétique interne, à interpréter avec prudence; les anomalies peuvent se chevaucher.</li>
    </ul>
    <h3>Priorités conseillées avant le pipeline SSIS</h3>
    <ol>
      <li>Confirmer les clés et relations (CODE, ID_Employee, ID_DEP, ID_Training/id_course).</li>
      <li>Arbitrer les doublons et les références introuvables; ne pas supprimer automatiquement les lignes.</li>
      <li>Documenter les formats de dates, les unités numériques et les catégories autorisées.</li>
      <li>Implémenter des sorties de quarantaine et une table de rejets avec valeur brute, nom du fichier, onglet et numéro de ligne.</li>
      <li>Après validation métier, transformer les contrôles retenus en règles SSIS versionnées et testées.</li>
    </ol></section></main><footer>Rapport généré automatiquement — sources préservées en lecture seule.</footer></body></html>"""
    out_path.write_text(html, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Audit qualité RH en lecture seule; génère un rapport HTML autonome.")
    parser.add_argument("--input-dir", default="./data", help="Dossier contenant les 7 sources (défaut: ./data).")
    parser.add_argument("--output", default="eda_audit_report.html", help="Chemin du rapport HTML généré.")
    args = parser.parse_args()
    root = Path(args.input_dir).expanduser().resolve()
    out_path = Path(args.output).expanduser().resolve()
    if not root.exists():
        print(f"ERREUR: dossier source introuvable: {root}", file=sys.stderr)
        print("Créez ./data et placez-y les fichiers source, ou utilisez --input-dir.", file=sys.stderr)
        sys.exit(2)

    dfs: dict[str, pd.DataFrame] = {}
    sheet_names = {}
    meta = {}
    params_raw = ""
    params = {}
    missing_info = {}
    anomalies: list[dict] = []
    charts: list[dict] = []

    print("=" * 72)
    print("         RAPPORT AUDIT QUALITÉ RH — MODE LECTURE SEULE")
    print("=" * 72)
    for key, filename in FILES.items():
        path = root / filename
        if not path.exists():
            print(f"[ABSENT] {filename} — source ignorée, aucune donnée inventée.")
            continue
        try:
            if key in ("emp", "admin", "admin_att"):
                sheets = load_workbook(path)
                for sheet, df in sheets.items():
                    name = f"{filename} [{sheet}]"
                    df = df.copy()
                    df.insert(0, "_row_number", np.arange(2, len(df) + 2).astype(str))
                    dfs[key if len(sheets) == 1 else f"{key}::{sheet}"] = df
                    sheet_names[key if len(sheets) == 1 else f"{key}::{sheet}"] = name
                    meta[name] = {"rows": len(df), "cols": len(df.columns) - 1, "columns": list(df.columns[1:])}
            elif key in ("attendance", "courses"):
                df, enc, sep = read_csv_robust(path)
                df.insert(0, "_row_number", np.arange(2, len(df) + 2).astype(str))
                dfs[key] = df
                sheet_names[key] = filename
                meta[filename] = {"rows": len(df), "cols": len(df.columns) - 1, "columns": list(df.columns[1:]), "encoding": enc, "separator": sep}
            elif key == "departments":
                sheets = read_ods_all_sheets(path)
                for sheet, df in sheets.items():
                    name = f"{filename} [{sheet}]"
                    df.insert(0, "_row_number", np.arange(2, len(df) + 2).astype(str))
                    dfs[key if len(sheets) == 1 else f"{key}::{sheet}"] = df
                    sheet_names[key if len(sheets) == 1 else f"{key}::{sheet}"] = name
                    meta[name] = {"rows": len(df), "cols": len(df.columns) - 1, "columns": list(df.columns[1:])}
            elif key == "params":
                params_raw, params = parse_param_file(path)
                meta[filename] = {"rows": len(params_raw.splitlines()), "cols": 1, "columns": ["paramètres texte"]}
            print(f"[OK] {filename}")
        except Exception as exc:
            print(f"[ERREUR] {filename}: {exc}", file=sys.stderr)

    # Aplatir les onglets en choisissant le premier onglet pour les contrôles inter-fichiers.
    # Tous les onglets restent inclus dans le profilage et les contrôles génériques.
    primary = {}
    for key in ["emp", "admin", "admin_att", "attendance", "courses", "departments"]:
        if key in dfs:
            primary[key] = dfs[key]
        else:
            candidates = [k for k in dfs if k.startswith(key + "::")]
            if candidates:
                primary[key] = dfs[candidates[0]]
    # Alias vers les clés attendues par les règles inter-fichiers.
    dfs_for_cross = dict(primary)

    # Affichage structure + aperçu de 5 lignes pour chaque table/onglet.
    print("\\n--- PROFIL DES SOURCES ---")
    for key, df in dfs.items():
        display_name = sheet_names.get(key, key)
        data_cols = [c for c in df.columns if c != "_row_number"]
        print(f"\\n{display_name}: {len(df):,} lignes × {len(data_cols)} colonnes")
        print("Colonnes:", ", ".join(map(str, data_cols)))
        print(df[data_cols].head(5).to_string(index=False, max_cols=20))
        # Chaque table/onglet est audité génériquement.
        miss = audit_missing(df, display_name, anomalies, charts)
        missing_info[display_name] = miss
        # Ajouter les numéros de ligne aux anomalies d'audit manquants qui n'avaient pas cet index.
        # Les contrôles détaillés utilisent le DataFrame original avec _row_number.
        audit_duplicates(df, display_name, [
            ["CODE"], ["ID_Employee"], ["REGISTRATION_NUMBER"], ["EMAIL"],
            ["id_course"], ["course_id"], ["Course Name"], ["ID_DEP"], ["DEP"],
            ["ID_Employee", "Date"], ["Employee_ID", "Date"], ["CODE", "Date"],
        ], anomalies, display_name)
        audit_numeric(df, display_name, anomalies, charts)
        audit_dates(df, display_name, anomalies)
        audit_categories(df, display_name, anomalies)

    # Contrôles de quasi-doublons de noms et champs spécifiques.
    for key in ["emp", "admin"]:
        df = dfs_for_cross.get(key)
        if df is None:
            continue
        name_col = find_col(df, ["NAME_EMP", "Employee_Name", "Name"])
        if name_col:
            normalized = df[name_col].astype(str).str.casefold().str.replace(r"\\s+", " ", regex=True).str.strip()
            mask = normalized.duplicated(keep=False) & normalized.ne("")
            if mask.any():
                add_anomaly(anomalies, FILES[key], name_col, "Noms identiques après normalisation", df.loc[mask].copy(), "Info",
                            f"{int(mask.sum())} lignes ont un nom identique après neutralisation de la casse et des espaces multiples. Ce signal ne prouve pas que les employés sont identiques.",
                            "Comparer les identifiants, la date de naissance si elle est légalement disponible et d'autres attributs autorisés; ne pas fusionner sur le seul nom.",
                            "SSIS: générer une clé de rapprochement indicative et soumettre les candidats à une validation humaine.")
        for column in (["REGISTRATION_NUMBER", "EMAIL"] if key == "emp" else ["REGISTRATION_NUMBER", "EMAIL"]):
            col = find_col(df, [column])
            if col:
                val = df[col].astype(str).str.strip().str.casefold()
                mask = val.duplicated(keep=False) & ~val.isin(MISSING_TOKENS_NORMALIZED)
                if mask.any():
                    add_anomaly(anomalies, FILES[key], col, f"Doublons sur {column}", df.loc[mask].copy(), "Avertissement",
                                f"{int(mask.sum())} lignes partagent une valeur de {column}; vérifier si la valeur doit être unique.",
                                "Comparer les lignes concernées et confirmer la règle d'unicité métier.",
                                f"SSIS: profiler les doublons de {column}; mettre les cas en revue sans suppression automatique.")

    # Dédoublonner les contrôles redondants par signature de règle, en gardant l'information la plus précise.
    audit_cross_file(dfs_for_cross, anomalies, params)

    # Imprimer le catalogue synthétique.
    total_rows = sum(len(df) for df in dfs.values())
    total_cols = sum(len(df.columns) - (1 if "_row_number" in df.columns else 0) for df in dfs.values())
    total_cells = sum(len(df) * (len(df.columns) - (1 if "_row_number" in df.columns else 0)) for df in dfs.values())
    score = quality_score(anomalies, total_rows, total_cells)
    counts = Counter(a["severite"] for a in anomalies)
    print("\\n" + "=" * 72)
    print("RÉSUMÉ")
    print("-" * 72)
    print(f"Sources tabulaires/onglets analysés : {len(dfs)}")
    print(f"Lignes totales : {total_rows:,}")
    print(f"Colonnes totales : {total_cols:,}")
    print(f"Anomalies détectées : {len(anomalies)} (critique={counts.get('Critique',0)}, avertissement={counts.get('Avertissement',0)}, info={counts.get('Info',0)})")
    print(f"Score qualité indicatif : {score:.1f}%")
    print("Aucune donnée source modifiée.")
    try:
        report_html(dfs, sheet_names, meta, missing_info, anomalies, charts, params_raw, out_path)
        print(f"Rapport HTML généré : {out_path}")
    except Exception as exc:
        print(f"ERREUR génération HTML : {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
