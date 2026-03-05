"""
run_comparison.py — with debug output to confirm which files are loaded
"""

import argparse
import json
import sys
import os
from collections import defaultdict
from datetime import datetime, timezone

parser = argparse.ArgumentParser()
parser.add_argument("--uri",  required=True)
parser.add_argument("--uid",  required=True)
parser.add_argument("--out",  default="results.json")
args = parser.parse_args()

try:
    from pymongo import MongoClient
except ImportError:
    print("ERROR: pymongo not installed. Run:  pip install pymongo dnspython")
    sys.exit(1)

print(f"Connecting to MongoDB...")
client = MongoClient(args.uri)

db_names = [d for d in client.list_database_names() if d not in ("admin", "local", "config")]
db = None
for name in db_names:
    if "expenses" in client[name].list_collection_names():
        db = client[name]
        print(f"Using database: {name}")
        break
if db is None:
    db = client[db_names[0]]

print(f"Fetching expenses for user: {args.uid}")
expenses = list(db.expenses.find(
    {"userId": args.uid},
    {"category": 1, "amount": 1, "date": 1, "_id": 0}
))
print(f"Found {len(expenses)} expenses")

if not expenses:
    print("ERROR: No expenses found.")
    sys.exit(1)

from collections import defaultdict
import numpy as np

monthly_by_cat = defaultdict(lambda: defaultdict(float))
for e in expenses:
    cat = str(e.get("category", "other")).strip().lower()
    amt = float(e.get("amount", 0))
    date = e.get("date")
    from datetime import datetime
    if isinstance(date, str):
        date = datetime.fromisoformat(date.replace("Z", "+00:00"))
    if not isinstance(date, datetime):
        continue
    month_key = f"{date.year}-{str(date.month).zfill(2)}"
    monthly_by_cat[cat][month_key] += amt

category_series = {}
for cat, monthly in monthly_by_cat.items():
    sorted_months = sorted(monthly.keys())
    values = np.array([monthly[m] for m in sorted_months], dtype=float)
    category_series[cat] = {"months": sorted_months, "values": values}

print(f"\nCategories found: {list(category_series.keys())}")
print(f"Month range: {min(m for s in category_series.values() for m in s['months'])} "
      f"→ {max(m for s in category_series.values() for m in s['months'])}")

# ── Build sys.path ────────────────────────────────────────────────────────────
script_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "src", "ExpenseTrackerModel")
if not os.path.exists(script_dir):
    script_dir = os.path.join(os.getcwd(), "src", "ExpenseTrackerModel")
if not os.path.exists(script_dir):
    script_dir = os.getcwd()

sys.path.insert(0, script_dir)

# ── DEBUG: show exact file paths being loaded ─────────────────────────────────
sarima_path = os.path.join(script_dir, "models", "sarima_trend.py")
perf_path   = os.path.join(script_dir, "reports", "performance.py")


try:
    from reports.performance import compare_models
    print("Loaded performance.py successfully")
except ImportError as e:
    print(f"ERROR importing performance.py: {e}")
    sys.exit(1)

print("\nRunning model comparison (this may take 1–2 minutes for SARIMA)...")
print("─" * 60)

all_results = {}
skipped = []

for cat, series in sorted(category_series.items()):
    values = series["values"]
    n_months = len(values)
    print(f"  {cat:<25} ({n_months} months)...", end=" ", flush=True)

    if n_months < 18:
        print(f"SKIPPED (need 18+ months, have {n_months})")
        skipped.append(cat)
        continue

    results = compare_models(values, category=cat)
    if not results:
        print("SKIPPED (no results returned)")
        skipped.append(cat)
        continue

    all_results[cat] = {
        "n_months": n_months,
        "months": series["months"],
        "monthly_totals": [round(v, 2) for v in values.tolist()],
        "models": results,
    }
    best = min(results.items(), key=lambda x: x[1].get("mape", 999))
    print(f"OK  — best: {best[0]} (MAPE={best[1].get('mape','?')}%)")

model_names = ["mean", "linear", "sarima", "planner"]
overall = {}
for model in model_names:
    maes, rmses, mapes, r2s = [], [], [], []
    for cat_data in all_results.values():
        m = cat_data["models"].get(model)
        if m:
            maes.append(m["mae"])
            rmses.append(m["rmse"])
            if "mape" in m and m["mape"] == m["mape"]:
                mapes.append(m["mape"])
            r2s.append(m["r2"])
    if maes:
        overall[model] = {
            "mae":  round(np.mean(maes), 2),
            "rmse": round(np.mean(rmses), 2),
            "mape": round(np.mean(mapes), 1) if mapes else None,
            "r2":   round(np.mean(r2s), 3),
            "n_categories": len(maes),
        }

output = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "user_id": args.uid,
    "total_expenses": len(expenses),
    "categories_evaluated": list(all_results.keys()),
    "categories_skipped": skipped,
    "per_category": all_results,
    "overall_averages": overall,
}

with open(args.out, "w") as f:
    json.dump(output, f, indent=2, default=str)

print("\n" + "─" * 60)
print("OVERALL AVERAGES")
print(f"{'Model':<20} {'MAE':>8} {'RMSE':>8} {'MAPE%':>8} {'R²':>8}")
print("─" * 55)
for model in model_names:
    if model in overall:
        o = overall[model]
        mape_str = f"{o['mape']}" if o['mape'] else "N/A"
        print(f"{model.capitalize():<20} {o['mae']:>8} {o['rmse']:>8} {mape_str:>8} {o['r2']:>8}")

print(f"\nResults saved to: {args.out}")
print("Now run:  python generate_report.py --input results.json")
