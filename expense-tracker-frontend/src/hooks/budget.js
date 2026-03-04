import api from "@/lib/api";
import { toastSuccess, toastError } from "@/lib/toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// Fetch budgets — overlapping a given month, with optional period + category filters
export const useGetBudgets = ({ month, period, category } = {}) => {
  return useQuery({
    queryKey: ["budgets", month, period, category],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (month)    params.set("month",    month);
      if (period)   params.set("period",   period);
      if (category) params.set("category", category);
      const { result } = await api.get(`/budgets?${params}`);
      return result;
    },
    onError: () => toastError("Failed to load budgets"),
  });
};

export const useUpdateBudget = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ isEdit, id, formData }) => {
      const payload = {
        category: formData.category,
        amount:   Number(formData.amount),
        period:   formData.period,
        refDate:  formData.refDate, // ISO string — which specific period to create for
      };
      if (isEdit && id) return api.patch(`/budgets/${id}`, payload);
      return api.post("/budgets", payload);
    },
    onSuccess: () => {
      toastSuccess("Budget saved!");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: (err) => toastError(err?.response?.data?.message || "Failed to save budget"),
  });
};

export const useDeleteBudget = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id) => api.delete(`/budgets/${id}`),
    onSuccess: () => {
      toastSuccess("Budget deleted!");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: () => toastError("Failed to delete budget"),
  });
};

export const useAcceptBudgetPlan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (month) => api.post("/ai/accept-plan", { month }),
    onSuccess: () => {
      toastSuccess("Budget plan applied!");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: (err) => toastError(err?.response?.data?.message || "Failed to accept plan"),
  });
};

export const useDeleteBudgetPlan = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (month) => api.delete(`/ai/plan?month=${month}`),
    onSuccess: () => {
      toastSuccess("Plan deleted.");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: (err) => toastError(err?.response?.data?.message || "Failed to delete plan"),
  });
};
