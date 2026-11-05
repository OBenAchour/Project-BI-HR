# Guide des rôles du rapport Power BI

> Un seul rapport, `RH_Report.pbip`. Chaque rôle ne voit que son tableau de bord : l'accueil n'ouvre que la page du rôle, et toute autre page affiche « Accès réservé » sans aucune donnée.
> Rôles et pages : présentation, slides 20 à 22 (acteurs consommateurs).

## 1. Les rôles et ce qu'ils voient

| Rôle (Afficher en tant que) | Page(s) ouverte(s) | Ce que le rôle peut décider | Périmètre |
| --- | --- | --- | --- |
| Direction générale | Direction générale | Arbitrer budget et capacités entre départements | Les 4 départements |
| DRH | DRH · 1/2 et DRH · 2/2 | Fixer les priorités RH sur les six objectifs | Les 4 départements |
| Contrôle de gestion et paie | Contrôle de gestion et paie | Suivre la masse salariale et les heures sup | Les 4 départements |
| Resp. administration du personnel | Administration du personnel | Corriger les contrats, suivre échéances et congés | Les 4 départements, détail par employé |
| Resp. formation | Formation | Orienter les parcours de formation par métier | Les 4 départements |
| Resp. recrutement | Recrutement | Choisir les canaux de recrutement | Les 4 départements, vue agrégée |
| Manager Informatique | Managers de département | Piloter charge, assiduité, congés et échéances de son équipe | Informatique seulement |
| Manager Télécom | Managers de département | idem | Télécom seulement |
| Manager Communication | Managers de département | idem | Communication seulement |
| Manager Administration | Managers de département | idem | Administration seulement |

## 2. Répartition entre les membres

Chacun présente deux « parts » de démonstration (la DRH compte double : deux pages).

| Membre | Rôles à présenter |
| --- | --- |
| Membre 1 | DRH (pages 1/2 et 2/2) |
| Membre 2 | Direction générale · Manager Informatique |
| Membre 3 | Contrôle de gestion et paie · Manager Télécom |
| Membre 4 | Resp. administration du personnel · Manager Communication |
| Membre 5 | Resp. recrutement · Manager Administration |
| Membre 6 | Resp. formation · démonstration de la sécurité (section 5) |

## 3. Voir le rapport avec un rôle (Power BI Desktop)

1. Ouvrir `RH_Report.pbip` dans Power BI Desktop. Les données importées sont dans le cache local ; sur un nouveau poste, se connecter à `RH_Data_Warehouse` avec le login `BI` puis cliquer sur **Actualiser** (voir [SETUP.md](SETUP.md)).
2. Ruban **Modélisation** → **Afficher en tant que**.
3. Cocher **un seul rôle** (ne pas cocher « Autre utilisateur »), puis **OK**. Une barre jaune « Affichage en tant que : *rôle* » apparaît en haut du rapport.
4. Sur l'**Accueil**, vérifier le message « Bienvenue · *acteur* ».
5. **Ctrl + clic** sur **Ouvrir mon tableau de bord →** : dans Desktop, un bouton s'active avec Ctrl + clic (un simple clic le sélectionne).
6. Lire la page : bandeau avec ce que l'acteur peut décider, périmètre, KPI, graphiques, limites en bas de page.
7. **Ctrl + clic** sur **← Accueil** pour revenir (DRH : **Page suivante →** et **← Page précédente** entre ses deux pages).
8. Pour changer de rôle : **Arrêter l'affichage** dans la barre jaune, puis recommencer à l'étape 2.

Plusieurs rôles cochés en même temps cumulent leurs droits : pour la démonstration, toujours un seul rôle.

## 4. Valeurs attendues (photo du 30/10/2026)

Valeurs telles qu'elles s'affichent dans les cartes (format d'affichage anglais du modèle : point décimal, M = millions, K = milliers).

| Page (rôle) | Cartes KPI |
| --- | --- |
| Direction générale | Effectif 2,726 · Taux d'occupation 115.4% · % contrats courts 67.0% · Coût total estimé 11.3M · Écart H/F médian 1.2% · Échéances à 90 jours 95 |
| DRH · 1/2 (DRH) | Effectif 2,726 · Taux d'occupation 115.4% · % contrats courts 67.0% · Coût total estimé 11.3M · Écart H/F médian 1.2% · Heures par jour 6.49 |
| DRH · 2/2 (DRH) | Couverture formation 99.3% · Formations par employé 13.0 · Consommation des droits 50.4% · % dernier congé maladie 23.7% · Échéances à 90 jours 95 · Taux d'anomalies 71.3% |
| Contrôle de gestion et paie | Coût total estimé 11.3M · Masse salariale 5.8M · Coût vacataires 2.6M · Coût heures sup admin 2.9M · Heures sup pointées 9,155 h · Coût heures sup pointées 205.9K |
| Administration du personnel (Resp. administration du personnel) | Employés en anomalie 1,945 · Taux d'anomalies 71.3% · Échéances à 30 jours 25 · Échéances à 90 jours 95 · Solde moyen 14.8 · % soldes élevés 33.9% · tableau : 2 726 employés |
| Formation (Resp. formation) | Couverture formation 99.3% · Employés formés 1,437 · Inscriptions 18,618 · Formations par employé 13.0 · Cours suivis 3,499 · Taux d'utilisation du catalogue 99.3% |
| Recrutement (Resp. recrutement) | Effectif 2,726 · Capacité 2,363 · Taux d'occupation 115.4% · % contrats courts 67.0% · Ancienneté moyenne 9.2 ans · % ancienneté < 1 an 2.0% |

Page **Managers de département**, selon le rôle :

| Rôle | Périmètre affiché | Effectif | Taux d'occupation | Heures par jour | Taux de retard | Consommation des droits | Échéances à 90 jours |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Manager Informatique | Département : Informatique | 501 | 83.4% | 6.50 | 49.1% | 49.5% | 11 |
| Manager Télécom | Département : Télécom | 439 | 146.3% | 6.49 | 49.2% | 49.7% | 7 |
| Manager Communication | Département : Communication | 507 | 40.2% | 6.50 | 49.0% | 52.6% | 19 |
| Manager Administration | Département : Administration | 1,279 | 639.5% | 6.47 | 51.3% | 50.2% | 58 |

La somme des quatre effectifs fait 2 726 : chaque manager ne voit que son département.

## 5. Démonstration de la sécurité

1. **Sans rôle** (mode conception) : l'accueil affiche « Mode conception : aucun rôle actif » et le bouton est inactif. Le concepteur voit toutes les pages : c'est le rôle de l'auteur du rapport.
2. **Avec un rôle, page d'un autre acteur** : par exemple *Afficher en tant que* **Resp. formation**, puis cliquer sur l'onglet **DRH · 1/2**. Le bandeau rouge « Accès réservé : cette page ne fait pas partie de votre rôle » apparaît, les cartes et les graphiques sont vides.
3. **Manager** : *Afficher en tant que* **Manager Télécom** → la page Managers affiche « Département : Télécom » et 439 employés.
4. Les onglets des pages d'acteurs portent l'icône « page masquée » : dans le service Power BI, un lecteur ne les voit pas et n'y entre que par le bouton de l'accueil. Dans Desktop, l'auteur voit toujours les onglets, d'où le verrou sur les données.

## 6. Comment c'est construit

- **Table cachée `Acteurs`** : une ligne par page d'acteur (acteur, nom de la page, ordre, décision, vue).
- **Rôles** : chaque rôle filtre `Acteurs[acteur]` sur son acteur. Les 4 rôles managers filtrent en plus `dim_departement` et `dim_employe` sur leur département.
- **Accueil** : la mesure `Page de l'acteur` donne le nom de la page du rôle ; c'est la destination du bouton (vide = bouton inactif).
- **Pages d'acteurs** : masquées, avec un filtre de page verrouillé `Acteurs[page] = <la page>`. Pour un autre rôle, ce filtre ne laisse aucune ligne : `[Accès page]` vaut 0.
- **Verrou des données** : toutes les mesures métier renvoient vide quand `[Accès page]` = 0 ; les cartes passent en blanc sur blanc et le bandeau « Accès réservé » s'affiche.
- **Données personnelles** : nom, e-mail et adresses sont retirés dans Power Query ; le détail par employé n'affiche que l'identifiant.

## 7. Régénérer et retester

Power BI Desktop **fermé** (sinon il écrase les fichiers en enregistrant) :

```bash
node powerbi/scripts/gen_model.mjs
node powerbi/scripts/gen_report.mjs
```

Puis ouvrir `RH_Report.pbip` et lancer le test complet (port : `msmdsrv.port.txt` dans `%USERPROFILE%\Microsoft\Power BI Desktop Store App\AnalysisServicesWorkspaces\*\Data\` pour la version Microsoft Store, ou `%LOCALAPPDATA%\Microsoft\Power BI Desktop\AnalysisServicesWorkspaces\*\Data\` pour la version classique) :

```bash
node powerbi/scripts/test_report.mjs <port>
```

Le test rejoue la requête de chaque visuel pour chaque rôle et vérifie : aucune erreur, des données sur les pages du rôle, aucune donnée ailleurs, un seul département pour les managers, et la bonne destination du bouton de l'accueil.
