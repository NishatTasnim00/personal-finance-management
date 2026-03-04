import Budget from '../models/Budget.js';
import Expense from '../models/Expense.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const getUserId = (req) => req.user.uid || req.user.id || req.user.sub;

// ── Date helpers ──────────────────────────────────────────────────────────────

// Get start/end of a period from a reference date
export const getPeriodRange = (period, refDate = new Date()) => {
  const d = new Date(refDate);
  switch (period) {
    case 'monthly': {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end   = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'weekly': {
      // Week starts Monday
      const day   = d.getDay(); // 0=Sun
      const diff  = (day === 0 ? -6 : 1 - day);
      const start = new Date(d);
      start.setDate(d.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    case 'yearly': {
      const start = new Date(d.getFullYear(), 0, 1);
      const end   = new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
      return { start, end };
    }
    default:
      return { start: null, end: null };
  }
};

// Build a human-readable period label  e.g. "Mar 2025", "17–23 Mar 2025", "2025"
export const getPeriodLabel = (period, startDate, endDate) => {
  const s = new Date(startDate);
  const e = new Date(endDate);
  switch (period) {
    case 'monthly':
      return s.toLocaleString('default', { month: 'short', year: 'numeric' });
    case 'weekly': {
      const sStr = s.toLocaleString('default', { day: 'numeric', month: 'short' });
      const eStr = e.toLocaleString('default', { day: 'numeric', month: 'short', year: 'numeric' });
      return `${sStr} – ${eStr}`;
    }
    case 'yearly':
      return `${s.getFullYear()}`;
    default:
      return '';
  }
};

// ── Controllers ───────────────────────────────────────────────────────────────

export const createBudget = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { category, amount, period, refDate } = req.body;

    if (!category || !amount || !period) {
      return errorResponse(res, 'Category, amount, and period are required', 400);
    }

    const { start, end } = getPeriodRange(period, refDate ? new Date(refDate) : new Date());

    const budget = await Budget.findOneAndUpdate(
      { userId, category: category.trim().toLowerCase(), startDate: start, endDate: end },
      { amount: Number(amount), period, isAIGenerated: false, aiPlanId: null },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    successResponse(res, budget, 201, 'Budget created successfully');
  } catch (err) {
    console.error('createBudget error:', err);
    errorResponse(res, err.message || 'Failed to create budget', 500);
  }
};

export const getBudgets = async (req, res) => {
  try {
    const userId = getUserId(req);
    // month = "YYYY-MM" — show all budgets whose window overlaps this month
    // category = optional filter
    // period = optional filter (weekly/monthly/yearly)
    const { month, category, period } = req.query;

    // Build overlap filter
    const filter = { userId };

    if (month) {
      const [year, mon] = month.split('-').map(Number);
      const monthStart = new Date(year, mon - 1, 1);
      const monthEnd   = new Date(year, mon, 0, 23, 59, 59, 999);
      // Overlap: budget starts before month ends AND budget ends after month starts
      filter.startDate = { $lte: monthEnd };
      filter.endDate   = { $gte: monthStart };
    }

    if (category) filter.category = category.toLowerCase();
    if (period)   filter.period   = period;

    const budgets = await Budget.find(filter).sort({ startDate: -1 }).lean();

    // For each budget calculate:
    //   totalSpent  = all expenses within [budget.startDate, budget.endDate]
    //   monthSpent  = expenses within overlap of budget window and selected month
    const monthStart = month
      ? new Date(Number(month.split('-')[0]), Number(month.split('-')[1]) - 1, 1)
      : null;
    const monthEnd = month
      ? new Date(Number(month.split('-')[0]), Number(month.split('-')[1]), 0, 23, 59, 59, 999)
      : null;

    const enhanced = await Promise.all(budgets.map(async (b) => {
      // Total spent across full budget period
      const totalSpentResult = await Expense.aggregate([
        {
          $match: {
            userId,
            category: b.category,
            date: { $gte: b.startDate, $lte: b.endDate },
          },
        },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      const totalSpent = totalSpentResult[0]?.total || 0;

      // Month spent = expenses in overlap of [budget window] and [selected month]
      let monthSpent = null;
      if (monthStart && monthEnd) {
        const overlapStart = new Date(Math.max(b.startDate, monthStart));
        const overlapEnd   = new Date(Math.min(b.endDate,   monthEnd));
        if (overlapStart <= overlapEnd) {
          const monthSpentResult = await Expense.aggregate([
            {
              $match: {
                userId,
                category: b.category,
                date: { $gte: overlapStart, $lte: overlapEnd },
              },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
          ]);
          monthSpent = monthSpentResult[0]?.total || 0;
        }
      }

      const remaining = b.amount - totalSpent;
      const progress  = b.amount > 0 ? (totalSpent / b.amount) * 100 : 0;

      return {
        ...b,
        totalSpent,
        // Only include monthSpent separately when it differs from totalSpent
        monthSpent: (monthSpent !== null && monthSpent !== totalSpent) ? monthSpent : null,
        remaining,
        progress:    Math.min(progress, 200),
        isOverBudget: totalSpent > b.amount,
        periodLabel: getPeriodLabel(b.period, b.startDate, b.endDate),
      };
    }));

    successResponse(res, enhanced);
  } catch (err) {
    console.error('getBudgets error:', err);
    errorResponse(res, 'Server error', 500);
  }
};

export const updateBudget = async (req, res) => {
  try {
    const { amount, category, period, refDate } = req.body;
    const userId = getUserId(req);

    const update = {};
    if (amount)   update.amount   = Number(amount);
    if (category) update.category = category.trim().toLowerCase();

    // If period changes, recalculate startDate/endDate
    if (period) {
      update.period = period;
      const { start, end } = getPeriodRange(period, refDate ? new Date(refDate) : new Date());
      update.startDate = start;
      update.endDate   = end;
    }

    const budget = await Budget.findOneAndUpdate(
      { _id: req.params.id, userId },
      update,
      { new: true, runValidators: true }
    );

    if (!budget) return errorResponse(res, 'Budget not found', 404);
    successResponse(res, budget, 200, 'Budget updated');
  } catch (err) {
    console.error('updateBudget error:', err);
    errorResponse(res, err.message || 'Failed to update', 500);
  }
};

export const deleteBudget = async (req, res) => {
  try {
    const budget = await Budget.findOneAndDelete({
      _id: req.params.id,
      userId: getUserId(req),
    });

    if (!budget) return errorResponse(res, 'Budget not found', 404);
    successResponse(res, null, 200, 'Budget deleted');
  } catch (err) {
    console.error('deleteBudget error:', err);
    errorResponse(res, 'Server error', 500);
  }
};
