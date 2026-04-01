const crypto     = require("crypto");
const User       = require("../models/User");
const generateToken = require("../utils/generateToken");
const { Resend } = require("resend");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

// ── Cloudinary config (reads from .env automatically) ────────────
// Make sure your .env has:
//   CLOUDINARY_CLOUD_NAME=...
//   CLOUDINARY_API_KEY=...
//   CLOUDINARY_API_SECRET=...
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Upload a buffer to Cloudinary (stream-based, no temp file) ───
const uploadToCloudinary = (buffer, folder = "jsh/profiles") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// ── Helper: send email via Resend ─────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from:    "onboarding@resend.dev",
      to:      to,
      subject: subject,
      html:    html,
    });
  } catch (err) {
    console.error("❌ Email error:", err.message);
  }
};

// ── Shared email wrapper ──────────────────────────────────────────
const emailWrapper = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#c0c1c2;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#c0c1c2;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="max-width:448px;background:#1f2937;border-radius:16px;
                 overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.5);">

          <!-- Header -->
          <tr>
            <td style="background:#ffffff;padding:22px 28px;
                       border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:#cc0000;font-weight:800;font-size:20px;">
                      JeevanSaathi
                    </span>
                    <span style="color:#111827;font-weight:800;font-size:20px;">
                      Hub
                    </span>
                  </td>
                  <td align="right">
                    <span style="font-size:20px;">💑</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 32px;background:#f8f8f9;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px;background:#1f2937;
                       border-top:1px solid #374151;text-align:center;">
              <p style="color:#6b7280;font-size:12px;margin:0;">
                © 2025 JeevanSaathiHub. All rights reserved.
              </p>
              <p style="color:#4b5563;font-size:11px;margin:6px 0 0;">
                If you didn't create this account, please ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// ── Cookie options ────────────────────────────────────────────────
const cookieOptions = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "Strict" : "Lax",
  maxAge:   7 * 24 * 60 * 60 * 1000,
};

// ── REGISTER ──────────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const {
      fullName, email, password, mobile,
      gender, dateOfBirth, religion, city, state,
      // optional extra fields from the multi-step form
      maritalStatus, height, weight, motherTongue,
      caste, education, educationDetails, occupation,
      annualIncome, country, residentialStatus,
      fatherName, fatherOccupation, motherName, motherOccupation,
      siblings, familyType, familyValues, aboutMe,
      lookingFor, ageFrom, ageTo, heightFrom, heightTo,
      preferredEducation, preferredProfession,
      preferredLocation, preferredReligion, hobbies,
    } = req.body;

    // ── Duplicate check ───────────────────────────────────────────
    const exists = await User.findOne({ $or: [{ email }, { mobile }] });
    if (exists) {
      const field = exists.email === email ? "email" : "mobile number";
      return res.status(400).json({
        success: false,
        message: `This ${field} is already registered.`,
      });
    }

    // ── Build partner preferences from form data ──────────────────
    const partnerPreferences = {};
    if (ageFrom)            partnerPreferences.ageFrom    = parseInt(ageFrom)  || 18;
    if (ageTo)              partnerPreferences.ageTo      = parseInt(ageTo)    || 40;
    if (heightFrom)         partnerPreferences.heightFrom = heightFrom;
    if (heightTo)           partnerPreferences.heightTo   = heightTo;
    if (preferredReligion)  partnerPreferences.religion   = [preferredReligion];
    if (preferredLocation)  partnerPreferences.location   = preferredLocation.split(",").map(s => s.trim()).filter(Boolean);
    if (preferredEducation) partnerPreferences.education  = [preferredEducation];
    if (preferredProfession)partnerPreferences.profession = [preferredProfession];

    // ── Create user (without photos first) ───────────────────────
    const user = await User.create({
      fullName,
      email,
      password,
      mobile,
      gender,
      dateOfBirth,
      religion:          religion          || "",
      caste:             caste             || "",
      motherTongue:      motherTongue      || "",
      height:            height            || "",
      weight:            weight            || "",
      maritalStatus:     maritalStatus     || "Never Married",
      aboutMe:           aboutMe           || "",
      city:              city              || "",
      state:             state             || "",
      country:           country           || "India",
      education:         education         || "",
      profession:        occupation        || "",   // form field is "occupation"
      annualIncome:      annualIncome      || "",
      familyType:        familyType        || "",
      familyValues:      familyValues      || "",
      fatherOccupation:  fatherOccupation  || "",
      motherOccupation:  motherOccupation  || "",
      siblings:          siblings          || "",
      hobbies:           hobbies           || "",
      partnerPreferences,
    });

    // ── Upload photos to Cloudinary ───────────────────────────────
    // The frontend sends them as photo_0, photo_1, … photo_4
    // multer (or your upload middleware) puts them in req.files
    if (req.files && Object.keys(req.files).length > 0) {
      const uploadedPhotos = [];
      const photoKeys = Object.keys(req.files)
        .filter(k => k.startsWith("photo_"))
        .sort(); // keep order: photo_0, photo_1 …

      for (let i = 0; i < photoKeys.length; i++) {
        const fileArray = req.files[photoKeys[i]];
        const file      = Array.isArray(fileArray) ? fileArray[0] : fileArray;
        if (!file) continue;

        try {
          const result = await uploadToCloudinary(file.buffer, "jsh/profiles");
          uploadedPhotos.push({
            url:       result.secure_url,
            publicId:  result.public_id,
            isPrimary: i === 0,           // first photo is primary
          });
        } catch (uploadErr) {
          console.error(`❌ Cloudinary upload failed for ${photoKeys[i]}:`, uploadErr.message);
          // Don't block registration if one photo fails — just skip it
        }
      }

      if (uploadedPhotos.length > 0) {
        user.photos = uploadedPhotos;
        await user.save({ validateBeforeSave: false });
      }
    }

    // ── Issue JWT cookie ──────────────────────────────────────────
    const token = generateToken(user._id);
    res.cookie("authToken", token, cookieOptions);

    // ── Welcome email ─────────────────────────────────────────────
    await sendEmail({
      to:      user.email,
      subject: "Welcome to JeevanSaathiHub 💑",
      html:    emailWrapper(`
        <p style="color:#cc0000;font-size:13px;font-weight:500;
                  text-transform:uppercase;letter-spacing:0.3px;margin:0 0 6px;">
          Welcome
        </p>
        <h2 style="color:#111827;font-size:22px;font-weight:800;margin:0 0 16px;">
          Hello, ${user.fullName} 🎉
        </h2>
        <div style="height:1px;background:#374151;margin:0 -28px 20px;"></div>
        <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">
          Your JeevanSaathiHub account has been created successfully.
          We're excited to help you find your perfect life partner.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          <tr>
            <td style="background:#e7e9ed;border:1.5px solid #374151;
                       border-radius:10px;padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:12px;color:#cc0000;font-weight:500;">
                REGISTERED EMAIL
              </p>
              <p style="margin:0;font-size:14px;color:#111827;font-weight:600;">
                ${user.email}
              </p>
            </td>
          </tr>
        </table>
        <div style="height:1px;background:#374151;margin:0 -28px 20px;"></div>
        <a href="${process.env.CLIENT_URL}"
          style="display:block;width:100%;box-sizing:border-box;
                 padding:16px;background:#cc0000;color:#fff;
                 text-align:center;border-radius:10px;
                 font-size:16px;font-weight:700;text-decoration:none;
                 box-shadow:0 4px 16px rgba(204,0,0,0.35);">
          Go to JeevanSaathiHub →
        </a>
        <p style="text-align:center;font-size:13px;color:#6b7280;margin:16px 0 0;">
          Complete your profile to get better matches
        </p>
      `),
    });

    // ── Return FULL user so frontend AuthContext has photos ───────
    const fullUser = await User.findById(user._id);

    res.status(201).json({
      success: true,
      message: "Account created successfully!",
      user:    fullUser,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── LOGIN ─────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Your account has been deactivated.",
      });
    }

    user.lastActive = Date.now();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);
    res.cookie("authToken", token, cookieOptions);

    // ── Return FULL user (includes photos array) so profile shows correctly ──
    const fullUser = await User.findById(user._id);

    res.json({
      success: true,
      message: "Logged in successfully!",
      user:    fullUser,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET ME ────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── LOGOUT ────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  res.clearCookie("authToken", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "Strict" : "Lax",
  });
  res.json({ success: true, message: "Logged out successfully." });
};

// ── CHANGE PASSWORD ───────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select("+password");

    if (!(await user.comparePassword(currentPassword))) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: "Password changed successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── FORGOT PASSWORD ───────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: true, message: "If this email exists, a reset link has been sent." });
    }

    const token   = crypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 15 * 60 * 1000;

    user.resetPasswordToken   = token;
    user.resetPasswordExpires = expires;
    await user.save({ validateBeforeSave: false });

    const resetLink = `${process.env.CLIENT_URL}?reset_token=${token}`;

    await sendEmail({
      to:      user.email,
      subject: "Reset your JeevanSaathiHub password",
      html:    emailWrapper(`
        <p style="color:#cc0000;font-size:13px;font-weight:500;
                  text-transform:uppercase;letter-spacing:0.3px;margin:0 0 6px;">
          Password Reset
        </p>
        <h2 style="color:#111827;font-size:22px;font-weight:800;margin:0 0 16px;">
          Hello, ${user.fullName}
        </h2>
        <div style="height:1px;background:#374151;margin:0 -28px 20px;"></div>
        <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">
          We received a request to reset your password.
          Click the button below — this link expires in
          <strong style="color:#111827;">15 minutes</strong>.
        </p>
        <div style="height:1px;background:#374151;margin:0 -28px 20px;"></div>
        <a href="${resetLink}"
          style="display:block;width:100%;box-sizing:border-box;
                 padding:16px;background:#cc0000;color:#fff;
                 text-align:center;border-radius:10px;
                 font-size:16px;font-weight:700;text-decoration:none;
                 box-shadow:0 4px 16px rgba(204,0,0,0.35);">
          Reset My Password →
        </a>
        <p style="text-align:center;font-size:13px;color:#6b7280;margin:16px 0 0;">
          If you didn't request this, you can safely ignore this email.
        </p>
      `),
    });

    res.json({ success: true, message: "If this email exists, a reset link has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ success: false, message: "Something went wrong." });
  }
};

// ── RESET PASSWORD ────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: "Token and password are required." });
    }

    const user = await User.findOne({
      resetPasswordToken:   token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid or expired reset link." });
    }

    user.password             = password;
    user.resetPasswordToken   = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    await sendEmail({
      to:      user.email,
      subject: "Password changed — JeevanSaathiHub",
      html:    emailWrapper(`
        <p style="color:#cc0000;font-size:13px;font-weight:500;
                  text-transform:uppercase;letter-spacing:0.3px;margin:0 0 6px;">
          Security Alert
        </p>
        <h2 style="color:#111827;font-size:22px;font-weight:800;margin:0 0 16px;">
          Password Changed ✅
        </h2>
        <div style="height:1px;background:#374151;margin:0 -28px 20px;"></div>
        <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">
          Your JeevanSaathiHub password was successfully changed.
          If you did not make this change, please contact us immediately.
        </p>
        <div style="height:1px;background:#374151;margin:0 -28px 20px;"></div>
        <a href="${process.env.CLIENT_URL}"
          style="display:block;width:100%;box-sizing:border-box;
                 padding:16px;background:#cc0000;color:#fff;
                 text-align:center;border-radius:10px;
                 font-size:16px;font-weight:700;text-decoration:none;
                 box-shadow:0 4px 16px rgba(204,0,0,0.35);">
          Login Now →
        </a>
      `),
    });

    res.json({ success: true, message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Something went wrong." });
  }
};