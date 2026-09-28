const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../db");

/*
=========================================================
GET /api/reviews
Get all reviews (public)
=========================================================
*/
router.get("/", async (req, res) => {
  try {
    const [reviews] = await db.query(
      `
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        u.id AS user_id,
        u.name AS user_name,
        p.id AS property_id,
        p.title AS property_title,
        p.image AS property_image
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN properties p ON r.property_id = p.id
      ORDER BY r.created_at DESC
      `
    );

    res.json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (err) {
    console.error("GET ALL REVIEWS error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch reviews",
    });
  }
});

/*
=========================================================
GET /api/reviews/property/:propertyId
Get all reviews for a specific property (public)
=========================================================
*/
router.get("/property/:propertyId", async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);

    if (!propertyId || isNaN(propertyId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid property ID",
      });
    }

    const [reviews] = await db.query(
      `
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        u.id AS user_id,
        u.name AS user_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.property_id = ?
      ORDER BY r.created_at DESC
      `,
      [propertyId]
    );

    // Optional: also return average rating
    const [avg] = await db.query(
      "SELECT ROUND(AVG(rating), 1) AS average_rating, COUNT(*) AS total_reviews FROM reviews WHERE property_id = ?",
      [propertyId]
    );

    res.json({
      success: true,
      count: reviews.length,
      average_rating: avg[0].average_rating || 0,
      total_reviews: avg[0].total_reviews,
      data: reviews,
    });
  } catch (err) {
    console.error("GET PROPERTY REVIEWS error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch property reviews",
    });
  }
});

/*
=========================================================
GET /api/reviews/user/:userId
Get all reviews written by a user
=========================================================
*/
router.get("/user/:userId", auth, async (req, res) => {
  try {
    const requestedUserId = Number(req.params.userId);
    const authenticatedUserId = Number(req.user.id);
    const role = String(req.user.role || "").toLowerCase();

    if (role !== "admin" && requestedUserId !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        error: "You can only access your own reviews",
      });
    }

    const [reviews] = await db.query(
      `
      SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        p.id AS property_id,
        p.title AS property_title,
        p.image AS property_image,
        p.location
      FROM reviews r
      JOIN properties p ON r.property_id = p.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
      `,
      [requestedUserId]
    );

    res.json({
      success: true,
      count: reviews.length,
      data: reviews,
    });
  } catch (err) {
    console.error("GET USER REVIEWS error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user reviews",
    });
  }
});

/*
=========================================================
POST /api/reviews
Create a new review
Body: { property_id, rating, comment }
=========================================================
*/
router.post("/", auth, async (req, res) => {
  try {
    const { property_id, rating, comment } = req.body;
    const userId = req.user.id;

    if (!property_id || !rating) {
      return res.status(400).json({
        success: false,
        error: "property_id and rating are required",
      });
    }

    const numericRating = Number(rating);
    if (isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        error: "Rating must be a number between 1 and 5",
      });
    }

    // Check if property exists
    const [property] = await db.query(
      "SELECT id FROM properties WHERE id = ?",
      [property_id]
    );

    if (property.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Property not found",
      });
    }

    // Prevent duplicate reviews from the same user on the same property
    const [existing] = await db.query(
      "SELECT id FROM reviews WHERE user_id = ? AND property_id = ?",
      [userId, property_id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: "You have already reviewed this property",
      });
    }

    const [result] = await db.query(
      `INSERT INTO reviews (user_id, property_id, rating, comment)
       VALUES (?, ?, ?, ?)`,
      [userId, property_id, numericRating, comment || null]
    );

    res.status(201).json({
      success: true,
      message: "Review created successfully",
      review_id: result.insertId,
    });
  } catch (err) {
    console.error("CREATE REVIEW error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to create review",
    });
  }
});

/*
=========================================================
DELETE /api/reviews/:id
Delete a review (owner or admin only)
=========================================================
*/
router.delete("/:id", auth, async (req, res) => {
  try {
    const reviewId = Number(req.params.id);
    const userId = req.user.id;
    const role = String(req.user.role || "").toLowerCase();

    if (!reviewId || isNaN(reviewId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid review ID",
      });
    }

    // Check ownership
    const [review] = await db.query(
      "SELECT user_id FROM reviews WHERE id = ?",
      [reviewId]
    );

    if (review.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Review not found",
      });
    }

    if (role !== "admin" && Number(review[0].user_id) !== Number(userId)) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own reviews",
      });
    }

    await db.query("DELETE FROM reviews WHERE id = ?", [reviewId]);

    res.json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (err) {
    console.error("DELETE REVIEW error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to delete review",
    });
  }
});

module.exports = router;