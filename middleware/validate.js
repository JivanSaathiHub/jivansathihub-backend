const { body, validationResult } = require("express-validator");

// ── Run validations and return errors ─────────────────────────────
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors:  errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ── Register rules ────────────────────────────────────────────────
exports.registerRules = [
  body("fullName").trim().notEmpty().withMessage("Full name is required"),
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters")
    .matches(/\d/)
    .withMessage("Password must contain at least one number"),
  body("mobile")
    .matches(/^[6-9]\d{9}$/)
    .withMessage("Valid 10-digit Indian mobile number required"),
  body("gender")
    .isIn(["Male", "Female", "Other"])
    .withMessage("Gender must be Male, Female or Other"),
  body("dateOfBirth")
    .isISO8601()
    .withMessage("Valid date of birth required")
    .custom((val) => {
      const age = Math.floor(
        (Date.now() - new Date(val)) / (1000 * 60 * 60 * 24 * 365.25)
      );
      if (age < 18) throw new Error("You must be at least 18 years old");
      if (age > 80) throw new Error("Invalid date of birth");
      return true;
    }),
];

// ── Login rules ───────────────────────────────────────────────────
exports.loginRules = [
  body("email").isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

// ── Update profile rules ──────────────────────────────────────────
exports.updateProfileRules = [
  body("aboutMe")
    .optional()
    .isLength({ max: 500 })
    .withMessage("About me cannot exceed 500 characters"),
  body("annualIncome")
    .optional()
    .isString()
    .withMessage("Annual income must be a string"),
];