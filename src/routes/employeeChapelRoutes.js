const express = require("express");
const router = express.Router();
const { allowRoles, requireAuth, ROLES } = require("../middlewares/auth");
const {
  listChapelsForEmployee,
  listEmployeesForChapel,
  addChapelAssignment,
  removeChapelAssignment,
} = require("../controllers/employeeChapelController");

router.get(
  "/employee/:employeeId",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM, ROLES.FCR),
  listChapelsForEmployee,
);
router.get(
  "/chapel/:chapelId",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM, ROLES.FCR),
  listEmployeesForChapel,
);
router.post("/", requireAuth, allowRoles(ROLES.GCM), addChapelAssignment);
router.delete(
  "/:employeeId/:chapelId",
  requireAuth,
  allowRoles(ROLES.GCM),
  removeChapelAssignment,
);

module.exports = router;
