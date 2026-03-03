import { format } from "date-fns";
import {
  Briefcase,
  Laptop2,
  Store,
  TrendingUp,
  Gift,
  Wallet,
  PiggyBank,
  HandCoins,
  Utensils,
  UtensilsCrossed,
  Car,
  ShoppingBag,
  Gamepad2,
  Receipt,
  HeartPulse,
  GraduationCap,
  Home,
  Coffee,
  Plane,
  Smartphone,
  Dumbbell,
  MoreHorizontal,
  Shield,
  Heart,
  Sunset,
} from "lucide-react";

export const currencyOptions = [
  { value: "BDT", label: "৳ BDT" },
  { value: "USD", label: "$ USD" },
  { value: "EUR", label: "€ EUR" },
  { value: "INR", label: "₹ INR" },
  { value: "GBP", label: "£ GBP" },
];

export const defaultIncomeSources = [
  { name: "Salary", value: "salary", icon: Briefcase, color: "#10B981" },
  { name: "Freelance", value: "freelance", icon: Laptop2, color: "#3B82F6" },
  { name: "Business", value: "business", icon: Store, color: "#F59E0B" },
  {
    name: "Investment",
    value: "investment",
    icon: TrendingUp,
    color: "#8B5CF6",
  },
  { name: "Gift", value: "gift", icon: Gift, color: "#EC4899" },
  { name: "Bonus", value: "bonus", icon: HandCoins, color: "#FBBF24" },
  { name: "Savings", value: "savings", icon: PiggyBank, color: "#10B981" },
  { name: "Other", value: "other", icon: Wallet, color: "#6B7280" },
];

export const defaultExpenseTypes = [
  { name: "Dining Out", value: "dining", icon: UtensilsCrossed, color: "#F59E0B" },
  { name: "Transport", value: "transport", icon: Car, color: "#3B82F6" },
  { name: "Shopping", value: "shopping", icon: ShoppingBag, color: "#EC4899" },
  {
    name: "Entertainment",
    value: "entertainment",
    icon: Gamepad2,
    color: "#8B5CF6",
  },
  {
    name: "Bills & Utilities",
    value: "bills",
    icon: Receipt,
    color: "#EF4444",
  },
  { name: "Healthcare", value: "health", icon: HeartPulse, color: "#10B981" },
  {
    name: "Education",
    value: "education",
    icon: GraduationCap,
    color: "#6366F1",
  },
  { name: "Rent/Mortgage", value: "rent", icon: Home, color: "#F97316" },
  { name: "Groceries", value: "groceries", icon: Coffee, color: "#D97706" },
  { name: "Travel", value: "travel", icon: Plane, color: "#06B6D4" },
  {
    name: "Phone & Internet",
    value: "phone",
    icon: Smartphone,
    color: "#8B5CF6",
  },
  { name: "Fitness", value: "fitness", icon: Dumbbell, color: "#EC4899" },
  { name: "Other", value: "other", icon: MoreHorizontal, color: "#6B7280" },
];

export const recurringOption = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

export const defaultGoalSuggestions = [
  {
    title: "Emergency Fund",
    targetAmount: 100000,
    icon: "🛡️",
    color: "#10b981",
    recurring: true,
    recurringAmount: 10000,
    recurringFrequency: "monthly",
  },
  {
    title: "New Phone",
    targetAmount: 60000,
    icon: "📱",
    color: "#3b82f6",
    recurring: false,
  },
  {
    title: "Dream Vacation",
    targetAmount: 150000,
    icon: "✈️",
    color: "#8b5cf6",
    recurring: true,
    recurringAmount: 15000,
    recurringFrequency: "monthly",
  },
  {
    title: "Buy a Laptop",
    targetAmount: 120000,
    icon: "💻",
    color: "#6366f1",
    recurring: true,
    recurringAmount: 10000,
  },
  {
    title: "Wedding Fund",
    targetAmount: 500000,
    icon: "❤️",
    color: "#ec4899",
    recurring: true,
    recurringAmount: 25000,
  },
  {
    title: "Down Payment for Home",
    targetAmount: 2000000,
    icon: "🏠",
    color: "#f59e0b",
    recurring: true,
    recurringAmount: 50000,
  },
  {
    title: "Start a Business",
    targetAmount: 300000,
    icon: "💼",
    color: "#06b6d4",
    recurring: true,
    recurringAmount: 20000,
  },
  {
    title: "Education Fund",
    targetAmount: 400000,
    icon: "🎓",
    color: "#8b5cf6",
    recurring: true,
    recurringAmount: 15000,
  },
  {
    title: "New Car",
    targetAmount: 800000,
    icon: "🚗",
    color: "#ef4444",
    recurring: true,
    recurringAmount: 40000,
  },
  {
    title: "Retirement Fund",
    targetAmount: 5000000,
    icon: "🌅",
    color: "#10b981",
    recurring: true,
    recurringAmount: 30000,
  },
];

export const formatDate = (date) => {
  if (!date) return "N/A";
  return format(new Date(date), "MMM d, yyyy");
};

const escapeCSVValue = (value) => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (
    stringValue.includes('"') ||
    stringValue.includes(",") ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

export const downloadCSV = (filename, headers, rows) => {
  if (!Array.isArray(headers) || !Array.isArray(rows)) return;

  const headerLine = headers.map(escapeCSVValue).join(",");
  const dataLines = rows.map((row) =>
    (Array.isArray(row) ? row : headers.map((key) => row[key]))
      .map(escapeCSVValue)
      .join(",")
  );

  const csvContent = [headerLine, ...dataLines].join("\n");
  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute(
    "download",
    filename.endsWith(".csv") ? filename : `${filename}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};