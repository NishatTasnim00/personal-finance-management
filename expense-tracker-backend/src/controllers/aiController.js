import { spawn } from "child_process";
import path from "path";
import Expense from "../models/Expense.js";
import Income from "../models/Income.js";
import BudgetPlan from "../models/BudgetPlan.js";
import Budget from "../models/Budget.js";
import User from "../models/User.js";

// --- Helper to run Python Script ---
const runBudgetAI = (inputData) => {
  return new Promise((resolve, reject) => {
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python3";
    const scriptPath =
      process.env.AI_SCRIPT_PATH ||
      path.join(
        process.cwd(),
        "src",
        "ExpenseTrackerModel",
        "budget_wrapper.py",
      );
    const scriptDir = path.dirname(scriptPath);

    console.log("Spawning python process:", pythonExecutable, scriptPath);
    const pythonProcess = spawn(
      `"${pythonExecutable}" "${scriptPath}"`,
      [],
      {
        cwd: scriptDir,
        shell: true,
      }
    );

    let dataString = "";
    let errorString = "";

    pythonProcess.stdin.write(JSON.stringify(inputData));
    pythonProcess.stdin.end();

    pythonProcess.stdout.on("data", (data) => {
      dataString += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorString += data.toString();
    });

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        console.error("Python script error output:", errorString);
        reject(new Error(errorString || "Python script failed"));
      } else {
        try {
          const result = JSON.parse(dataString);
          resolve(result);
        } catch (e) {
          console.error("JSON parse error:", e);
          reject(new Error("Failed to parse Python output"));
        }
      }
    });
  });
};

// --- Controllers ---

// 1. Get Stored Plan (or return 404)
export const getStoredBudgetPlan = async (req, res) => {
  try {
    const { uid: userId } = req.user;
    const { month } = req.query; // YYYY-MM

    if (!month) {
      return res.status(400).json({ message: "Month is required (YYYY-MM)" });
    }

    const plan = await BudgetPlan.findOne({ userId, month });
    if (!plan) {
      return res.status(404).json({ message: "No plan found for this month" });
    }

    res.json({ success: true, plan });
  } catch (error) {
    console.error("getStoredBudgetPlan error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 2. Generate and Save Plan
export const generateBudgetPlan = async (req, res) => {
  try {
    const { uid: userId } = req.user;
    const { monthlyIncome, totalBudget, month } = req.body; // month is YYYY-MM

    if (!month) {
      return res.status(400).json({ message: "Target month is required" });
    }

    // Fetch Expenses (limit to last 1000 transactions)
    const expenses = await Expense.find({ userId })
      .sort({ date: -1 })
      .limit(1000);

    // Calculate monthly income if not provided
    let calculatedIncome = monthlyIncome;

    // 1. User profile monthly income (most reliable)
    if (!calculatedIncome) {
      const user = await User.findOne({ uid: userId });
      if (user && user.monthlyIncome > 0) {
        calculatedIncome = user.monthlyIncome;
      }
    }

    // 2. Fallback: last month's actual income
    if (!calculatedIncome) {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      const startOfMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
      const endOfMonth   = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
      const incomes = await Income.aggregate([
        { $match: { userId, date: { $gte: startOfMonth, $lte: endOfMonth } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      if (incomes.length > 0 && incomes[0].total > 0) {
        calculatedIncome = incomes[0].total;
      }
    }

    const transactions = expenses.map((e) => ({
      date: e.date.toISOString(),
      amount: e.amount,
      category: e.category,
      description: e.description || e.category,
      type: "Expense",
    }));

    const inputData = {
      transactions,
      monthly_income: Number(calculatedIncome) || 50000,
      total_budget: totalBudget ? Number(totalBudget) : null,
    };

    // Run AI
    const result = await runBudgetAI(inputData);

    // Save to DB
    const planData = {
      userId,
      month,
      monthlyIncome: result.monthly_income,
      recommendedSavings: result.recommended_savings,
      totalLivingBudget: result.total_living_budget,
      needsTotal: result.needs_total,
      wantsTotal: result.wants_total,
      needsBreakdown: result.needs_breakdown,
      wantsBreakdown: result.wants_breakdown,
      note: result.note,
      isAccepted: false,
    };

    const savedPlan = await BudgetPlan.findOneAndUpdate(
      { userId, month },
      planData,
      { new: true, upsert: true },
    );

    res.json({ success: true, plan: savedPlan });
  } catch (error) {
    console.error("generateBudgetPlan error:", error);
    res.status(500).json({ message: error.message || "Server error" });
  }
};

// 3. Accept Plan (Apply to Budgets)
export const acceptBudgetPlan = async (req, res) => {
  try {
    const { uid: userId } = req.user;
    const { month } = req.body;

    const plan = await BudgetPlan.findOne({ userId, month });
    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    const allCategories = {
      ...Object.fromEntries(plan.needsBreakdown),
      ...Object.fromEntries(plan.wantsBreakdown),
    };

    // Build startDate/endDate for the plan's month
    const [planYear, planMon] = plan.month.split("-").map(Number);
    const startDate = new Date(planYear, planMon - 1, 1);
    const endDate   = new Date(planYear, planMon, 0, 23, 59, 59, 999);

    // Remove any existing AI-generated budgets for this plan (clean slate)
    await Budget.deleteMany({ userId, aiPlanId: plan._id });

    // Create one budget per category, stamped with this plan's month window
    await Budget.insertMany(
      Object.entries(allCategories).map(([category, amount]) => ({
        userId,
        category: category.toLowerCase(),
        amount,
        period: "monthly",
        startDate,
        endDate,
        aiPlanId: plan._id,
        isAIGenerated: true,
      }))
    );

    plan.isAccepted = true;
    await plan.save();

    res.json({ success: true, message: "Budgets updated successfully" });
  } catch (error) {
    console.error("acceptBudgetPlan error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// 4. Delete Plan
export const deleteBudgetPlan = async (req, res) => {
  try {
    const { uid: userId } = req.user;
    const { month } = req.query;

    if (!month) {
      return res.status(400).json({ message: "Month is required (YYYY-MM)" });
    }

    const deleted = await BudgetPlan.findOneAndDelete({ userId, month });
    if (!deleted) {
      return res.status(404).json({ message: "No plan found for this month" });
    }

    // Delete all budgets that were created from this plan
    await Budget.deleteMany({ userId, aiPlanId: deleted._id });

    res.json({ success: true, message: "Plan deleted" });
  } catch (error) {
    console.error("deleteBudgetPlan error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
