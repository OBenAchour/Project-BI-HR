# Segmentation des collaborateurs (machine learning)

Regroupe les 2 726 collaborateurs de la dernière photo RH en **4 profils** avec un K-means. Les profils sont affichés sur la page **DRH · 3/3 · Profils des collaborateurs** du rapport Power BI.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `export_variables.mjs` | Exporte une ligne par employé depuis le modèle ouvert dans Power BI Desktop → `variables_employes.csv` |
| `segmentation_employes.py` | Standardise les variables, teste k = 2 à 7, applique le K-means retenu et nomme les profils |
| `variables_employes.csv` | Variables par employé (export du modèle) |
| `profils_employes.csv` | Profil de chaque employé (`employe_bk`, `profil_ordre`) : lu par `powerbi/scripts/gen_model.mjs` |
| `profils_resume.json` | Méthode, scores de silhouette et description des profils : lu par les générateurs du modèle et des pages |
| `requirements.txt` | Bibliothèques Python nécessaires |

## Méthode

- **Variables (4, standardisées)** : ancienneté, années d'expérience, coût mensuel estimé, part des journées de plus de 8 h.
- **Variables écartées** :
  - taux de retard : arrivées uniformes entre 8 h et 9 h, sans information ;
  - congés pris : redondant avec le solde (pris + solde ≈ 30 jours) ;
  - solde de congés : sans structure, il dégradait la silhouette ;
  - formations : absentes pour tout le pôle administratif, la variable ne ferait que séparer les deux pôles.
- **Valeurs manquantes** : heures et part de journées > 8 h remplacées par la médiane du pôle (employés sans pointage retenu) ; part > 8 h = 0 quand l'employé pointe sans dépasser 8 h.
- **Modèle** : `KMeans` de scikit-learn, 20 initialisations, graine 42 (résultat reproductible).
- **Choix de k** : silhouette 0,324 (k = 2), 0,298 (k = 3), **0,288 (k = 4)**, 0,250 (k = 5). k = 4 est retenu : silhouette quasi égale au meilleur k ≥ 3, et il distingue les juniors des experts recrutés récemment, ce que k = 3 confond.
- **Lecture** : une silhouette entre 0,25 et 0,5 indique une structure réelle mais modérée. Les profils décrivent l'effectif ; ce n'est pas une prédiction.

## Les 4 profils

| Profil | Effectif | Ce qui le caractérise |
| --- | --- | --- |
| Piliers expérimentés | 529 | 18 ans d'ancienneté, 16 ans d'expérience : la mémoire de l'entreprise |
| Experts recrutés récemment | 528 | 22 ans d'expérience mais 7 ans d'ancienneté : des compétences venues d'ailleurs |
| Profils juniors | 536 | 6 ans d'expérience, 7 ans d'ancienneté : à faire monter en compétences |
| Administratifs à horaires longs | 1 133 | Pôle administratif, 25 % de journées au-delà de 8 h, coût moyen de 5 491 |

## Relancer

```bash
pip install -r ml/requirements.txt
node ml/export_variables.mjs <port>
python ml/segmentation_employes.py
node powerbi/scripts/gen_model.mjs
```

Le port est celui du modèle ouvert dans Power BI Desktop (voir `powerbi/scripts/README.md`). Fermer Desktop avant `gen_model.mjs`.
