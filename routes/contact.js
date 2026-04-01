const express = require("express");
const { Resend } = require("resend");
const router = express.Router();

const resend = new Resend(process.env.RESEND_API_KEY);

router.post("/", async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ success: false, message: "All fields are required." });
  }

  try {
    await resend.emails.send({
      from:    "onboarding@resend.dev",           // replace with your verified domain later
      to:      "sigmarule0486@gmail.com",     // you receive here
      replyTo: email,
      subject: `[Support] ${subject} — from ${name}`,
      html: `
        <h2>New Support Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr/>
        <p>${message.replace(/\n/g, "<br/>")}</p>
      `,
    });
    res.json({ success: true, message: "Email sent successfully." });
  } catch (err) {
    console.error("Resend error:", err);
    res.status(500).json({ success: false, message: "Failed to send email." });
  }
});

module.exports = router;