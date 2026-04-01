const Shortlist = require("../models/Shortlist");

/* ─────────────────────────────────────────────
   GET /api/shortlist
   Returns all profiles shortlisted by the logged-in user
───────────────────────────────────────────── */
exports.getShortlist = async (req, res) => {
  try {
    const items = await Shortlist.find({ user: req.user._id })
      .populate(
        "profile",
        "fullName age height city state gender religion caste profession education photos isVerified membership"
      )
      .sort({ createdAt: -1 });

    const profiles = items
      .filter((item) => item.profile) // guard against deleted users
      .map((item) => ({ ...item.profile.toObject(), shortlistId: item._id }));

    res.json({ success: true, profiles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────────
   POST /api/shortlist/:profileId
   Add a profile to the shortlist
───────────────────────────────────────────── */
exports.addToShortlist = async (req, res) => {
  try {
    const { profileId } = req.params;

    if (String(req.user._id) === String(profileId)) {
      return res
        .status(400)
        .json({ success: false, message: "You cannot shortlist yourself." });
    }

    const item = await Shortlist.create({
      user:    req.user._id,
      profile: profileId,
    });

    res.status(201).json({ success: true, shortlistId: item._id });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "Already shortlisted." });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────────
   DELETE /api/shortlist/:profileId
   Remove a profile from the shortlist
───────────────────────────────────────────── */
exports.removeFromShortlist = async (req, res) => {
  try {
    const result = await Shortlist.findOneAndDelete({
      user:    req.user._id,
      profile: req.params.profileId,
    });

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "Not found in shortlist." });
    }

    res.json({ success: true, message: "Removed from shortlist." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────────
   GET /api/shortlist/check/:profileId
   Check if a profile is shortlisted (used by ProfileDetail)
───────────────────────────────────────────── */
exports.checkShortlist = async (req, res) => {
  try {
    const exists = await Shortlist.exists({
      user:    req.user._id,
      profile: req.params.profileId,
    });
    res.json({ success: true, isShortlisted: !!exists });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};