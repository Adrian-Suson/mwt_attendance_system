const { getClient } = require("../db");
const { ROLES } = require("../middlewares/auth");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const LEAVE_TYPES = new Set(["VL", "SL", "ML", "PL"]);

function normalizeDates(dates) {
  return [...new Set(dates.map((date) => String(date)))];
}

function isValidDate(date) {
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function normalizeTime(value) {
  const match = String(value || "").match(
    /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/,
  );
  return match ? `${match[1]}:${match[2]}` : null;
}

function validateDateList(dates, label) {
  if (!Array.isArray(dates) || dates.some((date) => !isValidDate(date))) {
    throw new Error(`${label} must contain valid dates in YYYY-MM-DD format`);
  }
}

function ensureUniqueDates(dates, label) {
  if (new Set(dates).size !== dates.length) {
    throw new Error(`${label} cannot contain duplicate dates`);
  }
}

function getMutation(body) {
  const changes = body?.changes || {};
  const schedules = changes.schedules || {};
  const dayOffs = changes.day_offs || {};
  const leaves = changes.leaves || {};
  const mutation = {
    schedules: {
      upsert: Array.isArray(schedules.upsert) ? schedules.upsert : [],
      remove: normalizeDates(Array.isArray(schedules.remove) ? schedules.remove : []),
    },
    dayOffs: {
      add: normalizeDates(Array.isArray(dayOffs.add) ? dayOffs.add : []),
      remove: normalizeDates(Array.isArray(dayOffs.remove) ? dayOffs.remove : []),
    },
    leaves: {
      add: Array.isArray(leaves.add) ? leaves.add : [],
      remove: normalizeDates(Array.isArray(leaves.remove) ? leaves.remove : []),
    },
  };

  validateDateList(mutation.schedules.remove, "Schedule removals");
  validateDateList(mutation.dayOffs.add, "Day-off additions");
  validateDateList(mutation.dayOffs.remove, "Day-off removals");
  validateDateList(mutation.leaves.remove, "Leave removals");
  validateDateList(mutation.schedules.upsert.map((schedule) => schedule.date), "Schedules");
  validateDateList(mutation.leaves.add.map((leave) => leave.date), "Leave additions");
  ensureUniqueDates(mutation.schedules.upsert.map((schedule) => schedule.date), "Schedules");
  ensureUniqueDates(mutation.dayOffs.add, "Day-off additions");
  ensureUniqueDates(mutation.leaves.add.map((leave) => leave.date), "Leave additions");

  mutation.schedules.upsert.forEach((schedule) => {
    schedule.time_in = normalizeTime(schedule.time_in);
    schedule.time_out = normalizeTime(schedule.time_out);
    if (
      !schedule.time_in ||
      !schedule.time_out ||
      schedule.time_in === schedule.time_out
    ) {
      throw new Error("Each schedule needs valid Time In and Time Out values that differ");
    }
  });
  mutation.leaves.add.forEach((leave) => {
    if (!LEAVE_TYPES.has(leave.leave_type)) {
      throw new Error("Leave type must be VL, SL, ML, or PL");
    }
  });

  const targetTypesByDate = new Map();
  const addTarget = (date, type) => {
    if (!targetTypesByDate.has(date)) targetTypesByDate.set(date, new Set());
    targetTypesByDate.get(date).add(type);
  };
  mutation.schedules.upsert.forEach((schedule) => addTarget(schedule.date, "schedule"));
  mutation.dayOffs.add.forEach((date) => addTarget(date, "day_off"));
  mutation.leaves.add.forEach((leave) => addTarget(leave.date, "leave"));
  if ([...targetTypesByDate.values()].some((types) => types.size > 1)) {
    throw new Error("A date cannot be assigned more than one calendar entry type");
  }

  return mutation;
}

function hasDate(dates, date) {
  return dates.includes(date);
}

async function saveEmployeeCalendar(req, res) {
  const employeeId = Number(req.body.employee_id);
  if (!employeeId) return res.status(400).json({ error: "employee_id is required" });

  let mutation;
  try {
    mutation = getMutation(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const hasChanges = mutation.schedules.upsert.length ||
    mutation.schedules.remove.length ||
    mutation.dayOffs.add.length ||
    mutation.dayOffs.remove.length ||
    mutation.leaves.add.length ||
    mutation.leaves.remove.length;
  if (!hasChanges) return res.status(400).json({ error: "No calendar changes were provided" });

  const pool = getClient();
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const chapelId = req.user.role === ROLES.CM ? req.user.chapel_id : null;
    if (req.user.role === ROLES.CM && !chapelId) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "Your account is not assigned to a chapel" });
    }
    const employeeResult = await client.query(
      `SELECT e.id
       FROM employees e
       WHERE e.id = $1
         AND (
           $2::integer IS NULL
           OR e.chapel_id = $2
           OR EXISTS (
             SELECT 1 FROM employee_chapels ec
             WHERE ec.employee_id = e.id AND ec.chapel_id = $2
           )
         )
       FOR UPDATE`,
      [employeeId, chapelId],
    );
    if (!employeeResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: chapelId ? "Employee not found in your chapel" : "Employee not found",
      });
    }

    const targets = new Map();
    mutation.schedules.upsert.forEach((schedule) => targets.set(schedule.date, "schedule"));
    mutation.dayOffs.add.forEach((date) => targets.set(date, "day_off"));
    mutation.leaves.add.forEach((leave) => targets.set(leave.date, "leave"));

    for (const [date, targetType] of targets) {
      const scheduleResult = await client.query(
        "SELECT 1 FROM employee_schedules WHERE employee_id = $1 AND schedule_date = $2",
        [employeeId, date],
      );
      const dayOffResult = await client.query(
        "SELECT 1 FROM employee_day_offs WHERE employee_id = $1 AND day_off_date = $2",
        [employeeId, date],
      );
      const leaveResult = await client.query(
        "SELECT leave_type FROM employee_leaves WHERE employee_id = $1 AND leave_date = $2",
        [employeeId, date],
      );
      const existingTypes = new Set();
      if (scheduleResult.rows.length) existingTypes.add("schedule");
      if (dayOffResult.rows.length) existingTypes.add("day_off");
      if (leaveResult.rows.some((row) => row.leave_type !== "DO")) existingTypes.add("leave");
      if (leaveResult.rows.some((row) => row.leave_type === "DO")) existingTypes.add("day_off");

      for (const existingType of existingTypes) {
        const scheduledForRemoval = existingType === "day_off"
          ? hasDate(mutation.dayOffs.remove, date)
          : hasDate(mutation[existingType === "schedule" ? "schedules" : "leaves"].remove, date);
        if (existingType !== targetType && !scheduledForRemoval) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: `${date} already has a saved ${existingType === "day_off" ? "day off" : existingType}. Remove it before assigning a different entry.`,
          });
        }
      }
    }

    if (mutation.schedules.remove.length) {
      await client.query(
        `DELETE FROM employee_schedules
         WHERE employee_id = $1 AND schedule_date = ANY($2::date[])`,
        [employeeId, mutation.schedules.remove],
      );
    }
    if (mutation.dayOffs.remove.length) {
      await client.query(
        `DELETE FROM employee_day_offs
         WHERE employee_id = $1 AND day_off_date = ANY($2::date[])`,
        [employeeId, mutation.dayOffs.remove],
      );
      await client.query(
        `DELETE FROM employee_leaves
         WHERE employee_id = $1 AND leave_date = ANY($2::date[]) AND leave_type = 'DO'`,
        [employeeId, mutation.dayOffs.remove],
      );
    }
    if (mutation.leaves.remove.length) {
      await client.query(
        `DELETE FROM employee_leaves
         WHERE employee_id = $1 AND leave_date = ANY($2::date[]) AND leave_type <> 'DO'`,
        [employeeId, mutation.leaves.remove],
      );
    }
    const removedLeaveDates = [...new Set([
      ...mutation.leaves.remove,
      ...mutation.dayOffs.remove,
    ])];
    if (removedLeaveDates.length) {
      await client.query(
        `UPDATE attendance_records
         SET status = CASE
               WHEN check_in IS NOT NULL OR check_out IS NOT NULL THEN 'present'
               ELSE 'absent'
             END,
             source = 'employee-calendar',
             notes = CASE
               WHEN notes LIKE 'Leave: %' THEN NULL
               ELSE notes
             END,
             updated_at = NOW()
         WHERE employee_id = $1
           AND attendance_date = ANY($2::date[])
           AND source = 'employee-leave'`,
        [employeeId, removedLeaveDates],
      );
    }

    for (const schedule of mutation.schedules.upsert) {
      await client.query(
        `INSERT INTO employee_schedules
         (employee_id, schedule_date, time_in, time_out, notes)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (employee_id, schedule_date)
         DO UPDATE SET time_in = EXCLUDED.time_in,
                       time_out = EXCLUDED.time_out,
                       notes = COALESCE(EXCLUDED.notes, employee_schedules.notes),
                       updated_at = NOW()`,
        [employeeId, schedule.date, schedule.time_in, schedule.time_out, schedule.notes || null],
      );
    }
    for (const date of mutation.dayOffs.add) {
      await client.query(
        `INSERT INTO employee_day_offs (employee_id, day_off_date, notes)
         VALUES ($1, $2, 'Day Off')
         ON CONFLICT (employee_id, day_off_date) DO NOTHING`,
        [employeeId, date],
      );
    }
    for (const leave of mutation.leaves.add) {
      await client.query(
        `INSERT INTO employee_leaves (employee_id, leave_date, leave_type, notes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (employee_id, leave_date)
         DO UPDATE SET leave_type = EXCLUDED.leave_type,
                       notes = EXCLUDED.notes,
                       updated_at = NOW()`,
        [employeeId, leave.date, leave.leave_type, `Leave: ${leave.leave_type}`],
      );

      const attendanceResult = await client.query(
        `SELECT id
         FROM attendance_records
         WHERE employee_id = $1 AND attendance_date = $2
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [employeeId, leave.date],
      );
      if (attendanceResult.rows.length) {
        await client.query(
          `UPDATE attendance_records
           SET status = 'on_leave', source = 'employee-leave', notes = $1
           WHERE id = $2`,
          [`Leave: ${leave.leave_type}`, attendanceResult.rows[0].id],
        );
      } else {
        await client.query(
          `INSERT INTO attendance_records
           (employee_id, attendance_date, status, source, notes)
           VALUES ($1, $2, 'on_leave', 'employee-leave', $3)`,
          [employeeId, leave.date, `Leave: ${leave.leave_type}`],
        );
      }
    }

    await client.query("COMMIT");
    return res.json({ ok: true });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Failed to roll back employee calendar changes", rollbackError);
      }
    }
    console.error("Failed to save employee calendar", error);
    return res.status(500).json({ error: error.message || "Failed to save employee calendar" });
  } finally {
    client?.release();
  }
}

module.exports = { saveEmployeeCalendar };
