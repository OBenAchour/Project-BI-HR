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
| `PI/DataSet/` | The 7 source files (employees, attendance, courses, departments, rates) |
| `PI/EDA_HR.ipynb` | Exploratory analysis + business KPIs (OM1–OM6) |
| `Project BI HR/` | SSIS project (Visual Studio 2022) |
| `Dossier_Conception_DW_RH.docx` | Data Warehouse design (17 tables) |
| `Rapport SSIS — ….pdf` | Full explanation of every SSIS component |
| `docs/` | Setup guide + team conventions |

## The Data Warehouse (schema `dw`)

- **3 fact tables:** `fact_pointage` (273k attendance rows), `fact_effectif_snapshot` (2,740 employees), `fact_formation` (18,679 enrolments)
- **12 dimensions:** employee, department, hourly rate (SCD 2) · contract, position, leave type, course, skill (SCD 1) · date, time · 2 junk flag dimensions
- **2 bridge tables:** employee ↔ technology, course ↔ skill

## Tech stack

SQL Server 2022 · SSIS (SSDT, VS 2022) · Python (pandas) · Power BI · Tailscale (shared server)

## Get started

👉 **[docs/SETUP.md](docs/SETUP.md)** — 10 minutes to run it on your PC.

👉 **[docs/CONVENTIONS.md](docs/CONVENTIONS.md)** — branches, commits, rules for working at 6.
