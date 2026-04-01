const mongoose = require("mongoose");

const interestSchema = new mongoose.Schema(
  {
    sender:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
    message: { type: String, default: "", maxlength: 200 },
  },
  { timestamps: true }
);

// Prevent duplicate interests
interestSchema.index({ sender: 1, receiver: 1 }, { unique: true });

module.exports = mongoose.model("Interest", interestSchema);