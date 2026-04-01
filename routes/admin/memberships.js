const express = require("express");
const router  = express.Router();
const { checkSuperAdmin } = require("../../middleware/auth");
const {
  getAllMemberships,
  getMembershipStats,
  upgradeMembership,
  cancelMembership,
  exportMemberships,
} = require("../../controllers/adminMembershipController");

/* protect + checkAdmin already applied in routes/admin.js */

/* GET  /api/admin/memberships/stats          → revenue + plan counts   (before /:userId) */
router.get("/stats",  getMembershipStats);

/* GET  /api/admin/memberships/export         → CSV download            (before /:userId) */
router.get("/export", exportMemberships);

/* GET  /api/admin/memberships                → paginated list */
router.get("/",       getAllMemberships);

/* PUT  /api/admin/memberships/:userId/upgrade  → superadmin only */
router.put("/:userId/upgrade", checkSuperAdmin, upgradeMembership);

/* PUT  /api/admin/memberships/:userId/cancel   → superadmin only */
router.put("/:userId/cancel",  checkSuperAdmin, cancelMembership);

module.exports = router;