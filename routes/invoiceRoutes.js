const express = require("express");
const router = express.Router();
const multer = require("multer");
const invoiceController = require("../controllers/invoiceController");

// Upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "text/plain",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only TXT or XLSX files are allowed"), false);
  }
};

const upload = multer({ storage, fileFilter });

router.post("/upload", upload.single("files"), invoiceController.uploadInvoice);
router.get("/", invoiceController.getAllInvoices);
router.delete("/", invoiceController.deleteAllInvoices);
router.put("/:invoiceNumber", invoiceController.updateInvoice);
router.put("/override/:invoiceNumber", invoiceController.overrideStatus);
router.get("/export-excel", invoiceController.exportToExcel);
router.post("/export-save", invoiceController.saveInvoicesAndExport);

module.exports = router;
