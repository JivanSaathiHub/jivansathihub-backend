const Interest = require("../models/Interest");
const User     = require("../models/User");

/* ════════════════════════════════════════════════════════════════════════════
   SHARED UTILITIES
════════════════════════════════════════════════════════════════════════════ */
function sendCSV(res, rows, filename) {
  if (!rows.length) return res.status(404).json({ success: false, message: "No data to export." });
  const headers = Object.keys(rows[0]).join(",");
  const csv     = [headers, ...rows.map((r) => Object.values(r).map((v) => `"${v ?? ""}"`).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}-${Date.now()}.csv"`);
  res.send(csv);
}

/**
 * Compute a compatibility match score (0–99) between two users.
 * Returns both an overall score and per-category breakdown
 * matching the 4 boxes shown in Image 3 (Lifestyle, Background, Education, Values).
 */
function computeCompatibility(a, b) {
  if (!a || !b) return { overall: 0, lifestyle: 0, background: 0, education: 0, values: 0 };

  /* ── Lifestyle (age proximity + city + height) ── */
  let lifestyle = 50;
  const ageDiff = Math.abs((a.age || 25) - (b.age || 25));
  lifestyle += ageDiff <= 2 ? 30 : ageDiff <= 5 ? 20 : ageDiff <= 10 ? 10 : 0;
  if (a.city  && a.city  === b.city)  lifestyle += 10;
  if (a.state && a.state === b.state) lifestyle += 10;
  lifestyle = Math.min(lifestyle, 99);

  /* ── Background (religion + caste + mother tongue + family type) ── */
  let background = 40;
  if (a.religion     && a.religion     === b.religion)     background += 20;
  if (a.motherTongue && a.motherTongue === b.motherTongue) background += 20;
  if (a.caste        && a.caste        === b.caste)        background += 10;
  if (a.familyType   && a.familyType   === b.familyType)   background += 10;
  background = Math.min(background, 99);

  /* ── Education (education field + profession) ── */
  let education = 45;
  if (a.education  && a.education  === b.education)  education += 25;
  if (a.profession && a.profession === b.profession) education += 20;
  if (a.education  && b.education  && a.education.includes("Tech") && b.education.includes("Tech")) education += 10;
  education = Math.min(education, 99);

  /* ── Values (marital status + family values) ── */
  let values = 55;
  if (a.maritalStatus && a.maritalStatus === b.maritalStatus) values += 25;
  if (a.familyValues  && a.familyValues  === b.familyValues)  values += 15;
  if (a.religion      && a.religion      === b.religion)      values += 5;
  values = Math.min(values, 99);

  /* ── Overall ── */
  const overall = Math.min(Math.round((lifestyle + background + education + values) / 4), 99);

  return { overall, lifestyle, background, education, values };
}

function getPhoto(photos) {
  if (!photos?.length) return null;
  return photos.find((p) => p.isPrimary)?.url || photos[0]?.url || null;
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60)    return "Just now";
  if (s < 3600)  { const m = Math.floor(s / 60);  return `${m} min ago`; }
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h > 1 ? "s" : ""} ago`; }
  const d = Math.floor(s / 86400);
  if (d < 7)     return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatResponseTime(sentAt, respondedAt) {
  if (!sentAt || !respondedAt) return null;
  const diffMs  = new Date(respondedAt).getTime() - new Date(sentAt).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60)   return `${diffMin} minutes`;
  const diffHr = Math.floor(diffMin / 60);
  const remMin  = diffMin % 60;
  if (diffHr < 24)    return `${diffHr} hour${diffHr > 1 ? "s" : ""} ${remMin > 0 ? `${remMin} minutes` : ""}`.trim();
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} day${diffDay > 1 ? "s" : ""}`;
}

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/admin/interests/stats
   4 stat cards in AdminInterests.jsx
════════════════════════════════════════════════════════════════════════════ */
exports.getInterestStats = async (req, res) => {
  try {
    const [total, accepted, declined, pending] = await Promise.all([
      Interest.countDocuments(),
      Interest.countDocuments({ status: "accepted" }),
      Interest.countDocuments({ status: "declined" }),
      Interest.countDocuments({ status: "pending"  }),
    ]);
    const successRate = total > 0 ? Math.round((accepted / total) * 100) : 0;
    res.json({ success: true, stats: { total, accepted, declined, pending, successRate } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/admin/interests
   Paginated + filtered list matching the table in Image 1
   Query params: page, limit, status, search, timeRange
════════════════════════════════════════════════════════════════════════════ */
exports.getAllInterests = async (req, res) => {
  try {
    const {
      page      = 1,
      limit     = 10,
      status    = "",
      search    = "",
      timeRange = "",
    } = req.query;

    const filter = {};
    if (status && status !== "all") filter.status = status;

    if (timeRange === "today") {
      const s = new Date(); s.setUTCHours(0, 0, 0, 0);
      filter.createdAt = { $gte: s };
    } else if (timeRange === "week") {
      const s = new Date(); s.setUTCDate(s.getUTCDate() - 7);
      filter.createdAt = { $gte: s };
    } else if (timeRange === "month") {
      const now = new Date();
      filter.createdAt = { $gte: new Date(now.getUTCFullYear(), now.getUTCMonth(), 1) };
    }

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await Interest.countDocuments(filter);

    let interests = await Interest.find(filter)
      .populate("sender",   "fullName email age city state gender religion motherTongue education photos")
      .populate("receiver", "fullName email age city state gender religion motherTongue education photos")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    /* Search by name after populate */
    if (search) {
      const q = search.toLowerCase();
      interests = interests.filter((i) =>
        i.sender?.fullName?.toLowerCase().includes(q) ||
        i.receiver?.fullName?.toLowerCase().includes(q)
      );
    }

    const compat = (s, r) => computeCompatibility(s, r);

    const formatted = interests.map((i) => {
      const s = i.sender, r = i.receiver;
      const { overall } = compat(s, r);
      return {
        _id: i._id,
        sender: {
          _id:      s?._id,
          id:       `#${s?._id?.toString().slice(-4).toUpperCase()}`,
          fullName: s?.fullName || "Deleted User",
          email:    s?.email    || "",
          gender:   s?.gender,
          age:      s?.age,
          city:     s?.city,
          photo:    getPhoto(s?.photos),
        },
        receiver: {
          _id:      r?._id,
          id:       `#${r?._id?.toString().slice(-4).toUpperCase()}`,
          fullName: r?.fullName || "Deleted User",
          email:    r?.email    || "",
          gender:   r?.gender,
          age:      r?.age,
          city:     r?.city,
          photo:    getPhoto(r?.photos),
        },
        matchScore:  overall,
        status:      i.status,
        message:     i.message || "",
        createdAt:   new Date(i.createdAt).toLocaleString("en-IN", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }),
        respondedAt: i.respondedAt
          ? new Date(i.respondedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
          : null,
      };
    });

    res.json({
      success:    true,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      count:      formatted.length,
      interests:  formatted,
    });
  } catch (error) {
    console.error("getAllInterests error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/admin/interests/:id
   Full interest detail — drives both tabs in Image 2 and Image 3:
     Overview tab:  compatibility analysis, interest message, interaction stats,
                    interest details, system notes
     Profile tab:   side-by-side full profile comparison
════════════════════════════════════════════════════════════════════════════ */
exports.getInterestById = async (req, res) => {
  try {
    const interest = await Interest.findById(req.params.id)
      .populate("sender",   "-password -resetPasswordToken -resetPasswordExpires -blockedUsers -recentViewers")
      .populate("receiver", "-password -resetPasswordToken -resetPasswordExpires -blockedUsers -recentViewers");

    if (!interest) {
      return res.status(404).json({ success: false, message: "Interest not found." });
    }

    const s = interest.sender;
    const r = interest.receiver;
    const compat = computeCompatibility(s, r);

    /* ── Response time (sent → responded) ── */
    const responseTime = formatResponseTime(interest.createdAt, interest.respondedAt);

    /* ── System notes — auto-generated based on compatibility ── */
    const systemNotes = [];
    if (compat.background >= 80) {
      systemNotes.push({ note: "High compatibility match with shared cultural background", addedAt: interest.createdAt });
    }
    if (compat.lifestyle >= 80) {
      systemNotes.push({ note: "Similar lifestyle preferences and location proximity", addedAt: interest.createdAt });
    }
    if (compat.education >= 80) {
      systemNotes.push({ note: "Matching educational qualifications", addedAt: interest.createdAt });
    }
    if (s?.religion && s.religion === r?.religion) {
      systemNotes.push({ note: `Both from ${s.religion} background`, addedAt: interest.createdAt });
    }
    if (s?.state && s.state === r?.state) {
      systemNotes.push({ note: `Both from ${s.state}`, addedAt: interest.createdAt });
    }
    /* Always add at least one note */
    if (!systemNotes.length) {
      systemNotes.push({ note: "Interest recorded in the system", addedAt: interest.createdAt });
    }

    const formatProfile = (u) => {
      if (!u) return null;
      return {
        _id:          u._id,
        fullName:     u.fullName,
        email:        u.email,
        mobile:       u.mobile,
        gender:       u.gender,
        age:          u.age,
        city:         u.city,
        state:        u.state,
        photo:        getPhoto(u.photos),
        /* Profile comparison fields matching Image 2 */
        occupation:   u.profession    || u.occupation || "—",
        education:    u.education     || "—",
        location:     [u.city, u.state].filter(Boolean).join(", ") || "—",
        annualIncome: u.annualIncome  || "—",
        height:       u.height        || "—",
        religion:     u.religion      || "—",
        motherTongue: u.motherTongue  || "—",
        maritalStatus:u.maritalStatus || "—",
        familyType:   u.familyType    || "—",
        caste:        u.caste         || "—",
        aboutMe:      u.aboutMe       || "—",
        isVerified:   u.isVerified,
        membership:   u.membership?.plan || "free",
        lastActive:   timeAgo(u.lastActive || u.createdAt),
      };
    };

    res.json({
      success: true,
      interest: {
        _id:        interest._id,
        interestId: `#${interest._id.toString().slice(-4).toUpperCase()}`,
        status:     interest.status,
        message:    interest.message || "",
        matchScore: compat.overall,

        /* Dates */
        sentAt: new Date(interest.createdAt).toLocaleString("en-IN", {
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit",
        }),
        respondedAt: interest.respondedAt
          ? new Date(interest.respondedAt).toLocaleString("en-IN", {
              year: "numeric", month: "2-digit", day: "2-digit",
              hour: "2-digit", minute: "2-digit",
            })
          : null,
        responseTime,

        /* Sender + receiver — full profile objects */
        sender:   formatProfile(s),
        receiver: formatProfile(r),

        /* Overview tab — Compatibility Analysis (Image 3) */
        compatibility: {
          overall:    compat.overall,
          lifestyle:  compat.lifestyle,
          background: compat.background,
          education:  compat.education,
          values:     compat.values,
        },

        /* Overview tab — Interaction Statistics (Image 3) */
        /* Your Interest model doesn't store these — placeholder zeros.
           Wire to a Message model when you build messaging. */
        interactions: {
          messagesExchanged:   0,
          phoneCalls:          0,
          videoCalls:          0,
          meetingsScheduled:   0,
          lastInteraction:     null,
        },

        /* Overview tab — Interest Details (Image 3) */
        interestType: "Direct Interest",

        /* Overview tab — System Notes (Image 3) */
        systemNotes: systemNotes.map((n) => ({
          note:    n.note,
          addedAt: new Date(n.addedAt).toLocaleString("en-IN", {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit",
          }),
          addedBy: "System",
        })),
      },
    });
  } catch (error) {
    console.error("getInterestById error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   DELETE /api/admin/interests/:id
   Cleans up both users' arrays + removes from matches if accepted
════════════════════════════════════════════════════════════════════════════ */
exports.deleteInterest = async (req, res) => {
  try {
    const interest = await Interest.findById(req.params.id);
    if (!interest) return res.status(404).json({ success: false, message: "Interest not found." });

    await Promise.all([
      User.findByIdAndUpdate(interest.sender,   { $pull: { interestsSent:     interest.receiver } }),
      User.findByIdAndUpdate(interest.receiver, { $pull: { interestsReceived: interest.sender   } }),
    ]);

    if (interest.status === "accepted") {
      await Promise.all([
        User.findByIdAndUpdate(interest.sender,   { $pull: { matches: interest.receiver } }),
        User.findByIdAndUpdate(interest.receiver, { $pull: { matches: interest.sender   } }),
      ]);
    }

    await Interest.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Interest deleted successfully." });
  } catch (error) {
    console.error("deleteInterest error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/admin/interests/export  — CSV download
════════════════════════════════════════════════════════════════════════════ */
exports.exportInterests = async (req, res) => {
  try {
    const interests = await Interest.find()
      .populate("sender",   "fullName email age city gender")
      .populate("receiver", "fullName email age city gender")
      .sort({ createdAt: -1 })
      .lean();

    const rows = interests.map((i) => ({
      "Sender Name":    i.sender?.fullName   || "Deleted",
      "Sender Email":   i.sender?.email      || "—",
      "Receiver Name":  i.receiver?.fullName || "Deleted",
      "Receiver Email": i.receiver?.email    || "—",
      "Status":         i.status,
      "Message":        i.message            || "",
      "Date":           new Date(i.createdAt).toLocaleDateString("en-IN"),
    }));

    sendCSV(res, rows, "interests");
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};