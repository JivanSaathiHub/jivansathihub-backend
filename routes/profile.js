const express = require("express");
const router  = express.Router();
const {
  getMyProfile, updateProfile, getProfile,
  uploadPhoto, deletePhoto, setPrimaryPhoto, deactivateAccount,
} = require("../controllers/profileController");
const { protect }             = require("../middleware/auth");
const { updateProfileRules, validate } = require("../middleware/validate");
const upload                  = require("../middleware/upload");

// All profile routes require auth
router.use(protect);

router.get("/me",                          getMyProfile);
router.put("/me", updateProfileRules, validate, updateProfile);
router.delete("/me",                       deactivateAccount);

router.post("/photos",                     upload.single("photo"), uploadPhoto);
router.delete("/photos/:photoId",          deletePhoto);
router.put("/photos/:photoId/primary",     setPrimaryPhoto);

// Public profile (still requires login to track views)
router.get("/:id",                         getProfile);

module.exports = router;