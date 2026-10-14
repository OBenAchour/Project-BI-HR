import pandas as pd
from pathlib import Path

SRC = Path(r"C:\Users\ousse\OneDrive\Desktop\4SDE2\PI\DataSet")   # <- dossier contenant vos 7 fichiers

for f in sorted(SRC.iterdir()):
    ext = f.suffix.lower()
    print(f"\n=== {f.name} ===")
    try:
        if ext == ".csv":
            df = pd.read_csv(f, nrows=0, sep=None, engine="python", encoding="utf-8-sig")
            print(len(df.columns), "colonnes :", list(df.columns))
        elif ext in (".xlsx", ".xls", ".ods"):
            eng = "odf" if ext == ".ods" else None
            for sheet, df in pd.read_excel(f, sheet_name=None, nrows=0, engine=eng).items():
                print(f"[feuille: {sheet}]", len(df.columns), "colonnes :", list(df.columns))
        elif ext == ".txt":
            print("(5 premières lignes)")
            print("".join(f.open(encoding="utf-8-sig", errors="replace").readlines()[:5]))
    except Exception as e:
        print("Erreur :", e)