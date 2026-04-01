const express = require("express");
const router  = express.Router();
const {
  sendAadhaarOtp,
  verifyAadhaarOtp,
} = require("../controllers/verificationController");
const { protect } = require("../middleware/auth");

// Both routes require the user to be logged in
router.use(protect);

router.post("/aadhaar/send-otp",   sendAadhaarOtp);
router.post("/aadhaar/verify-otp", verifyAadhaarOtp);

module.exports = router;