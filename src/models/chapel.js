const { getClient } = require("../db");

async function getAllChapels() {
  const client = getClient();
  const result = await client.query(
    "SELECT * FROM chapels ORDER BY id ASC",
  );
  return result.rows;
}

async function getChapelById(id) {
  const client = getClient();
  const result = await client.query(
    "SELECT * FROM chapels WHERE id = $1",
    [id],
  );
  return result.rows[0] || null;
}

async function createChapel({ name, location, status }) {
  const client = getClient();
  const result = await client.query(
    `INSERT INTO chapels (name, location, status)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, location || null, status || "active"],
  );
  return result.rows[0];
}

async function updateChapel(id, updates) {
  const client = getClient();
  const allowed = ["name", "location", "status"];
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
    return getChapelById(id);
  }

  sets.push("updated_at = NOW()");
  values.push(id);

  const result = await client.query(
    `UPDATE chapels SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return result.rows[0] || null;
}

async function deleteChapel(id) {
  const client = getClient();
  const result = await client.query(
    "DELETE FROM chapels WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0] || null;
}

module.exports = {
  getAllChapels,
  getChapelById,
  createChapel,
  updateChapel,
  deleteChapel,
};
