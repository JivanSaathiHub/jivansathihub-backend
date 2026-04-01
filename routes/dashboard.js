const express    = require("express");
const router     = express.Router();
const { getDashboard } = require("../controllers/dashboardController");
const { protect }      = require("../middleware/auth");

// All dashboard routes require login
router.use(protect);

router.get("/", getDashboard);

module.exports = router;