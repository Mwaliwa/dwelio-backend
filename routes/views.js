const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../db");

/*
=========================================================
GET /api/views/count/:userId
Returns how many properties a user has viewed
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
        error: "You can only access your own views count",
      });
    }

    const [rows] = await db.query(
      "SELECT COUNT(*) AS count FROM views WHERE user_id = ?",
      [requestedUserId]
    );

    res.json({ count: rows[0].count });
  } catch (err) {
    console.error("VIEWS COUNT error:", err);
    res.status(500).json({ success: false, error: "Failed to get views count" });
  }
});

/*
=========================================================
POST /api/views
Record a property view
Body: { property_id }
=========================================================
*/
router.post("/", auth, async (req, res) => {
  try {
    const { property_id } = req.body;
    const userId = req.user.id;

    if (!property_id) {
      return res.status(400).json({ success: false, error: "property_id is required" });
    }

    // Optional: prevent duplicate views from the same user in a short time window
    // (e.g. last 30 minutes). Comment out if you want every view counted.
    /*
    const [recent] = await db.query(
      `SELECT id FROM views 
       WHERE user_id = ? AND property_id = ? 
       AND viewed_at > NOW() - INTERVAL 30 MINUTE
       LIMIT 1`,
      [userId, property_id]
    );

    if (recent.length > 0) {
      return res.json({ success: true, message: "View already recorded recently" });
    }
    */

    await db.query(
      "INSERT INTO views (property_id, user_id) VALUES (?, ?)",
      [property_id, userId]
    );

    res.status(201).json({ success: true, message: "View recorded" });
  } catch (err) {
    console.error("RECORD VIEW error:", err);
    res.status(500).json({ success: false, error: "Failed to record view" });
  }
});

/*
=========================================================
GET /api/views/property/:propertyId
Get total views for a specific property (public)
=========================================================
*/
router.get("/property/:propertyId", async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);

    if (!propertyId || isNaN(propertyId)) {
      return res.status(400).json({ success: false, error: "Invalid property ID" });
    }

    const [rows] = await db.query(
      "SELECT COUNT(*) AS count FROM views WHERE property_id = ?",
      [propertyId]
    );

    res.json({ count: rows[0].count });
  } catch (err) {
    console.error("PROPERTY VIEWS error:", err);
    res.status(500).json({ success: false, error: "Failed to get property views" });
  }
});

module.exports = router;