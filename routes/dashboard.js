const express = require("express");
const router = express.Router();
const pool = require("../db");
const jwt = require("jsonwebtoken");

/* =========================================================
   AUTH MIDDLEWARE (recommended)
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
        error: "Invalid token",
      });
    }

    // Optional: only allow admin
    if (decoded.role && decoded.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admins only.",
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
   GET /api/admin/stats   (or /api/stats depending on how you mount it)
========================================================= */

router.get("/stats", auth, async (req, res) => {
  try {
    // Run the three counts in parallel for better performance
    const [userResult, propertyResult, agentResult] = await Promise.all([
      pool.query("SELECT COUNT(*) AS count FROM users"),
      pool.query("SELECT COUNT(*) AS count FROM properties"),
      pool.query("SELECT COUNT(*) AS count FROM agents"),
    ]);

    const users = Number(userResult[0][0]?.count) || 0;
    const properties = Number(propertyResult[0][0]?.count) || 0;
    const agents = Number(agentResult[0][0]?.count) || 0;

    return res.json({
      success: true,
      stats: {
        users,
        properties,
        agents,
      },
      // Also return flat keys for backward compatibility with older frontend
      users,
      properties,
      agents,
    });
  } catch (err) {
    console.error("STATS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to load dashboard stats",
      error: err.message,
    });
  }
});

module.exports = router;