const express = require("express");
const { allowRoles, requireAuth, ROLES } = require("../middlewares/auth");
const { saveEmployeeCalendar } = require("../controllers/employeeCalendarController");

const router = express.Router();
router.use(requireAuth, allowRoles(ROLES.GCM, ROLES.CM));
router.post("/", saveEmployeeCalendar);

module.exports = router;
