const express = require("express");

const router = express.Router();

const { allowRoles, requireAuth, ROLES } = require("../middlewares/auth");

const {
  listEmployeeLeaves,
  getEmployeeLeave,
  createEmployeeLeaves,
  updateEmployeeLeave,
  deleteEmployeeLeave,
  deleteEmployeeLeaves,
} = require("../controllers/employeeLeaveController");

router.use(requireAuth, allowRoles(ROLES.GCM, ROLES.CM));

router.get("/", listEmployeeLeaves);

router.get("/:id", getEmployeeLeave);

router.post("/", createEmployeeLeaves);

router.put("/:id", updateEmployeeLeave);

router.delete("/", deleteEmployeeLeaves);
router.delete("/:id", deleteEmployeeLeave);

module.exports = router;
