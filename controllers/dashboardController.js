const User     = require("../models/User");
const Interest = require("../models/Interest"); // adjust path if different

/* ══════════════════════════════════════════════════════════════
   GET /api/dashboard
   Returns all data needed for the logged-in user's dashboard
══════════════════════════════════════════════════════════════ */
exports.getDashboard = async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
      .select(
        "fullName age gender city state religion profession photos " +
        "isVerified membership profileViews lastActive " +
        "interestsSent interestsReceived matches recentViewers"
      )
      .populate({
        path:   "recentViewers.viewerId",
        select: "fullName age city gender photos isVerified",
      })
      .lean();

    if (!me) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // ── Profile completion score ──────────────────────────────────
    const fields = [
      "fullName", "age", "gender", "city", "state",
      "religion", "profession", "education", "height",
      "motherTongue", "aboutMe",
    ];
    const filled     = fields.filter((f) => me[f] && me[f] !== "").length;
    const hasPhoto   = (me.photos || []).length > 0;
    const completion = Math.round(((filled + (hasPhoto ? 1 : 0)) / (fields.length + 1)) * 100);

    // ── Primary photo ─────────────────────────────────────────────
    const primaryPhoto =
      (me.photos || []).find((p) => p.isPrimary)?.url ||
      (me.photos || [])[0]?.url ||
      null;

    // ── Stats ─────────────────────────────────────────────────────
    const stats = {
      profileViews:      me.profileViews     || 0,
      interestsSent:     (me.interestsSent   || []).length,
      interestsReceived: (me.interestsReceived || []).length,
      matches:           (me.matches         || []).length,
    };

    // ── Recent profile viewers (last 5) ───────────────────────────
    const recentViewers = (me.recentViewers || [])
      .slice(0, 5)
      .map((v) => ({
        user:     v.viewerId,
        viewedAt: v.viewedAt,
      }))
      .filter((v) => v.user); // drop any unpopulated refs

    // ── Recommended profiles (opposite gender, same religion/city) ─
    const filter = {
      isActive: true,
      _id:      { $ne: me._id },
      gender:   me.gender === "Male" ? "Female" : "Male",
    };
    if (me.religion) filter.religion = new RegExp(me.religion, "i");

    const recommended = await User.find(filter)
      .select("fullName age city state gender religion profession education height isVerified photos lastActive")
      .sort({ lastActive: -1 })
      .limit(6)
      .lean();

    const recommendedWithPhoto = recommended.map((u) => ({
      ...u,
      primaryPhoto:
        (u.photos || []).find((p) => p.isPrimary)?.url ||
        (u.photos || [])[0]?.url ||
        null,
    }));

    // ── Membership info ───────────────────────────────────────────
    const membership = me.membership || { plan: "free", isActive: false };

    res.json({
      success: true,
      dashboard: {
        user: {
          _id:         me._id,
          fullName:    me.fullName,
          age:         me.age,
          gender:      me.gender,
          city:        me.city,
          state:       me.state,
          isVerified:  me.isVerified,
          primaryPhoto,
          completion,
          membership,
        },
        stats,
        recentViewers,
        recommended: recommendedWithPhoto,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};