const express = require("express");
const { allowRoles, requireAuth, ROLES } = require("../middlewares/auth");
const {
  listEmployeeSchedules,
  createEmployeeSchedules,
} = require("../controllers/employeeScheduleController");

const router = express.Router();
router.use(requireAuth, allowRoles(ROLES.GCM, ROLES.CM));
router.get("/", listEmployeeSchedules);
router.post("/", createEmployeeSchedules);

module.exports = router;
