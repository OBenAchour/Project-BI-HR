# Project BI HR — HR analytics Data Warehouse

> Turn raw HR files into a star-schema Data Warehouse, loaded by SSIS, ready for Power BI.

**Academic project · 4SDE · group of 6**

## In one picture

```
7 source files ──► RH_Staging_Area (stg) ──► RH_Data_Warehouse (dw) ──► Power BI
 (xlsx/csv/ods/txt)   Load_Staging_Area.dtsx   Load_data_warehouse.dtsx
```

## What's inside

| Folder / file | What it is |
| --- | --- |
| `DataSet/` | The 7 source files (employees, attendance, courses, departments, rates) |
| `eda_audit_pipeline.py` | Data quality audit of the 7 files (read-only) |
| `eda_audit_report.html` | Audit report it generates: 42 anomalies, impact, proposed fix |
| `Projet_EDA_BI_RH.pptx` | EDA presentation: business objectives OM1–OM6 and KPIs |
| `sql/staging_area.sql` | Creates the 7 `stg` tables: file columns only, typed as SSIS reads them |
| `sql/data_warehouse.sql` | Creates the DW v2 database `RH_Data_Warehouse_v2` (19 tables, unknown members) |
| `Project BI HR/` | SSIS project (Visual Studio 2022) |
| `docs/CONCEPTION_DW.md` | DW v2 design: model, bus matrix, every fact and dimension |
| `docs/GUIDE_RECONSTRUCTION_DW.md` | Step-by-step guide to build the DW v2 load in SSDT (components, expressions, table fiches) |
| `docs/` | Also: setup guide + team conventions |

## The staging area (schema `stg`)

- **Raw copy of the files:** no added column, no transformation in SSIS or in the files.
- **Type differences are handled in the database:** each `stg` column has the type SSIS reads (`float` for Excel numbers, `datetime` for Excel dates, UTF-8 `varchar` for UTF-8 text).
- **All cleaning happens in the DW load.**

## The Data Warehouse (schema `dw`) — v2, being rebuilt

⚠️ `Load_data_warehouse.dtsx` is the **v1** package: it no longer runs against the raw staging area. The v2 database `RH_Data_Warehouse_v2` is created (empty) and the team builds its loading package by hand in SSDT:

👉 **Design:** [docs/CONCEPTION_DW.md](docs/CONCEPTION_DW.md)
👉 **How to load it:** [docs/GUIDE_RECONSTRUCTION_DW.md](docs/GUIDE_RECONSTRUCTION_DW.md)

- **3 fact tables:** `fact_pointage` (employee × day, 272,999 rows), `fact_effectif_snapshot` (employee × snapshot, 2,740), `fact_inscription_formation` (employee × course × snapshot, 18,685)
- **11 dimensions:** date, time, employee (SCD 2), department, contract, position, leave type, course, hourly rate, attendance anomalies, contract anomalies
- **5 sub-dimensions (snowflake):** diploma, hiring channel, pole, university, course level
- **No bridge table:** languages and technologies become yes/no flags, enrolments are fact rows
- **Visual SSIS components only** — SQL is used only to create the tables and empty the facts before reloading

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
