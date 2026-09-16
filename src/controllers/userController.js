const User = require("../models/user");
const bcrypt = require("bcrypt");

const USER_ROLES = ["gcm_super_admin", "cm_admin", "fcr"];

async function listUsers(req, res) {
  try {
    const rows = await User.getAllUsers();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const user = await User.getUserById(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createUser(req, res) {
  const { email, password, password_hash, full_name, chapel_id, role } =
    req.body;

  if (!email || !(password || password_hash) || !full_name) {
    return res
      .status(400)
      .json({ error: "email, password, and full_name are required" });
  }

  if (role && !USER_ROLES.includes(role)) {
    return res.status(400).json({ error: "Invalid user role" });
  }

  try {
    const hashedPassword = password_hash || (await bcrypt.hash(password, 10));
    const created = await User.createUser({
      email,
      password_hash: hashedPassword,
      full_name,
      chapel_id,
      role,
    });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function changePassword(req, res) {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({
      error: "Current password and new password are required",
    });
  }

  if (String(new_password).length < 8) {
    return res.status(400).json({
      error: "New password must be at least 8 characters",
    });
  }

  try {
    const user = await User.getUserByIdWithPassword(req.user.id);

    if (
      !user ||
      !(await bcrypt.compare(current_password, user.password_hash))
    ) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await User.updateUser(req.user.id, { password_hash: passwordHash });

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function resetUserPassword(req, res) {
  const id = Number(req.params.id);
  const { new_password } = req.body;

  if (!id) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  if (!new_password || String(new_password).length < 8) {
    return res.status(400).json({
      error: "New password must be at least 8 characters",
    });
  }

  try {
    const user = await User.getUserById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await User.updateUser(id, { password_hash: passwordHash });

    res.json({ message: "User password reset successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });

    const updated = await User.updateUser(id, req.body);
    if (!updated) return res.status(404).json({ error: "User not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteUser(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const removed = await User.deleteUser(id);
    if (!removed) return res.status(404).json({ error: "User not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  changePassword,
  resetUserPassword,
  updateUser,
  deleteUser,
};
