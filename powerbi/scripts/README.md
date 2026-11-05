# Scripts du rapport Power BI

Ces scripts ont généré les pages de `RH_Report.pbip` (accueil + OM1 à OM6).

| Fichier | Rôle |
| --- | --- |
| `measures.mjs` | Les 57 mesures DAX (nom, formule, format, dossier). Elles sont déjà dans le modèle (`RH_Report.SemanticModel/definition/tables/Mesures.tmdl`) |
| `gen_report.mjs` | Écrit les 7 pages et leurs visuels dans `RH_Report.Report/definition/pages`, plus le thème `RH_Pilotage.json` |
| `gen_test_dax.mjs` | Écrit deux requêtes DAX de contrôle (`test_total.dax`, `test_dep.dax`) |
| `as.ps1` | Envoie une requête DAX au modèle ouvert dans Power BI Desktop (`-Roles` pour tester un rôle) |

## Régénérer les pages

1. **Fermer Power BI Desktop** (sinon il écrase les fichiers en enregistrant).
2. Lancer :

   ```bash
   node powerbi/scripts/gen_report.mjs
   ```

3. Rouvrir `RH_Report.pbip`.

⚠️ Le script **remplace toutes les pages** : une modification faite à la main dans Desktop sur ces pages est perdue. Modifier le script plutôt que la page.

## Contrôler les chiffres d'un rôle

Power BI Desktop ouvert, le port du modèle est dans `%LOCALAPPDATA%\Microsoft\Power BI Desktop\AnalysisServicesWorkspaces\*\Data\msmdsrv.port.txt` :

```powershell
.\powerbi\scripts\as.ps1 -Port <port> -Roles "Manager Télécom" -Query "EVALUATE ROW(""Effectif"", [Effectif])"
```

Résultat attendu : 439.
