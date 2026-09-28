const express = require("express");
const router = express.Router();
const pool = require("../db");

// You already have auth middleware somewhere – use the same one
const auth = require("../middleware/auth"); // adjust path if needed

/* =========================
   CREATE OFFER
========================= */
router.post("/", auth, async (req, res) => {
  try {
    const { property_id, offer_amount, message } = req.body;
    const user_id = req.user.id; // comes from the JWT middleware

    if (!property_id || !offer_amount) {
      return res.status(400).json({ error: "property_id and offer_amount are required" });
    }

    // Optional: check that the property exists and is for sale
    const [props] = await pool.query(
      "SELECT id, listing_type FROM properties WHERE id = ?",
      [property_id]
    );

    if (!props.length) {
      return res.status(404).json({ error: "Property not found" });
    }

    if (props[0].listing_type !== "sale") {
      return res.status(400).json({ error: "This property is not for sale" });
    }

    const [result] = await pool.query(
      `INSERT INTO offers (property_id, user_id, offer_amount, message)
       VALUES (?, ?, ?, ?)`,
      [property_id, user_id, offer_amount, message || null]
    );

    res.status(201).json({
      message: "Offer submitted successfully",
      id: result.insertId,
    });
  } catch (err) {
    console.error("CREATE offer error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   GET MY OFFERS (optional)
========================= */
router.get("/my", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, p.title, p.location, p.price
       FROM offers o
       JOIN properties p ON p.id = o.property_id
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET my offers error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;