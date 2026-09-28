const express = require("express");
const router = express.Router();

const db = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

require("dotenv").config();

/* =========================================================
   REGISTER
   Public registration ALWAYS creates a customer.
   Users cannot create admin/agent accounts themselves.
========================================================= */

router.post("/register", async (req, res) => {
  try {
    console.log("=================================");
    console.log("REGISTRATION REQUEST");
    console.log("Body:", req.body);
    console.log("=================================");

    const {
      name,
      email,
      password,
    } = req.body || {};

    /* =========================
       VALIDATE INPUT
    ========================= */

    if (!name || !email || !password) {
      return res.status(400).json({
        error:
          "Name, email and password are required.",
      });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email)
      .trim()
      .toLowerCase();

    /* =========================
       NAME VALIDATION
    ========================= */

    if (cleanName.length < 2) {
      return res.status(400).json({
        error:
          "Name must contain at least 2 characters.",
      });
    }

    /* =========================
       EMAIL VALIDATION
    ========================= */

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        error:
          "Please provide a valid email address.",
      });
    }

    /* =========================
       PASSWORD VALIDATION
    ========================= */

    if (password.length < 6) {
      return res.status(400).json({
        error:
          "Password must be at least 6 characters.",
      });
    }

    /* =====================================================
       IMPORTANT SECURITY RULE

       Public registration can ONLY create customers.

       Never trust role supplied by the browser.
    ===================================================== */

    const role = "customer";

    /* =========================
       CHECK EXISTING EMAIL
    ========================= */

    const [existing] = await db.query(
      `
      SELECT id
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [cleanEmail]
    );

    if (
      existing &&
      existing.length > 0
    ) {
      return res.status(409).json({
        error:
          "An account with this email already exists.",
      });
    }

    /* =========================
       HASH PASSWORD
    ========================= */

    const hashedPassword =
      await bcrypt.hash(
        password,
        12
      );

    /* =========================
       INSERT USER
    ========================= */

    const [result] =
      await db.query(
        `
        INSERT INTO users
        (
          name,
          email,
          password,
          role
        )
        VALUES (?, ?, ?, ?)
        `,
        [
          cleanName,
          cleanEmail,
          hashedPassword,
          role,
        ]
      );

    /* =========================
       VERIFY INSERT
    ========================= */

    if (
      !result ||
      !result.insertId
    ) {
      console.error(
        "Registration insert failed:",
        result
      );

      return res.status(500).json({
        error:
          "Account could not be created.",
      });
    }

    console.log(
      `User registered successfully: ${cleanEmail}`
    );

    /* =========================
       SUCCESS RESPONSE
    ========================= */

    return res.status(201).json({
      success: true,

      message:
        "Account created successfully.",

      user: {
        id: result.insertId,
        name: cleanName,
        email: cleanEmail,
        role,
      },
    });

  } catch (err) {
    console.error(
      "================================="
    );

    console.error(
      "REGISTER ERROR:"
    );

    console.error(err);

    console.error(
      "================================="
    );

    /* =========================
       DUPLICATE EMAIL
    ========================= */

    if (
      err.code === "ER_DUP_ENTRY"
    ) {
      return res.status(409).json({
        error:
          "An account with this email already exists.",
      });
    }

    /* =========================
       DATABASE ERROR
    ========================= */

    if (
      err.code === "ER_NO_SUCH_TABLE"
    ) {
      return res.status(500).json({
        error:
          "Users table does not exist in the database.",
      });
    }

    if (
      err.code === "ER_BAD_FIELD_ERROR"
    ) {
      return res.status(500).json({
        error:
          "Users table structure does not match the application.",
      });
    }

    /* =========================
       GENERAL ERROR
    ========================= */

    return res.status(500).json({
      error:
        "Internal server error. Please try again later.",
    });
  }
});


/* =========================================================
   LOGIN
========================================================= */

router.post("/login", async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body || {};

    /* =========================
       VALIDATION
    ========================= */

    if (!email || !password) {
      return res.status(400).json({
        error:
          "Email and password are required.",
      });
    }

    const cleanEmail =
      String(email)
        .trim()
        .toLowerCase();

    /* =========================
       FIND USER
    ========================= */

    const [rows] =
      await db.query(
        `
        SELECT
          id,
          name,
          email,
          password,
          role
        FROM users
        WHERE email = ?
        LIMIT 1
        `,
        [cleanEmail]
      );

    if (
      !rows ||
      rows.length === 0
    ) {
      return res.status(401).json({
        error:
          "Invalid email or password.",
      });
    }

    const user = rows[0];

    /* =========================
       PASSWORD CHECK
    ========================= */

    if (!user.password) {
      console.error(
        `User ${user.id} has no password.`
      );

      return res.status(500).json({
        error:
          "Account authentication data is invalid.",
      });
    }

    const isMatch =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!isMatch) {
      return res.status(401).json({
        error:
          "Invalid email or password.",
      });
    }

    /* =========================
       JWT SECRET CHECK
    ========================= */

    if (!process.env.JWT_SECRET) {
      console.error(
        "JWT_SECRET is not configured."
      );

      return res.status(500).json({
        error:
          "Server authentication is not configured.",
      });
    }

    /* =========================
       CREATE TOKEN
    ========================= */

    const token =
      jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },

        process.env.JWT_SECRET,

        {
          expiresIn: "1d",
        }
      );

    /* =========================
       SUCCESS
    ========================= */

    return res.json({
      success: true,

      message:
        "Login successful.",

      token,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

  } catch (err) {
    console.error(
      "LOGIN ERROR:",
      err
    );

    return res.status(500).json({
      error:
        "Internal server error.",
    });
  }
});


/* =========================================================
   GET CURRENT USER
========================================================= */

router.get("/me", async (req, res) => {
  try {
    const authorization =
      req.headers.authorization;

    if (!authorization) {
      return res.status(401).json({
        error:
          "Authorization token required.",
      });
    }

    const parts =
      authorization.split(" ");

    if (
      parts.length !== 2 ||
      parts[0] !== "Bearer"
    ) {
      return res.status(401).json({
        error:
          "Invalid authorization format.",
      });
    }

    const token = parts[1];

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        error:
          "Server authentication is not configured.",
      });
    }

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    const [rows] =
      await db.query(
        `
        SELECT
          id,
          name,
          email,
          role
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [decoded.id]
      );

    if (
      !rows ||
      rows.length === 0
    ) {
      return res.status(401).json({
        error:
          "User account not found.",
      });
    }

    return res.json({
      success: true,
      user: rows[0],
    });

  } catch (err) {
    console.error(
      "AUTH CHECK ERROR:",
      err
    );

    return res.status(401).json({
      error:
        "Invalid or expired token.",
    });
  }
});


module.exports = router;