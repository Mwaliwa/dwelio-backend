// routes/chat.js  (or wherever this lives)

const express = require("express");
const router = express.Router();

const db = require("../db");
const authenticateToken = require("../middleware/auth");

/* =========================================================
   HELPERS
========================================================= */

function sendServerError(res, message, error) {
  console.error("========================================");
  console.error(message);
  console.error(error);
  console.error("========================================");

  return res.status(500).json({
    success: false,
    error: "Server error",
    message,
    details:
      process.env.NODE_ENV === "development"
        ? error?.message
        : undefined,
  });
}

function getUserId(req) {
  return Number(req.user?.id);
}

function getUserRole(req) {
  return String(req.user?.role || "").toLowerCase();
}

/**
 * Normalize a conversation row so the frontend always receives
 * a consistent shape (especially unread_count + property_name).
 */
function mapConversation(row, role) {
  if (!row) return null;

  const isCustomer = role === "customer";

  return {
    id: row.id,
    property_id: row.property_id,
    property_name: row.property_title || row.property_name || "Property",
    property_title: row.property_title || row.property_name || "Property",

    agent_id: row.agent_id,
    agent_name: row.agent_name || "Property Agent",

    customer_id: row.customer_id,
    customer_name: row.customer_name || "Customer",

    last_message: row.last_message || null,
    last_message_at: row.last_message_at || null,
    last_message_sender_id: row.last_message_sender_id || null,

    // Frontend expects a single unread_count field
    unread_count: isCustomer
      ? Number(row.unread_by_customer || 0)
      : Number(row.unread_by_agent || 0),

    // Keep the raw counters as well (useful for debugging / other clients)
    unread_by_customer: Number(row.unread_by_customer || 0),
    unread_by_agent: Number(row.unread_by_agent || 0),

    status: row.status || "active",
    avatar: row.avatar || null, // populated if you join users later

    created_at: row.created_at,
    updated_at: row.updated_at,

    // Convenience field used by some UIs
    other_user_name: isCustomer
      ? row.agent_name
      : row.customer_name,
  };
}

/* =========================================================
   START CHAT
   POST /api/chat/start
========================================================= */

router.post("/start", authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const userName = req.user?.name || "Customer";
    const role = getUserRole(req);

    const { property_id } = req.body || {};

    if (!userId || !Number.isInteger(userId)) {
      return res.status(401).json({
        success: false,
        error: "Invalid authenticated user.",
      });
    }

    // Only customers should normally start chats
    if (role && role !== "customer") {
      return res.status(403).json({
        success: false,
        error: "Only customers can start a conversation from a property.",
      });
    }

    if (property_id === undefined || property_id === null || property_id === "") {
      return res.status(400).json({
        success: false,
        error: "property_id is required",
      });
    }

    const propertyId = Number(property_id);

    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({
        success: false,
        error: "property_id must be a valid positive number",
      });
    }

    // ---------- Get property ----------
    const [properties] = await db.query(
      `
      SELECT id, title, user_id
      FROM properties
      WHERE id = ?
      LIMIT 1
      `,
      [propertyId]
    );

    if (!properties?.length) {
      return res.status(404).json({
        success: false,
        error: "Property not found",
      });
    }

    const property = properties[0];
    const agentId = Number(property.user_id);

    if (!Number.isInteger(agentId) || agentId <= 0) {
      return res.status(400).json({
        success: false,
        error: "This property has no valid assigned agent.",
      });
    }

    // Prevent chatting with yourself
    if (agentId === userId) {
      return res.status(400).json({
        success: false,
        error: "You cannot start a chat with yourself.",
      });
    }

    // ---------- Get agent ----------
    const [agents] = await db.query(
      `
      SELECT id, name, role
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [agentId]
    );

    if (!agents?.length) {
      return res.status(404).json({
        success: false,
        error: "The agent assigned to this property could not be found.",
      });
    }

    const agent = agents[0];
    const agentName = agent.name || "Agent";

    // ---------- Check existing conversation ----------
    const [existing] = await db.query(
      `
      SELECT *
      FROM conversations
      WHERE property_id = ?
        AND customer_id = ?
        AND agent_id = ?
      LIMIT 1
      `,
      [propertyId, userId, agentId]
    );

    if (existing?.length) {
      const conversation = mapConversation(existing[0], "customer");

      return res.status(200).json({
        success: true,
        message: "Conversation already exists.",
        conversation,
        id: conversation.id,
        conversationId: conversation.id,
      });
    }

    // ---------- Create new conversation ----------
    const [result] = await db.query(
      `
      INSERT INTO conversations
        (property_id, property_title, customer_id, customer_name,
         agent_id, agent_name, unread_by_customer, unread_by_agent,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, NOW(), NOW())
      `,
      [
        propertyId,
        property.title || "Property",
        userId,
        userName,
        agentId,
        agentName,
      ]
    );

    const newConversationId = Number(result.insertId);

    if (!newConversationId || newConversationId <= 0) {
      throw new Error("Conversation was not created correctly.");
    }

    const [newRows] = await db.query(
      `SELECT * FROM conversations WHERE id = ? LIMIT 1`,
      [newConversationId]
    );

    if (!newRows?.length) {
      throw new Error("Conversation was created but could not be retrieved.");
    }

    const conversation = mapConversation(newRows[0], "customer");

    return res.status(201).json({
      success: true,
      message: "Conversation started successfully.",
      conversation,
      id: conversation.id,
      conversationId: conversation.id,
    });
  } catch (err) {
    return sendServerError(res, "Error starting chat", err);
  }
});

/* =========================================================
   GET ALL CONVERSATIONS
   GET /api/chat
   GET /api/chat/conversations   (kept for backward compatibility)
========================================================= */

async function handleGetConversations(req, res) {
  try {
    const userId = getUserId(req);
    const role = getUserRole(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Invalid authenticated user.",
      });
    }

    let query;
    let params;

    if (role === "customer") {
      query = `
        SELECT c.*
        FROM conversations c
        WHERE c.customer_id = ?
        ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC
      `;
      params = [userId];
    } else {
      // agent / landlord / admin viewing as agent
      query = `
        SELECT c.*
        FROM conversations c
        WHERE c.agent_id = ?
        ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC
      `;
      params = [userId];
    }

    const [rows] = await db.query(query, params);

    const conversations = (rows || []).map((row) =>
      mapConversation(row, role)
    );

    return res.json({
      success: true,
      conversations,
      // also expose as array for clients that expect a raw list
      data: conversations,
    });
  } catch (err) {
    return sendServerError(res, "Error fetching conversations", err);
  }
}

// Primary endpoint used by the polished CustomerChat frontend
router.get("/", authenticateToken, handleGetConversations);

// Keep the old path working
router.get("/conversations", authenticateToken, handleGetConversations);

/* =========================================================
   GET MESSAGES
   GET /api/chat/messages/:conversationId
========================================================= */

router.get(
  "/messages/:conversationId",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const conversationId = Number(req.params.conversationId);

      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid conversation ID.",
        });
      }

      // Access check
      const [conversation] = await db.query(
        `
        SELECT id, customer_id, agent_id
        FROM conversations
        WHERE id = ?
          AND (customer_id = ? OR agent_id = ?)
        LIMIT 1
        `,
        [conversationId, userId, userId]
      );

      if (!conversation?.length) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const [messages] = await db.query(
        `
        SELECT
          id,
          conversation_id,
          sender_id,
          text,
          is_read,
          created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC, id ASC
        `,
        [conversationId]
      );

      return res.json({
        success: true,
        messages: messages || [],
      });
    } catch (err) {
      return sendServerError(res, "Error fetching messages", err);
    }
  }
);

/* =========================================================
   SEND MESSAGE
   POST /api/chat/messages
========================================================= */

router.post("/messages", authenticateToken, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { conversation_id, text } = req.body || {};

    const conversationId = Number(conversation_id);
    const message = typeof text === "string" ? text.trim() : "";

    if (!Number.isInteger(conversationId) || conversationId <= 0) {
      return res.status(400).json({
        success: false,
        error: "conversation_id is required and must be valid.",
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message text is required.",
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        error: "Message cannot exceed 5000 characters.",
      });
    }

    // Access check
    const [conversation] = await db.query(
      `
      SELECT id, customer_id, agent_id
      FROM conversations
      WHERE id = ?
        AND (customer_id = ? OR agent_id = ?)
      LIMIT 1
      `,
      [conversationId, userId, userId]
    );

    if (!conversation?.length) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    const conversationData = conversation[0];
    const isCustomer = Number(conversationData.customer_id) === userId;

    // Insert message
    const [result] = await db.query(
      `
      INSERT INTO messages
        (conversation_id, sender_id, text, is_read, created_at)
      VALUES (?, ?, ?, FALSE, NOW())
      `,
      [conversationId, userId, message]
    );

    // Update conversation + unread counters
    if (isCustomer) {
      await db.query(
        `
        UPDATE conversations
        SET
          last_message = ?,
          last_message_at = NOW(),
          last_message_sender_id = ?,
          unread_by_agent = COALESCE(unread_by_agent, 0) + 1,
          updated_at = NOW()
        WHERE id = ?
        `,
        [message, userId, conversationId]
      );
    } else {
      await db.query(
        `
        UPDATE conversations
        SET
          last_message = ?,
          last_message_at = NOW(),
          last_message_sender_id = ?,
          unread_by_customer = COALESCE(unread_by_customer, 0) + 1,
          updated_at = NOW()
        WHERE id = ?
        `,
        [message, userId, conversationId]
      );
    }

    const newMessage = {
      id: result.insertId,
      conversation_id: conversationId,
      sender_id: userId,
      text: message,
      is_read: false,
      created_at: new Date().toISOString(),
    };

    return res.status(201).json({
      success: true,
      message: "Message sent successfully.",
      data: newMessage,
    });
  } catch (err) {
    return sendServerError(res, "Error sending message", err);
  }
});

/* =========================================================
   MARK MESSAGES AS READ
   PUT /api/chat/messages/read/:conversationId
========================================================= */

router.put(
  "/messages/read/:conversationId",
  authenticateToken,
  async (req, res) => {
    try {
      const userId = getUserId(req);
      const conversationId = Number(req.params.conversationId);

      if (!Number.isInteger(conversationId) || conversationId <= 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid conversation ID.",
        });
      }

      // Access check
      const [conversation] = await db.query(
        `
        SELECT id, customer_id, agent_id
        FROM conversations
        WHERE id = ?
          AND (customer_id = ? OR agent_id = ?)
        LIMIT 1
        `,
        [conversationId, userId, userId]
      );

      if (!conversation?.length) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const conversationData = conversation[0];

      // Mark messages as read
      const [result] = await db.query(
        `
        UPDATE messages
        SET is_read = TRUE
        WHERE conversation_id = ?
          AND sender_id != ?
          AND is_read = FALSE
        `,
        [conversationId, userId]
      );

      // Reset the correct unread counter
      if (Number(conversationData.customer_id) === userId) {
        await db.query(
          `UPDATE conversations SET unread_by_customer = 0 WHERE id = ?`,
          [conversationId]
        );
      } else {
        await db.query(
          `UPDATE conversations SET unread_by_agent = 0 WHERE id = ?`,
          [conversationId]
        );
      }

      return res.json({
        success: true,
        message: "Messages marked as read.",
        updated: result.affectedRows,
      });
    } catch (err) {
      return sendServerError(res, "Error marking messages as read", err);
    }
  }
);

module.exports = router;