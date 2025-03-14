require("dotenv").config();
const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const app = express();
app.use(cors());
// app.use((req, res, next) => {
//     res.header("Access-Control-Allow-Origin", "https://demo.vdigo.com");
//     res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
//     res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
//     res.header("Access-Control-Allow-Credentials", "true");
//     if (req.method === "OPTIONS") {
//         return res.status(200).end();
//     }
//     next();
// });

app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Define MongoDB Schema
const InvoiceSchema = new mongoose.Schema({
    advertiserID: String,
    advertiser: String,
    address: String,
    station: String,
    vendor: String,
    ownershipGroup: String,
    invoiceNumber: String,
    invoiceDate: String,
    estimateCode: String,
    billMemo: String,
    totalAmount: String,
    dueDate: String,
    terms: String,
    invoiceSource: String,
    category: String,
    schedules: Array
});

const Invoice = mongoose.model("Invoice", InvoiceSchema);

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

// Broadcast Calendar Mapping
const broadcastCalendar = [
    { month: "January", start: "2024-12-30", end: "2025-01-26" },
    { month: "February", start: "2025-01-27", end: "2025-02-23" },
    { month: "March", start: "2025-02-24", end: "2025-03-30" },
    { month: "April", start: "2025-03-31", end: "2025-04-27" }
];


const detectInvoiceType = (data) => {
    // Check first few lines for known Marketron or Radio invoice patterns
    const firstFewLines = data.slice(0, 5).join(" ");

    if (firstFewLines.includes("Marketron") || firstFewLines.includes("MKT")) {
        return "Marketron";
    } else if (firstFewLines.includes("Radio") || firstFewLines.includes("WOS")) {
        return "Radio";
    }

    // Additional check: Marketron invoices have structured numeric codes like "34;" at the end
    if (data.some(line => line.startsWith("34;"))) {
        return "Marketron";
    }

    return "Radio"; // Default to Radio if uncertain
};

const getBroadcastEndDate = (invoiceDate) => {
    if (!invoiceDate || isNaN(Date.parse(invoiceDate))) return "N/A"; // Handle invalid date
    const dateObj = new Date(invoiceDate);
    for (const period of broadcastCalendar) {
        const start = new Date(period.start);
        const end = new Date(period.end);
        if (dateObj >= start && dateObj <= end) {
            return period.end; // Return correct broadcast end date
        }
    }
    return invoiceDate; // If no match, return the original date
};

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
        category: invoiceType === "Marketron" ? "5016 COS - Digital" : "5015 COS - Radio"
    };

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
                const adv =  fields[3] || "N/A";
                const est = fields[7] || "N/A";
                invoice.billMemo = `${adv} - ${est}`;
                break;

                case "22": // Station & Ownership
                const station = fields[1] || "N/A"; // KLPX
                const stationFullName = fields[3] || "N/A"; // KLPX-FM
                const ownershipGroup = fields[5] || "N/A"; // ARIZONA LOTUS CORP
                invoice.vendor = `${ownershipGroup} - ${station} - ${stationFullName}`; // ✅ Corrected Vendor Combination
                invoice.ownershipGroup = ownershipGroup; // ✅ Corrected Ownership Group
                invoice.invoiceSource = fields[10] === "MKT" ? "Marketron" : "Radio"; // ✅ Corrected Invoice Source
                break;
                

            case "34": // Financial Information
                invoice.totalAmount = fields[2] || "N/A";
                break;

            case "33": // Terms (Not Found in This Case)
                invoice.terms = fields[1] || "N/A"; // ✅ Corrected Terms
                break;
        }
    });

    // Ensure Due Date is calculated correctly
    if (invoice.dueDate === "N/A") {
        invoice.dueDate = getBroadcastEndDate(invoice.invoiceDate);
    }

    return invoice;
};



const parseInvoiceDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 6) return "N/A";
    const year = "20" + dateStr.substring(0, 2); // Prefix "20" for full year
    const month = dateStr.substring(2, 4) - 1; // Convert to zero-based month
    const day = dateStr.substring(4, 6);
    return new Date(year, month, day).toISOString().split("T")[0]; // Convert to YYYY-MM-DD
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


// API Route to Export CSV
app.get("/export", async (req, res) => {
    try {
        const invoices = await Invoice.find().lean();
        const csv = Papa.unparse(invoices);
        res.header("Content-Type", "text/csv");
        res.attachment("invoices.csv");
        res.send(csv);
    } catch (error) {
        res.status(500).json({ error: "Failed to export CSV." });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
