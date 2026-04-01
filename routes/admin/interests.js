const express = require("express");
const router  = express.Router();
const {
  getInterestStats,
  getAllInterests,
  getInterestById,
  deleteInterest,
  exportInterests,
} = require("../../controllers/adminInterestsController");

/* protect + checkAdmin already applied in routes/admin.js */

/* GET  /api/admin/interests/stats    → 4 stat cards   (before /:id) */
router.get("/stats",  getInterestStats);

/* GET  /api/admin/interests/export   → CSV download   (before /:id) */
router.get("/export", exportInterests);

/* GET  /api/admin/interests          → paginated list */
router.get("/",       getAllInterests);

/* GET  /api/admin/interests/:id      → single detail */
router.get("/:id",    getInterestById);

/* DELETE /api/admin/interests/:id    → any admin */
router.delete("/:id", deleteInterest);

module.exports = router;