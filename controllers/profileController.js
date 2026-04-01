const User      = require("../models/User");
const cloudinary = require("../config/cloudinary");

// ── GET /api/profile/:id  (public profile) ────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-interestsSent -interestsReceived -blockedUsers -resetPasswordToken -resetPasswordExpires"
    );
    if (!user || !user.isActive) {
      return res.status(404).json({ success: false, message: "Profile not found." });
    }

    // Increment view count (don't count own views)
    if (req.user && String(req.user._id) !== String(user._id)) {
      await User.findByIdAndUpdate(user._id, { $inc: { profileViews: 1 } });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── GET /api/profile/me  (own full profile) ───────────────────────
exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("matches",           "fullName age city gender photos")
      .populate("interestsSent",     "fullName age city gender photos")
      .populate("interestsReceived", "fullName age city gender photos");
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── PUT /api/profile/me  (update own profile) ─────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const allowed = [
      "fullName","religion","caste","motherTongue","height","weight",
      "complexion","maritalStatus","aboutMe","country","state","city",
      "education","profession","employer","annualIncome",
      "familyType","familyStatus","familyValues",
      "fatherOccupation","motherOccupation",
      "siblings","partnerPreferences",
    ];

    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    res.json({ success: true, message: "Profile updated successfully.", user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── POST /api/profile/photos  (upload photo) ──────────────────────
exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No photo uploaded." });
    }

    const user = await User.findById(req.user._id);
    if (user.photos.length >= 10) {
      await cloudinary.uploader.destroy(req.file.filename);
      return res.status(400).json({ success: false, message: "Maximum 10 photos allowed." });
    }

    const isPrimary = user.photos.length === 0;

    user.photos.push({
      url:        req.file.path,
      publicId:   req.file.filename,
      isPrimary,
    });
    await user.save();

    res.status(201).json({
      success: true,
      message: "Photo uploaded successfully.",
      photo:   { url: req.file.path, isPrimary },
      photos:  user.photos,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── DELETE /api/profile/photos/:photoId ───────────────────────────
exports.deletePhoto = async (req, res) => {
  try {
    const user  = await User.findById(req.user._id);
    const photo = user.photos.id(req.params.photoId);

    if (!photo) {
      return res.status(404).json({ success: false, message: "Photo not found." });
    }

    if (photo.publicId) {
      await cloudinary.uploader.destroy(photo.publicId);
    }

    user.photos.pull(req.params.photoId);

    if (photo.isPrimary && user.photos.length > 0) {
      user.photos[0].isPrimary = true;
    }

    await user.save();
    res.json({ success: true, message: "Photo deleted.", photos: user.photos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── PUT /api/profile/photos/:photoId/primary ──────────────────────
exports.setPrimaryPhoto = async (req, res) => {
  try {
    const user  = await User.findById(req.user._id);
    const photo = user.photos.id(req.params.photoId);

    if (!photo) {
      return res.status(404).json({ success: false, message: "Photo not found." });
    }

    user.photos.forEach((p) => (p.isPrimary = false));
    photo.isPrimary = true;
    await user.save();

    res.json({ success: true, message: "Primary photo updated.", photos: user.photos });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── DELETE /api/profile/me  (deactivate account) ──────────────────
exports.deactivateAccount = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { isActive: false });
    res.json({ success: true, message: "Account deactivated successfully." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};