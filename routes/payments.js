const express = require("express");
const router = express.Router();

const {
  initializePayment,
  verifyPayment,
  getPaymentHistory,
} = require("../controllers/payments");

const auth = require("../middleware/auth");
const db = require("../db");

// Protect all payment routes
router.use(auth);

// ==========================================
// HELPER
// ==========================================
const isAgent = (user) =>
  user.role === "agent" || user.role === "landlord";

// ==========================================
// Initialize payment (customer)
// POST /api/payments/initialize
// ==========================================
router.post("/initialize", initializePayment);

// ==========================================
// Verify payment
// GET /api/payments/verify/:tx_ref
// ==========================================
router.get("/verify/:tx_ref", verifyPayment);

// ==========================================
// Payment history (customer)
// GET /api/payments/history
// ==========================================
router.get("/history", getPaymentHistory);

// ==========================================
// AGENT: GET PAYMENTS ON MY PROPERTIES
// GET /api/payments/agent
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

    const [payments] = await db.query(
      `
      SELECT 
        pay.id,
        pay.booking_id,
        pay.user_id,
        pay.tx_ref,
        pay.paychangu_reference,
        pay.amount,
        pay.currency,
        pay.payment_method,
        pay.status,
        pay.created_at,

        p.title AS property_title,
        p.location AS property_location,

        u.name AS customer_name,
        u.phone AS customer_phone,
        u.email AS customer_email

      FROM payments pay

      INNER JOIN bookings b 
        ON pay.booking_id = b.id

      INNER JOIN properties p 
        ON b.property_id = p.id

      LEFT JOIN users u 
        ON pay.user_id = u.id

      WHERE p.user_id = ?

      ORDER BY pay.created_at DESC
      `,
      [agentId]
    );

    const formatted = payments.map((row) => ({
      id: row.id,
      booking_id: row.booking_id,
      amount: Number(row.amount),
      currency: row.currency || "MWK",
      status: row.status === "successful" ? "completed" : row.status,
      type: "Rental Payment",
      property_title: row.property_title,
      property_location: row.property_location,
      customer_name: row.customer_name,
      client_name: row.customer_name,
      customer_phone: row.customer_phone,
      method: row.payment_method
        ? `PayChangu (${row.payment_method})`
        : "PayChangu",
      reference: row.paychangu_reference || row.tx_ref,
      tx_ref: row.tx_ref,
      date: row.created_at,
      created_at: row.created_at,
    }));

    res.json({
      success: true,
      payments: formatted,
    });
  } catch (error) {
    console.error("AGENT PAYMENTS ERROR:", error.message);
    res.status(500).json({
      success: false,
      message: "Unable to fetch agent payments",
      error: error.message,
    });
  }
});

module.exports = router;