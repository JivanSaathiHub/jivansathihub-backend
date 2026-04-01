const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
      required: true,
    },
    userName:  { type: String, required: true },
    userEmail: { type: String, required: true },
    subject:   { type: String, required: true, trim: true },
    message:   { type: String, required: true, trim: true },
    rating:    { type: Number, required: true, min: 1, max: 5 },
    category:  {
      type:    String,
      enum:    ["Positive", "Suggestion", "Issue", "Negative"],
      default: "Positive",
    },
    status: {
      type:    String,
      enum:    ["Pending", "Resolved"],
      default: "Pending",
    },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feedback", feedbackSchema);