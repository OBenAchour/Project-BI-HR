# Setup on a new PC

⏱ ~10 minutes. Do it **once**.

## 1. Install

- [ ] Git
- [ ] Visual Studio 2022 + extension **SQL Server Integration Services Projects**
- [ ] **Microsoft OLE DB Driver for SQL Server** (MSOLEDBSQL)
- [ ] **Tailscale** — sign in, check you can reach `100.102.67.72`

## 2. Get the code

```bash
git clone https://github.com/OBenAchour/Project-BI-HR.git
cd Project-BI-HR
```

## 3. Tell SSIS where the source files are

1. Open `Project BI HR/Project BI HR.sln`
2. Double-click **Project.params**
3. Set `DossierSources` = full path of **your** `PI\DataSet` folder (no `\` at the end)
   e.g. `D:\School\Project-BI-HR\PI\DataSet`
4. Save, then hide this change from Git:

```bash
git update-index --skip-worktree "Project BI HR/Project.params"
```

## 4. Enter the database password

In **both** packages, double-click each connection manager → login `BI` → password → ✅ *Save my password* → *Test Connection*.

> The password is never in Git. Ask the team.

## 5. Run

1. `Load_Staging_Area.dtsx` → F5
2. `Load_data_warehouse.dtsx` → F5
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
