# Team conventions

5 rules. That's it.

## 1. Never work on `main`

`main` = always working. Create a branch for each task:

```bash
git checkout main
git pull
git checkout -b feature/dim-employe-scd2
```

## 2. Branch names

`type/short-description` — lowercase, words joined by `-`

| Type | When | Example |
| --- | --- | --- |
| `feature/` | New thing | `feature/powerbi-dashboard` |
| `fix/` | Bug fix | `fix/staging-date-format` |
| `docs/` | Docs, report | `docs/setup-guide` |
| `refactor/` | Clean up, same result | `refactor/lookup-queries` |
| `chore/` | Config, gitignore | `chore/gitignore` |

## 3. Commit messages

`type: what you did` — short, present tense, one change per commit.

```
feat: add SCD2 load for dim_employe
fix: parse admin attendance dates (YYYY-MM-DD)
docs: add setup guide
```

❌ `update`, `fix`, `final version`, `aaa`

## 4. One person per `.dtsx` at a time

A package is a huge XML file → two people editing it = merge nightmare.
**Say it in the group chat before you open a package.**

## 5. Commit only what you changed

```bash
git status                       # look first
git add "Project BI HR/Load_DW.dtsx"
git commit -m "feat: ..."
git push -u origin feature/...
```

- ❌ Never `git add .`
- ❌ Never commit `.vs/`, `bin/`, `obj/` (already in `.gitignore`)
- ❌ Never commit a `.dtsx` just because you re-typed the password →
  `git restore "Project BI HR/<package>.dtsx"`

## Merge to `main`

Open a **Pull Request** on GitHub → one teammate reviews → merge.
