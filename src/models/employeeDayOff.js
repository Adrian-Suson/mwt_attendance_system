const { getClient } = require("../db");

async function listDayOffs(employeeId) {
  const client = getClient();
  const result = await client.query(
    `SELECT id, employee_id, TO_CHAR(day_off_date, 'YYYY-MM-DD') AS day_off_date, notes
     FROM employee_day_offs
     WHERE employee_id = $1
     ORDER BY day_off_date ASC`,
    [employeeId],
  );
  return result.rows.map((row) => ({
    ...row,
    day_off_date: row.day_off_date,
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

async function deleteDayOffs(employeeId, dates) {
  const client = getClient();
  const normalizedDates = [
    ...new Set(dates.map((value) => String(value).slice(0, 10))),
  ];
  const result = await client.query(
    `DELETE FROM employee_day_offs
     WHERE employee_id = $1
       AND day_off_date = ANY($2::date[])
     RETURNING *`,
    [employeeId, normalizedDates],
  );
  return result.rows;
}

module.exports = { listDayOffs, createDayOffs, deleteDayOffs };
