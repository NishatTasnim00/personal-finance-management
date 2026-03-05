/**
 * seed.js
 * Inserts 1 year of realistic income + expense data for a user.
 *
 * Usage:
 *   node seed.js
 *
 * Requires MONGODB_URI in .env
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const USER_ID       = "qM3077NfvJRgXnJzpThbtIA0Se02";
const MONTHLY_INCOME = 50000;
const MONGODB_URI   = process.env.MONGODB_URI;

// ── Schemas ───────────────────────────────────────────────────────────────────
const expenseSchema = new mongoose.Schema({
  userId: String, category: String, description: String,
  amount: Number, date: Date, recurring: Boolean, recurringFrequency: String,
}, { timestamps: true });

const incomeSchema = new mongoose.Schema({
  userId: String, source: String, description: String, amount: Number, date: Date,
}, { timestamps: true });

const Expense = mongoose.model("Expense", expenseSchema);
const Income  = mongoose.model("Income",  incomeSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────
const rand     = (min, max) => Math.round(Math.random() * (max - min) + min);
const pick     = (arr)      => arr[Math.floor(Math.random() * arr.length)];
const dateIn   = (y, m, d)  => new Date(y, m, d);

// ── Expense templates — all categories use DB raw values ──────────────────────
// DB raw values: rent, bills, groceries, health, education,
//                transport, food, entertainment, shopping, travel, fitness, other
const templates = [
  // Fixed needs
  { category: "rent",          description: "House rent",             min: 14000, max: 14000, recurring: true,  freq: "monthly", days: [1]         },
  { category: "bills",         description: "Electricity bill",       min: 1200,  max: 1800,  recurring: true,  freq: "monthly", days: [7]         },
  { category: "bills",         description: "Internet (WiFi)",        min: 700,   max: 700,   recurring: true,  freq: "monthly", days: [5]         },
  { category: "bills",         description: "Mobile recharge",        min: 300,   max: 500,   recurring: false, freq: null,      days: [10]        },

  // Variable needs
  { category: "food and groceries",     description: "Bazar / Shwapno",        min: 5000,  max: 8000,  recurring: false, freq: null,      days: [3, 17]     },
  { category: "transport",     description: "Rickshaw / CNG / Uber",  min: 600,   max: 1200,  recurring: false, freq: null,      days: [5,12,20,26]},
  { category: "health",        description: "Medicine / Pharmacy",    min: 300,   max: 800,   recurring: false, freq: null,      days: [14]        },
  { category: "fitness",       description: "Gym membership",         min: 800,   max: 800,   recurring: true,  freq: "monthly", days: [1]         },
  { category: "emi & insurance", description: "EMI / Insurance payment", min: 3000,  max: 5000,  recurring: true,  freq: "monthly", days: [5]         },

  // Wants
  { category: "dining out",          description: "Restaurant / Dining",    min: 500,   max: 1500,  recurring: false, freq: null,      days: [8, 22]     },
  { category: "dining out",          description: "Foodpanda / Delivery",   min: 300,   max: 700,   recurring: false, freq: null,      days: [15]        },
  { category: "entertainment", description: "Netflix subscription",   min: 650,   max: 650,   recurring: true,  freq: "monthly", days: [1]         },
  { category: "entertainment", description: "Movies / Cinema",        min: 400,   max: 800,   recurring: false, freq: null,      days: [20]        },
  { category: "shopping",      description: "Clothing / Daraz",       min: 1000,  max: 3000,  recurring: false, freq: null,      days: [25]        },

  // Occasional
  { category: "education",     description: "Online course / Books",  min: 500,   max: 2000,  recurring: false, freq: null,      days: [10]        },
  { category: "travel",        description: "Weekend trip / Travel",  min: 3000,  max: 8000,  recurring: false, freq: null,      days: [22]        },
  { category: "other",         description: "Miscellaneous",          min: 200,   max: 800,   recurring: false, freq: null,      days: [28]        },
];

const OCCASIONAL = new Set(["travel", "education", "shopping"]);

// ── Seed ──────────────────────────────────────────────────────────────────────
async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  await Expense.deleteMany({ userId: USER_ID });
  await Income.deleteMany({ userId: USER_ID });
  console.log("🗑️  Cleared existing data");

  const now      = new Date();
  const expenses = [];
  const incomes  = [];

  for (let offset = 11; offset >= 0; offset--) {
    const base  = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const year  = base.getFullYear();
    const month = base.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();

    // Expenses
    for (const t of templates) {
      if (OCCASIONAL.has(t.category) && Math.random() > 0.55) continue;

      for (const day of t.days) {
        if (day > maxDay) continue;
        expenses.push({
          userId:             USER_ID,
          category:           t.category,
          description:        t.description,
          amount:             rand(t.min, t.max),
          date:               dateIn(year, month, day),
          recurring:          t.recurring,
          recurringFrequency: t.freq,
        });
      }
    }

    // Salary — every month
    incomes.push({
      userId: USER_ID, source: "salary",
      description: "Monthly salary",
      amount: MONTHLY_INCOME,
      date: dateIn(year, month, 1),
    });

    // Freelance — 60% of months
    if (Math.random() > 0.4) {
      incomes.push({
        userId: USER_ID, source: "freelance",
        description: "Freelance project payment",
        amount: rand(3000, 15000),
        date: dateIn(year, month, 15),
      });
    }

    // Bonus — ~25% of months
    if (Math.random() > 0.75) {
      incomes.push({
        userId: USER_ID, source: "other",
        description: "Bonus / Extra income",
        amount: rand(5000, 20000),
        date: dateIn(year, month, 25),
      });
    }
  }

  await Expense.insertMany(expenses);
  await Income.insertMany(incomes);

  console.log(`✅ Inserted ${expenses.length} expenses`);
  console.log(`✅ Inserted ${incomes.length} income entries`);

  // Summary
  const summary = {};
  for (const e of expenses) {
    summary[e.category] = (summary[e.category] || 0) + e.amount;
  }
  console.log("\n📊 Total spend by category (12 months):");
  for (const [cat, total] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat.padEnd(15)} ৳${total.toLocaleString()}`);
  }

  const totalExpense = Object.values(summary).reduce((a, b) => a + b, 0);
  const totalIncome  = incomes.reduce((a, b) => a + b.amount, 0);
  console.log(`\n💰 Total income:  ৳${totalIncome.toLocaleString()}`);
  console.log(`💸 Total expense: ৳${totalExpense.toLocaleString()}`);
  console.log(`💚 Net savings:   ৳${(totalIncome - totalExpense).toLocaleString()}`);

  await mongoose.disconnect();
  console.log("\n🎉 Done! Refresh your app.");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});