const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const xlsx = require("xlsx");
const InvoiceModel = require("../models/invoiceModel");
const { extractInvoiceData } = require("../utils/extractInvoiceData");
const { parseInvoiceDate } = require('../utils/broadcastCalendar')
// ✅ Upload & Parse Invoices
// exports.uploadInvoice = async (req, res) => {
//   try {
//     if (!req.files || req.files.length === 0) {
//       return res.status(400).json({ error: "No files uploaded" });
//     }

//     let allInvoices = [];

//     for (const file of req.files) {
//       const ext = path.extname(file.originalname).toLowerCase();
//       const filePath = path.join(__dirname, "..", file.path);
//       let invoices = [];

//       if (ext === ".txt") {
//         invoices = extractInvoiceData(filePath);
//       } else if (ext === ".xlsx") {
//         const workbook = XLSX.readFile(filePath);
//         const sheet = workbook.Sheets[workbook.SheetNames[0]];
//         const parsed = XLSX.utils.sheet_to_json(sheet);

//         invoices = parsed.map(row => ({
//           advertiser: row.advertiser || "N/A",
//           vendor: row.vendor || "N/A",
//           station: row.station,
//           stationFullName: row.stationFullName,
//           ownershipGroup: row.ownershipGroup || "N/A",
//           invoiceNumber: row.invoiceNumber || "N/A",
//           invoiceDate: row.invoiceDate || "N/A",
//           billMemo: row.billMemo || "N/A",
//           totalAmount: row.totalAmount || "0.00",
//           terms: row.terms || "N/A",
//           invoiceSource: row.invoiceSource || "Excel Upload",
//           category: row.category || "5015 COS - Radio",
//           isProcessed: false
//         }));
//       } else {
//         return res.status(400).json({ error: `Unsupported file type: ${file.originalname}` });
//       }

//       allInvoices.push(...invoices);
//       fs.unlinkSync(filePath);
//     }

//     res.json({
//       message: `Parsed ${allInvoices.length} invoices from ${req.files.length} files`,
//       invoices: allInvoices
//     });

//   } catch (err) {
//     console.error("❌ Upload Error:", err);
//     res.status(500).json({ error: "Failed to process uploaded files" });
//   }
// };
exports.uploadInvoice = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      console.log("⚠️ No files uploaded");
      return res.status(400).json({ error: "No files uploaded" });
    }

    let allInvoices = [];

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const filePath = path.join(__dirname, "..", file.path);
      let invoices = [];

      console.log(`📥 Processing file: ${file.originalname} (${ext})`);

      if (ext === ".txt") {
        invoices = await extractInvoiceData(filePath);
        console.log(`✅ Parsed ${Array.isArray(invoices) ? invoices.length : 0} invoices from TXT file.`);
      } else if (ext === ".xlsx") {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const parsed = XLSX.utils.sheet_to_json(sheet);

        invoices = parsed.map(row => ({
          advertiser: row.advertiser || "N/A",
          vendor: row.vendor || "N/A",
          station: row.station || "N/A",
          stationFullName: row.stationFullName || "N/A",
          ownershipGroup: row.ownershipGroup || "N/A",
          invoiceNumber: row.invoiceNumber || "N/A",
          invoiceDate: parseInvoiceDate(row.invoiceDate), // ✅ Broadcast Calendar mapping
          billMemo: row.billMemo || "N/A",
          totalAmount: row.totalAmount || "0.00",
          terms: row.terms || "N/A",
          invoiceSource: row.invoiceSource || "Excel Upload",
          category: row.category || "5015 COS - Radio",
          cabLabel: row["CAB Label"] || "", // ✅ CAB Label parsing
          isProcessed: false,
        }));

        console.log(`✅ Parsed ${invoices.length} invoices from Excel file.`);
      } else {
        console.log(`❌ Unsupported file type: ${file.originalname}`);
        return res.status(400).json({ error: `Unsupported file type: ${file.originalname}` });
      }

      if (Array.isArray(invoices)) {
        allInvoices.push(...invoices);
      } else {
        console.warn(`⚠️ No invoices returned from: ${file.originalname}`);
      }

      fs.unlinkSync(filePath); // ✅ Delete temp file after parsing
      console.log(`🗑️ Deleted temp file: ${file.originalname}`);
    }

    console.log(`🎯 Total invoices parsed: ${allInvoices.length}`);
    res.json({
      message: `Parsed ${allInvoices.length} invoices from ${req.files.length} files`,
      invoices: allInvoices
    });

  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ error: "Failed to process uploaded files" });
  }
};

// ✅ Save Invoices & Export
exports.saveInvoicesAndExport = async (req, res) => {
  const invoices = req.body.invoices;

  if (!Array.isArray(invoices) || invoices.length === 0) {
    return res.status(400).json({ error: "No invoices provided" });
  }

  try {
    for (const invoice of invoices) {
      const exists = await InvoiceModel.findOne({ invoiceNumber: invoice.invoiceNumber });
      if (!exists) await InvoiceModel.create(invoice);
    }

    const ws = xlsx.utils.json_to_sheet(invoices);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Invoices");

    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=invoices.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    console.error("❌ Export Error:", err);
    res.status(500).json({ error: "Failed to save/export invoices" });
  }
};

// ✅ Get All
exports.getAllInvoices = async (req, res) => {
  try {
    const data = await InvoiceModel.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
};

// ✅ Delete All
exports.deleteAllInvoices = async (req, res) => {
  try {
    await InvoiceModel.deleteMany({});
    res.json({ message: "All invoices deleted." });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete invoices" });
  }
};

// ✅ Update
exports.updateInvoice = async (req, res) => {
  const { invoiceNumber } = req.params;
  try {
    const updated = await InvoiceModel.findOneAndUpdate({ invoiceNumber }, req.body, { new: true });
    if (!updated) return res.status(404).json({ error: "Invoice not found" });
    res.json({ message: "Invoice updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update invoice" });
  }
};

// ✅ Status
exports.overrideStatus = async (req, res) => {
  const { invoiceNumber } = req.params;
  const { isProcessed } = req.body;

  try {
    const updated = await InvoiceModel.findOneAndUpdate({ invoiceNumber }, { isProcessed }, { new: true });
    if (!updated) return res.status(404).json({ error: "Invoice not found" });
    res.json({ message: "Status updated." });
  } catch (err) {
    res.status(500).json({ error: "Failed to update status" });
  }
};

// ✅ Export All
exports.exportToExcel = async (req, res) => {
  try {
    const data = await InvoiceModel.find({});
    const ws = XLSX.utils.json_to_sheet(data.map(d => d.toObject()));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=invoices.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: "Failed to export" });
  }
};
