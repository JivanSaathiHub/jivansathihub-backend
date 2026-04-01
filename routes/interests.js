const express = require("express");
const router = express.Router();

const interestController = require("../controllers/interestController");
const { protect } = require("../middleware/auth");

// protect all routes
router.use(protect);

// Sent interests
router.get("/sent", interestController.getSentInterests);

// Received interests
router.get("/received", interestController.getReceivedInterests);

// Matches
router.get("/matches", interestController.getMatches);

// Send interest
router.post("/:userId", interestController.sendInterest);

// Accept / decline interest
router.put("/:interestId", interestController.respondToInterest);

// Withdraw interest
router.delete("/:userId", interestController.withdrawInterest);

module.exports = router;