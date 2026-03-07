"""
budget_planner.py
Core budget intelligence. Uses DB raw category values throughout.

Exact DB category values (from helper.js):
  rent, bills, food and groceries, health, education, transport,
  phone (→ treated as bills), emi & insurance,
  dining out, entertainment, shopping, travel, fitness, other

Prediction strategy (validated by rolling one-step-ahead evaluation):

  Fixed (rent, emi & insurance)
    → Last month value — contractually fixed, last value is ground truth

  Flat/step-change variable (fitness, entertainment — CV<0.15, ≤4 unique)
    → Last month value — barely changes month to month

  Sporadic (health, education, travel, shopping)
    → Mean of last 6 months × 1.05 — too irregular for any trend model

  Regular variable (bills, food, transport, dining out, other)
    < 6  months → Mean × 1.05
    6–24 months → Mean of last 6 × 1.05    (Mean wins over SARIMA here)
    25+  months → SARIMA with full seasonality (m=12)
                  fallback → weighted mean × 1.07

Allocation logic:
  1. Split income: 80% spending cap, 20% savings (50/30/20 rule)
  2. Needs bucket (62.5% of spending cap) — fixed categories deducted first
  3. Remaining needs split among variable needs proportionally
  4. Wants bucket (37.5% of spending cap) split proportionally
  5. Hard cap trim — total never exceeds spending_cap
"""

import sys
import pandas as pd
import numpy as np
from models.sarima_trend import MonthlySARIMATrendRegressor


# ── Category definitions ──────────────────────────────────────────────────────

FIXED_CATEGORIES    = {"rent", "emi & insurance"}

SPORADIC_CATEGORIES = {"health", "education", "travel", "shopping"}

NEEDS_CATEGORIES    = {"rent", "emi & insurance", "bills",
                       "food and groceries", "health",
                       "education", "transport", "fitness"}

WANTS_CATEGORIES    = {"dining out", "entertainment",
                       "shopping", "travel", "other"}

ALL_CATEGORIES      = NEEDS_CATEGORIES | WANTS_CATEGORIES


# ── Keyword categorizer ───────────────────────────────────────────────────────
class KeywordCategorizer:
    """
    Maps raw text to exact DB category values.
    'phone' → 'bills' per business rule.
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
        ({"school", "college", "university", "tuition", "coach",
          "education", "books"}, "education"),
        ({"doctor", "hospital", "pharmacy", "medicine", "clinic",
          "health", "labaid"}, "health"),
        ({"bus", "train", "cng", "rickshaw", "uber", "pathao",
          "fuel", "petrol", "metro"}, "transport"),
        ({"restaurant", "dining", "cafe", "coffee", "foodpanda",
          "shohoz", "kfc", "pizza", "delivery"}, "dining out"),
        ({"netflix", "spotify", "youtube", "movie", "cinema",
          "game", "pubg"}, "entertainment"),
        ({"daraz", "clothing", "fashion", "shoes", "bag",
          "accessories"}, "shopping"),
        ({"travel", "hotel", "flight", "trip", "vacation", "tour"}, "travel"),
        ({"gym", "fitness", "yoga", "sport", "workout"}, "fitness"),
    ]

    def categorize(self, category: str, description: str = "") -> str:
        if category:
            clean = str(category).strip().lower()
            if clean == "phone":
                return "bills"
            if clean in ALL_CATEGORIES:
                return clean
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

    @staticmethod
    def _is_flat_or_step(values: np.ndarray) -> bool:
        """Same logic as sarima_trend — detect flat/step series."""
        nonzero = values[values > 0]
        if len(nonzero) == 0:
            return True
        mean = np.mean(nonzero)
        if mean == 0:
            return True
        cv = float(np.std(nonzero) / mean)
        if cv < 0.02:
            return True
        n_unique = len(np.unique(np.round(nonzero, -2)))
        if cv < 0.15 and n_unique <= 4:
            return True
        return False

    @staticmethod
    def _mean_prediction(values: np.ndarray, window: int = 6) -> float:
        """Mean of last `window` months × 1.05 buffer."""
        w = min(window, len(values))
        return float(np.mean(values[-w:])) * 1.05

    def _predict_category(self, values: np.ndarray, category: str) -> float:
        """
        Tiered prediction validated by rolling one-step-ahead evaluation:

        Fixed (rent, emi):          last month value
        Flat/step variable:         last month value
        Sporadic (health etc):      mean(6mo) × 1.05
        Regular variable < 6mo:     mean × 1.05
        Regular variable 6–24mo:    mean(6mo) × 1.05
        Regular variable 25+mo:     SARIMA (full seasonality)
                                    fallback → weighted mean × 1.07
        """
        values = values[values > 0]
        n = len(values)

        if n == 0:
            return 0.0

        # ── Fixed categories ──────────────────────────────────────────────────
        if category in FIXED_CATEGORIES:
            return float(values[-1])

        # ── Flat or step-change variable (e.g. gym, netflix) ─────────────────
        if self._is_flat_or_step(values):
            return float(values[-1])

        # ── Sporadic categories — mean is most honest ─────────────────────────
        if category in SPORADIC_CATEGORIES:
            return self._mean_prediction(values)

        # ── Regular variable — tiered by data availability ────────────────────
        if n < 6:
            return float(np.mean(values)) * 1.05

        if n <= 24:
            return self._mean_prediction(values)

        # 25+ months — SARIMA with full seasonality
        try:
            reg = MonthlySARIMATrendRegressor(
                seasonal_period=12, max_pdq=2, max_PDQ=1, stepwise=True
            ).fit(values)

            if reg.is_flat:
                return float(values[-1])

            if reg.is_fitted:
                pred  = reg.predict_next()
                h_max = float(values.max())
                pred  = max(pred, h_max * 0.65)
                pred  = min(pred, h_max * 1.25)
                return float(pred)

            # SARIMA failed — weighted mean fallback
            weights = np.exp(np.linspace(0, 1, min(6, n)))
            weights /= weights.sum()
            return float(np.dot(weights, values[-6:])) * 1.07

        except Exception as e:
            print(f"[BudgetAI] SARIMA failed for {category}: {e}", file=sys.stderr)
            weights = np.exp(np.linspace(0, 1, min(6, n)))
            weights /= weights.sum()
            return float(np.dot(weights, values[-6:])) * 1.07

    def _to_monthly_series(self, df: pd.DataFrame) -> dict:
        """Convert expense dataframe → { category: np.array of monthly totals }"""
        try:
            df["date"] = df["date"].dt.tz_convert(None)
        except TypeError:
            df["date"] = df["date"].dt.tz_localize(None)

        result = {}
        for cat in df["category"].unique():
            cat_df  = df[df["category"] == cat]
            monthly = (
                cat_df
                .groupby(cat_df["date"].dt.to_period("M"))["amount"]
                .sum()
                .sort_index()
            )
            result[cat] = monthly.values
        return result

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

        monthly_series = self._to_monthly_series(df)

        predictions = {}
        for cat, values in monthly_series.items():
            pred = self._predict_category(values, cat)
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
                try:
                    dates = df["date"].dt.tz_convert(None)
                except TypeError:
                    dates = df["date"].dt.tz_localize(None)
                num_months = dates.dt.to_period("M").nunique()

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

            if num_months >= 25:
                notes.append(
                    "50/30/20 rule applied with full seasonal analysis from 2+ years of history."
                )
            elif num_months >= 6:
                notes.append(
                    "50/30/20 rule applied, personalized from your spending history."
                )
            elif num_months >= 1:
                notes.append(
                    f"Only {num_months} month(s) of data — using 50/30/20 as a safe baseline. "
                    "Keep tracking for a fully personalized plan!"
                )

        needs_cap = spending_cap * needs_pct
        wants_cap = spending_cap * wants_pct

        needs_breakdown: dict = {}
        wants_breakdown: dict = {}

        # ── Affordability check — before building any budget ──────────────────
        # If income < rent + food(avg 6mo) + EMI, the user cannot afford basics.
        # Return a warning instead of a misleading budget.
        rent_predicted = float(pred_needs.get("rent", 0))
        food_predicted = float(pred_needs.get("food and groceries", 0))
        emi_predicted  = float(pred_needs.get("emi & insurance", 0))
        minimum_needed = rent_predicted + food_predicted + emi_predicted

        if minimum_needed > 0 and monthly_income < minimum_needed:
            return {
                "monthly_income":      int(monthly_income),
                "recommended_savings": 0,
                "total_living_budget": 0,
                "needs_total":         0,
                "needs_breakdown":     {},
                "wants_total":         0,
                "wants_breakdown":     {},
                "unaffordable":        True,
                "note": [
                    f"🚨 Your income (৳{int(monthly_income):,}) is less than your minimum obligations — "
                    f"rent ৳{int(rent_predicted):,} + food ৳{int(food_predicted):,} + EMI ৳{int(emi_predicted):,} = ৳{int(minimum_needed):,}. "
                    f"A budget cannot be created. Please reduce your rent or EMI, or increase your income."
                ],
                "data_months": num_months,
            }

        # ── Normal allocation — 50/30/20 proportional split ───────────────────
        # Needs: fixed first (rent, EMI), then variable needs proportionally
        for cat in FIXED_CATEGORIES:
            amt = pred_needs.get(cat, 0)
            if amt > 0:
                needs_breakdown[cat] = round(float(amt))

        fixed_total     = sum(needs_breakdown.values())
        remaining_needs = max(0.0, needs_cap - fixed_total)

        var_needs = {
            c: float(pred_needs[c])
            for c in NEEDS_CATEGORIES
            if c not in FIXED_CATEGORIES and pred_needs.get(c, 0) > 0
        }
        if var_needs and remaining_needs > 0:
            var_sum = sum(var_needs.values())
            for cat, amt in var_needs.items():
                needs_breakdown[cat] = round(amt * (remaining_needs / var_sum))

        # Wants: proportional split
        if pred_wants and wants_cap > 0:
            wants_sum = sum(pred_wants.values())
            for cat, amt in pred_wants.items():
                wants_breakdown[cat] = round(float(amt) * (wants_cap / wants_sum))

        # ── Fallback if no transaction data ───────────────────────────────────
        if not needs_breakdown:
            notes.append("No expense history — using standard starter allocation.")
            needs_breakdown = {
                "rent":               round(needs_cap * 0.40),
                "food and groceries": round(needs_cap * 0.28),
                "bills":              round(needs_cap * 0.15),
                "transport":          round(needs_cap * 0.10),
                "emi & insurance":    round(needs_cap * 0.07),
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

        # ── Hard cap trim — total must never exceed spending_cap ──────────────
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
    