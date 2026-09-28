const db = require("../db");

/* =========================
   GET REVIEWS BY USER
========================= */
const getUserReviews = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || userId === "null" || userId === "undefined") {
      return res.status(400).json([]);
    }

    const [rows] = await db.query(
      `
      SELECT 
        r.id, r.rating, r.comment, r.created_at, r.property_id,
        p.title AS property_title
      FROM reviews r
      JOIN properties p ON r.property_id = p.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
      `,
      [userId]
    );

    return res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error("GET user reviews error:", err);
    return res.status(500).json({ error: "Failed to fetch user reviews" });
  }
};

/* =========================
   GET REVIEWS BY PROPERTY
========================= */
const getPropertyReviews = async (req, res) => {
  try {
    const { id: propertyId } = req.params;

    if (!propertyId || propertyId === "null" || propertyId === "undefined") {
      return res.status(400).json([]);
    }

    const [rows] = await db.query(
      `
      SELECT 
        r.id, r.rating, r.comment, r.created_at,
        u.name AS user_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.property_id = ?
      ORDER BY r.created_at DESC
      `,
      [propertyId]
    );

    return res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    console.error("GET property reviews error:", err);
    return res.status(500).json({ error: "Failed to fetch property reviews" });
  }
};

/* =========================
   CREATE REVIEW (FIXED)
========================= */
const createReview = async (req, res) => {
  try {
    const { property_id, rating, comment } = req.body;
    const user_id = req.user?.id;   // Must come from JWT middleware

    // Better error messages
    if (!user_id) {
      return res.status(401).json({ error: "Authentication required. Please log in again." });
    }

    if (!property_id || !rating) {
      return res.status(400).json({ 
        error: "Missing required fields: property_id and rating" 
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // Check for duplicate review
    const [existing] = await db.query(
      "SELECT id FROM reviews WHERE property_id = ? AND user_id = ?",
      [property_id, user_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "You have already reviewed this property" });
    }

    const [result] = await db.query(
      `
      INSERT INTO reviews (user_id, property_id, rating, comment)
      VALUES (?, ?, ?, ?)
      `,
      [user_id, property_id, rating, comment || ""]
    );

    return res.status(201).json({
      message: "Review created successfully",
      reviewId: result.insertId
    });
  } catch (err) {
    console.error("CREATE review error:", err);
    return res.status(500).json({ error: "Failed to create review" });
  }
};

/* =========================
   DELETE REVIEW
========================= */
const deleteReview = async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const user_id = req.user?.id;

    if (!reviewId) {
      return res.status(400).json({ error: "Review ID is required" });
    }

    if (!user_id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Verify ownership
    const [review] = await db.query(
      "SELECT user_id FROM reviews WHERE id = ?",
      [reviewId]
    );

    if (review.length === 0) {
      return res.status(404).json({ error: "Review not found" });
    }

    if (review[0].user_id !== parseInt(user_id)) {
      return res.status(403).json({ error: "You can only delete your own reviews" });
    }

    await db.query("DELETE FROM reviews WHERE id = ?", [reviewId]);

    return res.json({ message: "Review deleted successfully" });
  } catch (err) {
    console.error("DELETE review error:", err);
    return res.status(500).json({ error: "Failed to delete review" });
  }
};

module.exports = {
  getUserReviews,
  getPropertyReviews,
  createReview,
  deleteReview,
};