require("dotenv").config();
const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");
const XLSX = require("xlsx");
const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Define MongoDB Schema
const InvoiceSchema = new mongoose.Schema({
    advertiser: String,
    vendor: String,
    ownershipGroup: String,
    invoiceNumber: String,
    invoiceDate: String,
    billMemo: String,
    totalAmount: String,
    terms: String,
    invoiceSource: String,
    category: String
});

const Invoice = mongoose.model("Invoice", InvoiceSchema);


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
    if (!invoiceDate || isNaN(Date.parse(invoiceDate))) return "N/A";

    const dateObj = new Date(invoiceDate);

    for (const period of broadcastCalendar) {
        const start = new Date(period.start);
        const end = new Date(period.end);

        if (dateObj >= start && dateObj <= end) {
            return end.toISOString().split("T")[0]; // Return last day of the broadcast month
        }
    }

    return invoiceDate; // Return original date if not found in the calendar
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
    return "Radio";
};

// Extract Invoice Data
const extractInvoiceData = (filePath) => {
    const data = fs.readFileSync(filePath, "utf-8").split("\n");
    const invoiceType = detectInvoiceType(data);

    let invoice = {
        advertiser: "N/A",
        vendor: "N/A",
        ownershipGroup: "N/A",
        invoiceNumber: "N/A",
        invoiceDate: "N/A",
        billMemo: "N/A",
        totalAmount: "N/A",
        terms: "N/A",
        invoiceSource: invoiceType,
        category: invoiceType === "Marketron" ? "5015 COS - Radio" : "5015 COS - Radio"
    };
    let station = "N/A"; // Declare station globally before switch
    let stationFullName = "N/A";
    data.forEach(line => {
        const fields = line.split(";");
        const recordCode = fields[0];

        switch (recordCode) {
            case "31": // Invoice Details & Advertiser
                invoice.advertiser = fields[3] || "N/A"; // ✅ Corrected Advertiser Extraction
                invoice.invoiceNumber = fields[8] || "N/A"; // ✅ Corrected Invoice #
                invoice.invoiceDate = fields[5] ? parseInvoiceDate(fields[10]) : "N/A"; // ✅ Corrected Invoice Date
                invoice.estimateCode = fields[7] || "N/A"; // ✅ Corrected Estimate Code
                invoice.dueDate = fields[21] ? parseInvoiceDate(fields[21]) : "N/A";
                const adv = fields[3] || "N/A";
                const est = fields[7] || "N/A";
                invoice.billMemo = `${adv} - ${est}`;
                break;

            case "22": // Station & Ownership
                station = fields[1] || "N/A"; // ✅ Assign Station (e.g., KLPX)
                stationFullName = fields[3] || "N/A"; // ✅ Assign Station Full Name (e.g., KLPX-FM)
                const ownershipGroup = fields[5] || "N/A"; // ARIZONA LOTUS CORP

                invoice.ownershipGroup = ownershipGroup; // ✅ Assign Ownership Group
                invoice.invoiceSource = invoiceType === "Marketron" ? "Marketron" : "Radio Invoices"; // ✅ Detect Marketron or Radio

                if (invoice.invoiceSource === "Marketron") {
                    // ✅ Marketron: Vendor = ownershipGroup - station - stationFullName
                    invoice.vendor = `${ownershipGroup} - ${station} - ${stationFullName}`;
                }
                break;

            case "23": // ✅ Only for Radio: Vendor from Line 23
                if (invoice.invoiceSource === "Radio Invoices") {
                    const vendorField1 = fields[1] || "N/A"; // Get Vendor Field 1 from Line 23

                    // ✅ Radio: Vendor = field 1 (from line 23) - station - stationFullName (from line 22)
                    invoice.vendor = `${vendorField1} - ${station} - ${stationFullName}`;
                }
                break;

            case "34": // Financial Information
                invoice.totalAmount = fields[2] || "N/A";
                break;

            case "33": // Terms (Not Found in This Case)
                invoice.terms = fields[1] || "N/A"; // ✅ Corrected Terms
                break;
        }
    });

    return invoice;
};

// Convert Invoice Date
const parseInvoiceDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 6) return "N/A";

    const year = "20" + dateStr.substring(0, 2); // Prefix "20" for full year
    const month = dateStr.substring(2, 4) - 1; // Convert to zero-based month
    const day = dateStr.substring(4, 6);

    const invoiceDate = new Date(year, month, day).toISOString().split("T")[0];

    // ✅ Apply Broadcast Calendar Mapping
    return getBroadcastInvoiceDate(invoiceDate);
};


// API Route for Uploading Invoice
app.post("/upload", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            console.error("No file uploaded");
            return res.status(400).json({ error: "No file uploaded" });
        }

        const filePath = path.join(__dirname, req.file.path);
        console.log(`Processing file: ${filePath}`);

        const invoiceData = extractInvoiceData(filePath);
        console.log("Extracted Invoice Data:", invoiceData);

        // Check for duplicate invoice
        const existingInvoice = await Invoice.findOne({ invoiceNumber: invoiceData.invoiceNumber });

        // if (existingInvoice) {
        //     fs.unlinkSync(filePath);
        //     console.warn("Duplicate invoice detected:", invoiceData.invoiceNumber);
        //     return res.status(409).json({
        //         error: "Duplicate invoice detected",
        //         invoiceNumber: invoiceData.invoiceNumber
        //     });
        // }

        // Save to MongoDB
        const newInvoice = new Invoice(invoiceData);
        await newInvoice.save();
        console.log("Invoice saved successfully");

        fs.unlinkSync(filePath);
        return res.json({
            message: `✅ ${invoiceData.invoiceSource} Invoice Processed Successfully`,
            invoiceType: invoiceData.invoiceSource,
            ...invoiceData
        });
    } catch (error) {
        console.error("❌ Upload Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/export-excel", async (req, res) => {
    try {
        const invoices = await Invoice.find().lean(); // Fetch all invoices

        // Convert Data to Excel
        const ws = XLSX.utils.json_to_sheet(invoices);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Invoices");

        // Generate Buffer & Send as Response
        const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
        res.setHeader("Content-Disposition", "attachment; filename=invoices.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(excelBuffer);
    } catch (error) {
        console.error("❌ Excel Export Error:", error);
        res.status(500).json({ error: "Failed to export Excel." });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
