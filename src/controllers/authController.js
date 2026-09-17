const User = require("../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../config/security");

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "email and password required" });

  try {
    const user = await User.getUserByEmail(email);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        chapel_id: user.chapel_id,
      },
      getJwtSecret(),
      { expiresIn: "8h" },
    );

    // return safe user fields
    const safeUser = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      chapel_id: user.chapel_id,
      chapel_name: user.chapel_name,
      role: user.role,
      created_at: user.created_at,
    };

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
}

module.exports = { login };
