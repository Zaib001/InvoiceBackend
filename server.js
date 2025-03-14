require("dotenv").config();
const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");

const app = express();
app.use(cors({
    origin: 'https://demo.vdigo.com',  // Allow only your frontend
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: true // If your requests include cookies or auth headers
}));
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
        advertiserID: "N/A",
        advertiser: "N/A",
        address: "N/A",
        station: "N/A",
        vendor: "N/A",
        ownershipGroup: "N/A",
        invoiceNumber: "N/A",
        invoiceDate: "N/A",
        estimateCode: "N/A",
        billMemo: "N/A",
        totalAmount: "N/A",
        dueDate: "N/A",
        terms: "N/A",
        invoiceSource: invoiceType,
        category: invoiceType === "Marketron" ? "5016 COS - Digital" : "5015 COS - Radio",
        schedules: []
    };

    let currentSchedule = null;

    data.forEach(line => {
        const fields = line.split(";");
        const recordCode = fields[0];

        switch (recordCode) {
            case "21": // Advertiser Information
                invoice.advertiserID = fields[1] || "N/A";
                invoice.advertiser = fields[2] || "N/A";
                invoice.address = [fields[3], fields[4], fields[5], fields[6]].filter(Boolean).join(", ");
                break;
            case "22": // Station Information
                invoice.station = fields[1] || "N/A";
                invoice.vendor = fields[4] || "N/A";
                invoice.ownershipGroup = fields[5] || "N/A";
                break;
            case "31": // Invoice Details
                invoice.invoiceNumber = fields[8] || "N/A";
                invoice.invoiceDate = fields[9] ? parseInvoiceDate(fields[9]) : "N/A"; // Convert date
                invoice.estimateCode = fields[7] || "N/A";
                invoice.billMemo = fields[3] || "N/A";
                break;
            case "32": // Invoice Notes (Marketron Specific)
                if (!invoice.billMemo.includes(fields[1])) {
                    invoice.billMemo += " " + fields[1];
                }
                break;
            case "33": // Payment Terms & Due Date
                invoice.terms = fields[1] || "N/A"; // Extract Payment Terms
                invoice.dueDate = fields[2] ? parseInvoiceDate(fields[2]) : "N/A"; // Convert due date
                break;
            case "34": // Financial Information
                invoice.totalAmount = fields[2] || "N/A";
                break;
            case "41": // Schedule Information
                currentSchedule = {
                    scheduleNumber: fields[1] || "N/A",
                    days: fields[2] || "N/A",
                    startDate: fields[7] || "N/A",
                    endDate: fields[8] || "N/A",
                    daypartDescription: "",
                    spots: []
                };
                invoice.schedules.push(currentSchedule);
                break;
            case "42": // Daypart Description
                if (currentSchedule) {
                    currentSchedule.daypartDescription = fields[1] || "N/A";
                }
                break;
            case "51": // Spot Details
                if (currentSchedule) {
                    currentSchedule.spots.push({
                        date: fields[1] ? parseInvoiceDate(fields[1]) : "N/A",
                        time: fields[3] || "N/A",
                        length: fields[4] || "N/A",
                        copyCreative: fields[5] || "N/A",
                        rate: fields[6] || "N/A"
                    });
                }
                break;
        }
    });

    // Apply broadcast calendar end date to the invoice date
    invoice.invoiceDate = getBroadcastEndDate(invoice.invoiceDate);
    return invoice;
};

const parseInvoiceDate = (dateStr) => {
    if (!dateStr || dateStr.length !== 6) return "N/A"; // Handle invalid input
    const year = "20" + dateStr.substring(0, 2); // Prefix year with "20"
    const month = dateStr.substring(2, 4) - 1; // Convert to zero-based index
    const day = dateStr.substring(4, 6);
    return new Date(year, month, day).toISOString().split("T")[0]; // Format as YYYY-MM-DD
};



// API Route for Uploading Invoice
app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = path.join(__dirname, req.file.path);
    const invoiceData = extractInvoiceData(filePath);

    // Check for duplicate invoice
    const existingInvoice = await Invoice.findOne({ invoiceNumber: invoiceData.invoiceNumber });

    // if (existingInvoice) {
    //     fs.unlinkSync(filePath);
    //     return res.status(409).json({
    //         error: "Duplicate invoice detected",
    //         invoiceNumber: invoiceData.invoiceNumber
    //     });
    // }

    // Save to MongoDB
    const newInvoice = new Invoice(invoiceData);
    await newInvoice.save();

    fs.unlinkSync(filePath);
    res.json({ 
        message: `✅ ${invoiceData.invoiceSource} Invoice Processed Successfully`,
        invoiceType: invoiceData.invoiceSource,
        ...invoiceData
    });
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
