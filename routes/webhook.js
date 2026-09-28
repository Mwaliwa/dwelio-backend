const express = require("express");
const router = express.Router();

const {
  handleWebhook,
} = require("../controllers/webhookController");

// =====================================
// PAYCHANGU WEBHOOK
// POST /api/webhook
// =====================================
router.post(
  "/",
  handleWebhook
);

module.exports = router;