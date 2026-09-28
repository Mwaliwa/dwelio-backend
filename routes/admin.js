const express = require("express");
const router = express.Router();
const db = require("../db");
const auth = require("../middleware/auth");

// =====================================================
// Middleware: Admin only
// =====================================================
const adminOnly = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Admin access only",
    });
  }
  next();
};

// =====================================================
// DASHBOARD STATS
// GET /api/admin/stats
// =====================================================
router.get("/stats", auth, adminOnly, async (req, res) => {
  try {
    const [[users]] = await db.query(
      "SELECT COUNT(*) AS total FROM users"
    );
    const [[agents]] = await db.query(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'agent'"
    );
    const [[customers]] = await db.query(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'customer'"
    );
    const [[properties]] = await db.query(
      "SELECT COUNT(*) AS total FROM properties"
    );
    const [[bookings]] = await db.query(
      "SELECT COUNT(*) AS total FROM bookings"
    );
    const [[pendingRequests]] = await db.query(
      "SELECT COUNT(*) AS total FROM agent_requests WHERE status = 'pending'"
    );

    res.json({
      success: true,
      stats: {
        totalUsers: users.total,
        totalAgents: agents.total,
        totalCustomers: customers.total,
        totalProperties: properties.total,
        totalBookings: bookings.total,
        pendingAgentRequests: pendingRequests.total,
      },
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================
// LIST ALL AGENTS
// GET /api/admin/agents
// =====================================================
router.get("/agents", auth, adminOnly, async (req, res) => {
  try {
    const [agents] = await db.query(
      `SELECT id, name, email, role, created_at 
       FROM users 
       WHERE role = 'agent' 
       ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      agents,
    });
  } catch (err) {
    console.error("List agents error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================
// DEMOTE AGENT → CUSTOMER
// PATCH /api/admin/agents/:id/demote
// =====================================================
router.patch("/agents/:id/demote", auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      "UPDATE users SET role = 'customer' WHERE id = ? AND role = 'agent'",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "Agent not found",
      });
    }

    res.json({
      success: true,
      message: "Agent successfully demoted to customer",
    });
  } catch (err) {
    console.error("Demote agent error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================
// LIST ALL USERS (optional but useful)
// GET /api/admin/users
// =====================================================
router.get("/users", auth, adminOnly, async (req, res) => {
  try {
    const { role } = req.query;

    let query = `SELECT id, name, email, role, created_at FROM users`;
    const params = [];

    if (role) {
      query += ` WHERE role = ?`;
      params.push(role);
    }

    query += ` ORDER BY created_at DESC`;

    const [users] = await db.query(query, params);

    res.json({
      success: true,
      users,
    });
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// =====================================================
// CHANGE USER ROLE (optional)
// PATCH /api/admin/users/:id/role
// =====================================================
router.patch("/users/:id/role", auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!["customer", "agent", "admin"].includes(role)) {
      return res.status(400).json({
        success: false,
        error: "Invalid role",
      });
    }

    // Prevent changing your own role
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        success: false,
        error: "You cannot change your own role",
      });
    }

    const [result] = await db.query(
      "UPDATE users SET role = ? WHERE id = ?",
      [role, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.json({
      success: true,
      message: `User role updated to ${role}`,
    });
  } catch (err) {
    console.error("Change role error:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;