import pandas as pd
f = r"C:\Users\ousse\OneDrive\Desktop\4SDE2\PI\DataSet\Coursera_trainings.csv"
df = pd.read_csv(f, dtype=str, encoding="utf-8-sig", sep=None, engine="python")
print(len(df), "lignes")
print(df.apply(lambda c: c.str.len().max()))        # longueur max de chaque colonne
print(df["Difficulty Level"].value_counts(dropna=False))
print(df.iloc[1260:1265].T)                         # lignes autour de la 1263