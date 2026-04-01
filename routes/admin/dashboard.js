const express = require("express");
const router  = express.Router();
const { getDashboardAll } = require("../../controllers/dashboardController");

/* GET /api/admin/dashboard  — single all-in-one call */
router.get("/", getDashboardAll);

module.exports = router;