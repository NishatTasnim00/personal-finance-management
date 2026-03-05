import { CirclePlus, Wallet, Trash2, Download } from "lucide-react";
import TransactionForm from "@/components/common/TransactionForm";
import {
  useGetExpenses,
  useUpdateExpense,
  useDeleteExpense,
} from "@/hooks/expense";
import { toastError } from "@/lib/toast";
import { useState } from "react";
import { subDays } from "date-fns";
import FilterBar from "@/components/common/FilterBar";
import { formatDate, downloadCSV } from "@/lib/helper";
import DeleteConfirmation from "@/components/common/DeleteConfirmation";
import { defaultExpenseTypes } from "@/lib/helper";

const Expenses = () => {
  const [period, setPeriod] = useState("month");
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [tempStartDate, setTempStartDate] = useState(null);
  const [tempEndDate, setTempEndDate] = useState(null);
  const [category, setType] = useState("");
  const [recurring, setRecurring] = useState("");
  const [selectedExpense, setSelectedExpense] = useState({});

  const updateMutation = useUpdateExpense();
  const deleteMutation = useDeleteExpense();

  const { data, isLoading, refetch } = useGetExpenses({
    period,
    startDate,
    endDate,
    category,
    recurring:
      recurring === "true" ? true : recurring === "false" ? false : undefined,
    enabled: period !== "custom" ? true : Boolean(startDate && endDate),
  });

  const handleApplyCustom = () => {
    if (!tempStartDate || !tempEndDate) {
      toastError("Please pick both start and end dates");
      return;
    }
    if (tempStartDate > tempEndDate) {
      toastError("Start date cannot be after end date");
      return;
    }
    setStartDate(tempStartDate);
    setEndDate(tempEndDate);
  };

  const expenses = data?.expenses || [];

  const handleDownloadCSV = () => {
    if (!expenses.length) return;

    const headers = ["Date", "Category", "Description", "Amount", "Recurring"];
    const rows = expenses.map((expense) => [
      expense.date,
      expense.category || "",
      expense.description || "",
      expense.amount ?? "",
      expense.recurring ? expense.recurringFrequency || "Yes" : "No",
    ]);

    const baseName =
      data?.period === "custom"
        ? `expenses-${data?.searchStartDate || ""}-to-${
            data?.searchEndDate || ""
          }`
        : `expenses-${data?.period || "all"}`;

    downloadCSV(baseName, headers, rows);
  };

  const closeTransactionModal = () => {
    document.getElementById("transaction-form-modal")?.close();
    setSelectedExpense({});
  };

  const handleExpenseSubmit = (formData) => {
    const isEdit = !!selectedExpense?._id;

    updateMutation.mutate(
      {
        isEdit,
        id: selectedExpense._id,
        formData,
      },
      {
        onSuccess: () => {
          refetch();
          closeTransactionModal();
        },
      }
    );
  };

  const handleDelete = () => {
    if (selectedExpense?._id) {
      deleteMutation.mutate(selectedExpense._id);
    }
  };

  const openTransactionFormModal = () => {
    document.getElementById("transaction-form-modal")?.showModal();
  };

  return (
    <>
      <FilterBar
        filter={period}
        setFilter={(newPeriod) => {
          setPeriod(newPeriod);
          if (newPeriod !== "custom") {
            setStartDate(null);
            setEndDate(null);
            setTempStartDate(null);
            setTempEndDate(null);
          } else {
            const defaultStart = subDays(new Date(), 30);
            const defaultEnd = new Date();
            const useStart = startDate || defaultStart;
            const useEnd = endDate || defaultEnd;
            setStartDate(useStart);
            setEndDate(useEnd);
            setTempStartDate(useStart);
            setTempEndDate(useEnd);
          }
        }}
        from={tempStartDate}
        setFrom={setTempStartDate}
        to={tempEndDate}
        setTo={setTempEndDate}
        source={category}
        setSource={setType}
        sourceOptions={defaultExpenseTypes.map((t) => t.value)}
        sourcePlaceholder="All Expense Types"
        showRecurring={true}
        recurring={recurring}
        setRecurring={setRecurring}
        onApplyCustom={handleApplyCustom}
      />
      <div className="flex justify-end my-4">
        <button
          type="button"
          className="btn btn-sm btn-outline gap-2"
          onClick={handleDownloadCSV}
          disabled={!expenses.length}
        >
          <Download className="w-4 h-4" />
          Download CSV
        </button>
      </div>
      {expenses.length > 0 && (
        <div className="card w-fit sm:min-w-90 font-medium bg-base-100 shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-base-100">
          <div className="mt-auto">
            <h3 className="text-3xl text-primary">Total Expenses</h3>
            <p className="text-3xl font-bold text-error">
              -৳ {Number(data?.totalAmount).toLocaleString()}
            </p>
            <p className="text-lg mt-1">
              <span>
                Spent on {data?.category || "various categories"}
                {data?.recurring !== "all" && data?.recurring !== undefined
                  ? ` (${data.recurring ? "Recurring" : "One-time"})`
                  : ""}
                .
              </span>
              <br />
              {`From ${formatDate(
                data?.searchStartDate || expenses[expenses.length - 1]?.date
              )} To ${formatDate(data?.searchEndDate)}`}
            </p>
          </div>
        </div>
      )}
      {isLoading && !expenses.length ? (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : !expenses.length ? (
        <div className="text-center py-16">
          <p className="text-2xl md:text-5xl text-base-content/20 mb-6">
            No expenses found for the selected filters.
          </p>
          <p className="text-base-content/50">
            Try changing the period or add your first expense!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 py-6">
          {expenses.map((expense) => (
            <div
              key={expense._id}
              onClick={() => {
                setSelectedExpense(expense);
                openTransactionFormModal();
              }}
              className="card bg-base-100 shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-base-200 min-h-50 cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0"
                  style={{ backgroundColor: `${expense.color || "#ef4444"}30` }}
                >
                  {expense.icon || <Wallet />}
                </div>
                <div className="flex-1 min-w-0 relative">
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg capitalize truncate">
                      {expense.category || "Expense"}
                    </h3>
                    <button
                      className="hover:text-error hover:scale-110 transition-all z-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedExpense(expense);
                        document
                          .getElementById("delete-confirmation-modal")
                          .showModal();
                      }}
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                  <p className="text-sm text-base-content/60">
                    {expense.description || "No description"}
                  </p>
                  {expense.recurring && (
                    <span className="badge badge-sm badge-warning font-semibold text-base-100 p-3 mt-2 capitalize">
                      {expense.recurringFrequency}
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-auto">
                <p className="text-3xl font-bold text-error">
                  -৳{Number(expense.amount).toLocaleString()}
                </p>
                <p className="text-xs text-base-content/50 mt-1">
                  {new Date(expense.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
      <button className="add_button" onClick={openTransactionFormModal}>
        <CirclePlus className="w-8 h-8" />
      </button>
      <TransactionForm
        type="expense"
        sources={defaultExpenseTypes}
        onSubmit={handleExpenseSubmit}
        selectedTransaction={selectedExpense}
        setSelectedTransaction={setSelectedExpense}
        isSubmitting={updateMutation.isPending}
        onClose={closeTransactionModal}
      />
      <DeleteConfirmation
        title="Delete Expense"
        content={`expense "${selectedExpense?.category}" of ৳${selectedExpense?.amount}`}
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
};

export default Expenses;
