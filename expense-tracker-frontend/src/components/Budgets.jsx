import { useState } from "react";
import { useGetBudgets, useUpdateBudget, useDeleteBudget, currentMonthKey } from "@/hooks/budget";
import TransactionForm from "@/components/common/TransactionForm";
import { defaultExpenseTypes, downloadCSV } from "@/lib/helper";
import { CirclePlus, Trash2, Download, Sparkles } from "lucide-react";
import DeleteConfirmation from "@/components/common/DeleteConfirmation";

// Map raw category value → display name
const categoryDisplayName = Object.fromEntries(
  defaultExpenseTypes.map(({ value, name }) => [value, name])
);
const getCategoryName = (val) => categoryDisplayName[val] || val;

const Budgets = () => {
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [month,    setMonth]    = useState(currentMonthKey());   // YYYY-MM
  const [period,   setPeriod]   = useState("");                  // "" = all
  const [category, setCategory] = useState("");                  // "" = all

  const updateMutation = useUpdateBudget();
  const deleteMutation = useDeleteBudget();

  const { data: budgets = [], isLoading } = useGetBudgets({
    month,
    period:   period   || undefined,
    category: category || undefined,
  });

  // ── CSV export ──────────────────────────────────────────────────────────────
  const handleDownloadCSV = () => {
    if (!budgets.length) return;
    const headers = ["Category", "Period", "Period Label", "Budget", "Total Spent", "Month Spent", "Remaining", "Progress (%)", "Over Budget", "AI Generated"];
    const rows = budgets.map((b) => [
      getCategoryName(b.category),
      b.period,
      b.periodLabel || "",
      b.amount ?? "",
      b.totalSpent ?? "",
      b.monthSpent ?? "",
      b.remaining ?? "",
      typeof b.progress === "number" ? b.progress.toFixed(2) : "",
      b.isOverBudget ? "Yes" : "No",
      b.isAIGenerated ? "Yes" : "No",
    ]);
    downloadCSV(`budgets-${month}`, headers, rows);
  };

  // ── Modal helpers ───────────────────────────────────────────────────────────
  const openForm  = () => document.getElementById("transaction-form-modal")?.showModal();
  const closeForm = () => {
    document.getElementById("transaction-form-modal")?.close();
    setSelectedBudget(null);
  };

  const handleSubmit = (formData) => {
    updateMutation.mutate({
      isEdit:   !!selectedBudget?._id,
      id:       selectedBudget?._id,
      formData: { ...formData, refDate: `${month}-01` }, // create for selected month
    });
    closeForm();
  };

  const handleDelete = () => {
    if (!selectedBudget?._id) return;
    deleteMutation.mutate(selectedBudget._id);
    document.getElementById("delete-confirmation-modal")?.close();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      {/* Header */}
      <h1 className="text-3xl font-bold text-primary mb-5">Budgets</h1>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">

        <div className="flex flex-wrap md:flex-4 items-center gap-2">
          {/* Month picker */}
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="input input-bordered input-sm"
          />

          {/* Period filter */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="select select-bordered select-sm"
          >
            <option value="">All Periods</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>

          {/* Category filter */}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="select select-bordered select-sm"
          >
            <option value="">All Categories</option>
            {defaultExpenseTypes.map(({ value, name }) => (
              <option key={value} value={value}>{name}</option>
            ))}
          </select>

          <button
            className="btn btn-sm btn-outline gap-1 ml-auto"
            onClick={handleDownloadCSV}
            disabled={!budgets.length}
          >
            <Download className="w-4 h-4" /> Download Budget CSV
          </button>
        </div>
      </div>

      {/* Budget cards */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-2xl text-base-content/20 mb-4">No budgets found.</p>
          <button className="btn btn-primary" onClick={openForm}>
            Set a Budget
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {budgets.map((budget) => (
            <div
              key={budget._id}
              className="card bg-base-100 shadow-xl p-6 cursor-pointer hover:shadow-2xl transition-shadow"
              onClick={() => { setSelectedBudget(budget); openForm(); }}
            >
              {/* Card header */}
              <div className="flex justify-between items-start mb-1">
                <div>
                  <h3 className="font-bold text-xl">
                    {getCategoryName(budget.category)}
                  </h3>

                  {/* Period tag */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    <span className="badge badge-outline badge-sm capitalize">
                      {budget.period}
                    </span>
                    {budget.periodLabel && (
                      <span className="badge badge-ghost badge-sm">
                        {budget.periodLabel}
                      </span>
                    )}
                    {budget.isAIGenerated && (
                      <span className="badge badge-info badge-sm gap-1">
                        <Sparkles className="w-3 h-3" /> AI
                      </span>
                    )}
                  </div>
                </div>

                <button
                  className="hover:text-error hover:scale-110 transition-all mt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBudget(budget);
                    document.getElementById("delete-confirmation-modal")?.showModal();
                  }}
                >
                  <Trash2 />
                </button>
              </div>

              {/* Amounts */}
              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-base-content/60">Total Spent</span>
                  <span className="font-medium">৳{budget.totalSpent?.toLocaleString()}</span>
                </div>

                {/* Show month spent separately only when it differs (e.g. yearly/weekly) */}
                {budget.monthSpent !== null && (
                  <div className="flex justify-between text-base-content/50">
                    <span>This Month</span>
                    <span>৳{budget.monthSpent?.toLocaleString()}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-base-content/60">Remaining</span>
                  <span className={`font-medium ${budget.isOverBudget ? "text-error" : "text-success"}`}>
                    ৳{budget.remaining?.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                <progress
                  className={`progress w-full ${
                    budget.isOverBudget  ? "progress-error"   :
                    budget.progress >= 75 ? "progress-warning" : "progress-primary"
                  }`}
                  value={Math.min(budget.progress, 100)}
                  max="100"
                />
                <p className="text-center text-sm mt-1 font-medium">
                  ৳{budget.amount?.toLocaleString()} Budget
                </p>
              </div>

              {/* Status message */}
              <div className="text-center mt-2 text-sm">
                {budget.isOverBudget ? (
                  <span className="text-error font-bold animate-pulse">
                    Exceeded by ৳{(budget.totalSpent - budget.amount).toLocaleString()}!
                  </span>
                ) : budget.progress >= 90 ? (
                  <span className="text-error">Almost over! ৳{budget.remaining?.toLocaleString()} left</span>
                ) : budget.progress >= 75 ? (
                  <span className="text-warning">Careful — ৳{budget.remaining?.toLocaleString()} remaining</span>
                ) : (
                  <span className="text-success">On track — ৳{budget.remaining?.toLocaleString()} left</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FAB */}
      <button className="add_button" onClick={openForm}>
        <CirclePlus className="w-8 h-8" />
      </button>

      <TransactionForm
        type="budget"
        sources={defaultExpenseTypes}
        selectedTransaction={selectedBudget}
        onSubmit={handleSubmit}
        isSubmitting={updateMutation.isPending}
        onClose={closeForm}
      />

      <DeleteConfirmation
        id="delete-confirmation-modal"
        title="Delete Budget"
        content={`${getCategoryName(selectedBudget?.category)} — ${selectedBudget?.periodLabel || selectedBudget?.period}`}
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

export default Budgets;
