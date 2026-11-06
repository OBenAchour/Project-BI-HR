"""Segmentation des collaborateurs en profils (K-means).

Entrée  : ml/variables_employes.csv (export du modèle : node ml/export_variables.mjs <port>)
Sorties : ml/profils_employes.csv  (employe_bk, profil_ordre)
          ml/profils_resume.json   (méthode, scores, description de chaque profil)

Méthode
- Une ligne par employé présent sur la dernière photo RH (2 726).
- 4 variables numériques, standardisées : ancienneté, expérience, coût mensuel estimé, part de journées > 8 h.
  Écartées : retard (uniforme), congés pris (redondant avec le solde), solde de congés (sans structure),
  formations (absentes pour tout le pôle administratif : la variable ne ferait que séparer les pôles).
- Valeurs manquantes : heures et part de journées > 8 h remplacées par la médiane du pôle
  (employés sans pointage retenu) ; part > 8 h = 0 quand l'employé pointe sans dépasser 8 h.
- K-means (scikit-learn), k testé de 2 à 7, 20 initialisations, graine fixe (résultat reproductible).
  k = 4 retenu : silhouette quasi égale au meilleur k >= 3, et 4 profils lisibles pour la DRH.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

ICI = Path(__file__).resolve().parent
VARIABLES = ['anciennete_ans', 'experience_ans', 'cout_mensuel', 'pct_jours_8h']
K_RETENU = 4
GRAINE = 42

# ---------- données
d = pd.read_csv(ICI / 'variables_employes.csv')
d = d[d['departement'].notna()].copy()           # employés sans photo RH : écartés
d['pct_jours_8h'] = np.where(d['heures_jour'].notna() & d['pct_jours_8h'].isna(), 0, d['pct_jours_8h'])
for c in ['heures_jour', 'pct_jours_8h']:
    d[c] = d[c].fillna(d.groupby('pole')[c].transform('median'))
d['experience_ans'] = d['experience_ans'].fillna(d['experience_ans'].median())
d['nb_formations'] = d['nb_formations'].fillna(0)
X = StandardScaler().fit_transform(d[VARIABLES])

# ---------- choix de k
scores = {}
for k in range(2, 8):
    labels = KMeans(n_clusters=k, n_init=20, random_state=GRAINE).fit_predict(X)
    scores[k] = round(float(silhouette_score(X, labels)), 3)

modele = KMeans(n_clusters=K_RETENU, n_init=20, random_state=GRAINE).fit(X)
d['groupe'] = modele.labels_
silhouette = scores[K_RETENU]

# ---------- portrait de chaque groupe (unités d'origine)
portrait = d.groupby('groupe').agg(
    effectif=('employe_bk', 'size'),
    anciennete_ans=('anciennete_ans', 'mean'),
    experience_ans=('experience_ans', 'mean'),
    cout_mensuel=('cout_mensuel', 'mean'),
    pct_jours_8h=('pct_jours_8h', 'mean'),
    part_administratif=('pole', lambda s: float((s == 'Administratif').mean())),
)

# ---------- noms : règles sur les centres (reproductibles)
reste = list(portrait.index)
def prendre(colonne):
    g = portrait.loc[reste, colonne].idxmax()
    reste.remove(g)
    return g
noms = {}
noms[prendre('pct_jours_8h')] = 'Administratifs à horaires longs'
noms[prendre('anciennete_ans')] = 'Piliers expérimentés'
noms[prendre('experience_ans')] = 'Experts recrutés récemment'
noms[reste[0]] = 'Profils juniors'
ORDRE = ['Piliers expérimentés', 'Experts recrutés récemment', 'Profils juniors', 'Administratifs à horaires longs']

def description(nom, p):
    a, e, c, h = p['anciennete_ans'], p['experience_ans'], p['cout_mensuel'], p['pct_jours_8h']
    txt = {
        'Piliers expérimentés': f"{a:.0f} ans d'ancienneté, {e:.0f} ans d'expérience : la mémoire de l'entreprise, à fidéliser (tutorat).",
        'Experts recrutés récemment': f"{e:.0f} ans d'expérience mais {a:.0f} ans d'ancienneté : des compétences venues d'ailleurs, à retenir.",
        'Profils juniors': f"{e:.0f} ans d'expérience, {a:.0f} ans d'ancienneté : des profils à faire monter en compétences.",
        'Administratifs à horaires longs': f"Pôle administratif, {h * 100:.0f} % de journées au-delà de 8 h, coût moyen de {c:,.0f} : charge à surveiller.".replace(f"{c:,.0f}", f"{c:,.0f}".replace(',', ' ')),
    }
    return txt[nom]

d['profil'] = d['groupe'].map(noms)
d['profil_ordre'] = d['profil'].map({n: i + 1 for i, n in enumerate(ORDRE)})
d[['employe_bk', 'profil_ordre']].sort_values('employe_bk').to_csv(ICI / 'profils_employes.csv', index=False)

profils = []
for nom in ORDRE:
    g = [k for k, v in noms.items() if v == nom][0]
    p = portrait.loc[g]
    profils.append({
        'ordre': ORDRE.index(nom) + 1,
        'profil': nom,
        'description': description(nom, p),
        'effectif': int(p['effectif']),
        'anciennete_ans': round(float(p['anciennete_ans']), 1),
        'experience_ans': round(float(p['experience_ans']), 1),
        'cout_mensuel': round(float(p['cout_mensuel'])),
        'pct_jours_8h': round(float(p['pct_jours_8h']), 3),
        'part_administratif': round(float(p['part_administratif']), 3),
    })

resume = {
    'methode': 'K-means (scikit-learn), variables standardisées',
    'variables': VARIABLES,
    'employes': int(len(d)),
    'k_retenu': K_RETENU,
    'silhouette_par_k': scores,
    'silhouette': silhouette,
    'graine': GRAINE,
    'profils': profils,
}
(ICI / 'profils_resume.json').write_text(json.dumps(resume, ensure_ascii=False, indent=2), encoding='utf-8')

print(f"{len(d)} employés · k = {K_RETENU} · silhouette {silhouette} · scores {scores}")
for p in profils:
    print(f"  {p['ordre']}. {p['profil']} : {p['effectif']} employés")
