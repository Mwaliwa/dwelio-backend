// index.js  (or server.js)

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

// ========================
// DATABASE & ROUTES
// ========================
const db = require("./db");

const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const propertiesRoutes = require("./routes/properties");
const bookingRoutes = require("./routes/bookings");
const reviewsRoutes = require("./routes/reviews");
const favoritesRoutes = require("./routes/favorites");
const userRoutes = require("./routes/user");
const paymentsRoutes = require("./routes/payments");
const offersRoutes = require("./routes/offers");
const chatRoutes = require("./routes/chat");
const agentRequestsRoutes = require("./routes/agentRequests");
const agentRoutes = require("./routes/agent");
const viewsRoutes = require("./routes/views");
const inquiriesRoutes = require("./routes/inquiries");

const setupChatSocket = require("./socket/chatSocket");

const app = express();

// ========================
// CONFIG
// ========================
const PORT = process.env.PORT || 5001;
const VERSION = "3.6.0";
const NODE_ENV = process.env.NODE_ENV || "development";

console.log("🚀 DWELIO BACKEND STARTING...");

// ========================
// ENSURE UPLOAD DIRECTORIES EXIST
// ========================
const uploadDirs = [
  path.join(__dirname, "uploads"),
  path.join(__dirname, "uploads/chat"),
  path.join(__dirname, "uploads/properties"),
];

uploadDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// ========================
// CORS
// ========================
const allowedOrigins = [
  "http://localhost:8100",
  "http://127.0.0.1:8100",
  "http://localhost:8101",
  "http://127.0.0.1:8101",
  "http://localhost:5173",
  "http://localhost:3000",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.log("❌ CORS BLOCKED:", origin);
      return callback(new Error(`Not allowed by CORS: ${origin}`), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Authorization"],
    optionsSuccessStatus: 200,
  })
);

// ========================
// MIDDLEWARE
// ========================
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Static files (property images, chat media, etc.)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Simple request logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${req.method} ${req.originalUrl} | Origin: ${
      req.headers.origin || "none"
    }`
  );
  next();
});

// ========================
// HEALTH & STATUS
// ========================
app.get("/", (req, res) => {
  res.status(200).json({
    app: "Dwelio Backend",
    version: VERSION,
    status: "ONLINE",
    environment: NODE_ENV,
    serverTime: new Date().toISOString(),
    features: [
      "chat",
      "realtime",
      "media-messages",
      "agent-requests",
      "agent-dashboard",
      "views",
      "inquiries",
    ],
  });
});

app.get("/api/status", async (req, res) => {
  try {
    await db.query("SELECT 1");
    res.json({
      status: "OK",
      database: "CONNECTED",
      uptime: process.uptime(),
      version: VERSION,
      environment: NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      status: "ERROR",
      database: "DISCONNECTED",
      error: err.message,
    });
  }
});

// ========================
// ROUTES
// ========================
console.log("📌 Mounting routes...");

const routes = [
  ["/api/auth", authRoutes],
  ["/api/admin", adminRoutes],
  ["/api/properties", propertiesRoutes],
  ["/api/bookings", bookingRoutes],
  ["/api/reviews", reviewsRoutes],
  ["/api/favorites", favoritesRoutes],
  ["/api/users", userRoutes],
  ["/api/payments", paymentsRoutes],
  ["/api/offers", offersRoutes],
  ["/api/chat", chatRoutes],
  ["/api/agent-requests", agentRequestsRoutes],
  ["/api/agent", agentRoutes],
  ["/api/views", viewsRoutes],
  ["/api/inquiries", inquiriesRoutes],
];

routes.forEach(([routePath, router]) => {
  if (typeof router !== "function") {
    console.error(`❌ Invalid router for ${routePath}`);
    process.exit(1);
  }
  app.use(routePath, router);
  console.log(`   → Mounted ${routePath}`);
});

console.log("✅ All routes mounted successfully");

// ========================
// ADMIN SEED
// ========================
const createAdminIfNotExists = async () => {
  try {
    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      ["admin@dwelio.com"]
    );

    if (existing.length > 0) {
      console.log("👤 Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash(
      process.env.ADMIN_PASSWORD || "admin123",
      12
    );

    await db.query(
      `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
      ["System Admin", "admin@dwelio.com", hashedPassword, "admin"]
    );

    console.log("🔥 Default admin account created");
    console.log("   Email: admin@dwelio.com");
  } catch (err) {
    console.error("❌ Admin seed failed:", err.message);
  }
};

// ========================
// 404 HANDLER
// ========================
app.use((req, res) => {
  console.log(`⚠️  404 → ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    error: "Route not found",
    method: req.method,
    path: req.originalUrl,
  });
});

// ========================
// GLOBAL ERROR HANDLER
// ========================
app.use((err, req, res, next) => {
  // Multer errors
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      error: "File too large",
      message: "Maximum file size is 20MB",
    });
  }

  if (err.message && err.message.includes("Only images and videos are allowed")) {
    return res.status(400).json({
      success: false,
      error: "Invalid file type",
      message: err.message,
    });
  }

  if (err.message && err.message.includes("Not allowed by CORS")) {
    return res.status(403).json({
      success: false,
      error: "CORS Error",
      message: err.message,
    });
  }

  console.error("💥 SERVER ERROR:", err);

  res.status(err.status || 500).json({
    success: false,
    error: "Internal Server Error",
    message:
      NODE_ENV === "development" ? err.message : "Something went wrong",
  });
});

// ========================
// CREATE HTTP SERVER + SOCKET.IO
// ========================
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: 25e6, // 25MB for larger media if needed
});

// Make io accessible from routes if needed
app.set("io", io);

// Setup real-time chat
setupChatSocket(io);

// ========================
// START SERVER
// ========================
server.listen(PORT, async () => {
  console.log("");
  console.log("========================================");
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`📦 Version: ${VERSION}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`💬 Real-time Chat: ENABLED`);
  console.log(`🖼️  Media Messages (Image/Video): ENABLED`);
  console.log(`🧑‍💼 Agent Requests: ENABLED`);
  console.log(`📊 Agent Dashboard: ENABLED`);
  console.log(`👁️  Views: ENABLED`);
  console.log(`📨 Inquiries: ENABLED`);
  console.log("========================================");
  console.log("");

  await createAdminIfNotExists();
});