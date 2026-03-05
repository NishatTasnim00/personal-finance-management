import pandas as pd
import numpy as np
from models.linear_trend import MonthlyTrendRegressor
from models.sarima_trend import MonthlySARIMATrendRegressor
from reports.performance import evaluate_linear_trend, evaluate_sarima


# ── KeywordCategorizer replaces LLMCategorizer (no Ollama needed) ────────────
class KeywordCategorizer:
    """
    Maps app category values + description keywords to standardized labels.
    Matches the mandatory_labels and wants_labels used in BudgetAI.
    """

    # Direct map from app category values → BudgetAI labels
    CATEGORY_MAP = {
        "rent":          "House Rent",
        "bills":         "Utilities",
        "phone":         "Utilities",
        "food and groceries":     "food and groceries",
        "health":        "Healthcare",
        "education":     "Education",
        "transport":     "Transportation",
        "food":          "Dining Out",
        "entertainment": "Entertainment",
        "shopping":      "Shopping",
        "travel":        "Travel",
        "fitness":       "Health and Fitness",
        "other":         "Miscellaneous",
    }

    KEYWORD_MAP = [
        (["rent", "house", "flat", "bari", "basa", "apartment", "mortgage", "emi", "loan", "installment"], "House Rent"),
        (["food and groceries", "grocery", "bazar", "shwapno", "meena", "supermarket", "vegetable", "rice", "fish", "meat"], "food and groceries"),
        (["electricity", "wasa", "water", "gas", "internet", "wifi", "broadband", "utility", "utilities", "bill", "bills"], "Utilities"),
        (["phone", "mobile", "recharge", "airtel", "robi", "grameenphone", "gp", "banglalink"], "Utilities"),
        (["school", "college", "university", "tuition", "tution", "coach", "education", "books"], "Education"),
        (["doctor", "hospital", "pharmacy", "medicine", "clinic", "health", "labaid"], "Healthcare"),
        (["bus", "train", "cng", "rickshaw", "uber", "pathao", "fuel", "petrol", "metro", "transport"], "Transportation"),
        (["restaurant", "dining", "cafe", "coffee", "foodpanda", "shohoz", "fast food", "kfc", "pizza"], "Dining Out"),
        (["netflix", "spotify", "youtube", "movie", "cinema", "game", "pubg", "entertainment", "subscription"], "Entertainment"),
        (["daraz", "clothing", "fashion", "shoes", "bag", "accessories", "shopping"], "Shopping"),
        (["travel", "hotel", "flight", "trip", "vacation", "tour"], "Travel"),
        (["gym", "fitness", "yoga", "sport", "workout"], "Health and Fitness"),
    ]

    def predict(self, category: str, description: str = "") -> str:
        # 1. Direct category value match
        if category:
            clean = str(category).strip().lower()
            if clean in self.CATEGORY_MAP:
                return self.CATEGORY_MAP[clean]

        # 2. Keyword match on category + description text
        text = f"{category} {description}".lower()
        for keywords, label in self.KEYWORD_MAP:
            if any(kw in text for kw in keywords):
                return label

        return "Miscellaneous"


# ── BudgetAI — your original logic, unchanged ─────────────────────────────────
class BudgetAI:
    def __init__(self):
        self.categorizer = KeywordCategorizer()
        self.mandatory_labels = [
            "Rent",
            "Utilities",
            "food and groceries",
            "EMI/Loan/Insurance",
            "Debt",
            "Transportation",
            "Bills",
            "Loan EMI",
            "House Rent",
            "Education",
            "Health and Fitness",
            "Utility",
            "Healthcare",
            "EMI/Loan/Insurance",
        ]
        self.wants_labels = [
            "Dining Out",
            "Shopping",
            "Subscriptions",
            "Entertainment",
            "Netflix",
            "Food Delivery",
            "Personal Care",
            "Gifts",
            "Clothing",
            "Food & Drinks",
            "Travel",
            "Movies",
            "Coffee",
        ]
        self.fixed_budget = ["Rent", "EMI/Loan/Insurance", "House Rent"]

    # def _predict_category_trend(self, cat_data, category_name=None):
    #     """
    #     Predict next month amount using regression + safety caps
    #     """
    #     if cat_data.empty:
    #         return 0

    #     monthly = (
    #         cat_data.groupby(cat_data["date"].dt.to_period("M"))["amount"]
    #         .sum()
    #         .sort_index()
    #     )

    #     values = monthly[monthly > 0].values

    #     if len(values) == 0:
    #         return 0

    #     # Special handling for fixed costs: Use max of last 3 months instead of regression
    #     # This prevents under-predicting rent/EMI if the trend is flat or slightly negative
    #     if category_name in self.fixed_budget:
    #         # If we have recent data, trust the recent high (e.g., rent increase)
    #         return round(values[-3:].max()) if len(values) > 0 else 0

    #     # Too little data → mean fallback
    #     if len(values) <= 3:
    #         return round(values.mean() * 1.05)

    #     reg = MonthlyTrendRegressor().fit(values)
    #     pred = reg.predict_next()
    #     params = reg.get_params()

    #     # 🔒 Safety logic
    #     if params["slope"] <= 0:
    #         return round(values.mean())

    #     capped_pred = min(pred, values.max() * 1.2)
    #     return round(capped_pred * 1.05)

    def _predict_category_trend(self, cat_data, category_name=None):
        if cat_data.empty:
            return 0

        monthly = (
            cat_data.groupby(cat_data["date"].dt.tz_localize(None).dt.to_period("M"))["amount"]
            .sum()
            .sort_index()
        )

        values = monthly[monthly > 0].values

        if len(values) == 0:
            return 0

        if category_name in self.fixed_budget:
            return round(np.max(values[-4:])) if len(values) >= 1 else 0

        if len(values) <= 5:
            return round(np.mean(values) * 1.05)

        try:
            reg = MonthlySARIMATrendRegressor(
                seasonal_period=12,
                max_pdq=3,
                max_PDQ=2,
                stepwise=True,
            ).fit(values)

            if reg.is_fitted:
                pred = reg.predict_next()
                hist_max = values.max()
                pred = min(pred, hist_max * 1.25)
                pred = max(pred, hist_max * 0.65)
                return round(pred * 1.05)

            return round(np.mean(values[-6:]) * 1.07)

        except Exception as e:
            print(f"SARIMA failed for {category_name}: {e}")
            return round(np.mean(values[-6:]) * 1.07)

    def _filter_expenses(self, df):
        df = df.copy()
        col_map = {c.lower(): c for c in df.columns}
        if "type" in col_map:
            type_col = col_map["type"]
            df = df[df[type_col].astype(str).str.lower().str.strip() != "income"]
        df["amount"] = df["amount"].abs()
        return df

    def predict_next_month_budget(self, transaction_history):
        df = pd.DataFrame(transaction_history)
        if df.empty:
            return {"breakdown": {}, "total_predicted": 0}

        df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
        df = df.dropna(subset=["date", "amount", "category"])
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")

        df = self._filter_expenses(df)

        if df.empty:
            return {"breakdown": {}, "total_predicted": 0}

        df["predicted_category"] = df.apply(
            lambda row: self.categorizer.predict(
                row.get("category", ""),
                row.get("description", "")
            ), axis=1
        )

        predictions = {}
        for cat in df["predicted_category"].unique():
            cat_data = df[df["predicted_category"] == cat]
            predictions[cat] = self._predict_category_trend(cat_data, category_name=cat)

        return {"breakdown": predictions, "total_predicted": sum(predictions.values())}

    def create_balanced_budget(self, transaction_history, monthly_income=None, total_budget=None):
        note = []

        df = pd.DataFrame(transaction_history)
        if df.empty:
            num_months = 0
        else:
            df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
            df = df.dropna(subset=["date"])
            df = self._filter_expenses(df)
            if df.empty:
                num_months = 0
            else:
                df["month"] = df["date"].dt.tz_localize(None).dt.to_period("M")
                num_months = df["month"].nunique()

        base = self.predict_next_month_budget(transaction_history)
        base_prediction = base["breakdown"]

        needs_categories = [c for c in base_prediction if c in self.mandatory_labels]
        wants_categories = [c for c in base_prediction if c in self.wants_labels]
        other_categories = [
            c for c in base_prediction
            if c not in needs_categories and c not in wants_categories
        ]
        wants_categories += other_categories

        use_503020 = num_months >= 3

        if total_budget is not None:
            spending_cap = total_budget
            note.append("You set a custom spending limit — we've respected it while protecting essentials.")
            if monthly_income is None:
                savings = 0
                note.append("No income provided. Savings set to 0 since we're working within your fixed limit.")
            else:
                savings = max(0, monthly_income - total_budget)
                if savings == 0:
                    note.append("Your limit uses full income — savings paused to stay within budget.")
            needs_pct = 0.60
            wants_pct = 0.40
        else:
            if monthly_income is None:
                monthly_income = 50000
                note.append(
                    "No income or limit provided — showing a sample budget based on average spending patterns. "
                    "Enter your actual income and/or desired limit for a personalized plan!"
                )
            spending_cap = monthly_income * 0.80
            savings = monthly_income * 0.20
            note.append("Following healthy 50/30/20 rule with full savings protected.")
            needs_pct = 0.625
            wants_pct = 0.375

        needs_cap = spending_cap * needs_pct
        wants_cap = spending_cap * wants_pct

        needs_sum = sum(base_prediction.get(c, 0) for c in needs_categories) or 1
        wants_sum = sum(base_prediction.get(c, 0) for c in wants_categories) or 1

        needs_breakdown = {
            c: round(base_prediction.get(c, 0) * (needs_cap / needs_sum))
            for c in needs_categories
            if base_prediction.get(c, 0) > 0
        }
        wants_breakdown = {
            c: round(base_prediction.get(c, 0) * (wants_cap / wants_sum))
            for c in wants_categories
            if base_prediction.get(c, 0) > 0
        }

        for fixed_cat in self.fixed_budget:
            if fixed_cat in base_prediction:
                historical = base_prediction[fixed_cat]
                current = needs_breakdown.get(fixed_cat, 0)
                if current < historical * 0.9:
                    boost_needed = historical - current
                    needs_breakdown[fixed_cat] = historical
                    if wants_breakdown and boost_needed > 0:
                        reduction_per_want = boost_needed / len(wants_breakdown)
                        for w in list(wants_breakdown):
                            wants_breakdown[w] = max(0, round(wants_breakdown[w] - reduction_per_want))
                    note.append(f"{fixed_cat} protected at full historical amount.")

        if not needs_breakdown:
            note.append("No past expenses detected — using standard starter Needs allocation.")
            needs_breakdown = {
                "House Rent":            int(needs_cap * 0.40),
                "food and groceries":             int(needs_cap * 0.25),
                "Utilities & Bills":     int(needs_cap * 0.15),
                "Transportation":        int(needs_cap * 0.10),
                "Healthcare/Insurance":  int(needs_cap * 0.10),
            }

        if not wants_breakdown:
            note.append("No past wants detected — using standard starter Wants allocation.")
            wants_breakdown = {
                "Dining Out & Food Delivery":    int(wants_cap * 0.30),
                "Entertainment & Subscriptions": int(wants_cap * 0.25),
                "Shopping & Personal Care":      int(wants_cap * 0.20),
                "Travel & Leisure":              int(wants_cap * 0.15),
                "Miscellaneous Fun":             int(wants_cap * 0.10),
            }

        return {
            "monthly_income":       monthly_income if monthly_income is not None else "Not provided",
            "recommended_savings":  int(savings),
            "total_living_budget":  int(spending_cap),
            "needs_total":          int(needs_cap),
            "needs_breakdown":      needs_breakdown,
            "wants_total":          int(wants_cap),
            "wants_breakdown":      wants_breakdown,
            "note":                 note,
            "using_503020":         use_503020,
            "data_months":          num_months,
            "predicted_raw":        base_prediction,
        }

    def linear_regression_performance_report(self, transaction_history):
        df = pd.DataFrame(transaction_history)
        if df.empty:
            return {}
        df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
        df = df.dropna(subset=["date", "amount", "category"])
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        df = self._filter_expenses(df)
        if df.empty:
            return {}
        df["predicted_category"] = df.apply(
            lambda row: self.categorizer.predict(row.get("category", ""), row.get("description", "")), axis=1
        )
        report = {}
        for cat in df["predicted_category"].unique():
            cat_df = df[df["predicted_category"] == cat]
            monthly = cat_df.groupby(cat_df["date"].dt.tz_localize(None).dt.to_period("M"))["amount"].sum().sort_index()
            metrics = evaluate_linear_trend(monthly.values)
            if metrics:
                report[cat] = metrics
        return report

    def sarima_performance_report(self, transaction_history, seasonal_period=12):
        df = pd.DataFrame(transaction_history)
        if df.empty:
            return {}
        df["date"] = pd.to_datetime(df["date"], errors="coerce", utc=True)
        df = df.dropna(subset=["date", "amount", "category"])
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        df = self._filter_expenses(df)
        if df.empty:
            return {}
        df["predicted_category"] = df.apply(
            lambda row: self.categorizer.predict(row.get("category", ""), row.get("description", "")), axis=1
        )
        report = {}
        for cat in df["predicted_category"].unique():
            cat_df = df[df["predicted_category"] == cat]
            monthly = cat_df.groupby(cat_df["date"].dt.tz_localize(None).dt.to_period("M"))["amount"].sum().sort_index()
            metrics = evaluate_sarima(monthly.values, seasonal_period=seasonal_period)
            if metrics:
                report[cat] = metrics
        return report

    def combined_performance_report(self, transaction_history):
        linear_report = self.linear_regression_performance_report(transaction_history)
        sarima_report = self.sarima_performance_report(transaction_history)
        combined = {}
        all_cats = set(linear_report.keys()) | set(sarima_report.keys())
        for cat in all_cats:
            combined[cat] = {
                "linear": linear_report.get(cat),
                "sarima": sarima_report.get(cat),
            }
        return combined
