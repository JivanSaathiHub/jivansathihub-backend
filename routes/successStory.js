const express               = require("express");
const router                = express.Router();
const ctrl                  = require("../controllers/successStoryController");
const upload                = require("../middleware/uploadStoryImage");
const { protect, checkAdmin } = require("../middleware/auth");

/* PUBLIC */
router.get("/",    ctrl.getStories);
router.get("/:id", ctrl.getStoryById);

/* POST /api/stories — admin create */
router.post(
  "/",
  protect,
  checkAdmin,
  (req, res, next) => {
    upload(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  ctrl.createStory
);

/* PUT /api/stories/:id — admin update */
router.put(
  "/:id",
  protect,
  checkAdmin,
  (req, res, next) => {
    upload(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  ctrl.updateStory
);

/* PATCH /api/stories/:id/status — toggle publish/draft */
router.patch("/:id/status", protect, checkAdmin, ctrl.toggleStatus);

/* DELETE /api/stories/:id — admin delete */
router.delete("/:id", protect, checkAdmin, ctrl.deleteStory);

module.exports = router;