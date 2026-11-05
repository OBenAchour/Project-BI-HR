# Scripts du rapport Power BI

Ces scripts produisent le modèle et les pages de `RH_Report.pbip`, puis les testent rôle par rôle.
Rôles, étapes de test et répartition : [docs/GUIDE_ROLES_POWERBI.md](../../docs/GUIDE_ROLES_POWERBI.md).

| Fichier | Rôle |
| --- | --- |
| `acteurs.mjs` | Les 7 acteurs de la présentation (slides 20 à 22) : pages, rôles, ce que chacun peut décider. Source commune du modèle et des pages |
| `measures.mjs` | Les 69 mesures DAX : 59 mesures métier (verrouillées hors des pages du rôle) et 10 mesures de sécurité et d'accueil |
| `gen_model.mjs` | Écrit dans le modèle : la table `Mesures`, la table cachée `Acteurs`, le libellé lisible du département et les 10 rôles |
| `gen_report.mjs` | Écrit l'accueil et les 8 pages d'acteurs (masquées, filtre de page verrouillé), plus le thème `RH_Pilotage.json` |
| `test_report.mjs` | Test complet : rejoue la requête de chaque visuel pour chaque rôle et vérifie données, verrou, département et bouton de l'accueil |
| `run_dax.ps1` | Exécute une liste de requêtes DAX (JSON) sur le modèle ouvert dans Desktop, une connexion par rôle |
| `gen_test_dax.mjs` | Écrit deux requêtes DAX de contrôle (`test_total.dax`, `test_dep.dax`) |
| `as.ps1` | Envoie une requête DAX au modèle ouvert dans Power BI Desktop (`-Roles` pour tester un rôle) |

## Régénérer le modèle et les pages

1. **Fermer Power BI Desktop** (sinon il écrase les fichiers en enregistrant).
2. Lancer :

   ```bash
   node powerbi/scripts/gen_model.mjs
   node powerbi/scripts/gen_report.mjs
   ```

3. Rouvrir `RH_Report.pbip`.

⚠️ Les scripts **remplacent** la table `Mesures`, la table `Acteurs`, les rôles et toutes les pages : une modification faite à la main dans Desktop sur ces éléments est perdue. Modifier les scripts plutôt que le rapport.

## Tester

Power BI Desktop ouvert sur `RH_Report.pbip`, le port du modèle est dans `%USERPROFILE%\Microsoft\Power BI Desktop Store App\AnalysisServicesWorkspaces\*\Data\msmdsrv.port.txt` (version Microsoft Store) ou `%LOCALAPPDATA%\Microsoft\Power BI Desktop\AnalysisServicesWorkspaces\*\Data\msmdsrv.port.txt` (version classique) :

```bash
node powerbi/scripts/test_report.mjs <port>
```

Résultat attendu : `Échecs : 0`. Contrôle ponctuel d'un rôle :

```powershell
.\powerbi\scripts\as.ps1 -Port <port> -Roles "Manager Télécom" -Query "EVALUATE ROW(""Effectif"", [Effectif])"
```

Résultat attendu : 439.
