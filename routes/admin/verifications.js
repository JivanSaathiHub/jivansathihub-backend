const express = require("express");
const router  = express.Router();
const {
  getVerificationStats,
  getAllVerifications,
  getVerificationDetail,
  exportVerifications,
} = require("../../controllers/adminVerificationsController");

/* protect + checkAdmin already applied in routes/admin.js */

/* GET /api/admin/verifications/stats     → 3 stat cards   (before /:userId) */
router.get("/stats",    getVerificationStats);

/* GET /api/admin/verifications/export    → CSV download    (before /:userId) */
router.get("/export",   exportVerifications);

/* GET /api/admin/verifications           → paginated list */
router.get("/",         getAllVerifications);

/* GET /api/admin/verifications/:userId   → VerifDetail.jsx */
router.get("/:userId",  getVerificationDetail);

module.exports = router;