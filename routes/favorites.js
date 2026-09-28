const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const db = require("../db");

/*
=========================================================
GET /api/favorites
Get all favorites of the logged-in user
=========================================================
*/
router.get("/", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [favorites] = await db.query(
      `
      SELECT 
        f.id AS favorite_id,
        f.created_at AS favorited_at,
        p.id,
        p.title,
        p.location,
        p.price,
        p.listing_type,
        p.image,
        p.property_type,
        p.size_value,
        p.status
      FROM favorites f
      JOIN properties p ON f.property_id = p.id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
      `,
      [userId]
    );

    res.json({
      success: true,
      count: favorites.length,
      data: favorites,
    });
  } catch (err) {
    console.error("GET favorites error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch favorites",
    });
  }
});

/*
=========================================================
GET /api/favorites/count/:userId
=========================================================
*/
router.get("/count/:userId", auth, async (req, res) => {
  try {
    const requestedUserId = Number(req.params.userId);
    const authenticatedUserId = Number(req.user.id);
    const role = String(req.user.role || "").toLowerCase();

    if (role !== "admin" && requestedUserId !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        error: "You can only access your own favorites count",
      });
    }

    const [rows] = await db.query(
      "SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?",
      [requestedUserId]
    );

    res.json({
      success: true,
      count: rows[0].count,
    });
  } catch (err) {
    console.error("FAVORITES COUNT error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to get favorites count",
    });
  }
});

/*
=========================================================
GET /api/favorites/check/:propertyId
Check if a property is favorited by the current user
=========================================================
*/
router.get("/check/:propertyId", auth, async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    const userId = req.user.id;

    if (!propertyId || isNaN(propertyId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid property ID",
      });
    }

    const [rows] = await db.query(
      "SELECT id FROM favorites WHERE user_id = ? AND property_id = ?",
      [userId, propertyId]
    );

    res.json({
      success: true,
      isFavorite: rows.length > 0,
    });
  } catch (err) {
    console.error("CHECK favorite error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to check favorite",
    });
  }
});

/*
=========================================================
POST /api/favorites
Add a property to favorites
Body: { property_id }
=========================================================
*/
router.post("/", auth, async (req, res) => {
  try {
    const { property_id } = req.body;
    const userId = req.user.id;

    if (!property_id) {
      return res.status(400).json({
        success: false,
        error: "property_id is required",
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

    // Check if already favorited
    const [existing] = await db.query(
      "SELECT id FROM favorites WHERE user_id = ? AND property_id = ?",
      [userId, property_id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Property is already in your favorites",
      });
    }

    const [result] = await db.query(
      "INSERT INTO favorites (user_id, property_id) VALUES (?, ?)",
      [userId, property_id]
    );

    res.status(201).json({
      success: true,
      message: "Added to favorites",
      favorite_id: result.insertId,
    });
  } catch (err) {
    console.error("ADD favorite error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to add favorite",
    });
  }
});

/*
=========================================================
DELETE /api/favorites/:propertyId
Remove a property from favorites
=========================================================
*/
router.delete("/:propertyId", auth, async (req, res) => {
  try {
    const propertyId = Number(req.params.propertyId);
    const userId = req.user.id;

    if (!propertyId || isNaN(propertyId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid property ID",
      });
    }

    const [result] = await db.query(
      "DELETE FROM favorites WHERE user_id = ? AND property_id = ?",
      [userId, propertyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "Favorite not found",
      });
    }

    res.json({
      success: true,
      message: "Removed from favorites",
    });
  } catch (err) {
    console.error("REMOVE favorite error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to remove favorite",
    });
  }
});

module.exports = router;