const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const { login } = require("../controllers/authController");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post("/login", loginLimiter, login);

module.exports = router;
