const express = require("express");
const router  = express.Router();
const {
  /* Dashboard */
  getDashboardStats,
  getSidebarCounts,

  /* Users */
  getAllUsers, getUserStats, getUserById,
  blockUser, unblockUser, deleteUser, updateUserRole, exportUsers,

  /* Interests */
  getAllInterests, getInterestStats, deleteInterest, exportInterests,

  /* Memberships (users) */
  getAllMemberships, getMembershipStats,
  manualUpgradeMembership, cancelUserMembership, exportMemberships,

  /* Verifications */
  getAllVerifications, getVerificationStats, getVerificationDetail, exportVerifications,

  /* Analytics */
  getAnalytics,

  /* Reports */
  getReportsSummary, exportReport,

  /* Support */
  getSupportTickets, updateSupportTicket,

  /* Settings */
  getSettings, saveSettings,

  /* Admin profile */
  updateAdminProfile,
} = require("../controllers/adminController");

const {
  getAllFeedback,
  resolveFeedback,
  deleteFeedback,
} = require("../controllers/feedbackController");

const {
  getAdminPlans,
  createPlan,
  updatePlan,
  togglePlan,
  deletePlan,
} = require("../controllers/adminMembershipController");

const { protect, checkAdmin, checkSuperAdmin } = require("../middleware/auth");

router.use(protect);
router.use(checkAdmin);

/* ── Dashboard ──────────────────────────────────────────────────── */
router.get("/stats",                              getDashboardStats);
router.get("/sidebar-counts",                     getSidebarCounts);

/* ── Users — /stats and /export MUST come before /:id ───────────── */
router.get("/users/stats",                        getUserStats);
router.get("/users/export",                       exportUsers);
router.get("/users",                              getAllUsers);
router.get("/users/:id",                          getUserById);
router.put("/users/:id/block",                    blockUser);
router.put("/users/:id/unblock",                  unblockUser);
router.put("/users/:id/role",   checkSuperAdmin,  updateUserRole);
router.delete("/users/:id",     checkSuperAdmin,  deleteUser);

/* ── Interests — /stats and /export MUST come before /:id ──────── */
router.get("/interests/stats",                    getInterestStats);
router.get("/interests/export",                   exportInterests);
router.get("/interests",                          getAllInterests);
router.delete("/interests/:id",                   deleteInterest);

/* ── Memberships (users) — /stats and /export before /:userId ──── */
router.get("/memberships/stats",                  getMembershipStats);
router.get("/memberships/export",                 exportMemberships);
router.get("/memberships",                        getAllMemberships);
router.put("/memberships/:userId/upgrade", checkSuperAdmin, manualUpgradeMembership);
router.put("/memberships/:userId/cancel",  checkSuperAdmin, cancelUserMembership);

/* ── Membership Plans (CRUD) — /toggle MUST come before /:id ────── */
router.get("/plans",                               getAdminPlans);
router.post("/plans",             checkSuperAdmin,  createPlan);
router.put("/plans/:id",          checkSuperAdmin,  updatePlan);
router.patch("/plans/:id/toggle", checkSuperAdmin,  togglePlan);
router.delete("/plans/:id",       checkSuperAdmin,  deletePlan);

/* ── Verifications — /stats, /export MUST come before /:userId ─── */
router.get("/verifications/stats",                getVerificationStats);
router.get("/verifications/export",               exportVerifications);
router.get("/verifications",                      getAllVerifications);
router.get("/verifications/:userId",              getVerificationDetail);

/* ── Analytics ──────────────────────────────────────────────────── */
router.get("/analytics",                          getAnalytics);

/* ── Reports ────────────────────────────────────────────────────── */
router.get("/reports/summary",                    getReportsSummary);
router.get("/reports/export/:type",               exportReport);

/* ── Support ────────────────────────────────────────────────────── */
router.get("/support",                            getSupportTickets);
router.put("/support/:id",                        updateSupportTicket);

/* ── Feedback — /resolve MUST come before /:id ─────────────────── */
router.get("/feedback",                           getAllFeedback);
router.patch("/feedback/:id/resolve",             resolveFeedback);
router.delete("/feedback/:id",                    deleteFeedback);

/* ── Settings ───────────────────────────────────────────────────── */
router.get("/settings",                           getSettings);
router.put("/settings",           checkSuperAdmin,  saveSettings);

/* ── Admin own profile ──────────────────────────────────────────── */
router.put("/profile",                            updateAdminProfile);

module.exports = router;