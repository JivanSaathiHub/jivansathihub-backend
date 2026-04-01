const express  = require("express");
const router   = express.Router();
const { submitFeedback } = require("../controllers/feedbackController");
const { protect } = require("../middleware/auth");

/* POST /api/feedback  — logged-in users submit feedback */
router.post("/", protect, submitFeedback);

module.exports = router;