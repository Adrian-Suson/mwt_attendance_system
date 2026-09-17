const express = require("express");
const multer = require("multer");
const { allowRoles, requireAuth, ROLES } = require("../middlewares/auth");
const {
  registerEmployeeFace,
  recognizeFace,
  getEmployeeFaceStatus,
  deleteEmployeeFaces,
} = require("../controllers/faceController");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, callback) => {
    if (file.mimetype?.startsWith("image/")) {
      callback(null, true);
      return;
    }
    callback(new Error("Only image uploads are allowed."));
  },
});

router.post(
  "/register/:employeeId",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM),
  upload.single("image"),
  registerEmployeeFace,
);
router.post("/recognize", upload.single("image"), recognizeFace);
router.get(
  "/:employeeId",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM, ROLES.FCR),
  getEmployeeFaceStatus,
);
router.delete(
  "/:employeeId",
  requireAuth,
  allowRoles(ROLES.GCM, ROLES.CM),
  deleteEmployeeFaces,
);

module.exports = router;
