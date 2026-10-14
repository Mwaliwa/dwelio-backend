const express = require("express");
const router = express.Router();

const db = require("../db");
const auth = require("../middleware/auth");

console.log(">>> agentRequests.js LOADED SUCCESSFULLY");

// =====================================================
// ADMIN AUTHORIZATION
// =====================================================
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      error: "Admin access required",
    });
  }
  next();
};

// =====================================================
// CUSTOMER: GET MY LATEST AGENT REQUEST
// GET /api/agent-requests/me
// =====================================================
router.get("/me", auth, async (req, res) => {
  console.log(">>> HIT /api/agent-requests/me HANDLER");
  try {
    const [requests] = await db.query(
      `
      SELECT
        id,
        user_id,
        full_name,
        phone,
        email,
        national_id,
        date_of_birth,
        gender,
        address,
        city,
        occupation,
        experience,
        company_name,
        license_number,
        property_types,
        operating_areas,
        message,
        status,
        admin_note,
        created_at,
        updated_at
      FROM agent_requests
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [req.user.id]
    );

    return res.status(200).json({
      success: true,
      request: requests.length ? requests[0] : null,
    });
  } catch (err) {
    console.error("GET /agent-requests/me error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch your agent application",
    });
  }
});

// =====================================================
// CUSTOMER: SUBMIT AGENT APPLICATION
// POST /api/agent-requests
// =====================================================
router.post("/", auth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({
        success: false,
        error: "Only customer accounts can apply to become agents",
      });
    }

    const {
      full_name,
      phone,
      email,
      national_id,
      date_of_birth,
      gender,
      address,
      city,
      occupation,
      experience,
      company_name,
      license_number,
      property_types,
      operating_areas,
      message,
    } = req.body;

    const requiredFields = {
      full_name,
      phone,
      email,
      national_id,
      date_of_birth,
      gender,
      address,
      city,
      occupation,
      experience,
      property_types,
      operating_areas,
      message,
    };

    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value || String(value).trim() === "") {
        return res.status(400).json({
          success: false,
          error: `${field.replace(/_/g, " ")} is required`,
        });
      }
    }

    const [pendingRequests] = await db.query(
      `
      SELECT id, status
      FROM agent_requests
      WHERE user_id = ?
        AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [req.user.id]
    );

    if (pendingRequests.length > 0) {
      return res.status(409).json({
        success: false,
        error: "You already have a pending agent application",
        request: pendingRequests[0],
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO agent_requests (
        user_id,
        full_name,
        phone,
        email,
        national_id,
        date_of_birth,
        gender,
        address,
        city,
        occupation,
        experience,
        company_name,
        license_number,
        property_types,
        operating_areas,
        message,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        'pending',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      `,
      [
        req.user.id,
        String(full_name).trim(),
        String(phone).trim(),
        String(email).trim().toLowerCase(),
        String(national_id).trim(),
        date_of_birth,
        String(gender).trim(),
        String(address).trim(),
        String(city).trim(),
        String(occupation).trim(),
        String(experience).trim(),
        company_name ? String(company_name).trim() : null,
        license_number ? String(license_number).trim() : null,
        String(property_types).trim(),
        String(operating_areas).trim(),
        String(message).trim(),
      ]
    );

    const [createdRequests] = await db.query(
      `
      SELECT
        id,
        user_id,
        full_name,
        phone,
        email,
        national_id,
        date_of_birth,
        gender,
        address,
        city,
        occupation,
        experience,
        company_name,
        license_number,
        property_types,
        operating_areas,
        message,
        status,
        admin_note,
        created_at,
        updated_at
      FROM agent_requests
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      message: "Agent application submitted successfully",
      request: createdRequests[0] || null,
    });
  } catch (err) {
    console.error("POST /agent-requests error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to submit agent application",
    });
  }
});

// =====================================================
// ADMIN: GET AGENT REQUESTS
// GET /api/agent-requests/admin?status=pending
// =====================================================
router.get("/admin", auth, adminOnly, async (req, res) => {
  try {
    const requestedStatus = String(req.query.status || "pending")
      .trim()
      .toLowerCase();

    const allowedStatuses = ["pending", "approved", "rejected", "all"];

    if (!allowedStatuses.includes(requestedStatus)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status filter",
        allowedStatuses,
      });
    }

    let sql = `
      SELECT
        ar.id,
        ar.user_id,
        ar.full_name,
        ar.phone,
        ar.email,
        ar.national_id,
        ar.date_of_birth,
        ar.gender,
        ar.address,
        ar.city,
        ar.occupation,
        ar.experience,
        ar.company_name,
        ar.license_number,
        ar.property_types,
        ar.operating_areas,
        ar.message,
        ar.status,
        ar.admin_note,
        ar.reviewed_by,
        ar.created_at,
        ar.updated_at,
        COALESCE(u.name, ar.full_name, 'Unknown User') AS user_name
      FROM agent_requests ar
      LEFT JOIN users u
        ON u.id = ar.user_id
    `;

    const params = [];

    if (requestedStatus !== "all") {
      sql += ` WHERE ar.status = ?`;
      params.push(requestedStatus);
    }

    sql += ` ORDER BY ar.created_at DESC`;

    const [requests] = await db.query(sql, params);

    return res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (err) {
    console.error("GET /agent-requests/admin error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch agent requests",
    });
  }
});

// =====================================================
// ADMIN: APPROVE / REJECT AGENT APPLICATION
// PATCH /api/agent-requests/admin/:id
// =====================================================
router.patch("/admin/:id", auth, adminOnly, async (req, res) => {
  let connection;

  try {
    const requestId = Number(req.params.id);
    const status = String(req.body.status || "").trim().toLowerCase();
    const adminNote =
      typeof req.body.admin_note === "string"
        ? req.body.admin_note.trim()
        : null;

    if (!Number.isInteger(requestId) || requestId <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid request ID",
      });
    }

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Status must be approved or rejected",
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [requests] = await connection.query(
      `
      SELECT *
      FROM agent_requests
      WHERE id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [requestId]
    );

    if (!requests.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: "Agent request not found",
      });
    }

    const request = requests[0];

    if (request.status !== "pending") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        error: "This request has already been reviewed",
      });
    }

    let agentCode = null;

    if (status === "approved") {
      const [users] = await connection.query(
        `
        SELECT id, role, agent_code
        FROM users
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
        `,
        [request.user_id]
      );

      if (!users.length) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          error: "Applicant user account not found",
        });
      }

      const [codes] = await connection.query(
        `
        SELECT agent_code
        FROM users
        WHERE agent_code IS NOT NULL
          AND agent_code LIKE 'MALO-AG-%'
        ORDER BY agent_code DESC
        LIMIT 1
        `
      );

      let nextNumber = 1;
      if (codes.length) {
        const lastCode = codes[0].agent_code;
        const match = /^MALO-AG-(\d+)$/.exec(lastCode);
        if (match) {
          nextNumber = Number(match[1]) + 1;
        }
      }

      agentCode = `MALO-AG-${String(nextNumber).padStart(4, "0")}`;

      const [updateUser] = await connection.query(
        `
        UPDATE users
        SET
          role = 'agent',
          agent_code = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [agentCode, request.user_id]
      );

      if (updateUser.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          error: "Applicant user account could not be updated",
        });
      }
    }

    const [updateRequest] = await connection.query(
      `
      UPDATE agent_requests
      SET
        status = ?,
        admin_note = ?,
        reviewed_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND status = 'pending'
      `,
      [status, adminNote || null, req.user.id, requestId]
    );

    if (updateRequest.affectedRows === 0) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        error: "This request has already been reviewed",
      });
    }

    await connection.commit();

    return res.status(200).json({
      success: true,
      message:
        status === "approved"
          ? "Agent application approved successfully"
          : "Agent application rejected successfully",
      request_id: requestId,
      status,
      agent_code: agentCode,
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Agent request rollback error:", rollbackError);
      }
    }

    console.error("PATCH /agent-requests/admin/:id error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to process agent request",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

module.exports = router;