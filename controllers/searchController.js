const User     = require("../models/User");
const Interest = require("../models/Interest");

/* ══════════════════════════════════════════════════════════════
   MATCHING SCORE ENGINE
   Max score = 100
   +20  religion match
   +20  location match (city or state)
   +15  education level match
   +15  caste / community match
   +10  age within partner preference range
   +10  profile popularity (views + interests)
   +10  recently active (within 7 days)
══════════════════════════════════════════════════════════════ */
function calcMatchScore(me, candidate) {
  let score = 0;
  const pref = me.partnerPreferences || {};

  // Religion match
  if (me.religion && candidate.religion &&
      me.religion.toLowerCase() === candidate.religion.toLowerCase()) {
    score += 20;
  }

  // Location match — city first, then state
  if (me.city && candidate.city &&
      me.city.toLowerCase() === candidate.city.toLowerCase()) {
    score += 20;
  } else if (me.state && candidate.state &&
             me.state.toLowerCase() === candidate.state.toLowerCase()) {
    score += 10;
  }

  // Education level match
  const eduLevels = [
    "10th", "12th", "diploma", "bachelor", "b.tech", "b.e", "bba", "bca",
    "master", "mba", "mca", "m.tech", "phd", "doctorate", "mbbs", "md",
  ];
  const myEduIdx  = eduLevels.findIndex(l => me.education?.toLowerCase().includes(l));
  const canEduIdx = eduLevels.findIndex(l => candidate.education?.toLowerCase().includes(l));
  if (myEduIdx !== -1 && canEduIdx !== -1 && Math.abs(myEduIdx - canEduIdx) <= 1) {
    score += 15;
  }

  // Caste / community match
  if (me.caste && candidate.caste &&
      me.caste.toLowerCase() === candidate.caste.toLowerCase()) {
    score += 15;
  }

  // Age within partner preference range
  if (candidate.age) {
    const ageFrom = pref.ageFrom || 18;
    const ageTo   = pref.ageTo   || 60;
    if (candidate.age >= ageFrom && candidate.age <= ageTo) {
      score += 10;
    }
  }

  // Profile popularity (profileViews + interestsSent count, capped at 10)
  const popularity = Math.min(
    10,
    Math.floor(((candidate.profileViews || 0) + (candidate.interestsSent?.length || 0)) / 5)
  );
  score += popularity;

  // Recently active — within last 7 days
  if (candidate.lastActive) {
    const daysSince = (Date.now() - new Date(candidate.lastActive)) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) score += 10;
  }

  return score;
}

/* ── Shuffle top N results (Fisher-Yates) ── */
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ══════════════════════════════════════════════════════════════
   GET /api/search
══════════════════════════════════════════════════════════════ */
exports.searchProfiles = async (req, res) => {
  try {
    const {
      gender, ageFrom, ageTo, religion, location,
      profession, education, verified,
      sort = "score", page = 1, limit = 12,
    } = req.query;

    // ── Build filter ──────────────────────────────────────────────
    const filter = {
      isActive: true,
      _id:      { $ne: req.user._id },
    };

    // Opposite gender by default
    filter.gender = gender || (req.user.gender === "Male" ? "Female" : "Male");

    if (ageFrom || ageTo) {
      filter.age = {};
      if (ageFrom) filter.age.$gte = Number(ageFrom);
      if (ageTo)   filter.age.$lte = Number(ageTo);
    }

    if (religion   && religion   !== "Any") filter.religion   = new RegExp(religion,   "i");
    if (profession && profession !== "Any") filter.profession = new RegExp(profession, "i");
    if (education  && education  !== "Any") filter.education  = new RegExp(education,  "i");
    if (verified === "true") filter.isVerified = true;

    if (location && location !== "Any") {
      filter.$or = [
        { city:  new RegExp(location, "i") },
        { state: new RegExp(location, "i") },
      ];
    }

    // Exclude blocked users
    const blockedIds = req.user.blockedUsers || [];
    if (blockedIds.length) {
      filter._id = { ...filter._id, $nin: blockedIds };
    }

    // ── Fetch candidates ──────────────────────────────────────────
    const candidates = await User.find(filter)
      .select("fullName age gender city state religion caste profession education height motherTongue isVerified membership photos lastActive profileViews interestsSent")
      .lean();

    // ── Score + sort ──────────────────────────────────────────────
    const matchIds = req.user.matches?.map(String) || [];

    // Fetch interest status in BOTH directions in one go
    const profileIds = candidates.map(u => u._id);

    const [sentInterests, receivedInterests] = await Promise.all([
      // Interests current user sent to these profiles
      Interest.find({
        sender:   req.user._id,
        receiver: { $in: profileIds },
      }).select("receiver status").lean(),

      // Interests current user received FROM these profiles (only accepted ones)
      Interest.find({
        sender:   { $in: profileIds },
        receiver: req.user._id,
        status:   "accepted",
      }).select("sender status").lean(),
    ]);

    // Build lookup map: profileId string → status
    const interestStatusMap = {};

    // Interests sent by current user
    sentInterests.forEach(i => {
      interestStatusMap[String(i.receiver)] = i.status;
    });

    // Interests received by current user that were accepted — show "accepted" on receiver's side too
    receivedInterests.forEach(i => {
      const sid = String(i.sender);
      if (interestStatusMap[sid] !== "accepted") {
        interestStatusMap[sid] = "accepted";
      }
    });

    let scored = candidates.map(u => ({
      ...u,
      matchScore:     calcMatchScore(req.user, u),
      primaryPhoto:   u.photos?.find(p => p.isPrimary)?.url || u.photos?.[0]?.url || null,
      interestStatus: interestStatusMap[String(u._id)] || null,  // "pending" | "accepted" | "declined" | null
      isMatch:        matchIds.includes(String(u._id)),
    }));

    // Sort by score descending, then shuffle top 50 so results feel fresh
    scored.sort((a, b) => b.matchScore - a.matchScore);

    if (sort === "score" || sort === "relevance") {
      const top  = shuffleArray(scored.slice(0, 50));
      const rest = scored.slice(50);
      scored = [...top, ...rest];
    } else if (sort === "lastActive") {
      scored.sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));
    } else if (sort === "age_asc") {
      scored.sort((a, b) => a.age - b.age);
    } else if (sort === "age_desc") {
      scored.sort((a, b) => b.age - a.age);
    } else if (sort === "newest") {
      scored.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === "verified") {
      scored.sort((a, b) => (b.isVerified ? 1 : 0) - (a.isVerified ? 1 : 0));
    }

    // ── Paginate ──────────────────────────────────────────────────
    const total     = scored.length;
    const skip      = (Number(page) - 1) * Number(limit);
    const paginated = scored.slice(skip, skip + Number(limit));

    res.json({
      success:    true,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      count:      paginated.length,
      profiles:   paginated,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ══════════════════════════════════════════════════════════════
   GET /api/search/recommendations
   Score-based, shuffled, limited to 10
══════════════════════════════════════════════════════════════ */
exports.getRecommendations = async (req, res) => {
  try {
    const me   = req.user;
    const pref = me.partnerPreferences || {};

    const filter = {
      isActive: true,
      _id:      { $ne: me._id },
      gender:   me.gender === "Male" ? "Female" : "Male",
    };

    if (pref.ageFrom || pref.ageTo) {
      filter.age = {};
      if (pref.ageFrom) filter.age.$gte = pref.ageFrom;
      if (pref.ageTo)   filter.age.$lte = pref.ageTo;
    }
    if (pref.religion?.length) filter.religion = { $in: pref.religion };
    if (pref.location?.length) {
      filter.$or = pref.location.map(l => ({
        $or: [{ city: new RegExp(l, "i") }, { state: new RegExp(l, "i") }],
      }));
    }

    const blockedIds = me.blockedUsers || [];
    if (blockedIds.length) filter._id = { $ne: me._id, $nin: blockedIds };

    const candidates = await User.find(filter)
      .select("fullName age gender city state religion caste profession education height motherTongue isVerified photos lastActive profileViews interestsSent")
      .lean();

    const scored = candidates
      .map(u => ({
        ...u,
        matchScore:   calcMatchScore(me, u),
        primaryPhoto: u.photos?.find(p => p.isPrimary)?.url || u.photos?.[0]?.url || null,
      }))
      .sort((a, b) => b.matchScore - a.matchScore);

    // Shuffle top 30, return 10
    const top10 = shuffleArray(scored.slice(0, 30)).slice(0, 10);

    res.json({ success: true, count: top10.length, profiles: top10 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ══════════════════════════════════════════════════════════════
   POST /api/search/view/:id
   Track profile view — saves viewerId + timestamp
══════════════════════════════════════════════════════════════ */
exports.trackProfileView = async (req, res) => {
  try {
    const viewedId = req.params.id;
    const viewerId = req.user._id;

    // Don't track own profile views
    if (String(viewedId) === String(viewerId)) {
      return res.json({ success: true });
    }

    // Increment profileViews on the viewed user
    await User.findByIdAndUpdate(viewedId, {
      $inc: { profileViews: 1 },
    });

    // Add to viewed user's recentViewers array (last 50 unique viewers)
    await User.findByIdAndUpdate(viewedId, {
      $push: {
        recentViewers: {
          $each:     [{ viewerId, viewedAt: new Date() }],
          $slice:    -50,  // keep only the last 50
          $position: 0,    // newest first
        },
      },
    });

    res.json({ success: true });
  } catch (error) {
    // Non-critical — don't crash the app if tracking fails
    res.json({ success: true });
  }
};

/* ══════════════════════════════════════════════════════════════
   GET /api/search/who-viewed-me
   Returns list of users who viewed the logged-in user's profile
══════════════════════════════════════════════════════════════ */
exports.getWhoViewedMe = async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
      .select("recentViewers profileViews")
      .populate({
        path:   "recentViewers.viewerId",
        select: "fullName age city gender photos isVerified",
      });

    const viewers = (me.recentViewers || []).map(v => ({
      user:     v.viewerId,
      viewedAt: v.viewedAt,
    }));

    res.json({
      success:       true,
      totalViews:    me.profileViews || 0,
      recentViewers: viewers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ══════════════════════════════════════════════════════════════
   GET /api/search/featured   (PUBLIC — no auth required)
══════════════════════════════════════════════════════════════ */
exports.getFeaturedProfiles = async (req, res) => {
  try {
    const [brides, grooms] = await Promise.all([
      User.find({ isActive: true, gender: "Female" })
        .select("fullName age city state gender religion profession isVerified photos membership")
        .sort({ lastActive: -1 })
        .limit(3)
        .lean(),
      User.find({ isActive: true, gender: "Male" })
        .select("fullName age city state gender religion profession isVerified photos membership")
        .sort({ lastActive: -1 })
        .limit(3)
        .lean(),
    ]);

    const interleaved = [];
    const max = Math.max(brides.length, grooms.length);
    for (let i = 0; i < max; i++) {
      if (brides[i]) interleaved.push(brides[i]);
      if (grooms[i]) interleaved.push(grooms[i]);
    }

    const profiles = interleaved.map((u) => {
      const primaryPhoto =
        (u.photos || []).find((p) => p.isPrimary)?.url ||
        (u.photos || [])[0]?.url ||
        null;

      let badge = "New";
      if (u.membership?.plan === "premium" || u.membership?.plan === "elite") badge = "Premium";
      else if (u.isVerified) badge = "Verified";

      return {
        _id:        u._id,
        fullName:   u.fullName,
        age:        u.age,
        city:       u.city,
        state:      u.state,
        gender:     u.gender,
        religion:   u.religion,
        profession: u.profession,
        isVerified: u.isVerified,
        primaryPhoto,
        badge,
      };
    });

    res.json({ success: true, count: profiles.length, profiles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};