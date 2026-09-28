const express = require("express");
const router = express.Router();

const db = require("../db");
const auth = require("../middleware/auth");

// Protect all booking routes
router.use(auth);

// ==========================================
// HELPER: Check if user is agent/landlord
// ==========================================
const isAgent = (user) =>
  user.role === "agent" || user.role === "landlord";

// ==========================================
// GET ALL BOOKINGS FOR LOGGED-IN USER (CUSTOMER)
// GET /api/bookings
// ==========================================
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;

    const [bookings] = await db.query(
      `
      SELECT 
        b.id,
        b.user_id,
        b.property_id,
        b.check_in,
        b.check_out,
        b.total_amount,
        b.status,
        b.created_at,
        p.title AS property_title,
        p.location AS property_location
      FROM bookings b
      LEFT JOIN properties p ON b.property_id = p.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
      `,
      [userId]
    );

    res.json({
      success: true,
      bookings,
    });
  } catch (error) {
    console.error("GET BOOKINGS ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to fetch bookings",
      error: error.message,
    });
  }
});

// ==========================================
// AGENT: GET BOOKINGS ON MY PROPERTIES
// GET /api/bookings/agent
// ==========================================
router.get("/agent", async (req, res) => {
  try {
    if (!isAgent(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Agents only.",
      });
    }

    const agentId = req.user.id;

    const [bookings] = await db.query(
      `
      SELECT 
        b.id,
        b.user_id,
        b.property_id,
        b.check_in,
        b.check_out,
        b.total_amount,
        b.status,
        b.created_at,
        p.title AS property_title,
        p.location AS property_location,
        u.name AS customer_name,
        u.phone AS customer_phone,
        u.email AS customer_email
      FROM bookings b
      INNER JOIN properties p ON b.property_id = p.id
      LEFT JOIN users u ON b.user_id = u.id
      WHERE p.user_id = ?
      ORDER BY b.created_at DESC
      `,
      [agentId]
    );

    res.json({
      success: true,
      bookings,
    });
  } catch (error) {
    console.error("AGENT GET BOOKINGS ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to fetch agent bookings",
      error: error.message,
    });
  }
});

// ==========================================
// AGENT: CONFIRM BOOKING
// PATCH /api/bookings/agent/:id/confirm
// ==========================================
router.patch("/agent/:id/confirm", async (req, res) => {
  try {
    if (!isAgent(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const agentId = req.user.id;
    const bookingId = req.params.id;

    const [rows] = await db.query(
      `
      SELECT b.id, b.status
      FROM bookings b
      INNER JOIN properties p ON b.property_id = p.id
      WHERE b.id = ? AND p.user_id = ?
      `,
      [bookingId, agentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or not yours",
      });
    }

    if (["confirmed", "paid"].includes(rows[0].status)) {
      return res.status(400).json({
        success: false,
        message: "Booking is already confirmed",
      });
    }

    await db.query(
      `UPDATE bookings SET status = 'confirmed' WHERE id = ?`,
      [bookingId]
    );

    res.json({
      success: true,
      message: "Booking confirmed successfully",
    });
  } catch (error) {
    console.error("CONFIRM BOOKING ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to confirm booking",
      error: error.message,
    });
  }
});

// ==========================================
// AGENT: REJECT BOOKING
// PATCH /api/bookings/agent/:id/reject
// ==========================================
router.patch("/agent/:id/reject", async (req, res) => {
  try {
    if (!isAgent(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const agentId = req.user.id;
    const bookingId = req.params.id;

    const [rows] = await db.query(
      `
      SELECT b.id, b.status
      FROM bookings b
      INNER JOIN properties p ON b.property_id = p.id
      WHERE b.id = ? AND p.user_id = ?
      `,
      [bookingId, agentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found or not yours",
      });
    }

    if (rows[0].status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Booking is already cancelled",
      });
    }

    await db.query(
      `UPDATE bookings SET status = 'cancelled' WHERE id = ?`,
      [bookingId]
    );

    res.json({
      success: true,
      message: "Booking rejected successfully",
    });
  } catch (error) {
    console.error("REJECT BOOKING ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to reject booking",
      error: error.message,
    });
  }
});

// ==========================================
// GET SINGLE BOOKING (CUSTOMER)
// GET /api/bookings/:id
// ==========================================
router.get("/:id", async (req, res) => {
  try {
    const userId = req.user.id;
    const bookingId = req.params.id;

    const [bookings] = await db.query(
      `
      SELECT
        b.*,
        p.title AS property_title,
        p.location AS property_location
      FROM bookings b
      LEFT JOIN properties p ON b.property_id = p.id
      WHERE b.id = ? AND b.user_id = ?
      `,
      [bookingId, userId]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.json({
      success: true,
      booking: bookings[0],
    });
  } catch (error) {
    console.error("GET BOOKING ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to fetch booking",
      error: error.message,
    });
  }
});

// ==========================================
// CREATE BOOKING
// POST /api/bookings
// ==========================================
router.post("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const { property_id, check_in, check_out, total_amount } = req.body;

    if (!property_id || !check_in || !check_out || !total_amount) {
      return res.status(400).json({
        success: false,
        message: "property_id, check_in, check_out and total_amount are required",
      });
    }

    const startDate = new Date(check_in);
    const endDate = new Date(check_out);

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: "Check-out date must be after check-in date",
      });
    }

    const [property] = await db.query(
      `SELECT id FROM properties WHERE id = ?`,
      [property_id]
    );

    if (property.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property does not exist",
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO bookings
        (user_id, property_id, check_in, check_out, total_amount, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
      `,
      [userId, property_id, check_in, check_out, total_amount]
    );

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking_id: result.insertId,
      status: "pending",
    });
  } catch (error) {
    console.error("CREATE BOOKING ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to create booking",
      error: error.message,
    });
  }
});

// ==========================================
// CANCEL BOOKING (CUSTOMER)
// PATCH /api/bookings/:id/cancel
// ==========================================
router.patch("/:id/cancel", async (req, res) => {
  try {
    const userId = req.user.id;
    const bookingId = req.params.id;

    const [booking] = await db.query(
      `
      SELECT id, status
      FROM bookings
      WHERE id = ? AND user_id = ?
      `,
      [bookingId, userId]
    );

    if (booking.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    if (booking[0].status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Booking already cancelled",
      });
    }

    await db.query(
      `
      UPDATE bookings
      SET status = 'cancelled'
      WHERE id = ? AND user_id = ?
      `,
      [bookingId, userId]
    );

    res.json({
      success: true,
      message: "Booking cancelled successfully",
    });
  } catch (error) {
    console.error("CANCEL BOOKING ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to cancel booking",
      error: error.message,
    });
  }
});

module.exports = router;