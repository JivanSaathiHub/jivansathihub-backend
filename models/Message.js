const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    // Sorted pair of user IDs joined by "_" — e.g. "abc123_def456"
    roomId: { type: String, required: true, index: true },

    sender:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    text:  { type: String, default: "" },
    image: { type: String, default: "" }, // URL if image message

    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);