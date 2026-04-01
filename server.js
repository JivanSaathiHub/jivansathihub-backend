require("dotenv").config();
const http         = require("http");
const express      = require("express");
const cors         = require("cors");
const helmet       = require("helmet");
const rateLimit    = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const path         = require("path");
const connectDB    = require("./config/db");
const { initSocket } = require("./socket");

// ── Connect Database ──────────────────────────────────────────────
connectDB();

const app = express();

// ── Trust Proxy ───────────────────────────────────────────────────
app.set('trust proxy', 1);

// ── Security Middleware ───────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:         process.env.CLIENT_URL || "http://localhost:3000",
  credentials:    true,
  methods:        ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(cookieParser());

// ── Rate Limiting ─────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      200,
  message:  { success: false, message: "Too many requests. Please try again later." },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  { success: false, message: "Too many auth attempts. Please try again in 15 minutes." },
});

app.use(globalLimiter);

// ── Cashfree Webhook — raw body MUST come before express.json() ───
app.use(
  "/api/membership/webhook",
  express.raw({ type: "application/json" }),
  (req, _res, next) => { req.rawBody = req.body.toString(); next(); }
);

// ── Body Parsers ──────────────────────────────────────────────────
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ── Static Files ──────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Health Check ──────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "JeevanSaathiHub API is running 🚀",
    version: "1.0.0",
    time:    new Date().toISOString(),
  });
});

// ── API Routes ────────────────────────────────────────────────────
app.use("/api/auth",         authLimiter, require("./routes/auth"));
app.use("/api/profile",                  require("./routes/profile"));
app.use("/api/search",                   require("./routes/search"));
app.use("/api/interests",                require("./routes/interests"));
app.use("/api/membership",               require("./routes/membership"));
app.use("/api/otp",                      require("./routes/otp"));
app.use("/api/admin",                    require("./routes/admin"));
app.use("/api/verification",             require("./routes/verification"));
app.use("/api/contact",                  require("./routes/contact"));
app.use("/api/feedback",                 require("./routes/feedback"));
app.use("/api/dashboard",                require("./routes/dashboard"));
app.use("/api/shortlist",                require("./routes/routes_shortlist"));
app.use("/api/messages",                 require("./routes/routes_messages"));
app.use("/api/stories",                  require("./routes/successStory"));


// ── 404 Handler ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// ── Global Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.message);
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, message: "File too large. Maximum size is 5MB." });
  }
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ success: false, message: messages.join(", ") });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({ success: false, message: `${field} already exists.` });
  }
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ success: false, message: "Invalid token." });
  }
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal server error.",
  });
});

// ── Create HTTP server + attach Socket.io ─────────────────────────
const httpServer = http.createServer(app);
initSocket(httpServer);

// ── Start Server ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📋 API Docs: http://localhost:${PORT}/api/health`);
  console.log(`🔌 Socket.io ready`);
});