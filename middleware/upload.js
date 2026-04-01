const multer                  = require("multer");
const { CloudinaryStorage }   = require("multer-storage-cloudinary");
const cloudinary              = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          "jeevansaathihub/profiles",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation:  [
      { width: 800, height: 800, crop: "limit", quality: "auto" },
    ],
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG and WEBP images are allowed."), false);
  }
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});