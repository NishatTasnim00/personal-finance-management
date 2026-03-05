  import { CirclePlus, Banknote, Trash2, X, Download } from "lucide-react";
  import TransactionForm from "@/components/common/TransactionForm";
  import {
    useGetIncomes,
    useUpdateIncome,
    useDeleteIncome,
  } from "@/hooks/income";
  import { toastError } from "@/lib/toast";
  import { useState } from "react";
  import { subDays } from "date-fns";
  import FilterBar from "@/components/common/FilterBar";
  import { formatDate, downloadCSV } from "@/lib/helper";
  import DeleteConfirmation from "@/components/common/DeleteConfirmation";
  import { defaultIncomeSources } from "@/lib/helper";
  
  const Incomes = () => {
    const [period, setPeriod] = useState("month");
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [tempStartDate, setTempStartDate] = useState(null);
    const [tempEndDate, setTempEndDate] = useState(null);
    const [source, setSource] = useState("");
    const [selectedIncome, setSelectedIncome] = useState(null);
    const UpdateMutation = useUpdateIncome();
    const deleteMutation = useDeleteIncome();

    const { data, isLoading, refetch } = useGetIncomes({
      period,
      startDate,
      endDate,
      source,
      enabled: period !== "custom" ? true : Boolean(startDate && endDate),
    });

    const handleApplyCustom = () => {
      if (!tempStartDate || !tempEndDate) {
        toastError("Please pick both dates");
        return;
      }
      if (tempStartDate > tempEndDate) {
        toastError("Start date cannot be after end date");
        return;
      }
      setStartDate(tempStartDate);
      setEndDate(tempEndDate);
    };

    const incomes = data?.incomes || [];

    const handleDownloadCSV = () => {
      if (!incomes.length) return;

      const headers = ["Date", "Source", "Description", "Amount"];
      const rows = incomes.map((income) => [
        income.date,
        income.source || "",
        income.description || "",
        income.amount ?? "",
      ]);

      const baseName =
        data?.period === "custom"
          ? `incomes-${data?.searchStartDate || ""}-to-${
              data?.searchEndDate || ""
            }`
          : `incomes-${data?.period || "all"}`;

      downloadCSV(baseName, headers, rows);
    };

    const closeTransactionModal = () => {
      document.getElementById("transaction-form-modal")?.close();
      setSelectedIncome(null);
    };

    const handleIncomeSubmit = (formData) => {
      const isEdit = !!selectedIncome?._id;

      UpdateMutation.mutate(
        {
          isEdit,
          id: selectedIncome?._id,
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
      if (selectedIncome?._id) {
        deleteMutation.mutate(selectedIncome._id);
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
          source={source}
          setSource={setSource}
          sourceOptions={[
            "salary",
            "freelance",
            "investment",
            "gift",
            "bonus",
            "other",
          ]}
          onApplyCustom={handleApplyCustom}
          sourcePlaceholder="All Income Sources"
        />
        <div className="flex justify-end my-4">
          <button
            type="button"
            className="btn btn-sm btn-outline gap-2"
            onClick={handleDownloadCSV}
            disabled={!incomes.length}
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>
        {incomes.length > 0 && (
          <div className="card w-fit sm:min-w-90 font-medium bg-base-100 shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-base-100">
            <div className="mt-auto">
              <h3 className="text-3xl text-primary">Total Income</h3>
              <p className="text-3xl font-bold text-success">
                +৳ {Number(data?.totalAmount).toLocaleString()}
              </p>
              <p className="text-lg mt-1">
                <span>Earning from {data?.source}.</span>
                <br />
                {`From ${formatDate(
                  data?.searchStartDate || incomes[incomes.length - 1].date
                )} To ${formatDate(data?.searchEndDate)}`}
              </p>
            </div>
          </div>
        )}
        {isLoading && !incomes.length ? (
          <div className="flex justify-center py-16">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : !incomes.length ? (
          <div className="text-center py-16">
            <p className="text-2xl md:text-5xl text-base-content/20 mb-6">
              No incomes found for the selected filters.
            </p>
            <p className="text-base-content/50">
              Try changing the period or add your first income!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 py-6">
            {incomes.map((income) => (
              <div
                onClick={() => {
                  setSelectedIncome(income);
                  openTransactionFormModal();
                }}
                key={income._id}
                className="card bg-base-100 shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-base-200 min-h-50 cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0"
                    style={{ backgroundColor: `${income.color || "#10b981"}30` }}
                  >
                    {income.icon || <Banknote />}
                  </div>
                  <div className="flex-1 min-w-0 relative">
                    <div className="flex justify-between align-middle">
                      <h3 className="font-bold text-lg capitalize truncate">
                        {income.source || "Income"}
                      </h3>
                      <button
                        className="cursor-help hover:text-error shadow-2xl hover:scale-110 transition-all z-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedIncome(income);
                          document
                            .getElementById("delete-confirmation-modal")
                            .showModal();
                        }}
                      >
                        <Trash2 />
                      </button>
                    </div>
                    <p className="text-sm text-base-content/60 wrap-break-word">
                      {income.description || "No description"}
                    </p>
                  </div>
                </div>
                <div className="mt-auto">
                  <p className="text-3xl font-bold text-success">
                    +৳{Number(income.amount).toLocaleString()}
                  </p>
                  <p className="text-xs text-base-content/50 mt-1">
                    {new Date(income.date).toLocaleDateString("en-US", {
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
          type={"income"}
          sources={defaultIncomeSources}
          onSubmit={handleIncomeSubmit}
          selectedTransaction={selectedIncome}
          setSelectedTransaction={setSelectedIncome}
          isSubmitting={UpdateMutation.pending}
          onClose={closeTransactionModal}
        />
        <DeleteConfirmation
          title="Delete Income"
          content={`income from ${selectedIncome?.source}`}
          onConfirm={handleDelete}
          isLoading={deleteMutation.isPending}
        />
      </>
    );
  };

  export default Incomes;
