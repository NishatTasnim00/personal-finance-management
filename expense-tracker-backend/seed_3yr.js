/**
 * seed.js
 * Inserts 3 years of realistic income + expense data for a user.
 * Includes yearly salary raises, rent hikes, inflation on expenses,
 * and seasonal variation (higher spending in summer/winter months).
 *
 * Usage:
 *   node seed.js
 *
 * Requires MONGODB_URI in .env
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const USER_ID        = "qM3077NfvJRgXnJzpThbtIA0Se02";
const MONGODB_URI    = process.env.MONGODB_URI;

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
const rand   = (min, max) => Math.round(Math.random() * (max - min) + min);
const dateIn = (y, m, d)  => new Date(y, m, d);

// Seasonal multiplier — higher spending in months 5,6,11,12 (Jun, Jul, Dec, Jan)
const seasonalMultiplier = (month) => {
  const high = [5, 6, 11, 0];   // June, July, December, January
  const low  = [1, 2, 8];       // February, March, September
  if (high.includes(month)) return 1.20;
  if (low.includes(month))  return 0.85;
  return 1.0;
};

// ── Year-based base values (progression over 3 years) ────────────────────────
// yearOffset: 0 = oldest year, 1 = middle year, 2 = most recent year
const getYearConfig = (yearOffset) => ({
  // Income
  salary:          [45000, 50000, 58000][yearOffset],
  freelanceMin:    [2000,  3000,  5000 ][yearOffset],
  freelanceMax:    [8000,  15000, 20000][yearOffset],
  bonusMin:        [3000,  5000,  8000 ][yearOffset],
  bonusMax:        [10000, 20000, 25000][yearOffset],

  // Fixed expenses — rent increases each year
  rent:            [12000, 14000, 15000][yearOffset],
  gym:             [700,   800,   1000 ][yearOffset],
  netflix:         [600,   650,   750  ][yearOffset],
  emi:             [3000,  4000,  5000 ][yearOffset],  // loan amount grows

  // Variable expenses — inflation ~8% per year
  electricityMin:  [1000,  1200,  1400 ][yearOffset],
  electricityMax:  [1500,  1800,  2000 ][yearOffset],
  internet:        [600,   700,   700  ][yearOffset],
  mobileMin:       [250,   300,   350  ][yearOffset],
  mobileMax:       [400,   500,   550  ][yearOffset],
  groceryMin:      [4500,  5000,  6000 ][yearOffset],
  groceryMax:      [6500,  8000,  9000 ][yearOffset],
  transportMin:    [500,   600,   800  ][yearOffset],
  transportMax:    [900,   1200,  1500 ][yearOffset],
  healthMin:       [200,   300,   400  ][yearOffset],
  healthMax:       [600,   800,   1000 ][yearOffset],
  diningMin:       [400,   500,   700  ][yearOffset],
  diningMax:       [1200,  1500,  2000 ][yearOffset],
  deliveryMin:     [200,   300,   400  ][yearOffset],
  deliveryMax:     [500,   700,   900  ][yearOffset],
  cinemaMin:       [300,   400,   500  ][yearOffset],
  cinemaMax:       [600,   800,   1000 ][yearOffset],
  shoppingMin:     [800,   1000,  1500 ][yearOffset],
  shoppingMax:     [2500,  3000,  4000 ][yearOffset],
  educationMin:    [400,   500,   800  ][yearOffset],
  educationMax:    [1500,  2000,  3000 ][yearOffset],
  travelMin:       [2500,  3000,  5000 ][yearOffset],
  travelMax:       [6000,  8000,  12000][yearOffset],
  otherMin:        [150,   200,   300  ][yearOffset],
  otherMax:        [600,   800,   1000 ][yearOffset],
});

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

  for (let offset = 35; offset >= 0; offset--) {
    const base      = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const year      = base.getFullYear();
    const month     = base.getMonth();
    const maxDay    = new Date(year, month + 1, 0).getDate();

    // Which year-bucket is this month in? (0 = oldest, 1 = middle, 2 = recent)
    const yearOffset = offset >= 24 ? 0 : offset >= 12 ? 1 : 2;
    const cfg        = getYearConfig(yearOffset);
    const seasonal   = seasonalMultiplier(month);

    // Helper — apply seasonal multiplier and round
    const s = (val) => Math.round(val * seasonal);

    // ── Expenses ──────────────────────────────────────────────────────────────
    const templates = [
      // Fixed needs
      { category: "rent",             description: "House rent",              amount: () => cfg.rent,                                        days: [1],          recurring: true,  freq: "monthly" },
      { category: "bills",            description: "Electricity bill",        amount: () => s(rand(cfg.electricityMin, cfg.electricityMax)), days: [7],          recurring: true,  freq: "monthly" },
      { category: "bills",            description: "Internet (WiFi)",         amount: () => cfg.internet,                                    days: [5],          recurring: true,  freq: "monthly" },
      { category: "bills",            description: "Mobile recharge",         amount: () => rand(cfg.mobileMin, cfg.mobileMax),              days: [10],         recurring: false, freq: null       },
      { category: "emi & insurance",  description: "EMI / Insurance payment", amount: () => cfg.emi,                                         days: [5],          recurring: true,  freq: "monthly" },

      // Variable needs
      { category: "food and groceries", description: "Bazar / Shwapno",       amount: () => s(rand(cfg.groceryMin, cfg.groceryMax)),         days: [3, 17],      recurring: false, freq: null       },
      { category: "transport",          description: "Rickshaw / CNG / Uber", amount: () => s(rand(cfg.transportMin, cfg.transportMax)),     days: [5,12,20,26], recurring: false, freq: null       },
      { category: "health",             description: "Medicine / Pharmacy",   amount: () => rand(cfg.healthMin, cfg.healthMax),              days: [14],         recurring: false, freq: null       },
      { category: "fitness",            description: "Gym membership",        amount: () => cfg.gym,                                         days: [1],          recurring: true,  freq: "monthly" },

      // Wants
      { category: "dining out",         description: "Restaurant / Dining",   amount: () => s(rand(cfg.diningMin, cfg.diningMax)),           days: [8, 22],      recurring: false, freq: null       },
      { category: "dining out",         description: "Foodpanda / Delivery",  amount: () => s(rand(cfg.deliveryMin, cfg.deliveryMax)),       days: [15],         recurring: false, freq: null       },
      { category: "entertainment",      description: "Netflix subscription",  amount: () => cfg.netflix,                                     days: [1],          recurring: true,  freq: "monthly"  },
      { category: "entertainment",      description: "Movies / Cinema",       amount: () => s(rand(cfg.cinemaMin, cfg.cinemaMax)),           days: [20],         recurring: false, freq: null       },
      { category: "shopping",           description: "Clothing / Daraz",      amount: () => s(rand(cfg.shoppingMin, cfg.shoppingMax)),       days: [25],         recurring: false, freq: null       },

      // Occasional
      { category: "education",          description: "Online course / Books", amount: () => rand(cfg.educationMin, cfg.educationMax),        days: [10],         recurring: false, freq: null       },
      { category: "travel",             description: "Weekend trip / Travel", amount: () => s(rand(cfg.travelMin, cfg.travelMax)),           days: [22],         recurring: false, freq: null       },
      { category: "other",              description: "Miscellaneous",         amount: () => rand(cfg.otherMin, cfg.otherMax),                days: [28],         recurring: false, freq: null       },
    ];

    for (const t of templates) {
      if (OCCASIONAL.has(t.category) && Math.random() > 0.55) continue;

      for (const day of t.days) {
        if (day > maxDay) continue;
        expenses.push({
          userId:             USER_ID,
          category:           t.category,
          description:        t.description,
          amount:             t.amount(),
          date:               dateIn(year, month, day),
          recurring:          t.recurring,
          recurringFrequency: t.freq,
        });
      }
    }

    // ── Income ────────────────────────────────────────────────────────────────
    // Salary every month
    incomes.push({
      userId: USER_ID, source: "salary",
      description: "Monthly salary",
      amount: cfg.salary,
      date: dateIn(year, month, 1),
    });

    // Freelance — 60% of months
    if (Math.random() > 0.4) {
      incomes.push({
        userId: USER_ID, source: "freelance",
        description: "Freelance project payment",
        amount: rand(cfg.freelanceMin, cfg.freelanceMax),
        date: dateIn(year, month, 15),
      });
    }

    // Bonus — ~25% of months
    if (Math.random() > 0.75) {
      incomes.push({
        userId: USER_ID, source: "bonus",
        description: "Bonus / Extra income",
        amount: rand(cfg.bonusMin, cfg.bonusMax),
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
  console.log("\n📊 Total spend by category (36 months):");
  for (const [cat, total] of Object.entries(summary).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat.padEnd(20)} ৳${total.toLocaleString()}`);
  }

  const totalExpense = Object.values(summary).reduce((a, b) => a + b, 0);
  const totalIncome  = incomes.reduce((a, b) => a + b.amount, 0);
  console.log(`\n💰 Total income:  ৳${totalIncome.toLocaleString()}`);
  console.log(`💸 Total expense: ৳${totalExpense.toLocaleString()}`);
  console.log(`💚 Net savings:   ৳${(totalIncome - totalExpense).toLocaleString()}`);
  console.log("\nYear-by-year salary progression:");
  console.log("   Year 1 (oldest): ৳45,000/mo  Rent: ৳12,000");
  console.log("   Year 2 (middle):  ৳50,000/mo  Rent: ৳14,000");
  console.log("   Year 3 (recent):  ৳58,000/mo  Rent: ৳15,000");

  await mongoose.disconnect();
  console.log("\n🎉 Done! Refresh your app.");
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
