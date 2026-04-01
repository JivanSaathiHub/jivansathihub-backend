const Feedback = require("../models/Feedback");

/* ════════════════════════════════════════════════════════════════════════════
   SHARED UTILITY
════════════════════════════════════════════════════════════════════════════ */
function sendCSV(res, rows, filename) {
  if (!rows.length) return res.status(404).json({ success: false, message: "No data to export." });
  const headers = Object.keys(rows[0]).join(",");
  const csv     = [headers, ...rows.map((r) => Object.values(r).map((v) => `"${v ?? ""}"`).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}-${Date.now()}.csv"`);
  res.send(csv);
}

/* ════════════════════════════════════════════════════════════════════════════
   GET /api/admin/feedback
   Query params: page, limit, search, status, rating
════════════════════════════════════════════════════════════════════════════ */
exports.getAllFeedback = async (req, res) => {
  try {
    const {
      page   = 1,
      limit  = 5,
      search = "",
      status = "",
      rating = "",
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (rating) filter.rating = Number(rating);
    if (search) {
      filter.$or = [
        { userName:  { $regex: search, $options: "i" } },
        { userEmail: { $regex: search, $options: "i" } },
        { subject:   { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [feedbacks, total, totalAll, pending, resolved, ratingAgg] = await Promise.all([
      Feedback.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      Feedback.countDocuments(filter),
      Feedback.countDocuments(),
      Feedback.countDocuments({ status: "Pending"  }),
      Feedback.countDocuments({ status: "Resolved" }),
      Feedback.aggregate([{ $group: { _id: null, avg: { $avg: "$rating" } } }]),
    ]);

    const avgRating = ratingAgg[0] ? Number(ratingAgg[0].avg).toFixed(1) : "0.0";

    res.json({
      success:    true,
      total,
      totalPages: Math.ceil(total / Number(limit)),
      page:       Number(page),
      feedbacks:  feedbacks.map((f) => ({
        _id:       f._id,
        userName:  f.userName,
        userEmail: f.userEmail,
        subject:   f.subject,
        message:   f.message,
        rating:    f.rating,
        category:  f.category,
        status:    f.status,
        date:      new Date(f.createdAt).toLocaleDateString("en-IN", {
          day: "numeric", month: "numeric", year: "numeric",
        }),
      })),
      stats: {
        total:     totalAll,
        pending,
        resolved,
        avgRating,
      },
    });
  } catch (error) {
    console.error("getAllFeedback error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   PATCH /api/admin/feedback/:id/resolve
════════════════════════════════════════════════════════════════════════════ */
exports.resolveFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      { status: "Resolved", resolvedAt: new Date() },
      { new: true }
    );
    if (!feedback) {
      return res.status(404).json({ success: false, message: "Feedback not found." });
    }
    res.json({ success: true, message: "Feedback marked as resolved.", feedback });
  } catch (error) {
    console.error("resolveFeedback error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   DELETE /api/admin/feedback/:id
════════════════════════════════════════════════════════════════════════════ */
exports.deleteFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findByIdAndDelete(req.params.id);
    if (!feedback) {
      return res.status(404).json({ success: false, message: "Feedback not found." });
    }
    res.json({ success: true, message: "Feedback deleted successfully." });
  } catch (error) {
    console.error("deleteFeedback error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* ════════════════════════════════════════════════════════════════════════════
   POST /api/feedback  (public — users submit feedback from the app)
════════════════════════════════════════════════════════════════════════════ */
exports.submitFeedback = async (req, res) => {
  try {
    const { subject, message, rating, category } = req.body;

    if (!subject || !message || !rating) {
      return res.status(400).json({ success: false, message: "Subject, message and rating are required." });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5." });
    }

    const feedback = await Feedback.create({
      user:      req.user._id,
      userName:  req.user.fullName,
      userEmail: req.user.email,
      subject,
      message,
      rating:    Number(rating),
      category:  category || "Positive",
    });

    res.status(201).json({ success: true, message: "Thank you for your feedback!", feedback });
  } catch (error) {
    console.error("submitFeedback error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};