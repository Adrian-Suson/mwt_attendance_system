const express = require("express");
const { allowRoles, requireAuth, ROLES } = require("../middlewares/auth");
const {
  listEmployeeDayOffs,
  createEmployeeDayOffs,
} = require("../controllers/employeeDayOffController");

const router = express.Router();
router.use(requireAuth, allowRoles(ROLES.GCM, ROLES.CM));
router.get("/", listEmployeeDayOffs);
router.post("/", createEmployeeDayOffs);

module.exports = router;
