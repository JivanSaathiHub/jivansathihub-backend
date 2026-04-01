const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const {
  register,
  login,
  logout,
  getMe,
  changePassword,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");
const { registerRules, loginRules, validate } = require("../middleware/validate");

// ── Multer: store files in memory so we can stream to Cloudinary ──
// Accepts up to 5 photos sent as photo_0 … photo_4
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },   // 5 MB per file
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"), false);
  },
}).fields([
  { name: "photo_0", maxCount: 1 },
  { name: "photo_1", maxCount: 1 },
  { name: "photo_2", maxCount: 1 },
  { name: "photo_3", maxCount: 1 },
  { name: "photo_4", maxCount: 1 },
]);

// ── Public ────────────────────────────────────────────────────────
router.post("/register",        upload, registerRules, validate, register);
router.post("/login",           loginRules, validate, login);
router.post("/logout",          logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password",  resetPassword);

// ── Protected ─────────────────────────────────────────────────────
router.get("/me",              protect, getMe);
router.put("/change-password", protect, changePassword);

module.exports = router;