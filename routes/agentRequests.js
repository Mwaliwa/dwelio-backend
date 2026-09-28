const express = require("express");
const router = express.Router();
const db = require("../db");
const auth = require("../middleware/auth"); // must set req.user = { id, role, ... }

// =====================================================
// CUSTOMER: Submit request to become agent
// POST /api/agent-requests
// =====================================================
router.post("/", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { message } = req.body;

    const [users] = await db.query(
      "SELECT id, role FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    if (users[0].role === "agent" || users[0].role === "admin") {
      return res.status(400).json({
        success: false,
        error: "You are already an agent or admin",
      });
    }

    const [existing] = await db.query(
      `SELECT id FROM agent_requests
       WHERE user_id = ? AND status = 'pending'
       LIMIT 1`,
      [userId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: "You already have a pending request",
      });
    }

    const [result] = await db.query(
      `INSERT INTO agent_requests (user_id, message, status)
       VALUES (?, ?, 'pending')`,
      [userId, message ? String(message).trim() : null]
    );

    const [rows] = await db.query(
      `SELECT id, message, status, admin_note, created_at, updated_at
       FROM agent_requests
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: "Your request to become an agent has been submitted",
      request: rows[0] || null,
    });
  } catch (err) {
    console.error("Agent request error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

// =====================================================
// CUSTOMER: Check my request status
// GET /api/agent-requests/me
// =====================================================
router.get("/me", auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, message, status, admin_note, created_at, updated_at
       FROM agent_requests
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.id]
    );

    return res.json({
      success: true,
      request: rows[0] || null,
    });
  } catch (err) {
    console.error("Get my agent request error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

// =====================================================
// ADMIN: Get all agent requests
// GET /api/agent-requests/admin
// (If you prefer /api/admin/agent-requests, mount this under adminRoutes instead)
// =====================================================
router.get("/admin", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Admin only",
      });
    }

    const { status } = req.query;

    let query = `
      SELECT 
        ar.id,
        ar.message,
        ar.status,
        ar.admin_note,
        ar.created_at,
        ar.updated_at,
        u.id AS user_id,
        u.name,
        u.email,
        u.phone
      FROM agent_requests ar
      JOIN users u ON u.id = ar.user_id
    `;
    const params = [];

    if (status) {
      query += " WHERE ar.status = ?";
      params.push(status);
    }

    query += " ORDER BY ar.created_at DESC";

    const [rows] = await db.query(query, params);

    return res.json({
      success: true,
      requests: rows,
    });
  } catch (err) {
    console.error("Admin list agent requests error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

// =====================================================
// ADMIN: Approve or Reject request
// PATCH /api/agent-requests/admin/:id
// =====================================================
router.patch("/admin/:id", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Admin only",
      });
    }

    const { id } = req.params;
    const { status, admin_note } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Status must be 'approved' or 'rejected'",
      });
    }

    const [requests] = await db.query(
      `SELECT * FROM agent_requests WHERE id = ? LIMIT 1`,
      [id]
    );

    if (!requests.length) {
      return res.status(404).json({
        success: false,
        error: "Request not found",
      });
    }

    const request = requests[0];

    if (request.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: "This request has already been reviewed",
      });
    }

    // Update request (works even if reviewed_by column is missing — adjust if needed)
    await db.query(
      `UPDATE agent_requests
       SET status = ?,
           admin_note = ?,
           reviewed_by = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, admin_note || null, req.user.id, id]
    );

    if (status === "approved") {
      await db.query(`UPDATE users SET role = 'agent' WHERE id = ?`, [
        request.user_id,
      ]);
    }

    return res.json({
      success: true,
      message: `Request ${status} successfully`,
    });
  } catch (err) {
    console.error("Admin review agent request error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

module.exports = router;