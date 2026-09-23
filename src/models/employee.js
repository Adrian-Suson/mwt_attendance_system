const { getClient } = require("../db");

const EMPLOYEE_ROLES = [
  "GCM",
  "GCM Staff",
  "CM",
  "FCR",
  "Driver",
  "Embalmer",
  "Attendant",
  "Attendant/Asst Embalmer",
  "Driver/Asst Embalmer",
  "Driver/Attendant",
  "Driver/Embalmer",
];

async function getAllEmployees(page = 1, pageSize = 10, search = "", chapelId) {
  const client = getClient();
  const offset = (page - 1) * pageSize;
  const searchTerm = search.trim().toLowerCase();

  const filterParams = [];
  const conditions = [];

  if (searchTerm) {
    filterParams.push(`%${searchTerm}%`);
    conditions.push(`(
      LOWER(e.first_name) LIKE $1 OR
      LOWER(COALESCE(e.middle_name, '')) LIKE $1 OR
      LOWER(e.last_name) LIKE $1 OR
      LOWER(COALESCE(e.email, '')) LIKE $1 OR
      LOWER(e.role) LIKE $1 OR
      LOWER(COALESCE(e.employment_type, '')) LIKE $1 OR
      LOWER(COALESCE(c.name, '')) LIKE $1 OR
      LOWER(TRIM(CONCAT_WS(' ', e.first_name, e.middle_name, e.last_name))) LIKE $1
    )`);
  }

  if (chapelId) {
    filterParams.push(chapelId);
    conditions.push(`(
      e.chapel_id = $${filterParams.length} OR
      EXISTS (
        SELECT 1 FROM employee_chapels ec
        WHERE ec.employee_id = e.id AND ec.chapel_id = $${filterParams.length}
      )
    )`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const limitIdx = filterParams.length + 1;
  const offsetIdx = filterParams.length + 2;

  const result = await client.query(
    `SELECT e.*, c.name AS chapel_name,
            s.time_in AS scheduled_time_in,
            s.time_out AS scheduled_time_out
     FROM employees e
     LEFT JOIN chapels c ON c.id = e.chapel_id
     LEFT JOIN employee_schedules s
       ON s.employee_id = e.id
      AND s.schedule_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
     ${whereClause}
     ORDER BY e.id ASC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    [...filterParams, pageSize, offset],
  );

  const countResult = await client.query(
    `SELECT COUNT(*) AS total
     FROM employees e
     LEFT JOIN chapels c ON c.id = e.chapel_id
     ${whereClause}`,
    filterParams,
  );

  return {
    rows: result.rows,
    total: parseInt(countResult.rows[0].total, 10),
    page,
    pageSize,
  };
}

async function getPublicEmployeeNames() {
  const client = getClient();
  const result = await client.query(
    `SELECT e.id, e.first_name, e.middle_name, e.last_name,
            s.time_in AS scheduled_time_in,
            s.time_out AS scheduled_time_out
    FROM employees e
     LEFT JOIN employee_schedules s
       ON s.employee_id = e.id
      AND s.schedule_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date
     WHERE LOWER(COALESCE(e.status, 'active')) <> 'inactive'
     ORDER BY e.first_name ASC, e.last_name ASC, e.id ASC`,
  );
  return result.rows;
}

async function getEmployeeFaceEmbeddings(employeeId) {
  const client = getClient();
  const result = await client.query(
    `SELECT id, employee_id, embedding, model, drive_file_id, drive_file_url, created_at, updated_at
     FROM employee_face_embeddings
     WHERE employee_id = $1
     ORDER BY id ASC`,
    [employeeId],
  );
  return result.rows;
}

async function getAllActiveFaceEmbeddings() {
  const client = getClient();
  const result = await client.query(
    `SELECT efe.id, efe.employee_id, efe.embedding, efe.model,
            e.first_name, e.middle_name, e.last_name
     FROM employee_face_embeddings efe
     JOIN employees e ON e.id = efe.employee_id
     WHERE LOWER(COALESCE(e.status, 'active')) <> 'inactive'
     ORDER BY efe.employee_id ASC, efe.id ASC`,
  );
  return result.rows;
}

async function addEmployeeFaceEmbedding(
  employeeId,
  embedding,
  model = "face-api.js",
  driveFile = {},
) {
  const client = getClient();
  const result = await client.query(
    `INSERT INTO employee_face_embeddings (
       employee_id, embedding, model, drive_file_id, drive_file_url
     )
     SELECT id, $2::jsonb, $3, $4, $5 FROM employees WHERE id = $1
     RETURNING id, employee_id, model, drive_file_id, drive_file_url, created_at`,
    [
      employeeId,
      JSON.stringify(embedding),
      model,
      driveFile.id || null,
      driveFile.webViewLink || driveFile.webContentLink || null,
    ],
  );
  return result.rows[0] || null;
}

async function deleteEmployeeFaceEmbeddings(employeeId) {
  const client = getClient();
  const result = await client.query(
    `DELETE FROM employee_face_embeddings WHERE employee_id = $1`,
    [employeeId],
  );
  return result.rowCount;
}

async function getEmployeeById(id, chapelId) {
  const client = getClient();
  const scope = chapelId
    ? `AND (e.chapel_id = $2 OR EXISTS (
        SELECT 1 FROM employee_chapels ec
        WHERE ec.employee_id = e.id AND ec.chapel_id = $2
      ))`
    : "";
  const result = await client.query(
    `SELECT e.*, c.name AS chapel_name, c.location AS chapel_location
     FROM employees e
     LEFT JOIN chapels c ON c.id = e.chapel_id
    WHERE e.id = $1 ${scope}`,
    chapelId ? [id, chapelId] : [id],
  );
  return result.rows[0] || null;
}

async function createEmployee(data) {
  const client = getClient();

  let first_name = data.first_name || null;
  let middle_name = data.middle_name || null;
  let last_name = data.last_name || null;
  if (!first_name && data.name) {
    const parts = data.name.trim().split(/\s+/);
    first_name = parts.shift() || null;
    last_name = parts.join(" ") || null;
  }

  const result = await client.query(
    `INSERT INTO employees (
       first_name, middle_name, last_name, email, phone, role,
      chapel_id, employment_type, status, hire_date
     )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      first_name,
      middle_name,
      last_name,
      data.email || null,
      data.phone || null,
      data.role,
      data.chapel_id || null,
      data.employment_type || "Regular",
      data.status || "active",
      data.hire_date || null,
    ],
  );

  return result.rows[0];
}

async function updateEmployee(id, updates, chapelId) {
  const client = getClient();

  const allowed = [
    "first_name",
    "middle_name",
    "last_name",
    "email",
    "phone",
    "role",
    "employment_type",
    "chapel_id",
    "status",
    "hire_date",
  ];

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
    return getEmployeeById(id, chapelId);
  }

  sets.push("updated_at = NOW()");
  values.push(id);
  const idParam = idx;
  const scope = chapelId
    ? ` AND (chapel_id = $${idParam + 1} OR EXISTS (
        SELECT 1 FROM employee_chapels ec
        WHERE ec.employee_id = employees.id AND ec.chapel_id = $${idParam + 1}
      ))`
    : "";

  if (chapelId) {
    values.push(chapelId);
  }

  const result = await client.query(
    `UPDATE employees SET ${sets.join(", ")} WHERE id = $${idParam}${scope} RETURNING *`,
    values,
  );
  return result.rows[0] || null;
}

async function deleteEmployee(id) {
  const client = getClient();
  const result = await client.query(
    "DELETE FROM employees WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0] || null;
}

module.exports = {
  EMPLOYEE_ROLES,
  getAllEmployees,
  getPublicEmployeeNames,
  getEmployeeFaceEmbeddings,
  getAllActiveFaceEmbeddings,
  addEmployeeFaceEmbedding,
  deleteEmployeeFaceEmbeddings,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
};
