const mongoose = require("mongoose");

const membershipPlanSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    price:       { type: Number, required: true, default: 0 },
    duration:    { type: String, required: true, default: "Forever" },
    durationDays:{ type: Number, default: 0 },
    features:    [{ type: String, trim: true }],
    isActive:    { type: Boolean, default: true },
    order:       { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MembershipPlan", membershipPlanSchema);