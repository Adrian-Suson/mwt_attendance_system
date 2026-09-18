const { getClient } = require("../db");

function normalizeDateKeys(dates) {
  return [...new Set(dates.map((d) => String(d).slice(0, 10)))].sort();
}

/**
 * GET EMPLOYEE LEAVES
 *
 * Optional:
 * ?employee_id=1
 * ?start_date=2026-09-01
 * ?end_date=2026-09-30
 */
async function getEmployeeLeaves(filters = {}) {
  const client = getClient();

  const conditions = [];
  const values = [];
  let idx = 1;

  if (filters.employee_id) {
    conditions.push(`el.employee_id = $${idx}`);
    values.push(filters.employee_id);
    idx++;
  }

  if (filters.start_date) {
    conditions.push(`el.leave_date >= $${idx}`);
    values.push(filters.start_date);
    idx++;
  }

  if (filters.end_date) {
    conditions.push(`el.leave_date <= $${idx}`);
    values.push(filters.end_date);
    idx++;
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await client.query(
    `SELECT
       el.id,
       el.employee_id,
       e.first_name || ' ' || e.last_name AS employee_name,
      TO_CHAR(el.leave_date, 'YYYY-MM-DD') AS leave_date,
       el.leave_type,
       el.notes,
       el.created_at,
       el.updated_at
     FROM employee_leaves el
     JOIN employees e
       ON e.id = el.employee_id
     ${where}
     ORDER BY el.leave_date ASC, employee_name ASC`,
    values,
  );

  return result.rows.map((row) => ({
    ...row,
    leave_date: row.leave_date,
  }));
}

/**
 * GET ONE EMPLOYEE LEAVE
 */
async function getEmployeeLeaveById(id) {
  const client = getClient();

  const result = await client.query(
    `SELECT
       el.id,
       el.employee_id,
       e.first_name || ' ' || e.last_name AS employee_name,
      TO_CHAR(el.leave_date, 'YYYY-MM-DD') AS leave_date,
       el.leave_type,
       el.notes,
       el.created_at,
       el.updated_at
     FROM employee_leaves el
     JOIN employees e
       ON e.id = el.employee_id
     WHERE el.id = $1`,
    [id],
  );

  if (!result.rows[0]) {
    return null;
  }

  return {
    ...result.rows[0],
    leave_date: result.rows[0].leave_date,
  };
}

/**
 * CREATE EMPLOYEE LEAVES
 *
 * Accepts:
 *
 * {
 *   employee_id: 1,
 *   dates: [
 *     "2026-09-16",
 *     "2026-09-17",  
 *     "2026-09-19"
 *   ],
 *   leave_type: "VL",
 *   notes: "Vacation Leave"
 * }
 *
 * Creates ONE database row per date.
 */
async function createEmployeeLeaves(data) {
  const client = getClient();

  const employeeId = Number(data.employee_id);
  const leaveType = data.leave_type;
  const notes = data.notes || null;

  if (!employeeId) {
    throw new Error("employee_id is required");
  }

  if (!leaveType) {
    throw new Error("leave_type is required");
  }

  if (!Array.isArray(data.dates) || data.dates.length === 0) {
    throw new Error("dates[] is required");
  }

  const dates = normalizeDateKeys(data.dates);

  await client.query("BEGIN");

  try {
    const inserted = [];

    for (const leaveDate of dates) {
      const result = await client.query(
        `INSERT INTO employee_leaves (
           employee_id,
           leave_date,
           leave_type,
           notes
         )
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (employee_id, leave_date)
         DO UPDATE SET
           leave_type = EXCLUDED.leave_type,
           notes = EXCLUDED.notes,
           updated_at = NOW()
         RETURNING *`,
        [employeeId, leaveDate, leaveType, notes],
      );

      inserted.push(result.rows[0]);
    }

    await client.query("COMMIT");

    return inserted;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/**
 * UPDATE ONE LEAVE DATE
 */
async function updateEmployeeLeave(id, updates) {
  const client = getClient();

  const allowed = ["employee_id", "leave_date", "leave_type", "notes"];

  const sets = [];
  const values = [];
  let idx = 1;

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) {
      sets.push(`${key} = $${idx}`);
      values.push(updates[key]);
      idx++;
    }
  }

  if (sets.length === 0) {
    return getEmployeeLeaveById(id);
  }

  sets.push("updated_at = NOW()");
  values.push(id);

  await client.query(
    `UPDATE employee_leaves
     SET ${sets.join(", ")}
     WHERE id = $${idx}`,
    values,
  );

  return getEmployeeLeaveById(id);
}

/**
 * DELETE ONE LEAVE DATE
 */
async function deleteEmployeeLeave(id) {
  const client = getClient();

  const result = await client.query(
    `DELETE FROM employee_leaves
     WHERE id = $1
     RETURNING *`,
    [id],
  );

  return result.rows[0] || null;
}

/**
 * DELETE MULTIPLE LEAVE DATES
 *
 * Useful when the user selects multiple dates
 * and removes them from the calendar.
 */
async function deleteEmployeeLeaves(employeeId, dates) {
  const client = getClient();

  const normalizedDates = normalizeDateKeys(dates);

  const result = await client.query(
    `DELETE FROM employee_leaves
     WHERE employee_id = $1
       AND leave_date = ANY($2::date[])
     RETURNING *`,
    [employeeId, normalizedDates],
  );

  return result.rows;
}

module.exports = {
  getEmployeeLeaves,
  getEmployeeLeaveById,
  createEmployeeLeaves,
  updateEmployeeLeave,
  deleteEmployeeLeave,
  deleteEmployeeLeaves,
  normalizeDateKeys,
};
