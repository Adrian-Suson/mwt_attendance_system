const express = require("express");
const multer = require("multer");
const router = express.Router();
const {
  listPublicUploads,
  getPublicUpload,
  streamPublicUploadImage,
  createPublicUpload,
  updatePublicUpload,
  deletePublicUpload,
  getPublicAttendanceStatus,
} = require("../controllers/publicUploadController");
const {
  listPublicEmployeeNames,
} = require("../controllers/employeeController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }

    cb(new Error("Only image uploads are allowed."));
  },
});

router.get("/employees", listPublicEmployeeNames);
router.get("/attendance-status", getPublicAttendanceStatus);
router.get("/", listPublicUploads);
router.get("/:id/image", streamPublicUploadImage);
router.get("/:id", getPublicUpload);
router.post("/", upload.single("file"), createPublicUpload);
router.put("/:id", updatePublicUpload);
router.delete("/:id", deletePublicUpload);

module.exports = router;
