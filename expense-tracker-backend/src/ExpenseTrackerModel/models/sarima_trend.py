import warnings
import numpy as np
import pandas as pd
from statsmodels.tsa.statespace.sarimax import SARIMAX
from pmdarima import auto_arima

warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)


class MonthlySARIMATrendRegressor:
    """
    SARIMA model with automatic parameter selection via auto_arima.
    Designed for monthly data with yearly seasonality (m=12).

    Key improvements:
    - Detects flat series (CV < 0.02) and step-change series (CV < 0.15, ≤4 unique values)
      BEFORE calling auto_arima — prevents all singular matrix crashes
    - Caps max_d=1, max_D=1 to prevent over-differencing
    - Fallback chain: flat/step → last value, failed fit → weighted mean × 1.07
    """

    def __init__(self, seasonal_period=12, max_pdq=2, max_PDQ=1, stepwise=True):
        self.seasonal_period     = seasonal_period
        self.max_pdq             = max_pdq
        self.max_PDQ             = max_PDQ
        self.stepwise            = stepwise

        self.model               = None
        self.fitted_model        = None
        self.is_fitted           = False
        self.is_flat             = False
        self.last_value          = None
        self.recent_mean         = None
        self.best_order          = None
        self.best_seasonal_order = None

    @staticmethod
    def _is_flat_or_step(values: np.ndarray) -> bool:
        """
        Returns True if the series is too flat/structured for SARIMA to fit.
        Covers:
          - Perfectly flat (rent ৳14,000 every month) → CV < 0.02
          - Step-change (emi ৳3k→৳4k→৳5k, ≤4 distinct levels) → CV < 0.15 and n_unique ≤ 4
        Both cases produce singular matrices in auto_arima.
        """
        nonzero = values[values > 0]
        if len(nonzero) == 0:
            return True
        mean = np.mean(nonzero)
        if mean == 0:
            return True
        cv = float(np.std(nonzero) / mean)
        if cv < 0.02:
            return True
        n_unique = len(np.unique(np.round(nonzero, -2)))  # rounded to nearest 100
        if cv < 0.15 and n_unique <= 4:
            return True
        return False

    @staticmethod
    def _weighted_mean(values: np.ndarray, window: int = 6) -> float:
        recent = values[-window:] if len(values) >= window else values
        weights = np.exp(np.linspace(0, 1, len(recent)))
        weights /= weights.sum()
        return float(np.dot(weights, recent))

    def fit(self, values):
        values = np.asarray(values, dtype=float)
        nonzero = values[values > 0]

        if len(nonzero) < self.seasonal_period:
            self.is_fitted = False
            return self

        self.last_value  = float(values[-1])
        self.recent_mean = self._weighted_mean(nonzero)

        # ── Flat / step-change check ──────────────────────────────────────────
        if self._is_flat_or_step(values):
            self.is_flat   = True
            self.is_fitted = False
            return self

        y = pd.Series(nonzero, dtype=float)
        y.index = pd.period_range(start="2020-01", periods=len(y), freq="M")

        # Seasonality only when 2+ full cycles available
        if len(nonzero) <= 2 * self.seasonal_period:
            use_seasonal = False
            current_m    = 1
        else:
            use_seasonal = True
            current_m    = self.seasonal_period

        try:
            auto_model = auto_arima(
                y,
                seasonal          = use_seasonal,
                m                 = current_m,
                max_p             = self.max_pdq,
                max_d             = 1,
                max_q             = self.max_pdq,
                max_P             = self.max_PDQ,
                max_D             = 1,
                max_Q             = self.max_PDQ,
                stepwise          = self.stepwise,
                suppress_warnings = True,
                error_action      = "ignore",
                with_oob          = False,
            )

            self.best_order          = auto_model.order
            self.best_seasonal_order = auto_model.seasonal_order

            self.model = SARIMAX(
                y,
                order                 = self.best_order,
                seasonal_order        = self.best_seasonal_order,
                enforce_stationarity  = False,
                enforce_invertibility = False,
            )
            self.fitted_model = self.model.fit(disp=0)
            self.is_fitted    = True

        except Exception as e:
            pass  # silent — fallback handled by predict_next()
            self.is_fitted = False

        return self

    def predict_next(self) -> float:
        # Flat / step-change → last known value is the best prediction
        if self.is_flat:
            return self.last_value

        if self.is_fitted and self.fitted_model is not None:
            fc = self.fitted_model.get_forecast(steps=1)
            return float(fc.predicted_mean.iloc[0])

        # Fallback — weighted recent mean with small buffer
        if self.recent_mean is not None:
            return self.recent_mean * 1.07
        raise RuntimeError("SARIMA: no fitted model and no fallback available")

    def get_params(self) -> dict:
        if self.is_flat:
            return {"note": "Flat/step series — using last value", "last_value": self.last_value}
        if not self.is_fitted:
            return {"note": "SARIMA not fitted — using weighted mean fallback"}
        return {
            "order":          self.best_order,
            "seasonal_order": self.best_seasonal_order,
            "aic":            float(self.fitted_model.aic) if self.fitted_model else None,
        }
    