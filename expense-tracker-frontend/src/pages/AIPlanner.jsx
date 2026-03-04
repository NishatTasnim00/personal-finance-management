import { useState, useCallback, useEffect } from "react";
import api from "@/lib/api";
import { Brain, Shield, ShoppingBag, AlertCircle, Calendar, Check, Save, X, Wallet } from "lucide-react";
import { toastSuccess, toastError} from '@/lib/toast'
import { useAcceptBudgetPlan, useDeleteBudgetPlan } from "@/hooks/budget";

const AIPlanner = () => {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [totalBudget, setTotalBudget] = useState("");
  const [profileIncome, setProfileIncome] = useState(null);
  const acceptMutation = useAcceptBudgetPlan();
  const deleteMutation = useDeleteBudgetPlan();
  const accepting = acceptMutation.isPending;
  const deleting = deleteMutation.isPending;

  useEffect(() => {
    const fetchIncome = async () => {
      try {
        const { result } = await api.get("/user/profile");
        setProfileIncome(result?.monthlyIncome || null);
      } catch (err) {
        console.error("Failed to load monthly income", err);
      }
    };
    fetchIncome();
  }, []);

  const fetchPlan = useCallback(async () => {
    setFetching(true);
    setError(null);
    setPlan(null);
    try {
      const res = await api.get(`/ai/plan?month=${selectedMonth}`);
      if (res.success) {
        setPlan(res.plan);
      }
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error(err);
      }
    } finally {
      setFetching(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const generatePlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/ai/generate-plan", {
        month: selectedMonth,
        totalBudget: totalBudget ? Number(totalBudget) : null
      });
      if (res.success) {
        setPlan(res.plan);
        toastSuccess("Budget plan generated & saved!");
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to generate budget plan.");
      toastError(err.response?.data?.message || "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  };

  const acceptPlan = () => {
    if (!plan) return;
    acceptMutation.mutate(selectedMonth, {
      onSuccess: () => setPlan({ ...plan, isAccepted: true }),
    });
  };

  const deletePlan = () => {
    if (!plan) return;
    deleteMutation.mutate(selectedMonth, {
      onSuccess: () => setPlan(null),
    });
  };

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-4xl font-bold text-primary flex items-center gap-3">
            <Brain className="w-10 h-10" />
            AI Budget Planner
          </h1>
          <p className="text-base-content/70 mt-2">
            Plan your monthly finances with AI assistance.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-base-100 p-2 rounded-lg shadow">
            <Calendar className="w-5 h-5 text-primary" />
            <input 
                type="month" 
                className="input input-sm input-ghost focus:outline-none font-medium"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
            />
        </div>
      </div>

      {!plan && !fetching && (
        <div className="card bg-base-100 shadow-xl animate-fade-in">
            <div className="card-body">
                <h2 className="card-title mb-4">Plan for {selectedMonth}</h2>
                {profileIncome && (     
                    <p className="label-text text-base-content/60">Monthly Income (from profile):
                    <span className="font-bold text-success">৳{profileIncome.toLocaleString()}</span>
                    </p>
                    )}
                <div className="flex flex-col md:flex-row gap-4 items-end flex-wrap">
                    <div className="form-control w-full max-w-xs">
                        <label className="label mb-2">
                            <span className="label-text font-medium">Optional: Set a Max Budget Limit</span>
                            <span className="label-text-alt text-base-content/50">Leave blank to use 80% of income</span>
                        </label>
                        <input 
                            type="number" 
                            placeholder={profileIncome ? `e.g. ${Math.round(profileIncome * 0.8).toLocaleString()}` : "e.g. 30000"}
                            className="input input-bordered w-full max-w-xs" 
                            value={totalBudget}
                            onChange={(e) => setTotalBudget(e.target.value)}
                        />
                        {profileIncome && totalBudget && (
                          <label className="label">
                            <span className={`label-text-alt ${Number(totalBudget) > profileIncome ? "text-error" : "text-base-content/50"}`}>
                              {Number(totalBudget) > profileIncome
                                ? "⚠️ Exceeds your monthly income"
                                : `Savings: ৳${(profileIncome - Number(totalBudget)).toLocaleString()}`}
                            </span>
                          </label>
                        )}
                    </div>

                    <button 
                        className="btn btn-primary"
                        onClick={generatePlan}
                        disabled={loading}
                    >
                        {loading ? <span className="loading loading-spinner"></span> : "Generate AI Plan"}
                    </button>
                </div>
                {error && <div className="text-error mt-2">{error}</div>}
            </div>
        </div>
      )}

      {fetching && (
        <div className="flex justify-center py-20">
            <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      )}

      {plan && (
        <div className="space-y-6 animate-fade-in">
             {/* Actions Bar */}
             <div className="flex justify-between items-center bg-base-100 p-4 rounded-xl shadow-lg border border-base-200">
                <div className="flex items-center gap-2">
                    <div className={`badge ${plan.isAccepted ? "badge-success" : "badge-warning"} gap-2 p-3`}>
                        {plan.isAccepted ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {plan.isAccepted ? "Plan Accepted" : "Draft Plan"}
                    </div>
                    <span className="text-sm opacity-70">Generated for {plan.month}</span>
                </div>
                <div className="flex gap-2">
                    {!plan.isAccepted ? (
                        <button 
                            className="btn btn-success btn-sm text-white gap-2"
                            onClick={acceptPlan}
                            disabled={accepting || deleting}
                        >
                            {accepting ? <span className="loading loading-spinner loading-xs"></span> : <Check className="w-4 h-4" />}
                            Accept & Apply to Budget
                        </button>
                    ) : (
                        <button className="btn btn-sm btn-disabled btn-outline gap-2">
                            <Check className="w-4 h-4" />
                            Applied
                        </button>
                    )}
                    <button 
                        className="btn btn-error btn-sm btn-outline gap-2"
                        onClick={deletePlan}
                        disabled={deleting || accepting}
                    >
                        {deleting ? <span className="loading loading-spinner loading-xs"></span> : <X className="w-4 h-4" />}
                        Cancel & delete plan
                    </button>
                </div>
             </div>

             {/* Summary Stats */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="stats shadow">
                    <div className="stat">
                        <div className="stat-title">Monthly Income</div>
                        <div className="stat-value text-success">৳{(plan.monthlyIncome ?? 0).toLocaleString()}</div>
                    </div>
                </div>
                <div className="stats shadow">
                    <div className="stat">
                        <div className="stat-title">Recommended Savings</div>
                        <div className="stat-value text-primary">৳{(plan.recommendedSavings ?? 0).toLocaleString()}</div>
                        <div className="stat-desc">20% of income + (Target)</div>
                    </div>
                </div>
                <div className="stats shadow">
                    <div className="stat">
                        <div className="stat-title">Living Budget</div>
                        <div className="stat-value text-secondary">৳{(plan.totalLivingBudget ?? 0).toLocaleString()}</div>
                        <div className="stat-desc">Needs + Wants</div>
                    </div>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Needs */}
                <div className="card bg-base-100 shadow-xl border-t-4 border-blue-500">
                    <div className="card-body">
                        <h3 className="card-title flex items-center gap-2 text-blue-600">
                            <Shield className="w-6 h-6" />
                            Needs (Essentials)
                            <span className="ml-auto text-sm font-normal text-base-content/60">Target: ৳{(plan.needsTotal ?? 0).toLocaleString()}</span>
                        </h3>
                        <div className="divider my-1"></div>
                        <div className="space-y-3">
                            {Object.entries(plan.needsBreakdown || {}).map(([cat, amt]) => (
                                <div key={cat} className="flex justify-between items-center">
                                    <span>{cat}</span>
                                    <span className="font-bold">৳{amt.toLocaleString()}</span>
                                </div>
                            ))}
                            {Object.keys(plan.needsBreakdown || {}).length === 0 && (
                                <p className="text-center opacity-50">No specific needs identified yet.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Wants */}
                <div className="card bg-base-100 shadow-xl border-t-4 border-pink-500">
                    <div className="card-body">
                        <h3 className="card-title flex items-center gap-2 text-pink-600">
                            <ShoppingBag className="w-6 h-6" />
                            Wants (Lifestyle)
                            <span className="ml-auto text-sm font-normal text-base-content/60">Target: ৳{(plan.wantsTotal ?? 0).toLocaleString()}</span>
                        </h3>
                         <div className="divider my-1"></div>
                        <div className="space-y-3">
                            {Object.entries(plan.wantsBreakdown || {}).map(([cat, amt]) => (
                                <div key={cat} className="flex justify-between items-center">
                                    <span>{cat}</span>
                                    <span className="font-bold">৳{amt.toLocaleString()}</span>
                                </div>
                            ))}
                             {Object.keys(plan.wantsBreakdown || {}).length === 0 && (
                                <p className="text-center opacity-50">No specific wants identified yet.</p>
                            )}
                        </div>
                    </div>
                </div>
             </div>

             {/* Notes & Tips */}
             <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                    <h3 className="card-title flex items-center gap-2">
                        <AlertCircle className="w-6 h-6 text-info" />
                        AI Insights & Tips
                    </h3>
                    <ul className="list-disc list-inside space-y-2 mt-2">
                        {plan.note && plan.note.map((note, idx) => (
                            <li key={idx} className="text-base-content/80">{note}</li>
                        ))}
                    </ul>
                </div>
             </div>
        </div>
      )}
    </div>
  );
};

export default AIPlanner;
