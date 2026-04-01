const express = require("express");
const router  = express.Router();
const { checkSuperAdmin } = require("../../middleware/auth");
const {
  getAllUsers,
  getUserStats,
  getUserById,
  blockUser,
  unblockUser,
  deleteUser,
  updateUserRole,
  exportUsers,
} = require("../../controllers/adminUsersController");

/* protect + checkAdmin already applied in routes/admin.js */

/* GET  /api/admin/users/stats    → 4 quick-stat cards (must be before /:id) */
router.get("/stats",  getUserStats);

/* GET  /api/admin/users/export   → CSV download       (must be before /:id) */
router.get("/export", exportUsers);

/* GET  /api/admin/users          → paginated + filtered list */
router.get("/",       getAllUsers);

/* GET  /api/admin/users/:id      → full user detail */
router.get("/:id",    getUserById);

/* PUT  /api/admin/users/:id/block    → any admin */
router.put("/:id/block",   blockUser);

/* PUT  /api/admin/users/:id/unblock  → any admin */
router.put("/:id/unblock", unblockUser);

/* PUT  /api/admin/users/:id/role     → superadmin only */
router.put("/:id/role", checkSuperAdmin, updateUserRole);

/* DELETE /api/admin/users/:id        → superadmin only */
router.delete("/:id", checkSuperAdmin, deleteUser);

module.exports = router;