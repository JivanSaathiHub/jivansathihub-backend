const express    = require("express");
const router     = express.Router();
const ctrl       = require("../controllers/shortlistController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.get("/",                    ctrl.getShortlist);
router.get("/check/:profileId",    ctrl.checkShortlist);
router.post("/:profileId",         ctrl.addToShortlist);
router.delete("/:profileId",       ctrl.removeFromShortlist);

module.exports = router;