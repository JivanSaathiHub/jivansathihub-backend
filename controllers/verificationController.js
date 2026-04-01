const axios = require("axios");
const User  = require("../models/User");

// ── Cashfree Verification base URL ────────────────────────────────
// Uses same api.cashfree.com domain — Verification Suite is a
// separate product path under the same base URL
const CF_BASE = process.env.CASHFREE_ENV === "production"
  ? "https://api.cashfree.com/verification"
  : "https://sandbox.cashfree.com/verification";

const CF_HEADERS = {
  "x-client-id":     process.env.CASHFREE_APP_ID,
  "x-client-secret": process.env.CASHFREE_SECRET_KEY,
  "x-api-version":   "2023-08-01",
  "Content-Type":    "application/json",
};

// ── POST /api/verification/aadhaar/send-otp ───────────────────────
exports.sendAadhaarOtp = async (req, res) => {
  try {
    const { aadhaar_number } = req.body;
    const clean = (aadhaar_number || "").replace(/\s/g, "");

    if (clean.length !== 12) {
      return res.status(400).json({
        success: false,
        message: "Valid 12-digit Aadhaar number is required.",
      });
    }

    const { data } = await axios.post(
      `${CF_BASE}/offline-aadhaar/otp`,
      { aadhaar_number: clean },
      { headers: CF_HEADERS }
    );

    // Cashfree returns ref_id — needed for the verify step
    res.json({
      success: true,
      message: "OTP sent to your Aadhaar-linked mobile number.",
      ref_id:  data.ref_id,
    });
  } catch (err) {
    const msg = err.response?.data?.message
             || err.response?.data?.error
             || err.message;
    console.error("sendAadhaarOtp error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      success: false,
      message: msg || "Failed to send OTP. Please try again.",
    });
  }
};

// ── POST /api/verification/aadhaar/verify-otp ─────────────────────
exports.verifyAadhaarOtp = async (req, res) => {
  try {
    const { ref_id, otp } = req.body;

    if (!ref_id || !otp) {
      return res.status(400).json({
        success: false,
        message: "ref_id and otp are required.",
      });
    }

    const { data } = await axios.post(
      `${CF_BASE}/offline-aadhaar/verify`,
      { ref_id, otp },
      { headers: CF_HEADERS }
    );

    // Mark user as verified in DB
    await User.findByIdAndUpdate(req.user._id, {
      $set: { isVerified: true },
    });

    res.json({
      success: true,
      message: "Aadhaar verified successfully.",
      details: {
        name:    data.name        || "",
        dob:     data.dob         || "",
        gender:  data.gender      || "",
        address: data.address     || "",
        mobile:  data.mobile_hash || "",
        photo:   data.photo       || null,
      },
    });
  } catch (err) {
    const msg = err.response?.data?.message
             || err.response?.data?.error
             || err.message;
    console.error("verifyAadhaarOtp error:", err.response?.data || err.message);
    res.status(err.response?.status || 500).json({
      success: false,
      message: msg || "OTP verification failed. Please try again.",
    });
  }
};