const express = require("express");
const router = express.Router();
const { allowRoles, requireAuth, ROLES } = require("../middlewares/auth");
const {
  listChapels,
  getChapel,
  createChapel,
  updateChapel,
  deleteChapel,
} = require("../controllers/chapelController");

router.get(
  "/",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM, ROLES.FCR),
  listChapels,
);
router.get(
  "/:id",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM, ROLES.FCR),
  getChapel,
);
router.post("/", requireAuth, allowRoles(ROLES.GCM), createChapel);
router.put("/:id", requireAuth, allowRoles(ROLES.GCM), updateChapel);
router.delete("/:id", requireAuth, allowRoles(ROLES.GCM), deleteChapel);

module.exports = router;
