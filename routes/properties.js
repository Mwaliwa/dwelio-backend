const express = require("express");
const router = express.Router();
const pool = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const authenticateToken = require("../middleware/auth"); // ← make sure this path is correct

/* =========================
   ENSURE UPLOAD FOLDER EXISTS
========================= */
const uploadDir = path.join(__dirname, "../uploads/houses");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/* =========================
   MULTER CONFIG
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedImages = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
    "image/gif",
  ];

  const allowedVideos = [
    "video/mp4",
    "video/webm",
    "video/quicktime", // .mov
  ];

  if (allowedImages.includes(file.mimetype) || allowedVideos.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only image (jpeg, png, webp, gif) and video (mp4, webm, mov) files are allowed"
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB (supports both images and videos)
  },
});

/* =========================
   HELPERS
========================= */
const formatImages = (files) => {
  if (!files || files.length === 0) return null;
  return files.map((f) => `houses/${f.filename}`).join(",");
};

const parseImages = (img) => {
  if (!img) return [];
  return img
    .split(",")
    .map((i) => i.trim())
    .filter(Boolean);
};

/* =========================
   GET ALL PROPERTIES (public)
========================= */
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM properties ORDER BY id DESC"
    );

    const data = rows.map((p) => ({
      ...p,
      images: parseImages(p.image),
    }));

    res.json(data);
  } catch (err) {
    console.error("GET properties error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   GET MY PROPERTIES (agent only)
========================= */
router.get("/my", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      "SELECT * FROM properties WHERE user_id = ? ORDER BY id DESC",
      [userId]
    );

    const data = rows.map((p) => ({
      ...p,
      images: parseImages(p.image),
    }));

    res.json(data);
  } catch (err) {
    console.error("GET my properties error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   GET ONE PROPERTY
========================= */
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM properties WHERE id = ?",
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Property not found" });
    }

    const property = {
      ...rows[0],
      images: parseImages(rows[0].image),
    };

    res.json(property);
  } catch (err) {
    console.error("GET property error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   CREATE PROPERTY (agent only)
========================= */
router.post(
  "/",
  authenticateToken,
  upload.array("images", 10),
  async (req, res) => {
    try {
      const {
        title,
        location,
        price,
        description,
        property_type,
        size,
        listing_type,
        status,
        latitude,
        longitude,
      } = req.body;

      if (!title || !location || !price) {
        return res
          .status(400)
          .json({ error: "Title, location and price are required" });
      }

      // Always use the logged-in user's id
      const user_id = req.user.id;

      const images = formatImages(req.files);

      const [result] = await pool.query(
        `INSERT INTO properties
        (title, location, price, description, property_type, size, listing_type, user_id, status, image, latitude, longitude)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          location,
          price,
          description || null,
          property_type || null,
          size || null,
          listing_type || "sale",
          user_id,
          status || "available",
          images,
          latitude || null,
          longitude || null,
        ]
      );

      res.status(201).json({
        message: "Property created successfully",
        id: result.insertId,
        images: parseImages(images),
      });
    } catch (err) {
      console.error("CREATE property error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

/* =========================
   UPDATE PROPERTY (owner only)
========================= */
router.put(
  "/:id",
  authenticateToken,
  upload.array("images", 10),
  async (req, res) => {
    try {
      const {
        title,
        location,
        price,
        description,
        property_type,
        size,
        listing_type,
        latitude,
        longitude,
      } = req.body;

      // Check ownership
      const [existing] = await pool.query(
        "SELECT user_id, image FROM properties WHERE id = ?",
        [req.params.id]
      );

      if (!existing.length) {
        return res.status(404).json({ error: "Property not found" });
      }

      if (Number(existing[0].user_id) !== Number(req.user.id)) {
        return res
          .status(403)
          .json({ error: "You can only edit your own properties" });
      }

      const newImages = formatImages(req.files);
      let finalImages = existing[0].image || null;

      if (newImages) {
        finalImages = newImages;
      }

      await pool.query(
        `UPDATE properties SET
          title = ?,
          location = ?,
          price = ?,
          description = ?,
          property_type = ?,
          size = ?,
          listing_type = ?,
          image = ?,
          latitude = ?,
          longitude = ?
        WHERE id = ?`,
        [
          title,
          location,
          price,
          description || null,
          property_type || null,
          size || null,
          listing_type || "sale",
          finalImages,
          latitude || null,
          longitude || null,
          req.params.id,
        ]
      );

      res.json({ message: "Property updated successfully" });
    } catch (err) {
      console.error("UPDATE property error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

/* =========================
   DELETE PROPERTY (owner only)
========================= */
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    // Check ownership
    const [existing] = await pool.query(
      "SELECT user_id FROM properties WHERE id = ?",
      [req.params.id]
    );

    if (!existing.length) {
      return res.status(404).json({ error: "Property not found" });
    }

    if (Number(existing[0].user_id) !== Number(req.user.id)) {
      return res
        .status(403)
        .json({ error: "You can only delete your own properties" });
    }

    await pool.query("DELETE FROM properties WHERE id = ?", [req.params.id]);

    res.json({ message: "Property deleted successfully" });
  } catch (err) {
    console.error("DELETE property error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;