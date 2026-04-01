const SuccessStory           = require("../models/SuccessStory");
const { cloudinary }         = require("../middleware/uploadStoryImage");
const { getIO }              = require("../socket");

/* ── helper: human-readable date string ── */
const readableDate = () =>
  new Date().toLocaleDateString("en-GB", {
    day:   "2-digit",
    month: "short",
    year:  "numeric",
  });

/* ── helper: delete image from Cloudinary ── */
const deleteCloudinaryImage = async (imageUrl) => {
  if (!imageUrl) return;
  try {
    // Extract public_id from Cloudinary URL
    // URL format: https://res.cloudinary.com/<cloud>/image/upload/v123/jeevan-saathi/stories/<id>
    const parts   = imageUrl.split("/");
    const file    = parts[parts.length - 1].split(".")[0]; // filename without extension
    const folder  = parts[parts.length - 2];               // folder name
    const publicId = `${folder}/${file}`;
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Cloudinary delete error:", err.message);
  }
};

/* ── helper: broadcast stories_updated event to all clients ── */
const broadcast = (event, data) => {
  const io = getIO();
  if (io) io.emit(event, data);
};

/* ══════════════════════════════════════════
   GET /api/stories              — public (only published)
   GET /api/stories?all=true     — admin (all records)
══════════════════════════════════════════ */
exports.getStories = async (req, res) => {
  try {
    const filter  = req.query.all === "true" ? {} : { status: "published" };
    const stories = await SuccessStory.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: stories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ══════════════════════════════════════════
   GET /api/stories/:id
══════════════════════════════════════════ */
exports.getStoryById = async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found." });
    res.json({ success: true, data: story });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ══════════════════════════════════════════
   POST /api/stories              — admin create
══════════════════════════════════════════ */
exports.createStory = async (req, res) => {
  try {
    const { coupleName, groomName, brideName, marriageDate, location, story, status } = req.body;

    if (!coupleName || !coupleName.trim()) {
      return res.status(400).json({ success: false, message: "Couple name is required." });
    }

    const doc = await SuccessStory.create({
      coupleName:   coupleName.trim(),
      groomName:    groomName?.trim()    || "",
      brideName:    brideName?.trim()    || "",
      marriageDate: marriageDate?.trim() || "",
      location:     location?.trim()     || "",
      story:        story?.trim()        || "",
      status:       status === "draft" ? "draft" : "published",
      // Cloudinary gives back full secure URL in req.file.path
      image:        req.file ? req.file.path : null,
      addedOn:      readableDate(),
    });

    // Broadcast to all connected clients
    broadcast("stories_updated", { action: "created", story: doc });

    res.status(201).json({ success: true, message: "Success story created.", data: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ══════════════════════════════════════════
   PUT /api/stories/:id           — admin update
══════════════════════════════════════════ */
exports.updateStory = async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found." });

    const { coupleName, groomName, brideName, marriageDate, location, story: storyText, status } = req.body;

    // If new image uploaded, delete old one from Cloudinary
    if (req.file && story.image) await deleteCloudinaryImage(story.image);

    story.coupleName   = coupleName?.trim()   || story.coupleName;
    story.groomName    = groomName?.trim()    ?? story.groomName;
    story.brideName    = brideName?.trim()    ?? story.brideName;
    story.marriageDate = marriageDate?.trim() ?? story.marriageDate;
    story.location     = location?.trim()     ?? story.location;
    story.story        = storyText?.trim()    ?? story.story;
    if (status)   story.status = status;
    if (req.file) story.image  = req.file.path; // Cloudinary full URL

    await story.save();

    // Broadcast to all connected clients
    broadcast("stories_updated", { action: "updated", story });

    res.json({ success: true, message: "Success story updated.", data: story });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ══════════════════════════════════════════
   PATCH /api/stories/:id/status  — toggle publish/draft
══════════════════════════════════════════ */
exports.toggleStatus = async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found." });

    story.status = story.status === "published" ? "draft" : "published";
    await story.save();

    // Broadcast to all connected clients
    broadcast("stories_updated", { action: "updated", story });

    res.json({ success: true, message: `Story ${story.status}.`, data: { status: story.status } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ══════════════════════════════════════════
   DELETE /api/stories/:id        — admin delete
══════════════════════════════════════════ */
exports.deleteStory = async (req, res) => {
  try {
    const story = await SuccessStory.findById(req.params.id);
    if (!story) return res.status(404).json({ success: false, message: "Story not found." });

    // Delete image from Cloudinary
    if (story.image) await deleteCloudinaryImage(story.image);
    await story.deleteOne();

    // Broadcast to all connected clients
    broadcast("stories_updated", { action: "deleted", storyId: req.params.id });

    res.json({ success: true, message: "Success story deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};