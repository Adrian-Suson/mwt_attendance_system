const { getClient } = require("../db");

async function getAllPublicUploads(filters = {}) {
  const client = getClient();
  const conditions = [];
  const values = [];
  let idx = 1;

  if (filters.employee_id) {
    conditions.push(`pu.employee_id = $${idx}`);
    values.push(filters.employee_id);
    idx += 1;
  }

  if (filters.attendance_type) {
    conditions.push(`pu.attendance_type = $${idx}`);
    values.push(filters.attendance_type);
    idx += 1;
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await client.query(
    `SELECT pu.*, ar.attendance_date, ar.status AS attendance_status,
        ar.check_in, ar.check_out, ar.working_hours
     FROM public_uploads pu
     LEFT JOIN attendance_records ar ON ar.id = pu.attendance_record_id
     ${where}
     ORDER BY pu.created_at DESC`,
    values,
  );
  return result.rows;
}

async function getPublicUploadById(id) {
  const client = getClient();
  const result = await client.query(
    `SELECT pu.*, ar.attendance_date, ar.status AS attendance_status,
        ar.check_in, ar.check_out, ar.working_hours
     FROM public_uploads pu
     LEFT JOIN attendance_records ar ON ar.id = pu.attendance_record_id
     WHERE pu.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function createPublicUpload(data) {
  const client = getClient();
  const result = await client.query(
    `INSERT INTO public_uploads (
       employee_id, employee_name, attendance_type,
      file_name, file_path, location, capture_datetime, uploaded_by, attendance_record_id
     )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      data.employee_id || null,
      data.employee_name,
      data.attendance_type,
      data.file_name,
      data.file_path,
      data.location || null,
      data.capture_datetime || null,
      data.uploaded_by || null,
      data.attendance_record_id || null,
    ],
  );
  return getPublicUploadById(result.rows[0].id);
}

async function updatePublicUpload(id, updates) {
  const client = getClient();
  const allowed = [
    "employee_id",
    "employee_name",
    "attendance_type",
    "file_name",
    "file_path",
    "location",
    "capture_datetime",
    "uploaded_by",
    "attendance_record_id",
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
    return getPublicUploadById(id);
  }

  values.push(id);

  const result = await client.query(
    `UPDATE public_uploads SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    values,
  );
  return result.rows[0] || null;
}

async function deletePublicUpload(id) {
  const client = getClient();
  const result = await client.query(
    "DELETE FROM public_uploads WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0] || null;
}

module.exports = {
  getAllPublicUploads,
  getPublicUploadById,
  createPublicUpload,
  updatePublicUpload,
  deletePublicUpload,
};
