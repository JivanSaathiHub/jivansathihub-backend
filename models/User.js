const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // ── Auth ──────────────────────────────────────────────────────
    email: {
      type: String, required: true, unique: true,
      lowercase: true, trim: true,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    mobile:   { type: String, required: true, unique: true, trim: true },

    // ── Role ──────────────────────────────────────────────────────
    role: {
      type:    String,
      enum:    ["user", "admin", "superadmin"],
      default: "user",
    },

    // ── Basic Info ────────────────────────────────────────────────
    fullName:    { type: String, required: true, trim: true },
    gender:      { type: String, enum: ["Male", "Female", "Other"], required: true },
    dateOfBirth: { type: Date,   required: true },
    age:         { type: Number },

    // ── Profile ───────────────────────────────────────────────────
    religion:     { type: String, default: "" },
    caste:        { type: String, default: "" },
    motherTongue: { type: String, default: "" },
    height:       { type: String, default: "" },
    weight:       { type: String, default: "" },
    complexion:   { type: String, default: "" },
    maritalStatus: {
      type: String,
      enum: ["Never Married", "Divorced", "Widowed", "Awaiting Divorce"],
      default: "Never Married",
    },
    aboutMe: { type: String, default: "", maxlength: 500 },

    // ── Location ──────────────────────────────────────────────────
    country: { type: String, default: "India" },
    state:   { type: String, default: "" },
    city:    { type: String, default: "" },

    // ── Education & Career ────────────────────────────────────────
    education:    { type: String, default: "" },
    profession:   { type: String, default: "" },
    employer:     { type: String, default: "" },
    annualIncome: { type: String, default: "" },

    // ── Family ────────────────────────────────────────────────────
    familyType:        { type: String, default: "" },
    familyStatus:      { type: String, default: "" },
    familyValues:      { type: String, default: "" },
    fatherOccupation:  { type: String, default: "" },
    motherOccupation:  { type: String, default: "" },
    siblings:          { type: String, default: "" },

    // ── Partner Preferences ───────────────────────────────────────
    partnerPreferences: {
      ageFrom:    { type: Number, default: 18 },
      ageTo:      { type: Number, default: 40 },
      heightFrom: { type: String, default: "" },
      heightTo:   { type: String, default: "" },
      religion:   { type: [String], default: [] },
      caste:      { type: [String], default: [] },
      education:  { type: [String], default: [] },
      profession: { type: [String], default: [] },
      location:   { type: [String], default: [] },
      maritalStatus: { type: [String], default: [] },
    },

    // ── Photos ────────────────────────────────────────────────────
    photos: [
      {
        url:        { type: String },
        publicId:   { type: String },
        isPrimary:  { type: Boolean, default: false },
        uploadedAt: { type: Date,    default: Date.now },
      },
    ],

    // ── Membership ────────────────────────────────────────────────
    membership: {
      plan:      { type: String, enum: ["free", "premium", "elite"], default: "free" },
      startDate: { type: Date },
      endDate:   { type: Date },
      isActive:  { type: Boolean, default: false },
      orderId:   { type: String },
      paymentId: { type: String },
      amount:    { type: Number },
    },

    // ── Activity ──────────────────────────────────────────────────
    isVerified:   { type: Boolean, default: false },
    isActive:     { type: Boolean, default: true  },
    profileViews: { type: Number,  default: 0     },
    lastActive:   { type: Date,    default: Date.now },

    // ── Profile Views Tracking ────────────────────────────────────
    // Stores last 50 viewers — powers "who viewed your profile" feature
    recentViewers: [
      {
        viewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        viewedAt: { type: Date, default: Date.now },
      },
    ],

    // ── Interests ─────────────────────────────────────────────────
    interestsSent:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    interestsReceived: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    matches:           [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    blockedUsers:      [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // ── Password reset ────────────────────────────────────────────
    resetPasswordToken:   { type: String },
    resetPasswordExpires: { type: Date   },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────
// email + mobile indexes are auto-created via unique:true above
userSchema.index({ role:              1 });
userSchema.index({ city: 1, religion: 1, age: 1 });
userSchema.index({ gender: 1, isActive: 1 });
userSchema.index({ "membership.plan": 1 });

// ── Auto-calc age before save (mongoose 8: async, no next param) ──
userSchema.pre("save", async function () {
  if (this.dateOfBirth) {
    const diff = Date.now() - new Date(this.dateOfBirth).getTime();
    this.age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  }
  if (!this.isModified("password")) return;
  const salt    = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// ── Compare password ──────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// ── Remove sensitive fields from JSON output ──────────────────────
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.blockedUsers;
  delete obj.recentViewers;  // never expose raw viewer list
  return obj;
};

module.exports = mongoose.model("User", userSchema);