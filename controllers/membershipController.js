const crypto = require("crypto");
const axios  = require("axios");
const User   = require("../models/User");

// ── Cashfree base URL (switch to production when ready) ───────────
//   Sandbox : https://sandbox.cashfree.com/pg
//   Production: https://api.cashfree.com/pg
const CF_BASE = process.env.CASHFREE_ENV === "production"
  ? "https://api.cashfree.com/pg"
  : "https://sandbox.cashfree.com/pg";

const CF_HEADERS = {
  "x-api-version": "2023-08-01",
  "x-client-id":     process.env.CASHFREE_APP_ID,
  "x-client-secret": process.env.CASHFREE_SECRET_KEY,
  "Content-Type": "application/json",
};


// ── Email helper using Brevo REST API ─────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  try {
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: {
          name:  process.env.FROM_NAME,
          email: process.env.FROM_EMAIL,
        },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: {
          "api-key":      process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Email error:", err.response?.data || err.message);
  }
};


// ── Plans ─────────────────────────────────────────────────────────
const PLANS = {
  free: {
    name:     "Free Plan",
    price:    0,
    duration: 0,
    features: [
      "Create basic profile",
      "Search profiles",
      "Send 5 interests per day",
      "View limited profiles",
    ],
  },
  premium: {
    name:     "Premium Plan",
    price:    2999,
    duration: 180,
    features: [
      "All Free features",
      "Unlimited interests",
      "Send unlimited messages",
      "View all contact details",
      "Priority chat support",
      "Featured profile listing",
    ],
  },
  elite: {
    name:     "Elite Plan",
    price:    9999,
    duration: 365,
    features: [
      "All Premium features",
      "Dedicated relationship manager",
      "Profile verification badge",
      "Top search results placement",
    ],
  },
};


// ── GET plans ─────────────────────────────────────────────────────
exports.getPlans = async (req, res) => {
  res.json({ success: true, plans: PLANS });
};


// ── GET membership status ─────────────────────────────────────────
exports.getMembershipStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("membership");
    const { plan, isActive, startDate, endDate } = user.membership;

    const now       = new Date();
    const isExpired = endDate && new Date(endDate) < now;
    const daysLeft  = endDate
      ? Math.max(0, Math.ceil((new Date(endDate) - now) / (1000 * 60 * 60 * 24)))
      : null;

    res.json({
      success: true,
      membership: {
        plan,
        isActive: isActive && !isExpired,
        startDate,
        endDate,
        daysLeft,
        isExpired,
        planDetails: PLANS[plan] || PLANS.free,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// ── CREATE ORDER (Cashfree) ───────────────────────────────────────
// Step 1: frontend calls POST /api/membership/create-order { plan }
// Returns: { orderId, paymentSessionId, amount, plan }
// Frontend uses paymentSessionId to open Cashfree checkout SDK
exports.createOrder = async (req, res) => {
  try {
    const { plan } = req.body;

    if (!["premium", "elite"].includes(plan)) {
      return res.status(400).json({ success: false, message: "Invalid plan" });
    }

    const selectedPlan = PLANS[plan];
    const user         = await User.findById(req.user._id).select("fullName email mobile");

    // Unique order ID for Cashfree (max 50 chars, alphanumeric + _ -)
    const cfOrderId = `JSH_${req.user._id}_${Date.now()}`;

    const payload = {
      order_id:       cfOrderId,
      order_amount:   selectedPlan.price,
      order_currency: "INR",
      order_note:     `${selectedPlan.name} - JeevanSaathiHub`,
      customer_details: {
        customer_id:    String(req.user._id),
        customer_name:  user.fullName  || "User",
        customer_email: user.email,
        customer_phone: user.mobile    || "9999999999",
      },
      order_meta: {
        // After payment Cashfree will redirect here (optional)
        return_url: `${process.env.FRONTEND_URL}/payment-status?order_id={order_id}`,
        notify_url: `${process.env.BACKEND_URL}/api/membership/webhook`,
      },
      order_tags: {
        userId: String(req.user._id),
        plan,
      },
    };

    const { data } = await axios.post(
      `${CF_BASE}/orders`,
      payload,
      { headers: CF_HEADERS }
    );

    res.json({
      success:          true,
      orderId:          data.order_id,
      paymentSessionId: data.payment_session_id, // used by Cashfree JS SDK
      amount:           selectedPlan.price,
      currency:         "INR",
      appId:            process.env.CASHFREE_APP_ID,
      plan,
    });
  } catch (error) {
    console.error("Cashfree createOrder error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};


// ── VERIFY PAYMENT (Cashfree) ─────────────────────────────────────
// Step 2: frontend calls POST /api/membership/verify
//         { orderId, plan }   (no signature needed — we fetch order from Cashfree)
//
// Cashfree best practice: always re-fetch order status server-side
// instead of trusting client-sent signature alone.
exports.verifyPayment = async (req, res) => {
  try {
    const { orderId, plan } = req.body;

    if (!orderId || !plan) {
      return res.status(400).json({ success: false, message: "orderId and plan are required" });
    }

    // ── Fetch order status from Cashfree ──────────────────────────
    const { data: orderData } = await axios.get(
      `${CF_BASE}/orders/${orderId}`,
      { headers: CF_HEADERS }
    );

    const orderStatus = orderData.order_status; // PAID | ACTIVE | EXPIRED | etc.

    if (orderStatus !== "PAID") {
      return res.status(400).json({
        success: false,
        message: `Payment not completed. Status: ${orderStatus}`,
      });
    }

    // ── Validate the order belongs to this user ───────────────────
    const taggedUserId = orderData.order_tags?.userId;
    if (taggedUserId && taggedUserId !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Order mismatch" });
    }

    const selectedPlan = PLANS[plan];
    if (!selectedPlan) {
      return res.status(400).json({ success: false, message: "Invalid plan" });
    }

    const startDate = new Date();
    const endDate   = new Date();
    endDate.setDate(endDate.getDate() + selectedPlan.duration);

    // ── Grab payment ID from Cashfree payments list ───────────────
    let paymentId = null;
    try {
      const { data: pmtData } = await axios.get(
        `${CF_BASE}/orders/${orderId}/payments`,
        { headers: CF_HEADERS }
      );
      paymentId = pmtData?.[0]?.cf_payment_id || null;
    } catch (_) { /* non-critical */ }

    // ── Update user membership ────────────────────────────────────
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          membership: {
            plan,
            isActive:  true,
            startDate,
            endDate,
            orderId,
            paymentId,
            amount: selectedPlan.price,
          },
        },
      },
      { new: true }
    );

    // ── Send confirmation email ───────────────────────────────────
    await sendEmail({
      to:      user.email,
      subject: `Your ${selectedPlan.name} is active – JeevanSaathiHub`,
      html: `
        <h2>Hi ${user.fullName},</h2>
        <p>Your <strong>${selectedPlan.name}</strong> has been activated successfully.</p>
        <p>Valid until: <strong>${endDate.toDateString()}</strong></p>
        <p>Order ID: ${orderId}</p>
        <br/>
        <p>Thank you for choosing JeevanSaathiHub!</p>
      `,
    });

    res.json({
      success:    true,
      message:    "Payment verified and membership activated",
      membership: user.membership,
    });
  } catch (error) {
    console.error("Cashfree verifyPayment error:", error.response?.data || error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};


// ── WEBHOOK (Cashfree server-to-server notification) ─────────────
// Cashfree hits POST /api/membership/webhook automatically after payment.
// Use this as a reliable backup in case the frontend verify call fails.
exports.cashfreeWebhook = async (req, res) => {
  try {
    // ── Verify webhook signature ──────────────────────────────────
    const rawBody  = req.rawBody; // needs express.raw() — see router comment
    const ts       = req.headers["x-webhook-timestamp"];
    const received = req.headers["x-webhook-signature"];

    const signatureData = ts + rawBody;
    const computed = crypto
      .createHmac("sha256", process.env.CASHFREE_SECRET_KEY)
      .update(signatureData)
      .digest("base64");

    if (computed !== received) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = req.body;

    // Only process successful payment events
    if (event?.data?.order?.order_status !== "PAID") {
      return res.sendStatus(200); // acknowledge but do nothing
    }

    const orderId  = event.data.order.order_id;
    const plan     = event.data.order.order_tags?.plan;
    const userId   = event.data.order.order_tags?.userId;
    const paymentId = event.data.payment?.cf_payment_id;

    if (!userId || !plan || !PLANS[plan]) return res.sendStatus(200);

    // Idempotency: skip if already activated for this order
    const existing = await User.findOne({
      _id: userId,
      "membership.orderId": orderId,
    });
    if (existing) return res.sendStatus(200);

    const selectedPlan = PLANS[plan];
    const startDate    = new Date();
    const endDate      = new Date();
    endDate.setDate(endDate.getDate() + selectedPlan.duration);

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          membership: {
            plan,
            isActive: true,
            startDate,
            endDate,
            orderId,
            paymentId,
            amount: selectedPlan.price,
          },
        },
      },
      { new: true }
    );

    await sendEmail({
      to:      user.email,
      subject: `Your ${selectedPlan.name} is active – JeevanSaathiHub`,
      html: `
        <h2>Hi ${user.fullName},</h2>
        <p>Your <strong>${selectedPlan.name}</strong> has been activated.</p>
        <p>Valid until: <strong>${endDate.toDateString()}</strong></p>
      `,
    });

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error.message);
    res.sendStatus(500);
  }
};


// ── UPGRADE MEMBERSHIP ────────────────────────────────────────────
// Convenience: same as createOrder but called "upgrade"
// Frontend shows upgrade flow; backend just creates a new Cashfree order
exports.upgradeMembership = async (req, res) => {
  // Reuse createOrder logic — plan switch is handled by verifyPayment
  return exports.createOrder(req, res);
};


// ── CANCEL MEMBERSHIP ─────────────────────────────────────────────
exports.cancelMembership = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { "membership.isActive": false } },
      { new: true }
    );

    res.json({
      success:    true,
      message:    "Membership cancelled",
      membership: user.membership,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};