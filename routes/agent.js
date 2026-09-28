const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const db = require("../db");

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "No token provided",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "your_jwt_secret"
    );

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        error: "Invalid token payload",
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

/* =========================================================
   GET /api/agent/dashboard
========================================================= */

router.get("/dashboard", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Only agents and landlords can access this
    if (req.user.role !== "agent" && req.user.role !== "landlord") {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    // ---------- STATS ----------
    // Total properties owned by this user
    const [[{ totalProperties }]] = await db.query(
      `SELECT COUNT(*) AS totalProperties 
       FROM properties 
       WHERE user_id = ?`,
      [userId]
    );

    // Active properties
    const [[{ activeProperties }]] = await db.query(
      `SELECT COUNT(*) AS activeProperties 
       FROM properties 
       WHERE user_id = ? AND status = 'Available'`,
      [userId]
    );

    // Total bookings for this user's properties
    const [[{ totalBookings }]] = await db.query(
      `SELECT COUNT(*) AS totalBookings 
       FROM bookings b
       JOIN properties p ON p.id = b.property_id
       WHERE p.user_id = ?`,
      [userId]
    );

    // Pending bookings
    const [[{ pendingBookings }]] = await db.query(
      `SELECT COUNT(*) AS pendingBookings 
       FROM bookings b
       JOIN properties p ON p.id = b.property_id
       WHERE p.user_id = ? AND b.status = 'pending'`,
      [userId]
    );

    // Confirmed bookings
    const [[{ confirmedBookings }]] = await db.query(
      `SELECT COUNT(*) AS confirmedBookings 
       FROM bookings b
       JOIN properties p ON p.id = b.property_id
       WHERE p.user_id = ? AND b.status = 'confirmed'`,
      [userId]
    );

    // Rejected bookings
    const [[{ rejectedBookings }]] = await db.query(
      `SELECT COUNT(*) AS rejectedBookings 
       FROM bookings b
       JOIN properties p ON p.id = b.property_id
       WHERE p.user_id = ? AND b.status = 'rejected'`,
      [userId]
    );

    // ---------- RECENT BOOKINGS ----------
    const [recentBookings] = await db.query(
      `SELECT 
         b.id,
         b.status,
         b.created_at,
         u.name AS customer_name,
         u.email AS customer_email,
         p.title AS property_title
       FROM bookings b
       JOIN properties p ON p.id = b.property_id
       LEFT JOIN users u ON u.id = b.user_id
       WHERE p.user_id = ?
       ORDER BY b.created_at DESC
       LIMIT 5`,
      [userId]
    );

    // ---------- RECENT PROPERTIES ----------
    const [recentProperties] = await db.query(
      `SELECT id, title, location, price, status, created_at
       FROM properties
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 5`,
      [userId]
    );

    return res.json({
      success: true,
      stats: {
        properties: Number(totalProperties) || 0,
        activeProperties: Number(activeProperties) || 0,
        bookings: Number(totalBookings) || 0,
        pendingBookings: Number(pendingBookings) || 0,
        confirmedBookings: Number(confirmedBookings) || 0,
        rejectedBookings: Number(rejectedBookings) || 0,
      },
      recentBookings,
      recentProperties,
    });
  } catch (err) {
    console.error("Agent dashboard error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while loading dashboard",
    });
  }
});

module.exports = router;