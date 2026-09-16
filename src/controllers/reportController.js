const ReportModel = require("../models/reportModel");

class ReportController {
  constructor(db) {
    this.reportModel = new ReportModel(db);
  }

  // ============================================================
  // GET /api/reports
  // ============================================================
  getReport = async (req, res) => {
    try {
      const { start_date, end_date } = req.query;

      // ----------------------------------------------------------
      // Required dates
      // ----------------------------------------------------------
      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          message: "start_date and end_date are required.",
        });
      }

      // ----------------------------------------------------------
      // Validate dates
      // ----------------------------------------------------------
      if (!this.isValidDate(start_date)) {
        return res.status(400).json({
          success: false,
          message: "Invalid start_date. Expected YYYY-MM-DD.",
        });
      }

      if (!this.isValidDate(end_date)) {
        return res.status(400).json({
          success: false,
          message: "Invalid end_date. Expected YYYY-MM-DD.",
        });
      }

      // ----------------------------------------------------------
      // Validate date range
      // ----------------------------------------------------------
      if (start_date > end_date) {
        return res.status(400).json({
          success: false,
          message: "start_date cannot be later than end_date.",
        });
      }

      // ----------------------------------------------------------
      // Get report
      // ----------------------------------------------------------
      const report = await this.reportModel.getReport(
        start_date,
        end_date
      );

      return res.status(200).json({
        success: true,
        ...report,
      });
    } catch (error) {
      console.error("REPORT CONTROLLER ERROR:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to generate report.",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : undefined,
      });
    }
  };

  // ============================================================
  // GET /api/reports/employee/:employeeId
  // ============================================================
  getEmployeeReport = async (req, res) => {
    try {
      const { employeeId } = req.params;
      const { start_date, end_date } = req.query;

      // ----------------------------------------------------------
      // Validate employee ID
      // ----------------------------------------------------------
      if (!employeeId) {
        return res.status(400).json({
          success: false,
          message: "employeeId is required.",
        });
      }

      const numericEmployeeId = Number(employeeId);

      if (
        !Number.isInteger(numericEmployeeId) ||
        numericEmployeeId <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid employeeId.",
        });
      }

      // ----------------------------------------------------------
      // Required dates
      // ----------------------------------------------------------
      if (!start_date || !end_date) {
        return res.status(400).json({
          success: false,
          message: "start_date and end_date are required.",
        });
      }

      // ----------------------------------------------------------
      // Validate dates
      // ----------------------------------------------------------
      if (!this.isValidDate(start_date)) {
        return res.status(400).json({
          success: false,
          message: "Invalid start_date. Expected YYYY-MM-DD.",
        });
      }

      if (!this.isValidDate(end_date)) {
        return res.status(400).json({
          success: false,
          message: "Invalid end_date. Expected YYYY-MM-DD.",
        });
      }

      // ----------------------------------------------------------
      // Validate date range
      // ----------------------------------------------------------
      if (start_date > end_date) {
        return res.status(400).json({
          success: false,
          message: "start_date cannot be later than end_date.",
        });
      }

      // ----------------------------------------------------------
      // Get employee report
      // ----------------------------------------------------------
      const report =
        await this.reportModel.getEmployeeReport(
          numericEmployeeId,
          start_date,
          end_date
        );

      // ----------------------------------------------------------
      // Employee not found
      // ----------------------------------------------------------
      if (!report.employee) {
        return res.status(404).json({
          success: false,
          message: "Employee not found.",
        });
      }

      return res.status(200).json({
        success: true,
        ...report,
      });
    } catch (error) {
      console.error(
        "EMPLOYEE REPORT CONTROLLER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        message: "Failed to generate employee report.",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : undefined,
      });
    }
  };

  // ============================================================
  // Validate YYYY-MM-DD
  // ============================================================
  isValidDate(value) {
    // Must be a string
    if (typeof value !== "string") {
      return false;
    }

    // Must exactly match YYYY-MM-DD
    const match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (!match) {
      return false;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    // Basic range validation
    if (month < 1 || month > 12) {
      return false;
    }

    if (day < 1 || day > 31) {
      return false;
    }

    // Validate actual calendar date using UTC
    const date = new Date(
      Date.UTC(year, month - 1, day)
    );

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }
}

module.exports = ReportController;

