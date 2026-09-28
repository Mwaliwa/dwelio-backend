const jwt = require("jsonwebtoken");
require("dotenv").config();


/**
 * JWT Authentication Middleware
 * Protects private API routes
 */
module.exports = (req, res, next) => {

  try {

    // Check JWT secret configuration
    if (!process.env.JWT_SECRET) {
      console.error(
        "❌ JWT_SECRET is missing in environment variables"
      );

      return res.status(500).json({
        success: false,
        message: "Server authentication configuration error"
      });
    }


    // Get authorization header
    const authHeader = req.headers.authorization;


    console.log("🔐 AUTH CHECK");
    console.log(
      "Route:",
      req.method,
      req.originalUrl
    );


    if (!authHeader) {

      console.log(
        "❌ Authorization header missing"
      );

      return res.status(401).json({
        success: false,
        message: "Authorization token required"
      });
    }


    // Validate Bearer format
    if (!authHeader.startsWith("Bearer ")) {

      console.log(
        "❌ Invalid authorization format"
      );

      return res.status(401).json({
        success: false,
        message:
          "Invalid authorization format. Use Bearer <token>"
      });
    }


    const token =
      authHeader.split(" ")[1];


    if (!token) {

      return res.status(401).json({
        success: false,
        message: "Token missing"
      });
    }



    // Verify JWT
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );


    if (!decoded || !decoded.id) {

      return res.status(401).json({
        success: false,
        message: "Invalid user token"
      });
    }



    // Attach authenticated user
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name || null
    };


    console.log(
      "✅ Authenticated user:",
      req.user.id,
      req.user.role
    );


    next();


  } catch (error) {


    console.error(
      "🚨 AUTHENTICATION ERROR:",
      error.message
    );


    // Expired token
    if (
      error.name === "TokenExpiredError"
    ) {

      return res.status(401).json({
        success: false,
        message:
          "Session expired. Please login again."
      });

    }


    // Invalid token
    if (
      error.name === "JsonWebTokenError"
    ) {

      return res.status(401).json({
        success: false,
        message:
          "Invalid authentication token."
      });

    }


    return res.status(500).json({
      success: false,
      message:
        "Authentication service error."
    });

  }

};