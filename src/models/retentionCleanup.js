const { getClient } = require("../db");

async function deleteExpiredAttendanceAndSchedules(retentionDays) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("retentionDays must be a positive integer.");
  }

  const result = await getClient().query(
    `WITH retention_cutoff AS (
       SELECT
         (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date - $1::int AS cutoff_date
     ),
     deleted_attendance AS (
       DELETE FROM attendance_records
       USING retention_cutoff
       WHERE attendance_records.attendance_date < retention_cutoff.cutoff_date
       RETURNING attendance_records.id
     ),
     deleted_schedules AS (
       DELETE FROM employee_schedules
       USING retention_cutoff
       WHERE employee_schedules.schedule_date < retention_cutoff.cutoff_date
       RETURNING employee_schedules.id
     )
     SELECT
       (SELECT COUNT(*)::int FROM deleted_attendance) AS deleted_attendance,
       (SELECT COUNT(*)::int FROM deleted_schedules) AS deleted_schedules`,
    [retentionDays],
  );

  return result.rows[0];
}

module.exports = { deleteExpiredAttendanceAndSchedules };
