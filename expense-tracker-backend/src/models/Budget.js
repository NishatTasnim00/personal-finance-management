import mongoose from 'mongoose';

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0, 'Amount cannot be negative'],
    },
    period: {
      type: String,
      enum: ['weekly', 'monthly', 'yearly'],
      required: true,
    },
    // Exact start and end of this budget's time window
    // e.g. monthly → Mar 1 00:00:00  to  Mar 31 23:59:59
    // e.g. weekly  → Mar 17 00:00:00 to  Mar 23 23:59:59
    // e.g. yearly  → Jan 1 00:00:00  to  Dec 31 23:59:59
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    // null = manually created, ObjectId = created from an AI plan
    aiPlanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BudgetPlan',
      default: null,
    },
    isAIGenerated: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// One budget per category per exact time window per user
budgetSchema.index({ userId: 1, category: 1, startDate: 1, endDate: 1 }, { unique: true });

export default mongoose.model('Budget', budgetSchema);
