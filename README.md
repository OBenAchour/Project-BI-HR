# Project BI HR — HR analytics Data Warehouse

> Turn raw HR files into a star-schema Data Warehouse, loaded by SSIS, ready for Power BI.

**Academic project · 4SDE · group of 6**

## In one picture

```
7 source files ──► RH_Staging_Area (stg) ──► RH_Data_Warehouse (dw) ──► Power BI
 (xlsx/csv/ods/txt)   Load_Staging_Area.dtsx   Load_DW.dtsx
```

## What's inside

| Folder / file | What it is |
| --- | --- |
| `DataSet/` | The 7 source files (employees, attendance, courses, departments, rates) |
| `eda_audit_pipeline.py` | Data quality audit of the 7 files (read-only) |
| `eda_audit_report.html` | Audit report it generates: 42 anomalies, impact, proposed fix |
| `Projet_EDA_BI_RH.pptx` | EDA presentation: business objectives OM1–OM6, KPIs and the 7 actors who consume them |
| `sql/staging_area.sql` | Creates the 7 `stg` tables: file columns only, typed as SSIS reads them |
| `sql/data_warehouse.sql` | Creates the DW tables in `RH_Data_Warehouse` (17 tables; rows without a match are dropped at load time) |
| `Project BI HR/` | SSIS project (Visual Studio 2022) |
| `RH_Report.pbip` | Power BI report (Power BI project format): a home page and one hidden page per actor; each of the 10 roles only sees its own page |
| `powerbi/scripts/` | Scripts that generate the model and the report pages, and test every role |
| `ml/` | Employee segmentation (K-means, scikit-learn): 4 profiles shown on the *DRH · 3/3* page |
| `docs/Rapport_Projet_BI_RH.pdf` | Full project report (French, 67 pages): data, audit, DW, Power BI model, security, every report page, machine learning, tests, team guide |
| `docs/CONCEPTION_DW.md` | DW design: model, bus matrix, every fact and dimension |
| `docs/GUIDE_RECONSTRUCTION_DW.md` | Step-by-step guide to the DW load in SSDT (components, expressions, table fiches) |
| `docs/` | Also: setup guide + team conventions |

## The staging area (schema `stg`)

- **Raw copy of the files:** no added column, no transformation in SSIS or in the files.
- **Type differences are handled in the database:** each `stg` column has the type SSIS reads (`float` for Excel numbers, `datetime` for Excel dates, UTF-8 `varchar` for UTF-8 text).
- **All cleaning happens in the DW load.**

## The Data Warehouse (schema `dw`)

The tables are created in `RH_Data_Warehouse` and loaded by `Load_DW.dtsx` (4 containers: generated tables, sub-dimensions, dimensions, facts):

👉 **Design:** [docs/CONCEPTION_DW.md](docs/CONCEPTION_DW.md)
👉 **How to load it:** [docs/GUIDE_RECONSTRUCTION_DW.md](docs/GUIDE_RECONSTRUCTION_DW.md)

- **3 fact tables:** `fact_pointage` (employee × day, 169,561 rows), `fact_effectif_snapshot` (employee × snapshot, 2,726), `fact_inscription_formation` (employee × course × snapshot, 18,618)
- **9 dimensions:** date, time, employee (SCD 2), department, contract, position, leave type, course, hourly rate
- **Anomalies are dropped, not flagged:** attendance days with incoherent hours or after the contract end are not loaded
- **5 sub-dimensions (snowflake):** diploma, hiring channel, pole, university, course level
- **No bridge table:** languages and technologies become yes/no flags, enrolments are fact rows
- **No "unknown" member:** a row whose key isn't found, or whose required value is unreadable, is dropped at load time
- **Visual SSIS components** — SQL is used only to create the tables, generate the date and time rows, and update existing rows of the 2 history-tracked (SCD 2) dimensions
- **Nothing is ever deleted:** no table or row is removed from dimensions or facts; a reload only adds missing rows
- **One Lookup per link, plus one:** each load has one Lookup per foreign key, then a last Lookup on the table itself whose *No Match* output feeds the destination

## The Power BI report

Open `RH_Report.pbip` in Power BI Desktop, sign in to `RH_Data_Warehouse` with the `BI` login, then click **Refresh**: the imported data is not in Git.

👉 **Roles, test steps and team split:** [docs/GUIDE_ROLES_POWERBI.md](docs/GUIDE_ROLES_POWERBI.md)

- **One report, one view per actor** (presentation slides 20–22): each role only sees its own dashboard. The home page greets the role and has a single button that opens the role's page
- **9 hidden actor pages:** *Direction générale*, *DRH* (three pages, the third one shows the employee profiles), *Contrôle de gestion et paie*, *Administration du personnel* (detail per employee ID), *Formation*, *Recrutement*, *Managers de département*. No department slicer: the role decides the scope
- **10 roles:** `Direction générale`, `DRH`, `Contrôle de gestion et paie`, `Resp. administration du personnel`, `Resp. formation`, `Resp. recrutement`, and 4 manager roles (`Manager Informatique`, `Manager Télécom`, `Manager Communication`, `Manager Administration`) that also see their own department only (row-level security). Test them with *Modeling → View as*
- **Page-level security:** a hidden `Acteurs` table (one row per actor page) is filtered by each role; each actor page has a locked page filter on itself. On another role's page every measure returns blank and an « Accès non autorisé » banner shows
- **75 measures** in the `Mesures` table: 65 business measures (headcount and cost read the latest snapshot only) and 10 security / home page measures
- **Employee profiles (machine learning):** K-means on 4 standardized variables (seniority, experience, monthly cost, share of days over 8 h), 4 profiles, silhouette 0.29 — see [ml/README.md](ml/README.md)
- **Recruitment path:** Sankey diagram (certified Microsoft visual from AppSource) from hiring channel to department to contract type
- **No personal data:** name, e-mail and addresses of `dim_employe` are removed in Power Query
- **Model:** facts → `dim_employe` active, `dim_employe` → `dim_departement` inactive (avoids two paths), snapshot date active on `fact_effectif_snapshot`; readable department label computed in the model (`departement_libelle`)
- **Tested:** `powerbi/scripts/test_report.mjs` replays every visual query for every role (1,947 queries, 0 failure)

## Tech stack

SQL Server 2019 (shared server) · SSIS (SSDT, VS 2022) · Python (pandas) · Power BI · Tailscale

## Re-run the data audit

```bash
python eda_audit_pipeline.py
```

Needs `pandas`, `openpyxl`, `odfpy`, `matplotlib`. Reads `DataSet/`, writes `eda_audit_report.html`.

## Get started

👉 **[docs/SETUP.md](docs/SETUP.md)** — 10 minutes to run it on your PC.

👉 **[docs/CONVENTIONS.md](docs/CONVENTIONS.md)** — branches, commits, rules for working at 6.
