const EmployeeLeave = require("../models/employeeLeave");
const AttendanceRecord = require("../models/attendanceRecord");
const Employee = require("../models/employee");

function getPhilippineDayName(dateKey) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "Asia/Manila",
  }).format(
    new Date(`${dateKey}T12:00:00+08:00`)
  );
}


/**
 * Sync selected leave dates into attendance.
 *
 * Every selected date becomes:
 * status = on_leave
 */
async function syncAttendanceForDates(
  employeeId,
  dates,
  leaveType,
  notes,
) {
  for (const attendanceDate of dates) {
    const existing =
      await AttendanceRecord.getAllAttendanceRecords({
        employee_id: employeeId,
        attendance_date: attendanceDate,
      });

    const attendanceData = {
      employee_id: employeeId,
      attendance_date: attendanceDate,
      status: "on_leave",
      source: "employee-leave",
      notes:
        notes ||
        `Leave: ${leaveType}`,
    };

    if (existing[0]) {
      await AttendanceRecord.updateAttendanceRecord(
        existing[0].id,
        attendanceData,
      );
    } else {
      await AttendanceRecord.createAttendanceRecord(
        attendanceData,
      );
    }
  }
}


/**
 * GET LEAVES
 *
 * Example:
 *
 * GET /api/leaves
 *
 * GET /api/leaves?employee_id=1
 *
 * GET /api/leaves?employee_id=1
 *     &start_date=2026-09-01
 *     &end_date=2026-09-30
 */
async function listEmployeeLeaves(req, res) {
  try {
    const filters = {
      employee_id: req.query.employee_id
        ? Number(req.query.employee_id)
        : undefined,

      start_date:
        req.query.start_date || undefined,

      end_date:
        req.query.end_date || undefined,
    };

    const rows =
      await EmployeeLeave.getEmployeeLeaves(
        filters,
      );

    res.json(rows);
  } catch (err) {
    console.error("Get employee leaves error:", err);

    res.status(500).json({
      error: err.message,
    });
  }
}


/**
 * GET ONE LEAVE
 */
async function getEmployeeLeave(req, res) {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: "Invalid id",
      });
    }

    const leave =
      await EmployeeLeave.getEmployeeLeaveById(id);

    if (!leave) {
      return res.status(404).json({
        error: "Leave not found",
      });
    }

    res.json(leave);
  } catch (err) {
    console.error("Get employee leave error:", err);

    res.status(500).json({
      error: err.message,
    });
  }
}


/**
 * CREATE LEAVE DATES
 *
 * Body:
 *
 * {
 *   employee_id: 1,
 *   dates: [
 *     "2026-09-16",
 *     "2026-09-17",
 *     "2026-09-19"
 *   ],
 *   leave_type: "VL",
 *   notes: "Vacation"
 * }
 */
async function createEmployeeLeaves(req, res) {
  const {
    employee_id,
    dates,
    leave_type,
    notes,
  } = req.body;

  if (!employee_id) {
    return res.status(400).json({
      error: "employee_id is required",
    });
  }

  if (!leave_type) {
    return res.status(400).json({
      error: "leave_type is required",
    });
  }

  if (!Array.isArray(dates) || dates.length === 0) {
    return res.status(400).json({
      error: "dates[] is required",
    });
  }

  try {
    const employee =
      await Employee.getEmployeeById(
        employee_id,
      );

    if (!employee) {
      return res.status(404).json({
        error: "Employee not found",
      });
    }

    const normalizedDates =
      EmployeeLeave.normalizeDateKeys(
        dates,
      );

    /**
     * Don't allow scheduled day off
     * to be recorded as leave.
     */
    const dayOff =
      employee.day_off || "Sunday";

    for (const dateKey of normalizedDates) {
      if (
        getPhilippineDayName(dateKey) === dayOff
      ) {
        return res.status(400).json({
          error:
            `${dateKey} is the employee's scheduled ` +
            `day off (${dayOff}) and cannot be marked as leave.`,
        });
      }
    }

    const created =
      await EmployeeLeave.createEmployeeLeaves({
        employee_id,
        dates: normalizedDates,
        leave_type,
        notes,
      });

    /**
     * Immediately put the selected dates
     * into attendance.
     */
    await syncAttendanceForDates(
      employee_id,
      normalizedDates,
      leave_type,
      notes,
    );

    res.status(201).json({
      message: "Leave dates saved successfully",
      leaves: created,
    });
  } catch (err) {
    console.error(
      "Create employee leaves error:",
      err,
    );

    res.status(500).json({
      error: err.message,
    });
  }
}


/**
 * UPDATE ONE LEAVE DATE
 */
async function updateEmployeeLeave(req, res) {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: "Invalid id",
      });
    }

    const updated =
      await EmployeeLeave.updateEmployeeLeave(
        id,
        req.body,
      );

    if (!updated) {
      return res.status(404).json({
        error: "Leave not found",
      });
    }

    /**
     * Keep attendance synchronized.
     */
    await syncAttendanceForDates(
      updated.employee_id,
      [updated.leave_date],
      updated.leave_type,
      updated.notes,
    );

    res.json(updated);
  } catch (err) {
    console.error(
      "Update employee leave error:",
      err,
    );

    res.status(500).json({
      error: err.message,
    });
  }
}


/**
 * DELETE ONE LEAVE DATE
 */
async function deleteEmployeeLeave(req, res) {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        error: "Invalid id",
      });
    }

    const removed =
      await EmployeeLeave.deleteEmployeeLeave(
        id,
      );

    if (!removed) {
      return res.status(404).json({
        error: "Leave not found",
      });
    }

    /**
     * IMPORTANT:
     *
     * We remove the leave record.
     *
     * We do NOT automatically delete the
     * attendance record because it may contain
     * other information.
     */
    res.json({
      ok: true,
      message: "Leave date deleted",
      leave: removed,
    });
  } catch (err) {
    console.error(
      "Delete employee leave error:",
      err,
    );

    res.status(500).json({
      error: err.message,
    });
  }
}


module.exports = {
  listEmployeeLeaves,
  getEmployeeLeave,
  createEmployeeLeaves,
  updateEmployeeLeave,
  deleteEmployeeLeave,
};