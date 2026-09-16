const { getClient } = require("../db");

async function getAllAttendanceRecords(filters = {}) {
  const client = getClient();
  const conditions = [];
  const values = [];
  let idx = 1;

  if (filters.employee_id) {
    conditions.push(`ar.employee_id = $${idx}`);
    values.push(filters.employee_id);
    idx += 1;
  }

  if (filters.attendance_date) {
    conditions.push(`ar.attendance_date = $${idx}`);
    values.push(filters.attendance_date);
    idx += 1;
  }

  if (filters.status) {
    conditions.push(`ar.status = $${idx}`);
    values.push(filters.status);
    idx += 1;
  }

  if (filters.chapel_id) {
    conditions.push(`(
      e.chapel_id = $${idx} OR
      EXISTS (
        SELECT 1 FROM employee_chapels ec
        WHERE ec.employee_id = e.id AND ec.chapel_id = $${idx}
      )
    )`);
    values.push(filters.chapel_id);
    idx += 1;
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await client.query(
    `SELECT ar.*,
            e.first_name || ' ' || e.last_name AS employee_name,
            upload.id AS picture_upload_id,
            upload.file_path AS picture_path,
            upload.file_name AS picture_name
     FROM attendance_records ar
     JOIN employees e ON e.id = ar.employee_id
     LEFT JOIN LATERAL (
      SELECT pu.id, pu.file_path, pu.file_name
       FROM public_uploads pu
       WHERE pu.attendance_record_id = ar.id
          OR (
            pu.employee_id = ar.employee_id
            AND pu.capture_datetime IS NOT NULL
            AND (pu.capture_datetime AT TIME ZONE 'Asia/Manila')::date = ar.attendance_date
          )
       ORDER BY pu.created_at DESC, pu.id DESC
       LIMIT 1
     ) upload ON TRUE
     ${where}
     ORDER BY ar.attendance_date DESC, ar.id DESC`,
    values,
  );
  return result.rows;
}

async function getAttendanceRecordById(id, chapelId) {
  const client = getClient();
  const scope = chapelId
    ? `AND (e.chapel_id = $2 OR EXISTS (
        SELECT 1 FROM employee_chapels ec
        WHERE ec.employee_id = e.id AND ec.chapel_id = $2
      ))`
    : "";
  const result = await client.query(
    `SELECT ar.*,
            e.first_name || ' ' || e.last_name AS employee_name
     FROM attendance_records ar
     JOIN employees e ON e.id = ar.employee_id
    WHERE ar.id = $1 ${scope}`,
    chapelId ? [id, chapelId] : [id],
  );
  return result.rows[0] || null;
}

async function createAttendanceRecord(data) {
  const client = getClient();
  const result = await client.query(
    `INSERT INTO attendance_records (
       employee_id, attendance_date, status,
       check_in, check_out, working_hours, source, notes
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.employee_id,
      data.attendance_date,
      data.status,
      data.check_in || null,
      data.check_out || null,
      data.working_hours ?? 0,
      data.source || "manual",
      data.notes || null,
    ],
  );
  return result.rows[0];
}

async function updateAttendanceRecord(id, updates) {
  const client = getClient();
  const allowed = [
    "employee_id",
    "attendance_date",
    "status",
    "check_in",
    "check_out",
    "working_hours",
    "source",
    "notes",
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
    return getAttendanceRecordById(id);
  }

  values.push(id);

  const result = await client.query(
    `UPDATE attendance_records SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return result.rows[0] || null;
}

async function deleteAttendanceRecord(id) {
  const client = getClient();
  const result = await client.query(
    "DELETE FROM attendance_records WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0] || null;
}

module.exports = {
  getAllAttendanceRecords,
  getAttendanceRecordById,
  createAttendanceRecord,
  updateAttendanceRecord,
  deleteAttendanceRecord,
};
