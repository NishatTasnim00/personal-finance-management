/**
 * seed.js
 * Inserts 1 year of realistic income + expense data for a user.
 *
 * Usage:
 *   1. Place this file in expense-tracker-backend/
 *   2. Run: node seed.js
 *
 * Requires MONGODB_URI in .env or set it directly below.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const USER_ID = "qM3077NfvJRgXnJzpThbtIA0Se02";
const MONTHLY_INCOME = 50000;
const MONGODB_URI = process.env.MONGODB_URI;

// ── Schemas (inline so we don't need to import from src) ─────────────────────
const expenseSchema = new mongoose.Schema({
  userId: String,
  category: String,
  description: String,
  amount: Number,
  date: Date,
  recurring: Boolean,
  recurringFrequency: String,
}, { timestamps: true });

const incomeSchema = new mongoose.Schema({
  userId: String,
  source: String,
  description: String,
  amount: Number,
  date: Date,
}, { timestamps: true });

const Expense = mongoose.model("Expense", expenseSchema);
const Income = mongoose.model("Income", incomeSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────
const randomBetween = (min, max) =>
  Math.round(Math.random() * (max - min) + min);

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

const dateInMonth = (year, month, day) => new Date(year, month, day);

// ── Expense templates per category ───────────────────────────────────────────
const expenseTemplates = [
  // Fixed needs - same every month
  { category: "rent",       description: "House rent",         min: 14000, max: 14000, recurring: true,  freq: "monthly", daysOfMonth: [1] },
  { category: "bills",      description: "Electricity bill",   min: 1200,  max: 1800,  recurring: true,  freq: "monthly", daysOfMonth: [7] },
  { category: "bills",      description: "Internet (WiFi)",    min: 700,   max: 700,   recurring: true,  freq: "monthly", daysOfMonth: [5] },
  { category: "phone",      description: "Mobile recharge",    min: 300,   max: 500,   recurring: false, freq: null,      daysOfMonth: [10] },

  // Variable needs - slightly different each month
  { category: "groceries",  description: "Bazar / Shwapno",    min: 5000,  max: 8000,  recurring: false, freq: null,      daysOfMonth: [3, 17] },
  { category: "transport",  description: "Rickshaw / CNG",     min: 600,   max: 1200,  recurring: false, freq: null,      daysOfMonth: [5, 12, 20, 26] },
  { category: "health",     description: "Medicine / Pharmacy",min: 300,   max: 800,   recurring: false, freq: null,      daysOfMonth: [14] },

  // Wants - lifestyle
  { category: "dining",     description: "Restaurant / Dining",min: 500,   max: 1500,  recurring: false, freq: null,      daysOfMonth: [8, 22] },
  { category: "dining",     description: "Foodpanda / Delivery",min: 300,  max: 700,   recurring: false, freq: null,      daysOfMonth: [15] },
  { category: "entertainment", description: "Netflix subscription", min: 650, max: 650, recurring: true, freq: "monthly", daysOfMonth: [1] },
  { category: "entertainment", description: "Movies / Cinema", min: 400,   max: 800,   recurring: false, freq: null,      daysOfMonth: [20] },
  { category: "shopping",   description: "Clothing / Daraz",   min: 1000,  max: 3000,  recurring: false, freq: null,      daysOfMonth: [25] },
  { category: "fitness",    description: "Gym membership",     min: 800,   max: 800,   recurring: true,  freq: "monthly", daysOfMonth: [1] },

  // Occasional / seasonal
  { category: "education",  description: "Online course / Books", min: 500, max: 2000, recurring: false, freq: null,     daysOfMonth: [10] },
  { category: "travel",     description: "Weekend trip / Travel", min: 3000, max: 8000, recurring: false, freq: null,    daysOfMonth: [22] },
  { category: "other",      description: "Miscellaneous",      min: 200,   max: 800,   recurring: false, freq: null,      daysOfMonth: [28] },
];

// Some expenses only appear certain months (more realistic)
const OCCASIONAL_CATEGORIES = ["travel", "education", "shopping"];
const OCCASIONAL_PROBABILITY = 0.5; // 50% chance each month

// Income sources
const incomeSources = [
  { source: "salary",     description: "Monthly salary",       amount: 50000, day: 1  },
  { source: "freelance",  description: "Freelance project",    amount: null,  day: 15 }, // variable
  { source: "other",      description: "Bonus / Extra income", amount: null,  day: 25 }, // occasional
];

// ── Seed function ─────────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  // Clear existing data for this user
  await Expense.deleteMany({ userId: USER_ID });
  await Income.deleteMany({ userId: USER_ID });
  console.log("🗑️  Cleared existing data for user");

  const now = new Date();
  const expenses = [];
  const incomes = [];

  // Generate data for last 12 months
  for (let monthOffset = 11; monthOffset >= 0; monthOffset--) {
    const year = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1).getFullYear();
    const month = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1).getMonth();

    // ── Expenses ──────────────────────────────────────────────────────────────
    for (const tmpl of expenseTemplates) {
      // Skip occasional categories sometimes
      if (OCCASIONAL_CATEGORIES.includes(tmpl.category)) {
        if (Math.random() > OCCASIONAL_PROBABILITY) continue;
      }

      for (const day of tmpl.daysOfMonth) {
        // Skip if day doesn't exist in this month (e.g. Feb 30)
        const maxDay = new Date(year, month + 1, 0).getDate();
        if (day > maxDay) continue;

        const amount = randomBetween(tmpl.min, tmpl.max);
        expenses.push({
          userId: USER_ID,
          category: tmpl.category,
          description: tmpl.description,
          amount,
          date: dateInMonth(year, month, day),
          recurring: tmpl.recurring,
          recurringFrequency: tmpl.freq,
        });
      }
    }

    // ── Income ────────────────────────────────────────────────────────────────
    // Salary - every month
    incomes.push({
      userId: USER_ID,
      source: "salary",
      description: "Monthly salary",
      amount: MONTHLY_INCOME,
      date: dateInMonth(year, month, 1),
    });

    // Freelance - 60% of months
    if (Math.random() > 0.4) {
      incomes.push({
        userId: USER_ID,
        source: "freelance",
        description: "Freelance project payment",
        amount: randomBetween(3000, 15000),
        date: dateInMonth(year, month, 15),
      });
    }

    // Bonus - 3 months of the year (random)
    if (Math.random() > 0.75) {
      incomes.push({
        userId: USER_ID,
        source: "other",
        description: "Bonus / Extra income",
        amount: randomBetween(5000, 20000),
        date: dateInMonth(year, month, 25),
      });
    }
  }

  // Insert all data
  await Expense.insertMany(expenses);
  await Income.insertMany(incomes);

  console.log(`✅ Inserted ${expenses.length} expenses`);
  console.log(`✅ Inserted ${incomes.length} income entries`);
  console.log(`📅 Covers: ${new Date(now.getFullYear(), now.getMonth() - 11, 1).toDateString()} → ${now.toDateString()}`);

  // Summary by category
  const catSummary = {};
  for (const e of expenses) {
    catSummary[e.category] = (catSummary[e.category] || 0) + e.amount;
  }
  console.log("\n📊 Total spend by category:");
  for (const [cat, total] of Object.entries(catSummary).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat.padEnd(15)} ৳${total.toLocaleString()}`);
  }

  await mongoose.disconnect();
  console.log("\n🎉 Done! Refresh your app to see the data.");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});