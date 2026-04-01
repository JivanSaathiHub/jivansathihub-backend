const mongoose = require("mongoose");

const successStorySchema = new mongoose.Schema(
  {
    coupleName:  { type: String, required: true, trim: true },
    groomName:   { type: String, trim: true, default: "" },
    brideName:   { type: String, trim: true, default: "" },
    marriageDate:{ type: String, trim: true, default: "" },   // stored as DD/MM/YYYY string
    location:    { type: String, trim: true, default: "" },
    story:       { type: String, trim: true, default: "" },
    image:       { type: String, default: null },             // URL/path to uploaded image
    status:      { type: String, enum: ["published", "draft"], default: "draft" },
    addedOn:     { type: String, default: "" },               // human-readable e.g. "20 Mar 2024"
  },
  { timestamps: true }
);

module.exports = mongoose.model("SuccessStory", successStorySchema);