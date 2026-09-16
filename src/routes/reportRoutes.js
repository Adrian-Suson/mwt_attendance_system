// routes/reportRoutes.js

const express = require("express");
const ReportController = require("../controllers/reportController");

function createReportRoutes(db) {
  const router = express.Router();

  const reportController = new ReportController(db);

  // ============================================================
  // REPORT
  // ============================================================

  /**
   * GET /api/reports
   *
   * Example:
   * GET /api/reports?start_date=2026-09-01&end_date=2026-09-15
   */
  router.get("/", reportController.getReport);

  /**
   * GET /api/reports/employee/:employeeId
   *
   * Example:
   * GET /api/reports/employee/13
   * ?start_date=2026-09-01
   * &end_date=2026-09-15
   */
  router.get(
    "/employee/:employeeId",
    reportController.getEmployeeReport
  );

  return router;
}

module.exports = createReportRoutes;