const express      = require("express");
const nodemailer   = require("nodemailer");       // ✅ CHANGED — was axios + brevo
const NodeCache    = require("node-cache");
const rateLimit    = require("express-rate-limit");
const router       = express.Router();

// ── OTP store — auto-deletes after 10 minutes ─────────────────────
const otpCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// ── Rate limiter — max 5 OTP sends per 15 min per IP ──────────────
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      5,
  message:  { success: false, message: "Too many OTP requests. Please wait 15 minutes." },
});

// ✅ CHANGED — nodemailer transporter (Gmail / Yahoo / Outlook / any SMTP)
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail", // "gmail" | "yahoo" | "outlook" | "hotmail"
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,  // Gmail: App Password, Yahoo: App Password
  },
});

// Verify connection on startup
transporter.verify((err) => {
  if (err) console.error("❌ Nodemailer error:", err.message);
  else     console.log("✅ Nodemailer ready —", process.env.EMAIL_SERVICE || "gmail");
});

// ── POST /api/otp/send ────────────────────────────────────────────
router.post("/send", otpLimiter, async (req, res) => {
  const { email, name } = req.body;

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ success: false, message: "Valid email is required." });
  }

  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Save to cache keyed by lowercase email
  otpCache.set(email.toLowerCase(), otp);

  try {
    // ✅ CHANGED — nodemailer sendMail (was axios.post to brevo)
    await transporter.sendMail({
      from:    `"${process.env.FROM_NAME || "JeevanSaathiHub"}" <${process.env.EMAIL_USER}>`,
      to:      email,
      subject: "Your JeevanSaathiHub Verification OTP",
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
          <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">

            <div style="background:linear-gradient(135deg,#FEF2F2,#FFFBEB);padding:24px 32px;border-bottom:1px solid #f0f0f0;">
              <h1 style="margin:0;font-size:20px;font-weight:800;color:#cc0000;">
                JeevanSaathi<span style="color:#111827;">Hub</span>
              </h1>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">Email Verification</p>
            </div>

            <div style="padding:28px 32px;">
              <p style="margin:0 0 8px;font-size:15px;color:#374151;">
                Hi <strong>${name || "there"}</strong>,
              </p>
              <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6;">
                Use the OTP below to verify your email address.
              </p>
              <div style="background:#FEF2F2;border:2px dashed #ef3c3c;border-radius:12px;padding:24px;text-align:center;margin:0 0 20px;">
                <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#9ca3af;letter-spacing:1px;text-transform:uppercase;">Your OTP</p>
                <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#cc0000;font-family:monospace;">
                  ${otp}
                </span>
              </div>
              <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">⏱ Valid for <strong>10 minutes</strong> only</p>
              <p style="margin:0;font-size:13px;color:#6b7280;">🔒 Never share this OTP with anyone</p>
            </div>

            <div style="padding:16px 32px;background:#fafafa;border-top:1px solid #f0f0f0;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                If you did not request this, please ignore this email.
              </p>
            </div>

          </div>
        </body>
        </html>
      `,
    });

    console.log(`✅ OTP sent → ${email}`);
    return res.json({ success: true, message: "OTP sent successfully." });

  } catch (err) {
    console.error("❌ Nodemailer send error:", err.message);
    otpCache.del(email.toLowerCase()); // clean up on failure
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again.",
    });
  }
});

// ── POST /api/otp/verify ──────────────────────────────────────────
router.post("/verify", (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Email and OTP are required." });
  }

  const stored = otpCache.get(email.toLowerCase());

  if (!stored) {
    return res.status(400).json({
      success: false,
      message: "OTP expired or not found. Please request a new one.",
    });
  }

  if (stored !== otp.toString().trim()) {
    return res.status(400).json({ success: false, message: "Incorrect OTP. Please try again." });
  }

  // ✅ Verified — delete immediately so it can't be reused
  otpCache.del(email.toLowerCase());

  console.log(`✅ Email verified → ${email}`);
  return res.json({ success: true, message: "Email verified successfully.", verified: true });
});

module.exports = router;