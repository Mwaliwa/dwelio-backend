const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");

// ==========================================
// INITIALIZE PAYCHANGU PAYMENT
// POST /api/payments/initialize
// ==========================================
const initializePayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { booking_id } = req.body;

    if (!booking_id) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required",
      });
    }

    // GET BOOKING DETAILS
    const [bookings] = await db.query(
      `
      SELECT id, user_id, total_amount, status
      FROM bookings
      WHERE id = ?
      `,
      [booking_id]
    );

    if (bookings.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const booking = bookings[0];

    // Security check
    if (booking.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "You cannot pay for this booking",
      });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled booking cannot be paid",
      });
    }

    // GET USER DETAILS
    const [users] = await db.query(
      `SELECT name, email FROM users WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    // CHECK EXISTING PAYMENT
    const [existingPayment] = await db.query(
      `
      SELECT *
      FROM payments
      WHERE booking_id = ?
      AND status = 'successful'
      `,
      [booking_id]
    );

    if (existingPayment.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Booking already paid",
      });
    }

    // CREATE TRANSACTION REFERENCE
    const tx_ref = "DWELIO-" + uuidv4();

    // SAVE PAYMENT
    await db.query(
      `
      INSERT INTO payments
      (booking_id, user_id, tx_ref, amount, currency, status)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [booking_id, userId, tx_ref, booking.total_amount, "MWK", "pending"]
    );

    // PAYCHANGU REQUEST
    const response = await axios.post(
      "https://api.paychangu.com/payment",
      {
        amount: booking.total_amount,
        currency: "MWK",
        email: user.email,
        first_name: user.name,
        tx_ref,
        callback_url: `${process.env.BASE_URL}/api/webhook`,
        return_url: `${process.env.APP_URL}/payment-success`,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({
      success: true,
      message: "Payment initialized",
      tx_ref,
      checkout_url: response.data?.data?.checkout_url,
    });
  } catch (error) {
    console.error(
      "PAYMENT INITIALIZE ERROR:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to initialize payment",
    });
  }
};

// ==========================================
// VERIFY PAYMENT
// GET /api/payments/verify/:tx_ref
// ==========================================
const verifyPayment = async (req, res) => {
  try {
    const { tx_ref } = req.params;

    const response = await axios.get(
      `https://api.paychangu.com/verify-payment/${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
        },
      }
    );

    const payment = response.data.data;

    if (payment.status === "success") {
      await db.query(
        `
        UPDATE payments
        SET status = 'successful',
            paychangu_reference = ?,
            payment_method = ?
        WHERE tx_ref = ?
        `,
        [payment.reference, payment.payment_method, tx_ref]
      );

      const [booking] = await db.query(
        `SELECT booking_id FROM payments WHERE tx_ref = ?`,
        [tx_ref]
      );

      if (booking.length) {
        await db.query(
          `UPDATE bookings SET status = 'confirmed' WHERE id = ?`,
          [booking[0].booking_id]
        );
      }
    }

    return res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("VERIFY PAYMENT ERROR:", error.message);

    res.status(500).json({
      success: false,
      message: "Payment verification failed",
    });
  }
};

// ==========================================
// PAYMENT HISTORY
// GET /api/payments/history
// ==========================================
const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const [payments] = await db.query(
      `
      SELECT
        p.*,
        b.property_id,
        b.status AS booking_status
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.user_id = ?
      ORDER BY p.created_at DESC
      `,
      [userId]
    );

    res.json({
      success: true,
      payments,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Unable to load payment history",
    });
  }
};

module.exports = {
  initializePayment,
  verifyPayment,
  getPaymentHistory,
};