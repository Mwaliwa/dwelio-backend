const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not set");
      return res.status(500).json({
        success: false,
        error: "Server configuration error",
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        error: "Invalid token payload",
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    return res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
};

/* =========================================================
   HELPER - GET USER BY ID
========================================================= */

const getUserById = async (id) => {
  const [rows] = await db.query(
    `SELECT 
        id,
        name,
        email,
        phone,
        avatar,
        role,
        created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rows.length > 0 ? rows[0] : null;
};

/* =========================================================
   MULTER - AVATAR UPLOAD
========================================================= */

const uploadDir = path.join(__dirname, "../uploads/avatars");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)
      ? ext
      : ".jpg";
    cb(null, `user-${req.user.id}-${Date.now()}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

/* =========================================================
   GET /api/users/profile
========================================================= */

router.get("/profile", auth, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while fetching profile",
    });
  }
});

/* =========================================================
   PUT /api/users/profile
========================================================= */

router.put("/profile", auth, async (req, res) => {
  try {
    let { name, email, phone } = req.body;

    if (name === undefined || email === undefined) {
      return res.status(400).json({
        success: false,
        error: "Name and email are required",
      });
    }

    name = String(name).trim();
    email = String(email).trim().toLowerCase();

    if (phone !== undefined && phone !== null && phone !== "") {
      phone = String(phone).trim();
      if (phone.length > 30) {
        return res.status(400).json({
          success: false,
          error: "Phone number is too long",
        });
      }
    } else {
      phone = null;
    }

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        success: false,
        error: "Name must be between 2 and 100 characters",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email) || email.length > 150) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format",
      });
    }

    // Check email uniqueness
    const [existing] = await db.query(
      `SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1`,
      [email, req.user.id]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Email already in use",
      });
    }

    await db.query(
      `UPDATE users
       SET name = ?, email = ?, phone = ?
       WHERE id = ?`,
      [name, email, phone, req.user.id]
    );

    const updatedUser = await getUserById(req.user.id);

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        error: "User not found after update",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Update profile error:", err);

    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        error: "Email already in use",
      });
    }

    return res.status(500).json({
      success: false,
      error: "Server error while updating profile",
    });
  }
});

/* =========================================================
   PUT /api/users/avatar
========================================================= */

router.put("/avatar", auth, (req, res) => {
  upload.single("avatar")(req, res, async (err) => {
    try {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            error: "Image is too large. Maximum size is 5MB",
          });
        }
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }

      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message || "Invalid image file",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "No image file provided",
        });
      }

      const baseUrl = process.env.BASE_URL || "http://localhost:5001";
      const avatarUrl = `${baseUrl}/uploads/avatars/${req.file.filename}`;

      // Optional: delete old avatar file
      const currentUser = await getUserById(req.user.id);
      if (currentUser?.avatar) {
        try {
          const oldFilename = path.basename(currentUser.avatar);
          const oldPath = path.join(uploadDir, oldFilename);
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        } catch (deleteErr) {
          console.warn("Could not delete old avatar:", deleteErr.message);
        }
      }

      await db.query(`UPDATE users SET avatar = ? WHERE id = ?`, [
        avatarUrl,
        req.user.id,
      ]);

      const user = await getUserById(req.user.id);

      return res.status(200).json({
        success: true,
        message: "Avatar updated successfully",
        user,
        avatar: avatarUrl,
      });
    } catch (error) {
      console.error("Avatar upload error:", error);
      return res.status(500).json({
        success: false,
        error: "Server error while uploading avatar",
      });
    }
  });
});

/* =========================================================
   PUT /api/users/change-password
========================================================= */

router.put("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: "Both current and new passwords are required",
      });
    }

    const current = String(currentPassword);
    const next = String(newPassword);

    if (next.length < 6) {
      return res.status(400).json({
        success: false,
        error: "New password must be at least 6 characters",
      });
    }

    if (current === next) {
      return res.status(400).json({
        success: false,
        error: "New password must be different from current password",
      });
    }

    const [rows] = await db.query(
      `SELECT password FROM users WHERE id = ? LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const storedPassword = rows[0].password;

    if (!storedPassword) {
      return res.status(500).json({
        success: false,
        error: "User password is not configured correctly",
      });
    }

    const isMatch = await bcrypt.compare(current, storedPassword);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: "Current password is incorrect",
      });
    }

    const hashedPassword = await bcrypt.hash(next, 12);

    await db.query(`UPDATE users SET password = ? WHERE id = ?`, [
      hashedPassword,
      req.user.id,
    ]);

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while changing password",
    });
  }
});

module.exports = router;