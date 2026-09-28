const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../db");

/*
=========================================================
GET /api/inquiries/count/:userId
Returns how many inquiries a user has sent
=========================================================
*/
router.get("/count/:userId", auth, async (req, res) => {
  try {
    const requestedUserId = Number(req.params.userId);
    const authenticatedUserId = Number(req.user.id);
    const role = String(req.user.role || "").toLowerCase();

    // Only allow own count unless admin
    if (role !== "admin" && requestedUserId !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        error: "You can only access your own inquiries count",
      });
    }

    const [rows] = await db.query(
      "SELECT COUNT(*) AS count FROM inquiries WHERE user_id = ?",
      [requestedUserId]
    );

    res.json({ count: rows[0].count });
  } catch (err) {
    console.error("INQUIRIES COUNT error:", err);
    res.status(500).json({ success: false, error: "Failed to get inquiries count" });
  }
});

/*
=========================================================
GET /api/inquiries
Get all inquiries sent by the logged-in user
=========================================================
*/
router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [inquiries] = await db.query(
      `SELECT 
         i.*,
         p.title AS property_title,
         p.image AS property_image
       FROM inquiries i
       JOIN properties p ON i.property_id = p.id
       WHERE i.user_id = ?
       ORDER BY i.created_at DESC`,
      [userId]
    );

    res.json(inquiries);
  } catch (err) {
    console.error("GET INQUIRIES error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch inquiries" });
  }
});

/*
=========================================================
POST /api/inquiries
Create a new inquiry
Body: { property_id, name, email, phone?, message }
=========================================================
*/
router.post("/", auth, async (req, res) => {
  try {
    const { property_id, name, email, phone, message } = req.body;
    const userId = req.user.id;

    if (!property_id || !name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "property_id, name, email and message are required",
      });
    }

    // Optional: get the property owner as agent_id
    const [property] = await db.query(
      "SELECT user_id FROM properties WHERE id = ?",
      [property_id]
    );

    const agentId = property.length > 0 ? property[0].user_id : null;

    const [result] = await db.query(
      `INSERT INTO inquiries 
         (property_id, user_id, agent_id, name, email, phone, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [property_id, userId, agentId, name, email, phone || null, message]
    );

    res.status(201).json({
      success: true,
      message: "Inquiry submitted successfully",
      id: result.insertId,
    });
  } catch (err) {
    console.error("CREATE INQUIRY error:", err);
    res.status(500).json({ success: false, error: "Failed to create inquiry" });
  }
});

/*
=========================================================
GET /api/inquiries/received
Get inquiries received by the logged-in agent/owner
=========================================================
*/
router.get("/received", auth, async (req, res) => {
  try {
    const agentId = req.user.id;

    const [inquiries] = await db.query(
      `SELECT 
         i.*,
         p.title AS property_title,
         p.image AS property_image
       FROM inquiries i
       JOIN properties p ON i.property_id = p.id
       WHERE i.agent_id = ?
       ORDER BY i.created_at DESC`,
      [agentId]
    );

    res.json(inquiries);
  } catch (err) {
    console.error("GET RECEIVED INQUIRIES error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch received inquiries" });
  }
});

/*
=========================================================
PATCH /api/inquiries/:id/status
Update inquiry status (agent only)
Body: { status: 'pending' | 'replied' | 'closed' }
=========================================================
*/
router.patch("/:id/status", auth, async (req, res) => {
  try {
    const inquiryId = Number(req.params.id);
    const { status } = req.body;
    const agentId = req.user.id;

    if (!["pending", "replied", "closed"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status. Must be pending, replied or closed",
      });
    }

    // Only the assigned agent can update
    const [result] = await db.query(
      "UPDATE inquiries SET status = ? WHERE id = ? AND agent_id = ?",
      [status, inquiryId, agentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "Inquiry not found or you are not authorized",
      });
    }

    res.json({ success: true, message: "Status updated" });
  } catch (err) {
    console.error("UPDATE INQUIRY STATUS error:", err);
    res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

module.exports = router;