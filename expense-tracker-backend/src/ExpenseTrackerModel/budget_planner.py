"""
budget_planner.py
Core budget intelligence. Uses DB raw category values throughout.

Exact DB category values (from helper.js):
  rent, bills, food and groceries, health, education, transport,
  phone (→ treated as bills), emi & insurance,
  dining out, entertainment, shopping, travel, fitness, other

Allocation logic:
  1. Determine spending cap and needs/wants buckets (50/30/20 or custom 60/40)
  2. Fixed categories (rent, emi & insurance) deducted from needs bucket first
  3. Remaining needs bucket split among variable needs proportionally
  4. Wants bucket split among wants proportionally
  5. Hard cap trim — total never exceeds spending_cap
"""

import sys
import pandas as pd
import numpy as np
from models.sarima_trend import MonthlySARIMATrendRegressor


# ── Category definitions — exact DB raw values ───────────────────────────────

FIXED_CATEGORIES = {"rent", "emi & insurance"}          # never scale down

NEEDS_CATEGORIES = {"rent", "emi & insurance", "bills",
                    "food and groceries", "health",
                    "education", "transport", "fitness"}  # essentials

WANTS_CATEGORIES = {"dining out", "entertainment",
                    "shopping", "travel", "other"}        # discretionary

ALL_CATEGORIES   = NEEDS_CATEGORIES | WANTS_CATEGORIES


# ── Keyword categorizer ───────────────────────────────────────────────────────
class KeywordCategorizer:
    """
    Used only when a transaction has no recognized category.
    Always returns an exact DB raw category value.
    Note: 'phone' is a valid DB value but maps to 'bills' per business rule.
    """
    KEYWORD_MAP = [
        ({"rent", "house", "flat", "bari", "basa", "apartment", "mortgage"}, "rent"),
        ({"emi", "loan", "installment", "insurance"}, "emi & insurance"),
        ({"grocery", "groceries", "bazar", "shwapno", "meena", "supermarket",
          "vegetable", "rice", "fish", "meat"}, "food and groceries"),
        ({"electricity", "wasa", "water", "gas", "internet", "wifi",
          "broadband", "utility", "bill", "bills",
          "phone", "mobile", "recharge", "airtel", "robi",
          "grameenphone", "gp", "banglalink"}, "bills"),
        ({"school", "college", "university", "tuition", "coach", "education", "books"}, "education"),
        ({"doctor", "hospital", "pharmacy", "medicine", "clinic", "health", "labaid"}, "health"),
        ({"bus", "train", "cng", "rickshaw", "uber", "pathao", "fuel", "petrol", "metro"}, "transport"),
        ({"restaurant", "dining", "cafe", "coffee", "foodpanda", "shohoz", "kfc", "pizza", "delivery"}, "dining out"),
        ({"netflix", "spotify", "youtube", "movie", "cinema", "game", "pubg", "subscription"}, "entertainment"),
        ({"daraz", "clothing", "fashion", "shoes", "bag", "accessories"}, "shopping"),
        ({"travel", "hotel", "flight", "trip", "vacation", "tour"}, "travel"),
        ({"gym", "fitness", "yoga", "sport", "workout"}, "fitness"),
    ]

    def categorize(self, category: str, description: str = "") -> str:
        if category:
            clean = str(category).strip().lower()
            # phone → bills per business rule
            if clean == "phone":
                return "bills"
            if clean in ALL_CATEGORIES:
                return clean
        # Keyword fallback
        text = f"{category} {description}".lower()
        for keywords, raw_value in self.KEYWORD_MAP:
            if any(kw in text for kw in keywords):
                return raw_value
        return "other"


# ── BudgetAI ──────────────────────────────────────────────────────────────────
class BudgetAI:

    def __init__(self):
        self.categorizer = KeywordCategorizer()

    def _filter_expenses(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        col_map = {c.lower(): c for c in df.columns}
        if "type" in col_map:
            type_col = col_map["type"]
            df = df[df[type_col].astype(str).str.lower().str.strip() != "income"]
        df["amount"] = df["amount"].abs()
        return df

    def _predict_category(self, values: np.ndarray, category: str) -> float:
        """
          - Fixed (rent, emi & insurance) → max of last 4 months
          - n <= 5 months                 → mean × 1.05
          - n >  5 months                 → SARIMA bounded [65%, 125%] of historical max
                                            fallback: mean of last 6 months × 1.07
        """
        values = values[values > 0]
        if len(values) == 0:
            return 0.0

        if category in FIXED_CATEGORIES:
            return float(np.max(values[-4:]))

        if len(values) <= 5:
            return float(np.mean(values)) * 1.05

        try:
            reg = MonthlySARIMATrendRegressor(
                seasonal_period=12, max_pdq=3, max_PDQ=2, stepwise=True
            ).fit(values)

            if reg.is_fitted:
                pred  = reg.predict_next()
                h_max = float(values.max())
                pred  = max(pred, h_max * 0.65)
                pred  = min(pred, h_max * 1.25)
                return pred * 1.05

            return float(np.mean(values[-6:])) * 1.07

        except Exception as e:
            print(f"[BudgetAI] SARIMA failed for {category}: {e}", file=sys.stderr)
            return float(np.mean(values[-6:])) * 1.07

    def _predict_all(self, transactions: list) -> dict:
        """Returns { db_category: predicted_amount } for next month."""
        df = pd.DataFrame(transactions)
        if df.empty:
            return {}

        df["date"]   = pd.to_datetime(df["date"], errors="coerce", utc=True)
        df           = df.dropna(subset=["date", "amount", "category"])
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0)
        df           = self._filter_expenses(df)
        if df.empty:
            return {}

        df["category"] = df.apply(
            lambda r: self.categorizer.categorize(
                str(r.get("category", "")), str(r.get("description", ""))
            ), axis=1,
        )

        predictions = {}
        for cat in df["category"].unique():
            cat_df  = df[df["category"] == cat]
            monthly = (
                cat_df
                .groupby(cat_df["date"].dt.tz_localize(None).dt.to_period("M"))["amount"]
                .sum()
                .sort_index()
            )
            pred = self._predict_category(monthly.values, cat)
            if pred > 0:
                predictions[cat] = round(pred)

        return predictions

    def create_balanced_budget(
        self,
        transaction_history: list,
        monthly_income:      float = None,
        total_budget:        float = None,
        exceeded_last_month: list  = None,
    ) -> dict:
        notes    = []
        exceeded = exceeded_last_month or []

        if exceeded:
            exceeded_str = ", ".join(
                f"{e['category']} (over by ৳{int(e['exceededBy']):,})"
                for e in exceeded
            )
            notes.append(
                f"⚠️ Last month you exceeded budget in: {exceeded_str}. "
                "AI has adjusted allocations based on your actual spending."
            )

        # ── Count data months ─────────────────────────────────────────────────
        num_months = 0
        df = pd.DataFrame(transaction_history)
        if not df.empty:
            df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
            df = df.dropna(subset=["date"])
            df = self._filter_expenses(df)
            if not df.empty:
                num_months = df["date"].dt.tz_localize(None).dt.to_period("M").nunique()

        # ── AI predictions per category ───────────────────────────────────────
        predictions = self._predict_all(transaction_history)

        pred_needs = {c: v for c, v in predictions.items() if c in NEEDS_CATEGORIES}
        pred_wants = {c: v for c, v in predictions.items() if c in WANTS_CATEGORIES}
        pred_wants.update({c: v for c, v in predictions.items() if c not in ALL_CATEGORIES})

        # ── Spending cap ──────────────────────────────────────────────────────
        if total_budget is not None:
            spending_cap = float(total_budget)
            savings      = max(0.0, float(monthly_income) - spending_cap) if monthly_income else 0.0
            needs_pct    = 0.60
            wants_pct    = 0.40
            notes.append("Custom spending limit applied — essentials protected first.")
            if monthly_income and spending_cap >= float(monthly_income):
                notes.append("Spending limit equals or exceeds income — consider reducing it.")
        else:
            if not monthly_income:
                monthly_income = 50000.0
                notes.append(
                    "No income provided — using ৳50,000 as default. "
                    "Set your actual income in Profile for a personalized plan."
                )
            monthly_income = float(monthly_income)
            spending_cap   = monthly_income * 0.80
            savings        = monthly_income * 0.20
            needs_pct      = 0.625
            wants_pct      = 0.375
            if num_months >= 3:
                notes.append("50/30/20 rule applied, personalized from your spending history.")
            else:
                notes.append(
                    f"Only {num_months} month(s) of data — using 50/30/20 as a safe baseline. "
                    "Keep tracking for a fully personalized plan!"
                )

        # Split cap into buckets upfront
        needs_cap = spending_cap * needs_pct
        wants_cap = spending_cap * wants_pct

        needs_breakdown: dict = {}
        wants_breakdown: dict = {}

        # ── Fixed (rent + emi & insurance) — deducted from needs_cap first ────
        fixed_total = 0.0
        for cat in FIXED_CATEGORIES:
            amt = pred_needs.get(cat, 0)
            if amt > 0:
                allocated = min(float(amt), needs_cap - fixed_total)
                if allocated > 0:
                    needs_breakdown[cat] = round(allocated)
                    fixed_total += allocated

        if fixed_total >= needs_cap:
            notes.append(
                f"⚠️ Fixed essentials (rent + EMI ৳{int(fixed_total):,}) fill your entire "
                f"needs budget (৳{int(needs_cap):,}). No room for other needs categories."
            )
            remaining_needs = 0.0
        else:
            remaining_needs = needs_cap - fixed_total

        # ── Variable needs — scaled to remaining_needs ────────────────────────
        var_needs = {
            c: float(pred_needs[c])
            for c in NEEDS_CATEGORIES
            if c not in FIXED_CATEGORIES and pred_needs.get(c, 0) > 0
        }
        if var_needs and remaining_needs > 0:
            var_sum = sum(var_needs.values())
            for cat, amt in var_needs.items():
                needs_breakdown[cat] = round(amt * (remaining_needs / var_sum))

        # ── Wants — scaled to wants_cap ───────────────────────────────────────
        if pred_wants and wants_cap > 0:
            wants_sum = sum(pred_wants.values())
            for cat, amt in pred_wants.items():
                wants_breakdown[cat] = round(float(amt) * (wants_cap / wants_sum))

        # ── Fallback if no transaction data ───────────────────────────────────
        if not needs_breakdown:
            notes.append("No expense history — using standard starter allocation.")
            needs_breakdown = {
                "rent":               round(needs_cap * 0.40),
                "emi & insurance":    round(needs_cap * 0.10),
                "food and groceries": round(needs_cap * 0.25),
                "bills":              round(needs_cap * 0.15),
                "transport":          round(needs_cap * 0.10),
            }
        if not wants_breakdown:
            notes.append("No discretionary history — using standard starter allocation.")
            wants_breakdown = {
                "dining out":    round(wants_cap * 0.35),
                "entertainment": round(wants_cap * 0.25),
                "shopping":      round(wants_cap * 0.20),
                "travel":        round(wants_cap * 0.10),
                "other":         round(wants_cap * 0.10),
            }

        # ── Hard cap trim (rounding safety) ───────────────────────────────────
        total = sum(needs_breakdown.values()) + sum(wants_breakdown.values())
        if total > spending_cap:
            overflow = total - spending_cap
            for cat in sorted(wants_breakdown, key=wants_breakdown.get, reverse=True):
                trim = min(wants_breakdown[cat], overflow)
                wants_breakdown[cat] = round(wants_breakdown[cat] - trim)
                overflow -= trim
                if overflow <= 0:
                    break
            if overflow > 0:
                for cat in sorted(needs_breakdown, key=needs_breakdown.get, reverse=True):
                    if cat not in FIXED_CATEGORIES:
                        trim = min(needs_breakdown[cat], overflow)
                        needs_breakdown[cat] = round(needs_breakdown[cat] - trim)
                        overflow -= trim
                        if overflow <= 0:
                            break

        # Remove zeros
        needs_breakdown = {k: v for k, v in needs_breakdown.items() if v > 0}
        wants_breakdown = {k: v for k, v in wants_breakdown.items() if v > 0}

        # ── Savings note ──────────────────────────────────────────────────────
        savings_rate = (savings / float(monthly_income) * 100) if monthly_income else 0
        if savings_rate >= 20:
            notes.append(f"🎉 On track to save ৳{int(savings):,} ({savings_rate:.0f}%) this month!")
        elif savings_rate >= 10:
            notes.append(f"👍 Saving ৳{int(savings):,} ({savings_rate:.0f}%). Aim for 20% for stronger financial health.")
        elif savings_rate > 0:
            notes.append(f"💡 Low savings rate ({savings_rate:.0f}%). Try trimming wants to build a safety net.")

        notes.append("Every month you track, you get one step closer to financial freedom. Keep going! 💪")

        return {
            "monthly_income":      int(monthly_income) if monthly_income else 0,
            "recommended_savings": int(savings),
            "total_living_budget": int(spending_cap),
            "needs_total":         int(needs_cap),
            "needs_breakdown":     needs_breakdown,
            "wants_total":         int(wants_cap),
            "wants_breakdown":     wants_breakdown,
            "note":                notes,
            "data_months":         num_months,
        }
    