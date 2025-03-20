require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");
const XLSX = require("xlsx");
const db = require("./config/db")
const app = express();
app.use(cors());
app.use(express.json());


db.serialize(() => {
    console.log("✅ Database is ready to use.");
})

db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
        console.error("❌ Error fetching tables:", err.message);
    } else {
        console.log("📌 Database Tables:", tables);
    }
});





const broadcastCalendar = [
    { month: "January", start: "2024-12-31", end: "2025-01-28" },
    { month: "February", start: "2025-01-29", end: "2025-02-25" },
    { month: "March", start: "2025-02-26", end: "2025-03-31" },
    { month: "April", start: "2025-04-01", end: "2025-04-28" },
    { month: "May", start: "2025-04-29", end: "2025-05-26" },
    { month: "June", start: "2025-05-27", end: "2025-06-30" },
    { month: "July", start: "2025-07-01", end: "2025-07-28" },
    { month: "August", start: "2025-07-29", end: "2025-08-25" },
    { month: "September", start: "2025-08-26", end: "2025-09-29" },
    { month: "October", start: "2025-09-30", end: "2025-10-27" },
    { month: "November", start: "2025-10-28", end: "2025-11-24" },
    { month: "December", start: "2025-11-25", end: "2025-12-29" }
];
const getBroadcastInvoiceDate = (invoiceDate) => {
    console.log("Original Date:", invoiceDate);
    if (!invoiceDate || isNaN(Date.parse(invoiceDate))) return "N/A";

    const dateObj = new Date(invoiceDate);

    for (const period of broadcastCalendar) {
        const start = new Date(period.start);
        const end = new Date(period.end);

        // ✅ If date falls in the broadcast period, return the last day of the period
        if (dateObj >= start && dateObj <= end) {
            console.log("Mapped to Broadcast Period:", period.end);
            return new Date(end).toISOString().split("T")[0];
        }
    }

    // ✅ Handle dates falling at the end of a month (shift forward)
    if (dateObj.getDate() > 25) {
        dateObj.setMonth(dateObj.getMonth() + 1);
        console.log("Adjusted for Late-Month Invoice:", dateObj);
    }

    return dateObj.toISOString().split("T")[0]; // ✅ Ensure proper date format
};

// ✅ Modify parseInvoiceDate() to ensure correct mapping
const parseInvoiceDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 6) return "N/A";

    const year = "20" + dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4) - 1; // Convert to zero-based index
    const day = dateStr.substring(4, 6);

    const invoiceDate = new Date(year, month, day).toISOString().split("T")[0];

    // ✅ Apply Broadcast Calendar Mapping
    return getBroadcastInvoiceDate(invoiceDate);
};



// Multer Configuration for TXT File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => cb(null, file.originalname)
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype === "text/plain") cb(null, true);
    else cb(new Error("Only TXT files are allowed"), false);
};

const upload = multer({ storage, fileFilter });

// Detect Invoice Type (Radio or Marketron)
const detectInvoiceType = (data) => {
    if (data.some(line => line.includes("MKT"))) {
        return "Marketron";
    }
    return "Radio Invoices";
};

const extractInvoiceData = (filePath) => {
    const data = fs.readFileSync(filePath, "utf-8").split("\n");
    const invoiceType = detectInvoiceType(data);

    let invoices = []; // ✅ Store multiple invoices
    let invoice = {}; // ✅ Temporary invoice object
    let station = "N/A"; 
    let stationFullName = "N/A";
    let ownershipGroup = "N/A"; 
    let lastVendor = "N/A"; // ✅ Store last known vendor
    let vendorField1= "N/A";
    data.forEach(line => {
        const fields = line.split(";");
        const recordCode = fields[0];

        switch (recordCode) {
            case "22": // ✅ Extract Station & Ownership Info
                station = fields[1] || "N/A";
                stationFullName = fields[3] || "N/A";
                ownershipGroup = fields[5] || "N/A";
                break;
                case "23": // ✅ Assign Vendor ONLY for Radio from Line 23
                    vendorField1 = fields[1] || "N/A";
                break;
            case "31": // ✅ Start New Invoice Processing
                if (invoice.invoiceNumber && invoice.invoiceNumber !== "N/A") {
                    invoices.push({ ...invoice });
                }

                invoice = {
                    advertiser: fields[3] || "N/A",
                    invoiceNumber: fields[8] || "N/A",
                    invoiceDate: fields[5] ? parseInvoiceDate(fields[10]) : "N/A",
                    estimateCode: fields[7] || "N/A",
                    dueDate: fields[21] ? parseInvoiceDate(fields[21]) : "N/A",
                    billMemo: `${fields[3] || "N/A"} - ${fields[7] || "N/A"}`,
                    totalAmount: "N/A", // ✅ To be updated in case 34
                    terms: "N/A",
                    invoiceSource: invoiceType,
                    category: invoiceType === "Marketron" ? "5015 COS - Radio" : "5015 COS - Radio",
                    vendor: invoiceType === "Marketron" ? `${ownershipGroup} - ${station} - ${stationFullName}` : `${vendorField1} - ${station} - ${stationFullName}`, // ✅ Set "N/A" for Radio until case 23
                    ownershipGroup: ownershipGroup,
                };
                break;

           

            case "34": // ✅ Assign Total Amount
                invoice.totalAmount = fields[4] || "N/A";
                break;

            case "33": // ✅ Assign Terms
                invoice.terms = fields[1] || "N/A";
                break;
        }
    });

    // ✅ Ensure last invoice is added
    if (invoice.invoiceNumber && invoice.invoiceNumber !== "N/A") {
        invoices.push(invoice);
    }

    return invoices;
};










app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const filePath = path.join(__dirname, req.file.path);
        const invoices = extractInvoiceData(filePath); // ✅ Extract Multiple Invoices
        console.log("📌 Invoices to Insert:", invoices);

        // ✅ Check for duplicates and insert each invoice
        for (const invoice of invoices) {
            const checkDuplicate = await new Promise((resolve, reject) => {
                db.get("SELECT * FROM invoices WHERE invoiceNumber = ?", [invoice.invoiceNumber], (err, row) => {
                    if (err) return reject("Database Error");
                    resolve(row);
                });
            });

            // ✅ Insert only if it's not a duplicate
            if (!checkDuplicate) {
                await new Promise((resolve, reject) => {
                    db.run(
                        `INSERT INTO invoices (advertiser, vendor, ownershipGroup, invoiceNumber, invoiceDate, billMemo, totalAmount, terms, invoiceSource, category) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            invoice.advertiser || "N/A",
                            invoice.vendor || "N/A",
                            invoice.ownershipGroup || "N/A",
                            invoice.invoiceNumber || "N/A",
                            invoice.invoiceDate || "N/A",
                            invoice.billMemo || "N/A",
                            invoice.totalAmount || "0.00",
                            invoice.terms || "N/A",
                            invoice.invoiceSource || "Unknown",
                            invoice.category || "N/A"
                        ],
                        function (err) {
                            if (err) {
                                console.error("❌ SQLite Insert Error:", err);
                                return reject("Failed to insert data: " + err.message);
                            }
                            resolve();
                        }
                    );
                });
            }
        }

        fs.unlinkSync(filePath);
        res.json({
            message: `✅ ${invoices.length} Invoices Processed Successfully`,
            invoices
        });

    } catch (error) {
        console.error("❌ Upload Error:", error);
        res.status(500).json({ error });
    }
});


app.get("/invoices", async (req, res) => {
    try {
        db.all("SELECT * FROM invoices", [], (err, rows) => {
            if (err) {
                return res.status(500).json({ error: "Database Error" });
            }
            res.json(rows); // ✅ Return All Invoices
        });
    } catch (error) {
        console.error("❌ Fetch Invoices Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
app.get("/invoices", async (req, res) => {
    try {
        db.all("SELECT * FROM invoices", [], (err, rows) => {
            if (err) {
                return res.status(500).json({ error: "Database Error" });
            }
            res.json(rows); // ✅ Return All Invoices
        });
    } catch (error) {
        console.error("❌ Fetch Invoices Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});




app.get("/export-excel", async (req, res) => {
    try {
        db.all("SELECT * FROM invoices", [], (err, invoices) => {
            if (err) {
                return res.status(500).json({ error: "Database Error" });
            }

            // ✅ Convert Data to Excel
            const ws = XLSX.utils.json_to_sheet(invoices);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Invoices");

            // ✅ Generate Buffer & Send as Response
            const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
            res.setHeader("Content-Disposition", "attachment; filename=invoices.xlsx");
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.send(excelBuffer);
        });
    } catch (error) {
        console.error("❌ Excel Export Error:", error);
        res.status(500).json({ error: "Failed to export Excel." });
    }
});



// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
