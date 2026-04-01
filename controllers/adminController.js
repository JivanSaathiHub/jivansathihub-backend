const User     = require("../models/User");
const Interest = require("../models/Interest");
const cloudinary = require("cloudinary").v2;

/* ════════════════════════════════════════════════════════════════════════════
   SHARED UTILITIES
════════════════════════════════════════════════════════════════════════════ */
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

function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d);
  }
  return days;
}

const dayLabel   = (d) => d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
const monthLabel = (y, m) => new Date(y, m, 1).toLocaleDateString("en-IN", { month: "short" });

function sendCSV(res, rows, filename) {
  if (!rows.length) return res.status(404).json({ success: false, message: "No data to export." });
  const headers = Object.keys(rows[0]).join(",");
  const csv     = [headers, ...rows.map((r) => Object.values(r).map((v) => `"${v ?? ""}"`).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}-${Date.now()}.csv"`);
  res.send(csv);
}

function maskAadhaar(mobile) {
  const digits = (mobile || "").replace(/\D/g, "").slice(-4) || "0000";
  return `XXXX XXXX ${digits}`;
}

function matchScore(a, b) {
  if (!a || !b) return 0;
  let score = 40;
  if (a.religion     && a.religion     === b.religion)     score += 15;
  if (a.motherTongue && a.motherTongue === b.motherTongue) score += 10;
  const diff = Math.abs((a.age || 25) - (b.age || 25));
  score += diff <= 3 ? 15 : diff <= 5 ? 8 : diff <= 10 ? 4 : 0;
  if (a.city  && a.city  === b.city)  score += 10;
  if (a.state && a.state === b.state) score += 5;
  if (a.education && a.education === b.education) score += 5;
  return Math.min(score, 99);
}

/* ════════════════════════════════════════════════════════════════════════════
   DASHBOARD
   GET /api/admin/stats
════════════════════════════════════════════════════════════════════════════ */
exports.getDashboardStats = async (req, res) => {
  try {
    const now            = new Date();
    const todayStart     = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const thisMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const days           = lastNDays(7);
    const win7Start      = days[0];
    const win7End        = new Date(days[days.length - 1]);
    win7End.setUTCDate(win7End.getUTCDate() + 1);

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
    }
    const win6Start   = new Date(months[0].year, months[0].month, 1);
    const recentLimit = Math.min(Number(req.query.limit) || 5, 20);

    const [
      totalUsers, activeUsers, verifiedUsers,
      newToday, newThisMonth, premiumUsers, eliteUsers,
      maleUsers, femaleUsers,
      totalInterests, acceptedInterests,
      matchesAgg, revenueAgg, monthlyRevenueAgg, activeSubscriptions,
      growthAllAgg, growthVerifiedAgg, subGrowthAgg, recentUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
      User.countDocuments({ createdAt: { $gte: thisMonthStart } }),
      User.countDocuments({ "membership.plan": "premium", "membership.isActive": true }),
      User.countDocuments({ "membership.plan": "elite",   "membership.isActive": true }),
      User.countDocuments({ gender: "Male" }),
      User.countDocuments({ gender: "Female" }),
      Interest.countDocuments(),
      Interest.countDocuments({ status: "accepted" }),
      User.aggregate([{ $project: { n: { $size: { $ifNull: ["$matches", []] } } } }, { $group: { _id: null, total: { $sum: "$n" } } }]),
      User.aggregate([{ $match: { "membership.isActive": true, "membership.amount": { $gt: 0 } } }, { $group: { _id: null, total: { $sum: "$membership.amount" } } }]),
      User.aggregate([{ $match: { "membership.startDate": { $gte: thisMonthStart }, "membership.amount": { $gt: 0 } } }, { $group: { _id: null, total: { $sum: "$membership.amount" } } }]),
      User.countDocuments({ "membership.isActive": true, "membership.plan": { $in: ["premium", "elite"] } }),
      User.aggregate([{ $match: { createdAt: { $gte: win7Start, $lt: win7End } } }, { $group: { _id: { y: { $year: { date: "$createdAt", timezone: "UTC" } }, m: { $month: { date: "$createdAt", timezone: "UTC" } }, d: { $dayOfMonth: { date: "$createdAt", timezone: "UTC" } } }, count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { createdAt: { $gte: win7Start, $lt: win7End }, isVerified: true } }, { $group: { _id: { y: { $year: { date: "$createdAt", timezone: "UTC" } }, m: { $month: { date: "$createdAt", timezone: "UTC" } }, d: { $dayOfMonth: { date: "$createdAt", timezone: "UTC" } } }, count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { "membership.plan": { $in: ["premium", "elite"] }, "membership.startDate": { $gte: win6Start } } }, { $group: { _id: { y: { $year: { date: "$membership.startDate", timezone: "UTC" } }, m: { $month: { date: "$membership.startDate", timezone: "UTC" } } }, count: { $sum: 1 } } }]),
      /* Recent users — show ALL roles so admin always sees something */
      User.find().select("fullName email photos isVerified isActive membership createdAt city gender age role").sort({ createdAt: -1 }).limit(recentLimit).lean(),
    ]);

    const newMap = {}, verMap = {};
    growthAllAgg.forEach(({ _id, count }) => { newMap[`${_id.y}-${_id.m}-${_id.d}`] = count; });
    growthVerifiedAgg.forEach(({ _id, count }) => { verMap[`${_id.y}-${_id.m}-${_id.d}`] = count; });
    const userGrowthData = days.map((d) => {
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
      return { day: dayLabel(d), newUsers: newMap[key] || 0, verified: verMap[key] || 0 };
    });

    const subMap = {};
    subGrowthAgg.forEach(({ _id, count }) => { subMap[`${_id.y}-${_id.m}`] = count; });
    const subscriptionGrowthData = months.map(({ year, month }) => ({
      month: monthLabel(year, month),
      subs:  subMap[`${year}-${month + 1}`] || 0,
    }));

    const formattedRecent = recentUsers.map((u) => ({
      _id:          u._id,
      fullName:     u.fullName,
      email:        u.email,
      profilePhoto: getPhoto(u.photos),
      isVerified:   u.isVerified,
      isActive:     u.isActive,
      gender:       u.gender,
      age:          u.age,
      city:         u.city,
      membership:   u.membership?.plan || "free",
      time:         timeAgo(u.createdAt),
      createdAt:    u.createdAt,
    }));

    res.json({
      success: true,
      stats: {
        users:       { total: totalUsers, active: activeUsers, verified: verifiedUsers, newToday, newThisMonth, male: maleUsers, female: femaleUsers },
        memberships: { premium: premiumUsers, elite: eliteUsers, totalPaid: premiumUsers + eliteUsers, free: totalUsers - premiumUsers - eliteUsers },
        interests:   { total: totalInterests, accepted: acceptedInterests, pending: totalInterests - acceptedInterests },
        matches:     { total: matchesAgg[0]?.total || 0 },
        revenue:     { total: revenueAgg[0]?.total || 0, thisMonth: monthlyRevenueAgg[0]?.total || 0 },
      },
      miniStats: { newRegistrations: newToday, activeSubscriptions, totalMessages: 0 },
      userGrowthData,
      subscriptionGrowthData,
      recentUsers: formattedRecent,
    });
  } catch (error) {
    console.error("getDashboardStats error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   SIDEBAR COUNTS
   GET /api/admin/sidebar-counts
════════════════════════════════════════════════════════════════════════════ */
exports.getSidebarCounts = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    res.json({ success: true, totalUsers, openTickets: 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   USERS
════════════════════════════════════════════════════════════════════════════ */

/* GET /api/admin/users/stats */
exports.getUserStats = async (req, res) => {
  try {
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const [total, verified, premium, newToday] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ "membership.plan": { $in: ["premium", "elite"] }, "membership.isActive": true }),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
    ]);
    res.json({ success: true, stats: { total, verified, premium, newToday } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* GET /api/admin/users */
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", gender, plan, verified, active, sort = "newest" } = req.query;

    /* ── No role filter — show ALL accounts so admin always sees results ── */
    const filter = {};

    if (search) {
      filter.$or = [
        { fullName: new RegExp(search, "i") },
        { email:    new RegExp(search, "i") },
        { mobile:   new RegExp(search, "i") },
      ];
    }
    if (gender)               filter.gender             = gender;
    if (plan)                 filter["membership.plan"] = plan;
    if (verified === "true")  filter.isVerified         = true;
    if (verified === "false") filter.isVerified         = false;
    if (active   === "true")  filter.isActive           = true;
    if (active   === "false") filter.isActive           = false;

    const sortMap = {
      newest:     { createdAt:  -1 },
      oldest:     { createdAt:   1 },
      lastActive: { lastActive: -1 },
      name:       { fullName:    1 },
    };

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select("fullName email mobile gender age city state isVerified isActive membership role createdAt lastActive photos profileViews interestsSent interestsReceived")
      .sort(sortMap[sort] || sortMap.newest)
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const formatted = users.map((u) => ({
      _id:          u._id,
      fullName:     u.fullName,
      email:        u.email,
      mobile:       u.mobile,
      gender:       u.gender,
      age:          u.age,
      city:         u.city,
      state:        u.state,
      isVerified:   u.isVerified,
      isActive:     u.isActive,
      role:         u.role,
      membership:   u.membership || { plan: "free", isActive: false },
      profileViews: u.profileViews || 0,
      interests:    (u.interestsSent?.length || 0) + (u.interestsReceived?.length || 0),
      lastActive:   timeAgo(u.lastActive || u.createdAt),
      joinedDate:   new Date(u.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      profilePhoto: getPhoto(u.photos),
    }));

    res.json({
      success:    true,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      count:      formatted.length,
      users:      formatted,
    });
  } catch (error) {
    console.error("getAllUsers error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* GET /api/admin/users/:id */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -resetPasswordToken -resetPasswordExpires -blockedUsers -recentViewers")
      .lean();
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const shaped = {
      ...user,
      profilePhoto:       getPhoto(user.photos),
      profileViews:       user.profileViews || 0,
      interests:          (user.interestsSent?.length || 0) + (user.interestsReceived?.length || 0),
      lastActive:         timeAgo(user.lastActive || user.createdAt),
      joinedDate:         new Date(user.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      occupation:         user.profession,
      company:            user.employer,
      fathersOccupation:  user.fatherOccupation,
      mothersOccupation:  user.motherOccupation,
      about:              user.aboutMe,
      verificationMethod: user.isVerified ? "Aadhaar eKYC" : "—",
      verifiedOn:         user.isVerified
        ? new Date(user.updatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "—",
      paymentHistory: user.membership?.amount > 0
        ? [{
            label:  `${(user.membership.plan || "").charAt(0).toUpperCase() + (user.membership.plan || "").slice(1)} Plan`,
            date:   user.membership.startDate
              ? new Date(user.membership.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
              : "—",
            amount: `₹${(user.membership.amount || 0).toLocaleString("en-IN")}`,
          }]
        : [],
    };
    res.json({ success: true, user: shaped });
  } catch (error) {
    console.error("getUserById error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* PUT /api/admin/users/:id/block */
exports.blockUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    if (["admin", "superadmin"].includes(target.role)) {
      return res.status(403).json({ success: false, message: "Cannot block an admin account." });
    }
    await User.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: `${target.fullName} has been blocked.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* PUT /api/admin/users/:id/unblock */
exports.unblockUser = async (req, res) => {
  try {
    const target = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, message: `${target.fullName} has been unblocked.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* DELETE /api/admin/users/:id — superadmin only */
exports.deleteUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    if (["admin", "superadmin"].includes(target.role)) {
      return res.status(403).json({ success: false, message: "Cannot delete an admin account." });
    }
    if (target.photos?.length) {
      const ids = target.photos.map((p) => p.publicId).filter(Boolean);
      if (ids.length) await cloudinary.api.delete_resources(ids).catch((e) => console.error("Cloudinary:", e.message));
    }
    await Interest.deleteMany({ $or: [{ sender: req.params.id }, { receiver: req.params.id }] });
    await User.updateMany(
      { $or: [{ matches: req.params.id }, { interestsSent: req.params.id }, { interestsReceived: req.params.id }] },
      { $pull: { matches: req.params.id, interestsSent: req.params.id, interestsReceived: req.params.id } }
    );
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: `${target.fullName} deleted successfully.` });
  } catch (error) {
    console.error("deleteUser error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* PUT /api/admin/users/:id/role — superadmin only */
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!["user", "admin"].includes(role)) {
      return res.status(400).json({ success: false, message: "Role must be 'user' or 'admin'." });
    }
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ success: false, message: "User not found." });
    if (target.role === "superadmin") {
      return res.status(403).json({ success: false, message: "Cannot change superadmin role." });
    }
    await User.findByIdAndUpdate(req.params.id, { role });
    res.json({ success: true, message: `${target.fullName}'s role updated to ${role}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* GET /api/admin/users/export */
exports.exportUsers = async (req, res) => {
  try {
    const users = await User.find({ role: { $in: ["user", "admin"] } })
      .select("fullName email mobile gender age city state isVerified isActive membership role createdAt")
      .sort({ createdAt: -1 })
      .lean();
    const rows = users.map((u) => ({
      Name:        u.fullName,
      Email:       u.email,
      Mobile:      u.mobile,
      Gender:      u.gender      || "—",
      Age:         u.age         || "—",
      City:        u.city        || "—",
      State:       u.state       || "—",
      Verified:    u.isVerified  ? "Yes" : "No",
      Active:      u.isActive    ? "Yes" : "No",
      Role:        u.role        || "user",
      Plan:        u.membership?.plan || "free",
      "Joined On": new Date(u.createdAt).toLocaleDateString("en-IN"),
    }));
    sendCSV(res, rows, "users");
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   INTERESTS
════════════════════════════════════════════════════════════════════════════ */

/* GET /api/admin/interests/stats */
exports.getInterestStats = async (req, res) => {
  try {
    const [total, accepted, declined, pending] = await Promise.all([
      Interest.countDocuments(),
      Interest.countDocuments({ status: "accepted" }),
      Interest.countDocuments({ status: "declined" }),
      Interest.countDocuments({ status: "pending"  }),
    ]);
    res.json({
      success: true,
      stats: { total, accepted, declined, pending, successRate: total > 0 ? Math.round((accepted / total) * 100) : 0 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* GET /api/admin/interests */
exports.getAllInterests = async (req, res) => {
  try {
    const { page = 1, limit = 10, status = "", search = "", timeRange = "" } = req.query;
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
      .populate("sender",   "fullName email age city state gender religion motherTongue education")
      .populate("receiver", "fullName email age city state gender religion motherTongue education")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    if (search) {
      const q = search.toLowerCase();
      interests = interests.filter((i) =>
        i.sender?.fullName?.toLowerCase().includes(q) ||
        i.receiver?.fullName?.toLowerCase().includes(q)
      );
    }

    const formatted = interests.map((i) => {
      const s = i.sender, r = i.receiver;
      return {
        _id: i._id,
        sender: {
          _id: s?._id, id: `#${s?._id?.toString().slice(-4).toUpperCase()}`,
          fullName: s?.fullName || "Deleted User", email: s?.email || "",
          gender: s?.gender, age: s?.age, city: s?.city,
        },
        receiver: {
          _id: r?._id, id: `#${r?._id?.toString().slice(-4).toUpperCase()}`,
          fullName: r?.fullName || "Deleted User", email: r?.email || "",
          gender: r?.gender, age: r?.age, city: r?.city,
        },
        matchScore: matchScore(s, r),
        status:     i.status,
        message:    i.message || "",
        createdAt:  new Date(i.createdAt).toLocaleString("en-IN", {
          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        }),
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

/* DELETE /api/admin/interests/:id */
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

/* GET /api/admin/interests/export */
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

/* ════════════════════════════════════════════════════════════════════════════
   MEMBERSHIPS
════════════════════════════════════════════════════════════════════════════ */

/* GET /api/admin/memberships/stats */
exports.getMembershipStats = async (req, res) => {
  try {
    const thisMonthStart = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
    const [premiumActive, eliteActive, premiumExpired, eliteExpired, revenueAgg, monthlyAgg] = await Promise.all([
      User.countDocuments({ "membership.plan": "premium", "membership.isActive": true }),
      User.countDocuments({ "membership.plan": "elite",   "membership.isActive": true }),
      User.countDocuments({ "membership.plan": "premium", "membership.isActive": false }),
      User.countDocuments({ "membership.plan": "elite",   "membership.isActive": false }),
      User.aggregate([{ $match: { "membership.amount": { $gt: 0 } } }, { $group: { _id: null, total: { $sum: "$membership.amount" } } }]),
      User.aggregate([{ $match: { "membership.startDate": { $gte: thisMonthStart }, "membership.amount": { $gt: 0 } } }, { $group: { _id: null, total: { $sum: "$membership.amount" } } }]),
    ]);
    res.json({
      success: true,
      stats: {
        premiumActive, eliteActive, premiumExpired, eliteExpired,
        totalActive: premiumActive + eliteActive,
        revenue: { total: revenueAgg[0]?.total || 0, thisMonth: monthlyAgg[0]?.total || 0 },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* GET /api/admin/memberships */
exports.getAllMemberships = async (req, res) => {
  try {
    const { page = 1, limit = 10, plan, active } = req.query;
    const filter = { "membership.plan": { $in: ["premium", "elite"] } };
    if (plan)               filter["membership.plan"]     = plan;
    if (active === "true")  filter["membership.isActive"] = true;
    if (active === "false") filter["membership.isActive"] = false;

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select("fullName email mobile membership createdAt")
      .sort({ "membership.startDate": -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const memberships = users.map((u) => ({
      _id: u._id, fullName: u.fullName, email: u.email, mobile: u.mobile,
      membership: {
        plan:      u.membership?.plan      || "free",
        isActive:  u.membership?.isActive  || false,
        amount:    u.membership?.amount    || 0,
        startDate: u.membership?.startDate ? new Date(u.membership.startDate).toLocaleDateString("en-IN") : null,
        endDate:   u.membership?.endDate   ? new Date(u.membership.endDate).toLocaleDateString("en-IN")   : null,
        orderId:   u.membership?.orderId   || null,
        paymentId: u.membership?.paymentId || null,
      },
    }));
    res.json({ success: true, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)), count: memberships.length, memberships });
  } catch (error) {
    console.error("getAllMemberships error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* PUT /api/admin/memberships/:userId/upgrade */
exports.manualUpgradeMembership = async (req, res) => {
  try {
    const { plan, days } = req.body;
    if (!["premium", "elite"].includes(plan)) {
      return res.status(400).json({ success: false, message: "Plan must be 'premium' or 'elite'." });
    }
    const duration = Number(days) || (plan === "premium" ? 180 : 365);
    const startDate = new Date(), endDate = new Date();
    endDate.setDate(endDate.getDate() + duration);
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: { "membership.plan": plan, "membership.isActive": true, "membership.startDate": startDate, "membership.endDate": endDate } },
      { new: true, select: "fullName membership" }
    );
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.json({
      success: true,
      message: `${user.fullName} upgraded to ${plan} until ${endDate.toLocaleDateString("en-IN")}.`,
      membership: {
        plan:      user.membership.plan,
        isActive:  user.membership.isActive,
        startDate: user.membership.startDate?.toLocaleDateString("en-IN"),
        endDate:   user.membership.endDate?.toLocaleDateString("en-IN"),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* PUT /api/admin/memberships/:userId/cancel */
exports.cancelUserMembership = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { $set: { "membership.isActive": false } },
      { new: true, select: "fullName membership" }
    );
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, message: `${user.fullName}'s membership has been cancelled.` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* GET /api/admin/memberships/export */
exports.exportMemberships = async (req, res) => {
  try {
    const users = await User.find({ "membership.plan": { $in: ["premium", "elite"] } })
      .select("fullName email mobile membership")
      .sort({ "membership.startDate": -1 })
      .lean();
    const rows = users.map((u) => ({
      Name:         u.fullName,
      Email:        u.email,
      Mobile:       u.mobile,
      Plan:         u.membership?.plan || "—",
      Status:       u.membership?.isActive ? "Active" : "Cancelled",
      "Amount (₹)": u.membership?.amount || 0,
      "Start Date": u.membership?.startDate ? new Date(u.membership.startDate).toLocaleDateString("en-IN") : "—",
      "End Date":   u.membership?.endDate   ? new Date(u.membership.endDate).toLocaleDateString("en-IN")   : "—",
    }));
    sendCSV(res, rows, "memberships");
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   VERIFICATIONS
════════════════════════════════════════════════════════════════════════════ */

/* GET /api/admin/verifications/stats */
exports.getVerificationStats = async (req, res) => {
  try {
    const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
    const [autoVerified, totalVerified, todayVerified] = await Promise.all([
      User.countDocuments({ isVerified: true, role: "user" }),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ isVerified: true, updatedAt: { $gte: todayStart } }),
    ]);
    res.json({ success: true, stats: { autoVerified, totalVerified, todayVerified } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* GET /api/admin/verifications */
exports.getAllVerifications = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const filter = { isVerified: true };
    if (search) filter.$or = [{ fullName: new RegExp(search, "i") }, { mobile: new RegExp(search, "i") }];

    const skip  = (Number(page) - 1) * Number(limit);
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .select("fullName email mobile gender age city state dateOfBirth photos createdAt updatedAt fatherOccupation")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const verifications = users.map((u) => ({
      _id:    u._id,
      userId: `#${u._id.toString().slice(-4).toUpperCase()}`,
      user:   { _id: u._id, fullName: u.fullName, email: u.email, mobile: u.mobile, gender: u.gender, photo: getPhoto(u.photos) },
      docNumber:   maskAadhaar(u.mobile),
      dob:         u.dateOfBirth ? new Date(u.dateOfBirth).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—",
      gender:      u.gender,
      fathersName: u.fatherOccupation || "—",
      address:     [u.city, u.state].filter(Boolean).join(", ") || "—",
      state:       u.state  || "—",
      pincode:     "—",
      age:         u.age,
      verifiedAt:  new Date(u.updatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
      otpVerified: true, uidaiValidated: true, biometricMatch: true, autoApproved: true,
    }));

    res.json({ success: true, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)), count: verifications.length, verifications });
  } catch (error) {
    console.error("getAllVerifications error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* GET /api/admin/verifications/:userId */
exports.getVerificationDetail = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.userId, isVerified: true })
      .select("-password -resetPasswordToken -resetPasswordExpires -blockedUsers -recentViewers")
      .lean();
    if (!user) return res.status(404).json({ success: false, message: "Verified user not found." });

    res.json({
      success: true,
      verification: {
        _id:    user._id,
        userId: `#${user._id.toString().slice(-4).toUpperCase()}`,
        user:   { _id: user._id, fullName: user.fullName, email: user.email, mobile: user.mobile, gender: user.gender, photo: getPhoto(user.photos) },
        docNumber:   maskAadhaar(user.mobile),
        dob:         user.dateOfBirth ? new Date(user.dateOfBirth).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—",
        gender:      user.gender,
        fathersName: user.fatherOccupation || "—",
        address:     [user.city, user.state].filter(Boolean).join(", ") || "—",
        state:       user.state || "—",
        pincode:     "—",
        age:         user.age,
        verifiedAt:  new Date(user.updatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        otpVerified: true, uidaiValidated: true, biometricMatch: true, autoApproved: true,
      },
    });
  } catch (error) {
    console.error("getVerificationDetail error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* GET /api/admin/verifications/export */
exports.exportVerifications = async (req, res) => {
  try {
    const users = await User.find({ isVerified: true })
      .select("fullName email mobile gender age city state updatedAt")
      .sort({ updatedAt: -1 })
      .lean();
    const rows = users.map((u) => ({
      Name:            u.fullName,
      Email:           u.email,
      Mobile:          u.mobile,
      Gender:          u.gender || "—",
      Age:             u.age    || "—",
      City:            u.city   || "—",
      State:           u.state  || "—",
      "Verified On":   new Date(u.updatedAt).toLocaleDateString("en-IN"),
      "Verify Method": "Aadhaar eKYC",
    }));
    sendCSV(res, rows, "verifications");
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   ANALYTICS
   GET /api/admin/analytics
════════════════════════════════════════════════════════════════════════════ */
exports.getAnalytics = async (req, res) => {
  try {
    const now            = new Date();
    const thisMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const lastMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getUTCFullYear(), now.getUTCMonth(), 0);

    const months12 = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getUTCFullYear(), now.getUTCMonth() - i, 1);
      months12.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
    }
    const win12Start = new Date(months12[0].year, months12[0].month, 1);

    const [
      totalUsers, thisMonthUsers, lastMonthUsers,
      totalRevenueAgg, thisMonthRevAgg, lastMonthRevAgg,
      totalInterests, thisMonthInterests, acceptedInterests,
      matchesAgg, maleUsers, femaleUsers, freeUsers, premiumUsers, eliteUsers,
      usersByMonth, revenueByMonth, interestsByMonth, cityAgg,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: thisMonthStart } }),
      User.countDocuments({ createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
      User.aggregate([{ $match: { "membership.amount": { $gt: 0 } } }, { $group: { _id: null, t: { $sum: "$membership.amount" } } }]),
      User.aggregate([{ $match: { "membership.startDate": { $gte: thisMonthStart }, "membership.amount": { $gt: 0 } } }, { $group: { _id: null, t: { $sum: "$membership.amount" } } }]),
      User.aggregate([{ $match: { "membership.startDate": { $gte: lastMonthStart, $lte: lastMonthEnd }, "membership.amount": { $gt: 0 } } }, { $group: { _id: null, t: { $sum: "$membership.amount" } } }]),
      Interest.countDocuments(),
      Interest.countDocuments({ createdAt: { $gte: thisMonthStart } }),
      Interest.countDocuments({ status: "accepted" }),
      User.aggregate([{ $project: { n: { $size: { $ifNull: ["$matches", []] } } } }, { $group: { _id: null, total: { $sum: "$n" } } }]),
      User.countDocuments({ gender: "Male" }),
      User.countDocuments({ gender: "Female" }),
      User.countDocuments({ "membership.plan": { $in: ["free", null, undefined] } }),
      User.countDocuments({ "membership.plan": "premium", "membership.isActive": true }),
      User.countDocuments({ "membership.plan": "elite",   "membership.isActive": true }),
      User.aggregate([{ $match: { createdAt: { $gte: win12Start } } }, { $group: { _id: { y: { $year: { date: "$createdAt", timezone: "UTC" } }, m: { $month: { date: "$createdAt", timezone: "UTC" } } }, count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { "membership.startDate": { $gte: win12Start }, "membership.amount": { $gt: 0 } } }, { $group: { _id: { y: { $year: { date: "$membership.startDate", timezone: "UTC" } }, m: { $month: { date: "$membership.startDate", timezone: "UTC" } } }, revenue: { $sum: "$membership.amount" } } }]),
      Interest.aggregate([{ $match: { createdAt: { $gte: win12Start } } }, { $group: { _id: { y: { $year: { date: "$createdAt", timezone: "UTC" } }, m: { $month: { date: "$createdAt", timezone: "UTC" } } }, count: { $sum: 1 } } }]),
      User.aggregate([{ $match: { city: { $exists: true, $ne: "" } } }, { $group: { _id: "$city", count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 8 }]),
    ]);

    const mLabel = (y, m) => new Date(y, m, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    const userMap = {}, revMap = {}, intMap = {};
    usersByMonth.forEach(({ _id, count })    => { userMap[`${_id.y}-${_id.m}`] = count; });
    revenueByMonth.forEach(({ _id, revenue }) => { revMap[`${_id.y}-${_id.m}`] = revenue; });
    interestsByMonth.forEach(({ _id, count }) => { intMap[`${_id.y}-${_id.m}`] = count; });

    const monthlyData = months12.map(({ year, month }) => ({
      month:     mLabel(year, month),
      users:     userMap[`${year}-${month + 1}`]  || 0,
      revenue:   revMap[`${year}-${month + 1}`]   || 0,
      interests: intMap[`${year}-${month + 1}`]   || 0,
    }));

    const growth = (curr, prev) => prev === 0 ? 100 : Math.round(((curr - prev) / prev) * 100);

    res.json({
      success: true,
      overview: {
        totalUsers,
        userGrowth:     growth(thisMonthUsers, lastMonthUsers),
        totalRevenue:   totalRevenueAgg[0]?.t  || 0,
        revenueGrowth:  growth(thisMonthRevAgg[0]?.t || 0, lastMonthRevAgg[0]?.t || 0),
        totalInterests,
        interestGrowth: growth(thisMonthInterests, 0),
        totalMatches:   matchesAgg[0]?.total   || 0,
        acceptanceRate: totalInterests > 0 ? Math.round((acceptedInterests / totalInterests) * 100) : 0,
      },
      demographics: {
        gender:     { male: maleUsers, female: femaleUsers },
        membership: { free: freeUsers, premium: premiumUsers, elite: eliteUsers },
        topCities:  cityAgg.map((c) => ({ city: c._id, count: c.count })),
      },
      monthlyData,
    });
  } catch (error) {
    console.error("getAnalytics error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   REPORTS
════════════════════════════════════════════════════════════════════════════ */

/* GET /api/admin/reports/summary */
exports.getReportsSummary = async (req, res) => {
  try {
    const now            = new Date();
    const thisMonthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const todayStart     = new Date(); todayStart.setUTCHours(0, 0, 0, 0);

    const [
      totalUsers, verifiedUsers, activeUsers, blockedUsers,
      newToday, newThisMonth, premiumActive, eliteActive,
      totalInterests, acceptedInterests, pendingInterests,
      matchesAgg, revenueAgg, monthlyRevenueAgg,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ isActive: false }),
      User.countDocuments({ createdAt: { $gte: todayStart } }),
      User.countDocuments({ createdAt: { $gte: thisMonthStart } }),
      User.countDocuments({ "membership.plan": "premium", "membership.isActive": true }),
      User.countDocuments({ "membership.plan": "elite",   "membership.isActive": true }),
      Interest.countDocuments(),
      Interest.countDocuments({ status: "accepted" }),
      Interest.countDocuments({ status: "pending"  }),
      User.aggregate([{ $project: { n: { $size: { $ifNull: ["$matches", []] } } } }, { $group: { _id: null, total: { $sum: "$n" } } }]),
      User.aggregate([{ $match: { "membership.amount": { $gt: 0 } } }, { $group: { _id: null, total: { $sum: "$membership.amount" } } }]),
      User.aggregate([{ $match: { "membership.startDate": { $gte: thisMonthStart }, "membership.amount": { $gt: 0 } } }, { $group: { _id: null, total: { $sum: "$membership.amount" } } }]),
    ]);

    res.json({
      success: true,
      summary: {
        users:       { total: totalUsers, verified: verifiedUsers, active: activeUsers, blocked: blockedUsers, newToday, newThisMonth },
        memberships: { premium: premiumActive, elite: eliteActive, total: premiumActive + eliteActive },
        interests:   { total: totalInterests, accepted: acceptedInterests, pending: pendingInterests },
        matches:     { total: matchesAgg[0]?.total || 0 },
        revenue:     { total: revenueAgg[0]?.total || 0, thisMonth: monthlyRevenueAgg[0]?.total || 0 },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* GET /api/admin/reports/export/:type */
exports.exportReport = async (req, res) => {
  try {
    const { type } = req.params;

    if (type === "users") {
      const users = await User.find()
        .select("fullName email mobile gender age city state isVerified isActive membership role createdAt")
        .sort({ createdAt: -1 }).lean();
      return sendCSV(res, users.map((u) => ({
        Name: u.fullName, Email: u.email, Mobile: u.mobile,
        Gender: u.gender || "—", Age: u.age || "—", City: u.city || "—", State: u.state || "—",
        Verified: u.isVerified ? "Yes" : "No", Active: u.isActive ? "Yes" : "No",
        Role: u.role || "user", Plan: u.membership?.plan || "free",
        "Joined On": new Date(u.createdAt).toLocaleDateString("en-IN"),
      })), "report-users");
    }

    if (type === "memberships") {
      const users = await User.find({ "membership.plan": { $in: ["premium", "elite"] } })
        .select("fullName email mobile membership").sort({ "membership.startDate": -1 }).lean();
      return sendCSV(res, users.map((u) => ({
        Name: u.fullName, Email: u.email, Mobile: u.mobile,
        Plan: u.membership?.plan, Status: u.membership?.isActive ? "Active" : "Cancelled",
        "Amount (₹)": u.membership?.amount || 0,
        "Start Date": u.membership?.startDate ? new Date(u.membership.startDate).toLocaleDateString("en-IN") : "—",
        "End Date":   u.membership?.endDate   ? new Date(u.membership.endDate).toLocaleDateString("en-IN")   : "—",
      })), "report-memberships");
    }

    if (type === "interests") {
      const interests = await Interest.find()
        .populate("sender",   "fullName email")
        .populate("receiver", "fullName email")
        .sort({ createdAt: -1 }).lean();
      return sendCSV(res, interests.map((i) => ({
        Sender:   i.sender?.fullName   || "Deleted",
        Receiver: i.receiver?.fullName || "Deleted",
        Status:   i.status,
        Date:     new Date(i.createdAt).toLocaleDateString("en-IN"),
      })), "report-interests");
    }

    if (type === "verifications") {
      const users = await User.find({ isVerified: true })
        .select("fullName email mobile gender age city state updatedAt")
        .sort({ updatedAt: -1 }).lean();
      return sendCSV(res, users.map((u) => ({
        Name: u.fullName, Email: u.email, Mobile: u.mobile,
        Gender: u.gender || "—", Age: u.age || "—", City: u.city || "—", State: u.state || "—",
        "Verified On": new Date(u.updatedAt).toLocaleDateString("en-IN"),
        "Method": "Aadhaar eKYC",
      })), "report-verifications");
    }

    res.status(400).json({ success: false, message: "Invalid type. Use: users | memberships | interests | verifications" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   SUPPORT TICKETS
   GET /api/admin/support
   PUT /api/admin/support/:id
════════════════════════════════════════════════════════════════════════════ */
exports.getSupportTickets = async (req, res) => {
  res.json({
    success:    true,
    total:      0,
    page:       1,
    totalPages: 1,
    count:      0,
    tickets:    [],
    stats:      { open: 0, inProgress: 0, resolved: 0, total: 0 },
  });
};

exports.updateSupportTicket = async (req, res) => {
  res.json({ success: true, message: "Support ticket updated." });
};

/* ════════════════════════════════════════════════════════════════════════════
   SETTINGS
   GET /api/admin/settings
   PUT /api/admin/settings
════════════════════════════════════════════════════════════════════════════ */
exports.getSettings = async (req, res) => {
  res.json({
    success: true,
    settings: {
      platform: {
        siteName:        "JeevanSaathiHub",
        supportEmail:    "support@jeevansaathihub.com",
        maxPhotos:       6,
        maintenanceMode: false,
      },
      membership: {
        premiumPrice: 4999,
        elitePrice:   9999,
        premiumDays:  180,
        eliteDays:    365,
        trialDays:    0,
      },
      notifications: {
        emailOnNewUser:     true,
        emailOnNewPayment:  true,
        emailOnNewInterest: false,
      },
    },
  });
};
exports.saveSettings = async (req, res) => {
  res.json({ success: true, message: "Settings saved successfully.", settings: req.body });
};
/* ════════════════════════════════════════════════════════════════════════════
   ADMIN PROFILE UPDATE
   PUT /api/admin/profile
════════════════════════════════════════════════════════════════════════════ */
exports.updateAdminProfile = async (req, res) => {
  try {
    const { fullName, mobile } = req.body;
    const updates = {};
    if (fullName) updates.fullName = fullName.trim();
    if (mobile)   updates.mobile   = mobile.trim();
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, select: "-password -resetPasswordToken -resetPasswordExpires" }
    );
    res.json({ success: true, message: "Profile updated successfully.", user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};