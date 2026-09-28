const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");

const login = async (req, res) => {
  const { email, password } = req.body;

  console.log("🔐 Login attempt for:", email); // Debug log

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const [users] = await db.query(
      "SELECT id, name, email, password, role FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      console.log("❌ User not found:", email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      console.log("❌ Password mismatch for:", email);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate JWT Token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role,
        name: user.name 
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }   // 7 days
    );

    console.log("✅ Login successful for:", email);
    console.log("🔑 Token generated (first 30 chars):", token.substring(0, 30) + "...");

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("💥 Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
};

module.exports = { login };