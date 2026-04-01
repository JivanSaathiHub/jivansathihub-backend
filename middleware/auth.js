const jwt  = require("jsonwebtoken");
const User = require("../models/User");

// ── Protect route — require valid JWT ─────────────────────────────
exports.protect = async (req, res, next) => {
  try {
    let token;

    // 1. Read from HTTPOnly cookie (preferred)
    if (req.cookies && req.cookies.authToken) {
      token = req.cookies.authToken;
    }
    // 2. Fallback: Authorization header (for API clients)
    else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized. Please log in.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists.",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account has been deactivated.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
};

// ── Role check middlewares ─────────────────────────────────────────
exports.checkAdmin = (req, res, next) => {
  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    return res.status(403).json({
      success: false,
      message: "Admin access required.",
    });
  }
  next();
};

exports.checkSuperAdmin = (req, res, next) => {
  if (req.user.role !== "superadmin") {
    return res.status(403).json({
      success: false,
      message: "SuperAdmin access required.",
    });
  }
  next();
};

// ── Require premium or elite membership ───────────────────────────
exports.requirePremium = (req, res, next) => {
  const { plan, isActive, endDate } = req.user.membership || {};

  const isPremium =
    (plan === "premium" || plan === "elite") &&
    isActive &&
    new Date(endDate) > new Date();

  if (!isPremium) {
    return res.status(403).json({
      success: false,
      message: "This feature requires a Premium or Elite membership.",
    });
  }
  next();
};