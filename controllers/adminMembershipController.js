const MembershipPlan = require("../models/MembershipPlan");
const User           = require("../models/User");

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/admin/plans
   Returns all plans with live subscriber counts
════════════════════════════════════════════════════════════════════════════ */
exports.getAdminPlans = async (req, res) => {
  try {
    const plans = await MembershipPlan.find().sort({ order: 1, createdAt: 1 }).lean();

    /* Count subscribers per plan (case-insensitive match on plan name) */
    const plansWithCounts = await Promise.all(
      plans.map(async (plan) => {
        const subscriberCount = await User.countDocuments({
          "membership.plan":     { $regex: new RegExp(`^${plan.name}$`, "i") },
          "membership.isActive": true,
        });
        return { ...plan, subscriberCount };
      })
    );

    const totalSubscribers = await User.countDocuments({ "membership.isActive": true });
    const activePlans      = plans.filter((p) => p.isActive).length;

    res.json({
      success: true,
      stats: {
        totalPlans:       plans.length,
        totalSubscribers,
        activePlans,
      },
      plans: plansWithCounts,
    });
  } catch (error) {
    console.error("getAdminPlans error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   POST /api/admin/plans
   Create a new membership plan
════════════════════════════════════════════════════════════════════════════ */
exports.createPlan = async (req, res) => {
  try {
    const { name, price, duration, durationDays, features } = req.body;

    if (!name || !duration) {
      return res.status(400).json({ success: false, message: "Name and duration are required." });
    }

    const existing = await MembershipPlan.findOne({ name: { $regex: new RegExp(`^${name}$`, "i") } });
    if (existing) {
      return res.status(400).json({ success: false, message: `A plan named "${name}" already exists.` });
    }

    const count = await MembershipPlan.countDocuments();
    const plan  = await MembershipPlan.create({
      name,
      price:        Number(price)        || 0,
      duration,
      durationDays: Number(durationDays) || 0,
      features:     Array.isArray(features) ? features.filter(Boolean) : [],
      isActive:     true,
      order:        count,
    });

    res.status(201).json({ success: true, message: "Plan created successfully.", plan });
  } catch (error) {
    console.error("createPlan error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   PUT /api/admin/plans/:id
   Update an existing plan
════════════════════════════════════════════════════════════════════════════ */
exports.updatePlan = async (req, res) => {
  try {
    const { name, price, duration, durationDays, features } = req.body;

    const plan = await MembershipPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found." });

    if (name)                          plan.name         = name;
    if (price !== undefined)           plan.price        = Number(price);
    if (duration)                      plan.duration     = duration;
    if (durationDays !== undefined)    plan.durationDays = Number(durationDays);
    if (Array.isArray(features))       plan.features     = features.filter(Boolean);

    await plan.save();
    res.json({ success: true, message: "Plan updated successfully.", plan });
  } catch (error) {
    console.error("updatePlan error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   PATCH /api/admin/plans/:id/toggle
   Activate or deactivate a plan
════════════════════════════════════════════════════════════════════════════ */
exports.togglePlan = async (req, res) => {
  try {
    const plan = await MembershipPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found." });

    plan.isActive = !plan.isActive;
    await plan.save();

    res.json({
      success: true,
      message: `Plan ${plan.isActive ? "activated" : "deactivated"} successfully.`,
      plan,
    });
  } catch (error) {
    console.error("togglePlan error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   DELETE /api/admin/plans/:id
   Delete a plan (only if no active subscribers)
════════════════════════════════════════════════════════════════════════════ */
exports.deletePlan = async (req, res) => {
  try {
    const plan = await MembershipPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found." });

    const activeSubscribers = await User.countDocuments({
      "membership.plan":     { $regex: new RegExp(`^${plan.name}$`, "i") },
      "membership.isActive": true,
    });

    if (activeSubscribers > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete — ${activeSubscribers} active subscriber(s) on this plan.`,
      });
    }

    await MembershipPlan.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Plan deleted successfully." });
  } catch (error) {
    console.error("deletePlan error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};