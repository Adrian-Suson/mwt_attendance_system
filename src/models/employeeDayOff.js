const { getClient } = require("../db");

async function listDayOffs(employeeId) {
  const client = getClient();
  const result = await client.query(
    `SELECT id, employee_id, day_off_date, notes
     FROM employee_day_offs
     WHERE employee_id = $1
     ORDER BY day_off_date ASC`,
    [employeeId],
  );
  return result.rows.map((row) => ({
    ...row,
    day_off_date: String(row.day_off_date).slice(0, 10),
  }));
}

async function createDayOffs(employeeId, dates, notes) {
  const client = getClient();
  const saved = [];
  for (const date of [
    ...new Set(dates.map((value) => String(value).slice(0, 10))),
  ]) {
    const result = await client.query(
      `INSERT INTO employee_day_offs (employee_id, day_off_date, notes)
       VALUES ($1, $2, $3)
       ON CONFLICT (employee_id, day_off_date)
       DO UPDATE SET notes = EXCLUDED.notes, updated_at = NOW()
       RETURNING *`,
      [employeeId, date, notes || null],
    );
    saved.push(result.rows[0]);
  }
  return saved;
}

module.exports = { listDayOffs, createDayOffs };
