import csv
path = r"C:\Users\ousse\OneDrive\Desktop\4SDE2\PI\DataSet\Coursera_trainings.csv"
with open(path, encoding="utf-8-sig", newline="") as f:
    r = csv.reader(f); h = next(r)
    mx = [0]*len(h)
    for row in r:
        for i, c in enumerate(row):
            mx[i] = max(mx[i], len(c))
for n, m in zip(h, mx):
    print(f"{n:25s} {m}")