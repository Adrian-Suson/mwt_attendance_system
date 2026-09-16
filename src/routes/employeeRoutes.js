const express = require("express");
const router = express.Router();
const { allowRoles, requireAuth, ROLES } = require("../middlewares/auth");
const {
  listEmployees,
  createEmployee,
  getEmployee,
  updateEmployee,
  deleteEmployee,
} = require("../controllers/employeeController");

router.get(
  "/",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM, ROLES.FCR),
  listEmployees,
);
router.get(
  "/:id",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM, ROLES.FCR),
  getEmployee,
);
router.post("/", requireAuth, allowRoles(ROLES.GCM), createEmployee);
router.put(
  "/:id",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM),
  updateEmployee,
);
router.delete("/:id", requireAuth, allowRoles(ROLES.GCM), deleteEmployee);

module.exports = router;
