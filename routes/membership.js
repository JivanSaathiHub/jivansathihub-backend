const express = require("express");
const router  = express.Router();
const {
  getMembershipStatus,
  createOrder,
  verifyPayment,
  upgradeMembership,
  cancelMembership,
  cashfreeWebhook,
} = require("../controllers/membershipController");
const { protect } = require("../middleware/auth");
const MembershipPlan = require("../models/MembershipPlan");

// ── Public: get plans from DB ─────────────────────────────────────
router.get("/plans", async (req, res) => {
  try {
    const plans = await MembershipPlan.find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .lean();
    res.json({ success: true, plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Cashfree Webhook ──────────────────────────────────────────────
router.post("/webhook", cashfreeWebhook);

// ── Protected (login required) ────────────────────────────────────
router.use(protect);
router.get("/status",        getMembershipStatus);
router.post("/create-order", createOrder);
router.post("/verify",       verifyPayment);
router.post("/upgrade",      upgradeMembership);
router.post("/cancel",       cancelMembership);

module.exports = router;