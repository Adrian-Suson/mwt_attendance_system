const { getClient } = require("../db");

const USER_COLUMNS =
  "u.id, u.email, u.full_name, u.chapel_id, c.name AS chapel_name, u.role, u.created_at";

async function getAllUsers() {
  const client = getClient();
  const result = await client.query(
    `SELECT ${USER_COLUMNS}
     FROM users u
     LEFT JOIN chapels c ON c.id = u.chapel_id
     ORDER BY u.id ASC`,
  );
  return result.rows;
}

async function getUserById(id) {
  const client = getClient();
  const result = await client.query(
    `SELECT ${USER_COLUMNS}
     FROM users u
     LEFT JOIN chapels c ON c.id = u.chapel_id
     WHERE u.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function getUserByIdWithPassword(id) {
  const client = getClient();
  const result = await client.query(
    "SELECT id, password_hash FROM users WHERE id = $1",
    [id],
  );
  return result.rows[0] || null;
}

async function getUserByEmail(email) {
  const client = getClient();
  const result = await client.query(
    `SELECT u.*, c.name AS chapel_name
     FROM users u
     LEFT JOIN chapels c ON c.id = u.chapel_id
     WHERE u.email = $1 LIMIT 1`,
    [email],
  );
  return result.rows[0] || null;
}

async function createUser({
  email,
  password_hash,
  full_name,
  chapel_id,
  role,
}) {
  const client = getClient();

  const result = await client.query(
    `INSERT INTO users (email, password_hash, full_name, chapel_id, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, full_name, chapel_id, role, created_at`,
    [
      email,
      password_hash,
      full_name,
      chapel_id || null,
      role || "gcm_super_admin",
    ],
  );

  return result.rows[0];
}

async function updateUser(id, updates) {
  const client = getClient();
  const allowed = ["email", "password_hash", "full_name", "chapel_id", "role"];
  const sets = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      sets.push(`${key} = $${idx}`);
      values.push(updates[key]);
      idx += 1;
    }
  }

  if (sets.length === 0) {
    return getUserById(id);
  }

  values.push(id);

  const result = await client.query(
    `UPDATE users SET ${sets.join(", ")} WHERE id = $${idx}
     RETURNING id, email, full_name, chapel_id, role, created_at`,
    values,
  );
  return result.rows[0] || null;
}

async function deleteUser(id) {
  const client = getClient();
  const result = await client.query(
    "DELETE FROM users WHERE id = $1 RETURNING id",
    [id],
  );
  return result.rows[0] || null;
}

module.exports = {
  getAllUsers,
  getUserById,
  getUserByIdWithPassword,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,
};
