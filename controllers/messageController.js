const Message = require("../models/Message");
const User    = require("../models/User");
const { emitToUser } = require("../socket");

/* ── helper: build a stable room ID from two user IDs ── */
const roomId = (a, b) => [String(a), String(b)].sort().join("_");

/* ─────────────────────────────────────────────
   GET /api/messages/conversations
   Returns one entry per conversation partner,
   with the latest message and unread count.
───────────────────────────────────────────── */
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    // All messages involving this user
    const all = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .sort({ createdAt: -1 })
      .populate("sender",   "fullName photos city profession")
      .populate("receiver", "fullName photos city profession");

    // Group by roomId — keep only the most recent message per room
    const roomMap = new Map();
    for (const msg of all) {
      if (!roomMap.has(msg.roomId)) roomMap.set(msg.roomId, msg);
    }

    // Build conversation list
    const conversations = await Promise.all(
      [...roomMap.values()].map(async (msg) => {
        const isMe     = String(msg.sender._id) === String(userId);
        const partner  = isMe ? msg.receiver : msg.sender;
        const unread   = await Message.countDocuments({
          roomId: msg.roomId,
          receiver: userId,
          read: false,
        });
        return {
          roomId:    msg.roomId,
          partner:   partner,
          lastMsg:   msg.text || (msg.image ? "📷 Photo" : ""),
          time:      msg.createdAt,
          unread,
          online:    false, // can be enhanced with socket presence
        };
      })
    );

    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────────
   GET /api/messages/:partnerId
   Returns paginated messages between two users.
   Marks all received messages as read.
───────────────────────────────────────────── */
exports.getMessages = async (req, res) => {
  try {
    const userId    = req.user._id;
    const partnerId = req.params.partnerId;
    const room      = roomId(userId, partnerId);
    const page      = parseInt(req.query.page) || 1;
    const limit     = 50;

    const messages = await Message.find({ roomId: room })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("sender",   "fullName photos")
      .populate("receiver", "fullName photos");

    // Mark all received messages as read
    await Message.updateMany(
      { roomId: room, receiver: userId, read: false },
      { $set: { read: true } }
    );

    res.json({ success: true, messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────────
   POST /api/messages/:partnerId
   Send a text message to a partner.
───────────────────────────────────────────── */
exports.sendMessage = async (req, res) => {
  try {
    const senderId  = req.user._id;
    const partnerId = req.params.partnerId;

    if (String(senderId) === String(partnerId)) {
      return res.status(400).json({ success: false, message: "Cannot message yourself." });
    }

    const { text, image } = req.body;
    if (!text?.trim() && !image) {
      return res.status(400).json({ success: false, message: "Message cannot be empty." });
    }

    const room = roomId(senderId, partnerId);

    const message = await Message.create({
      roomId:   room,
      sender:   senderId,
      receiver: partnerId,
      text:     (text || "").trim().slice(0, 1000),
      image:    image || "",
    });

    await message.populate("sender",   "fullName photos");
    await message.populate("receiver", "fullName photos");

    // Real-time delivery to receiver
    emitToUser(String(partnerId), "new_message", {
      roomId:  room,
      message: {
        _id:      message._id,
        text:     message.text,
        image:    message.image,
        sender:   message.sender,
        receiver: message.receiver,
        read:     message.read,
        createdAt: message.createdAt,
      },
    });

    res.status(201).json({ success: true, message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ─────────────────────────────────────────────
   DELETE /api/messages/conversation/:partnerId
   Clear all messages in a conversation (local only for sender)
───────────────────────────────────────────── */
exports.clearConversation = async (req, res) => {
  try {
    const userId    = req.user._id;
    const partnerId = req.params.partnerId;
    const room      = roomId(userId, partnerId);

    // Only delete messages sent by this user
    await Message.deleteMany({ roomId: room, sender: userId });

    res.json({ success: true, message: "Conversation cleared." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};