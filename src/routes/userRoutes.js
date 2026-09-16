const express = require("express");
const router = express.Router();
const { allowRoles, requireAuth, ROLES } = require("../middlewares/auth");
const {
  listUsers,
  getUser,
  createUser,
  changePassword,
  resetUserPassword,
  updateUser,
  deleteUser,
} = require("../controllers/userController");

router.post("/change-password", requireAuth, changePassword);
router.use(requireAuth, allowRoles(ROLES.GCM));
router.get("/", listUsers);
router.get("/:id", getUser);
router.post("/", createUser);
router.put("/:id/reset-password", resetUserPassword);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
