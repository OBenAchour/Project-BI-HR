# Guide des rôles du rapport Power BI

> Un seul rapport, `RH_Report.pbip`. Chaque rôle ne voit que son tableau de bord : l'accueil n'ouvre que la page du rôle, et toute autre page affiche « Accès non autorisé pour votre profil » sans aucune donnée.
> Rôles et pages : présentation, slides 20 à 22 (acteurs consommateurs).

## 1. Les rôles et ce qu'ils voient

| Rôle | Page(s) ouverte(s) | Décisions | Périmètre |
| --- | --- | --- | --- |
| Direction générale | Direction générale | Arbitrer budget et capacités entre départements | Les 4 départements |
| DRH | DRH · 1/2 et DRH · 2/2 | Fixer les priorités RH de l'entreprise | Les 4 départements |
| Contrôle de gestion et paie | Contrôle de gestion et paie | Suivre la masse salariale et les heures sup | Les 4 départements |
| Resp. administration du personnel | Administration du personnel | Corriger les contrats, suivre échéances et congés | Les 4 départements, détail par employé |
| Resp. formation | Formation | Orienter les parcours de formation par métier | Les 4 départements |
| Resp. recrutement | Recrutement | Choisir les canaux de recrutement | Les 4 départements, vue agrégée |
| Manager Informatique | Managers de département | Piloter charge, assiduité, congés et échéances de l'équipe | Informatique seulement |
| Manager Télécom | Managers de département | idem | Télécom seulement |
| Manager Communication | Managers de département | idem | Communication seulement |
| Manager Administration | Managers de département | idem | Administration seulement |
| *(aucun rôle : propriétaire du rapport)* | Toutes les pages | Accès complet | Les 4 départements |

## 2. Répartition entre les membres

Chacun présente un rôle **en direct avec son propre compte** dans le service Power BI, et un second rôle montré par le propriétaire avec **Tester en tant que rôle** (section 3, étape 6). La DRH compte double : deux pages.

| Membre | Rôle sur son compte (en direct) | Rôle montré avec « Tester en tant que rôle » |
| --- | --- | --- |
| Membre 1 | DRH | — (deux pages) |
| Membre 2 | Direction générale | Manager Informatique |
| Membre 3 | Contrôle de gestion et paie | Manager Communication |
| Membre 4 | Resp. administration du personnel | Manager Administration |
| Membre 5 | Resp. formation | Resp. recrutement |
| Membre 6 | Manager Télécom | Démonstration de la sécurité (section 6) |

Le propriétaire du rapport (administrateur de l'espace de travail) ouvre l'accueil en accès complet.

## 3. Donner un accès et un rôle à chaque membre (service Power BI)

Prérequis : chaque membre a un compte de l'organisation (adresse `@esprit.tn`) et une licence Power BI Pro, l'essai gratuit de 60 jours suffit. Si l'espace de travail est sur une capacité d'essai Fabric, une licence gratuite suffit pour lire.

1. **Espace de travail partagé** : sur app.powerbi.com, **Espaces de travail** → **Nouvel espace de travail** (par exemple *Pilotage RH*). « Mon espace de travail » ne permet pas de gérer les accès par rôle.
2. **Publier** : dans Power BI Desktop, **Accueil** → **Publier** → choisir *Pilotage RH*.
3. **Ajouter les membres** : dans l'espace *Pilotage RH*, **Gérer l'accès** → **Ajouter des personnes ou des groupes** → saisir l'adresse du membre → rôle **Lecteur** → **Ajouter**.
   ⚠️ Toujours **Lecteur** : les rôles Administrateur, Membre et Contributeur ignorent la sécurité par ligne et voient tout.
4. **Affecter un rôle** : dans l'espace, sur le modèle sémantique **RH_Report** → **⋯** → **Sécurité**. Choisir le rôle à gauche, saisir l'adresse du membre, **Ajouter**, puis **Enregistrer**. Faire de même pour chaque membre (tableau de la section 2).
   ⚠️ **Un seul rôle par personne** : deux rôles se cumulent. Un membre à la fois *Direction générale* et *Manager Télécom* verrait les deux pages, et la page Managers sur les 4 départements.
5. **Ouvrir le rapport (chaque membre)** : app.powerbi.com → **Espaces de travail** → *Pilotage RH* → **RH_Report**. Seul l'**Accueil** apparaît dans la liste des pages ; le bouton **Ouvrir mon tableau de bord →** ouvre la page du rôle.
6. **Tester en tant que rôle (propriétaire)** : modèle sémantique **RH_Report** → **⋯** → **Sécurité** → **⋯** à côté du rôle → **Tester en tant que rôle**. Le rapport s'ouvre comme le verrait ce rôle ; c'est ainsi qu'on montre les rôles sans compte dédié.

Bon à savoir :

- **Pas d'actualisation dans le service** : la source SQL Server est sur un réseau privé ; le service garde les données publiées. Ne pas programmer d'actualisation. Pour mettre à jour, actualiser dans Desktop puis republier : les membres affectés aux rôles sont conservés.
- **Propriétaire** : en tant qu'administrateur de l'espace, il voit toutes les pages (accès complet).

## 4. Voir le rapport avec un rôle (Power BI Desktop)

1. Ouvrir `RH_Report.pbip` dans Power BI Desktop. Les données importées sont dans le cache local ; sur un nouveau poste, se connecter à `RH_Data_Warehouse` avec le login `BI` puis cliquer sur **Actualiser** (voir [SETUP.md](SETUP.md)).
2. Ruban **Modélisation** → **Afficher en tant que** → cocher **un seul rôle** → **OK**. Une barre jaune « Affichage en tant que : *rôle* » apparaît en haut du rapport.
3. Sur l'**Accueil**, vérifier le message « Bienvenue · *acteur* ».
4. **Ctrl + clic** sur **Ouvrir mon tableau de bord →** (dans Desktop, un simple clic sélectionne le bouton).
5. **Ctrl + clic** sur **← Accueil** pour revenir (DRH : **Page suivante →** et **← Page précédente**).
6. Pour changer de rôle : **Arrêter l'affichage** dans la barre jaune, puis recommencer à l'étape 2.
7. En fermant Desktop sans avoir rien modifié, choisir **Ne pas enregistrer**.

## 5. Valeurs attendues (photo du 30/10/2026)

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

## 6. Démonstration de la sécurité

1. **Accès complet** (propriétaire, sans rôle) : l'accueil affiche « Bienvenue » et « Accès complet à l'ensemble des tableaux de bord RH » ; le bouton ouvre la Direction générale et toutes les pages sont accessibles.
2. **Un rôle, page d'un autre acteur** : par exemple **Resp. formation**, puis ouvrir la page **DRH · 1/2** (onglet dans Desktop). Le bandeau rouge « Accès non autorisé pour votre profil » apparaît, les cartes et les graphiques sont vides. Dans le service, un lecteur ne voit même pas cette page dans la liste.
3. **Manager** : **Manager Télécom** → la page Managers affiche « Département : Télécom » et 439 employés.

## 7. Comment c'est construit

- **Table cachée `Acteurs`** : une ligne par page d'acteur (acteur, nom de la page, ordre, décisions, vue).
- **Rôles** : chaque rôle filtre `Acteurs[acteur]` sur son acteur. Les 4 rôles managers filtrent en plus `dim_departement` et `dim_employe` sur leur département.
- **Accueil** : la mesure `Page de l'acteur` donne le nom de la première page visible ; c'est la destination du bouton.
- **Pages d'acteurs** : masquées, avec un filtre de page verrouillé `Acteurs[page] = <la page>`. Pour un autre rôle, ce filtre ne laisse aucune ligne : `[Accès page]` vaut 0.
- **Verrou des données** : toutes les mesures métier renvoient vide quand `[Accès page]` = 0 ; les cartes passent en blanc sur blanc et le bandeau d'accès s'affiche.
- **Données personnelles** : nom, e-mail et adresses sont retirés dans Power Query ; le détail par employé n'affiche que l'identifiant.

## 8. Régénérer et retester

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
