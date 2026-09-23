const { getClient } = require("../db");

async function listSchedules(filters = {}) {
  const client = getClient();
  const conditions = [];
  const values = [];
  let index = 1;

  if (filters.employee_id) {
    conditions.push(`employee_id = $${index}`);
    values.push(filters.employee_id);
    index += 1;
  }
  if (filters.start_date) {
    conditions.push(`schedule_date >= $${index}`);
    values.push(filters.start_date);
    index += 1;
  }
  if (filters.end_date) {
    conditions.push(`schedule_date <= $${index}`);
    values.push(filters.end_date);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await client.query(
    `SELECT id, employee_id, schedule_date, time_in, time_out, notes
     FROM employee_schedules ${where}
     ORDER BY schedule_date ASC`,
    values,
  );
  return result.rows;
}

async function upsertSchedules(employeeId, schedules) {
  const client = getClient();
  const saved = [];

  for (const schedule of schedules) {
    const result = await client.query(
      `INSERT INTO employee_schedules
       (employee_id, schedule_date, time_in, time_out, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (employee_id, schedule_date)
       DO UPDATE SET time_in = EXCLUDED.time_in,
                     time_out = EXCLUDED.time_out,
                     notes = EXCLUDED.notes,
                     updated_at = NOW()
       RETURNING *`,
      [
        employeeId,
        schedule.date,
        schedule.time_in,
        schedule.time_out,
        schedule.notes || null,
      ],
    );
    saved.push(result.rows[0]);
  }

  return saved;
}

async function deleteSchedules(employeeId, dates) {
  const client = getClient();
  const result = await client.query(
    `DELETE FROM employee_schedules
     WHERE employee_id = $1 AND schedule_date = ANY($2::date[])`,
    [employeeId, dates],
  );
  return result.rowCount;
}

module.exports = { listSchedules, upsertSchedules, deleteSchedules };
