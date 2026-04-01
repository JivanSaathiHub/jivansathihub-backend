require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });                   // ← add this line
const multer             = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary         = require("cloudinary").v2;

// ── Configure Cloudinary ──────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,      // ← your actual key name
  api_key:    process.env.CLOUDINARY_KEY,        // ← your actual key name
  api_secret: process.env.CLOUDINARY_SECRET, 
});

// ── Cloudinary storage ────────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          "jeevan-saathi/stories",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    transformation:  [{ width: 800, height: 800, crop: "limit", quality: "auto" }],
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  if (
    allowed.test(file.mimetype) ||
    allowed.test(file.originalname.toLowerCase())
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG and WebP images are allowed."));
  }
};

const uploadStoryImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).single("image");

module.exports = uploadStoryImage;
module.exports.cloudinary = cloudinary;