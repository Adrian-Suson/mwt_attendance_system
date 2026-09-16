const express = require("express");
const router = express.Router();
const { allowRoles, requireAuth, ROLES } = require("../middlewares/auth");
const {
  listAttendanceRecords,
  getAttendanceRecord,
  createAttendanceRecord,
  updateAttendanceRecord,
  deleteAttendanceRecord,
} = require("../controllers/attendanceRecordController");

router.get(
  "/",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM, ROLES.FCR),
  listAttendanceRecords,
);
router.get(
  "/:id",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM, ROLES.FCR),
  getAttendanceRecord,
);
router.post("/", requireAuth, allowRoles(ROLES.GCM), createAttendanceRecord);
router.put("/:id", requireAuth, allowRoles(ROLES.GCM), updateAttendanceRecord);
router.delete(
  "/:id",
  requireAuth,
  allowRoles(ROLES.GCM),
  deleteAttendanceRecord,
);

module.exports = router;
