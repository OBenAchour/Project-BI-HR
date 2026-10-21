# Setup on a new PC

⏱ ~10 minutes. Do it **once**.

## 1. Install

- [ ] Git
- [ ] Visual Studio 2022 + extension **SQL Server Integration Services Projects**
- [ ] **Microsoft OLE DB Driver for SQL Server** (MSOLEDBSQL)
- [ ] **Tailscale** — sign in, check you can reach `100.102.67.72`

## 2. Get the code

On the repository's GitHub page, click **Code → HTTPS** and copy the address, then:

```bash
git clone <repository address>
cd Project-BI-HR
```

## 3. Tell SSIS where the source files are

1. Open `Project BI HR/Project BI HR.sln`
2. Double-click **Project.params**
3. Set `DossierSources` = full path of **your** `DataSet` folder (no `\` at the end)
   e.g. `D:\School\Project-BI-HR\DataSet`

> Already set it before? The folder moved from `PI\DataSet` to `DataSet` — update your value.
4. Save, then hide this change from Git:

```bash
git update-index --skip-worktree "Project BI HR/Project.params"
```

## 4. Enter the database password

In **both** packages, double-click each connection manager → login `BI` → password → ✅ *Save my password* → *Test Connection*.

> The password is never in Git. Ask the team.

## 5. Run

0. **Only once per server** (or after a change to the `stg` tables): run `sql/staging_area.sql` in SSMS on `RH_Staging_Area`. It recreates the 7 `stg` tables (SQL Server 2019+).
1. `Load_Staging_Area.dtsx` → F5
2. `Load_data_warehouse.dtsx` → **don't run it for now**: it's the v1 package, which no longer matches the raw staging area. The DW v2 is being rebuilt following the [guide](https://claude.ai/artifact/BR66GDu8mnFdRxUEx1nmeX).
3. All boxes green = done ✅

> ⚠️ Everyone uses the **same server**. One run is enough for the whole team — don't run it at the same time as someone else.

## Already cloned? Just update

```bash
git checkout main
git pull
```

## Problems?

| You see | Fix |
| --- | --- |
| "Failed to decrypt" | Normal on a new PC → step 4 |
| "File not found" | Wrong `DossierSources` → step 3 |
| "Login failed" / timeout | Tailscale off, or wrong password |
