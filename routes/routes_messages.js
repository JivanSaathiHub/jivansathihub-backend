const express    = require("express");
const router     = express.Router();
const ctrl       = require("../controllers/messageController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.get("/conversations",                  ctrl.getConversations);
router.get("/:partnerId",                     ctrl.getMessages);
router.post("/:partnerId",                    ctrl.sendMessage);
router.delete("/conversation/:partnerId",     ctrl.clearConversation);

module.exports = router;