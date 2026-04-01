const express = require("express");
const router  = express.Router();
const {
  searchProfiles,
  getRecommendations,
  trackProfileView,
  getWhoViewedMe,
  getFeaturedProfiles,
} = require("../controllers/searchController");
const { protect } = require("../middleware/auth");

// ── PUBLIC route — no login required ──────────────────────────
// Must be registered BEFORE router.use(protect) below
router.get("/featured", getFeaturedProfiles);

// ── All routes below this line require a logged-in user ────────
router.use(protect);

router.get("/",                searchProfiles);
router.get("/recommendations", getRecommendations);
router.get("/who-viewed-me",   getWhoViewedMe);
router.post("/view/:id",       trackProfileView);

module.exports = router;