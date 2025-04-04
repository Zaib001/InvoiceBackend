const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const db = require("../config/db");
const { extractInvoiceData } = require("../utils/invoiceParser");
const xlsx = require("xlsx");


exports.uploadInvoice = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = path.join(__dirname, "..", req.file.path);
    const ext = path.extname(filePath).toLowerCase();

    let invoices = [];

    if (ext === ".txt") {
      invoices = extractInvoiceData(filePath); // Existing TXT logic
    } else if (ext === ".xlsx") {
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = xlsx.utils.sheet_to_json(sheet);

      invoices = parsed.map(row => ({
        advertiser: row.advertiser || "N/A",
        vendor: row.vendor || "N/A",
        ownershipGroup: row.ownershipGroup || "N/A",
        invoiceNumber: row.invoiceNumber || "N/A",
        invoiceDate: row.invoiceDate || "N/A",
        billMemo: row.billMemo || "N/A",
        totalAmount: row.totalAmount || "0.00",
        terms: row.terms || "N/A",
        invoiceSource: row.invoiceSource || "Excel Upload",
        category: row.category || "5015 COS - Radio",
      }));
    } else {
      return res.status(400).json({ error: "Unsupported file type" });
    }

    // ✅ Save invoices
    const db = require("../config/db");
    for (const invoice of invoices) {
      const exists = await new Promise((resolve, reject) => {
        db.get("SELECT * FROM invoices WHERE invoiceNumber = ?", [invoice.invoiceNumber], (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });

      if (!exists) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO invoices 
              (advertiser, vendor, ownershipGroup, invoiceNumber, invoiceDate, billMemo, totalAmount, terms, invoiceSource, category) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              invoice.advertiser,
              invoice.vendor,
              invoice.ownershipGroup,
              invoice.invoiceNumber,
              invoice.invoiceDate,
              invoice.billMemo,
              invoice.totalAmount,
              invoice.terms,
              invoice.invoiceSource,
              invoice.category
            ],
            err => {
              if (err) return reject(err);
              resolve();
            }
          );
        });
      }
    }

    fs.unlinkSync(filePath);
    res.json({ message: `✅ ${invoices.length} invoices uploaded.`, invoices });

  } catch (err) {
    console.error("❌ Upload Error:", err);
    res.status(500).json({ error: "Failed to process invoice file" });
  }
};


exports.getAllInvoices = (req, res) => {
  db.all("SELECT * FROM invoices", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch invoices" });
    res.json(rows);
  });
};

exports.deleteAllInvoices = (req, res) => {
  db.run("DELETE FROM invoices", [], (err) => {
    if (err) return res.status(500).json({ error: "Failed to delete invoices" });
    res.json({ message: "All invoices deleted." });
  });
};

exports.updateInvoice = (req, res) => {
  const { invoiceNumber } = req.params;
  const {
    advertiser, vendor, ownershipGroup, invoiceDate,
    billMemo, totalAmount, terms, invoiceSource, category
  } = req.body;

  const query = `
    UPDATE invoices SET
      advertiser = COALESCE(?, advertiser),
      vendor = COALESCE(?, vendor),
      ownershipGroup = COALESCE(?, ownershipGroup),
      invoiceDate = COALESCE(?, invoiceDate),
      billMemo = COALESCE(?, billMemo),
      totalAmount = COALESCE(?, totalAmount),
      terms = COALESCE(?, terms),
      invoiceSource = COALESCE(?, invoiceSource),
      category = COALESCE(?, category)
    WHERE invoiceNumber = ?`;

  const values = [advertiser, vendor, ownershipGroup, invoiceDate, billMemo, totalAmount, terms, invoiceSource, category, invoiceNumber];

  db.run(query, values, function (err) {
    if (err) return res.status(500).json({ error: "Failed to update invoice" });
    if (this.changes === 0) return res.status(404).json({ error: "Invoice not found" });
    res.json({ message: "Invoice updated successfully" });
  });
};

exports.overrideStatus = (req, res) => {
  const { invoiceNumber } = req.params;
  const { isProcessed } = req.body;

  db.run("UPDATE invoices SET isProcessed = ? WHERE invoiceNumber = ?", [isProcessed, invoiceNumber], (err) => {
    if (err) return res.status(500).json({ error: "Failed to update status" });
    res.json({ message: "Status updated." });
  });
};

exports.exportToExcel = (req, res) => {
  db.all("SELECT * FROM invoices", [], (err, data) => {
    if (err) return res.status(500).json({ error: "Failed to fetch invoices" });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoices");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", "attachment; filename=invoices.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  });
};
