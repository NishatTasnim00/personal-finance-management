"""
budget_wrapper.py
Entry point called by aiController.js via stdin/stdout.
Reads JSON from stdin → runs BudgetAI → writes JSON to stdout.
"""
import sys
import json
import os

# Ensure imports resolve from this folder
sys.path.insert(0, os.path.dirname(__file__))

from budget_planner import BudgetAI


def convert(o):
    """Convert numpy/pandas types to native Python for JSON serialization."""
    import pandas as pd
    if isinstance(o, (pd.Period, pd.Timestamp)):
        return str(o)
    if hasattr(o, "item"):  # numpy scalar
        return o.item()
    raise TypeError(f"Object of type {type(o)} is not JSON serializable")


def main():
    try:
        raw = sys.stdin.read()
        if not raw:
            raise ValueError("No input received")
        input_data = json.loads(raw)
    except Exception as e:
        print(json.dumps({"error": f"Failed to parse input: {str(e)}"}))
        sys.exit(1)

    transactions     = input_data.get("transactions", [])
    monthly_income   = input_data.get("monthly_income")
    total_budget     = input_data.get("total_budget")       # optional
    exceeded_last_month = input_data.get("exceeded_last_month", [])

    try:
        ai = BudgetAI()
        result = ai.create_balanced_budget(
            transaction_history=transactions,
            monthly_income=float(monthly_income) if monthly_income else None,
            total_budget=float(total_budget) if total_budget else None,
            exceeded_last_month=exceeded_last_month,
        )
        print(json.dumps(result, default=convert))
    except Exception as e:
        print(json.dumps({"error": f"Model error: {str(e)}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
    