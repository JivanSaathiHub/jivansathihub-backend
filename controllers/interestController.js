const Interest = require("../models/Interest");
const User     = require("../models/User");
const axios    = require("axios");
const { emitToUser } = require("../socket");

/* ─────────────────────────────────────────────────────────────────
   HELPER: send email — truly non-blocking (no await at call site)
───────────────────────────────────────────────────────────────── */
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

/* ─────────────────────────────────────────────────────────────────
   EMAIL TEMPLATES
───────────────────────────────────────────────────────────────── */
const interestReceivedEmail = (receiverName, senderName) => ({
  subject: `💌 ${senderName} sent you an interest on JeevanSaathiHub`,
  html:    `<h2>Hi ${receiverName}</h2><p>${senderName} sent you an interest.</p>`,
});

const interestAcceptedEmail = (senderName, receiverName) => ({
  subject: `🎉 ${receiverName} accepted your interest!`,
  html:    `<h2>Hi ${senderName}</h2><p>${receiverName} accepted your interest.</p>`,
});

/* ─────────────────────────────────────────────────────────────────
   POST /interests/:userId
   Send an interest
───────────────────────────────────────────────────────────────── */
exports.sendInterest = async (req, res) => {
  try {
    const receiverId = req.params.userId;
    const senderId   = req.user._id;

    if (String(senderId) === String(receiverId)) {
      return res.status(400).json({
        success: false,
        message: "You cannot send interest to yourself.",
      });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver || !receiver.isActive) {
      return res.status(404).json({
        success: false,
        message: "Profile not found.",
      });
    }

    const existing = await Interest.findOne({ sender: senderId, receiver: receiverId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Interest already sent.",
      });
    }

    const interest = await Interest.create({
      sender:   senderId,
      receiver: receiverId,
      message:  (req.body.message || "").trim().slice(0, 200),
    });

    // Real-time notification to receiver
    emitToUser(String(receiverId), "new_interest", {
      type:       "new_interest",
      interestId: interest._id,
      sender: {
        _id:        req.user._id,
        fullName:   req.user.fullName,
        age:        req.user.age,
        city:       req.user.city,
        profession: req.user.profession,
        photos:     req.user.photos,
      },
      message:   interest.message,
      createdAt: interest.createdAt,
    });

    // FIX: fire-and-forget — do NOT await (was blocking the response)
    sendEmail({
      to: receiver.email,
      ...interestReceivedEmail(receiver.fullName, req.user.fullName),
    });

    res.status(201).json({ success: true, interest });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────
   PUT /interests/:interestId
   Accept or decline a received interest
   Body: { action: "accepted" | "declined" }
───────────────────────────────────────────────────────────────── */
exports.respondToInterest = async (req, res) => {
  try {
    const { action } = req.body;

    // FIX 1: validate action before touching the DB
    if (!["accepted", "declined"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'action must be "accepted" or "declined".',
      });
    }

    // FIX 2: fetch raw doc first, populate AFTER save
    const interest = await Interest.findById(req.params.interestId);

    if (!interest) {
      return res.status(404).json({
        success: false,
        message: "Interest not found.",
      });
    }

    // FIX 3: only the receiver may respond
    if (String(interest.receiver) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Not authorised — you are not the receiver of this interest.",
      });
    }

    // FIX 4: prevent re-responding to an already-resolved interest
    if (interest.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Interest is already ${interest.status}.`,
      });
    }

    interest.status = action;
    await interest.save();

    // Populate now — after save is confirmed
    await interest.populate("sender",   "fullName email age city profession photos");
    await interest.populate("receiver", "fullName age city profession photos");

    if (action === "accepted") {
      // Keep User.matches in sync
      await User.findByIdAndUpdate(interest.sender._id, {
        $addToSet: { matches: interest.receiver._id },
      });
      await User.findByIdAndUpdate(interest.receiver._id, {
        $addToSet: { matches: interest.sender._id },
      });

      // Real-time notification to original sender
      emitToUser(String(interest.sender._id), "interest_accepted", {
        type:       "interest_accepted",
        interestId: interest._id,
        acceptedBy: {
          _id:        interest.receiver._id,
          fullName:   interest.receiver.fullName,
          age:        interest.receiver.age,
          city:       interest.receiver.city,
          profession: interest.receiver.profession,
          photos:     interest.receiver.photos,
        },
        createdAt: new Date(),
      });

      // FIX: fire-and-forget
      sendEmail({
        to: interest.sender.email,
        ...interestAcceptedEmail(interest.sender.fullName, interest.receiver.fullName),
      });
    }

    if (action === "declined") {
      emitToUser(String(interest.sender._id), "interest_declined", {
        type:       "interest_declined",
        interestId: interest._id,
        declinedBy: {
          _id:      interest.receiver._id,
          fullName: interest.receiver.fullName,
        },
      });
    }

    res.json({ success: true, status: action });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GET /interests/sent
───────────────────────────────────────────────────────────────── */
exports.getSentInterests = async (req, res) => {
  try {
    const interests = await Interest.find({ sender: req.user._id })
      .populate("receiver", "fullName email age city gender photos profession")
      .sort({ createdAt: -1 });

    res.json({ success: true, interests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GET /interests/received
───────────────────────────────────────────────────────────────── */
exports.getReceivedInterests = async (req, res) => {
  try {
    const interests = await Interest.find({ receiver: req.user._id })
      .populate("sender", "fullName email age city gender photos profession")
      .sort({ createdAt: -1 });

    res.json({ success: true, interests });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────
   GET /interests/matches
   FIX: query Interest collection directly instead of trusting
        User.matches array (which can drift out of sync)
───────────────────────────────────────────────────────────────── */
exports.getMatches = async (req, res) => {
  try {
    const userId = req.user._id;

    // All accepted interests involving this user
    const accepted = await Interest.find({
      status: "accepted",
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate("sender",   "fullName email age city gender photos profession")
      .populate("receiver", "fullName email age city gender photos profession")
      .sort({ updatedAt: -1 });

    // Keep only mutual pairs (A→B accepted AND B→A accepted)
    const acceptedSet = new Set(
      accepted.map((i) => `${i.sender._id}_${i.receiver._id}`)
    );

    const mutual = accepted.filter((i) =>
      acceptedSet.has(`${i.receiver._id}_${i.sender._id}`)
    );

    // Deduplicate — one entry per pair
    const seen = new Set();
    const matches = mutual.filter((i) => {
      const key = [String(i.sender._id), String(i.receiver._id)].sort().join("_");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    res.json({ success: true, matches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ─────────────────────────────────────────────────────────────────
   DELETE /interests/:userId
   Withdraw a sent interest
───────────────────────────────────────────────────────────────── */
exports.withdrawInterest = async (req, res) => {
  try {
    const interest = await Interest.findOneAndDelete({
      sender:   req.user._id,
      receiver: req.params.userId,
    });

    if (!interest) {
      return res.status(404).json({
        success: false,
        message: "Interest not found.",
      });
    }

    res.json({ success: true, message: "Interest withdrawn." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};