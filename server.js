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
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// Define MongoDB Schema
const InvoiceSchema = new mongoose.Schema({
    invoiceNumber: String,
    totalAmount: String,
    billDate: String,
    vendor: String,
    ownershipGroup: String,
    estimateCode: String,
    dueDate: String,
    invoiceSource: { type: String, default: "Radio" },
    category: { type: String, default: "5015 COS - Radio" }
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

const getBroadcastEndDate = (invoiceDate) => {
    const dateObj = new Date(invoiceDate);
    for (const period of broadcastCalendar) {
        const start = new Date(period.start);
        const end = new Date(period.end);
        if (dateObj >= start && dateObj <= end) {
            return period.end;
        }
    }
    return invoiceDate;
};

const extractInvoiceData = (filePath) => {
    const data = fs.readFileSync(filePath, "utf-8").split("\n");

    let invoice = {
        advertiserID: "N/A",
        advertiser: "N/A",
        address: "N/A",
        station: "N/A",
        ownershipGroup: "N/A",
        invoiceNumber: "N/A",
        invoiceDate: "N/A",
        estimateCode: "N/A",
        billMemo: "N/A",
        totalAmount: "N/A",
        dueDate: "N/A",
        terms: "N/A",
        invoiceSource: "Radio",
        category: "5015 COS - Radio",
        schedules: []
    };

    let currentSchedule = null;

    data.forEach(line => {
        const fields = line.split(";");
        const recordCode = fields[0];

        switch (recordCode) {
            case "21": // Advertiser
                invoice.advertiserID = fields[1];
                invoice.advertiser = fields[2];
                invoice.address = `${fields[3]}, ${fields[4]}, ${fields[5]}, ${fields[6]}`;
                break;
            case "22": // Station Information
                invoice.station = fields[1];
                invoice.ownershipGroup = fields[4];
                break;
            case "31": // Invoice Details
                invoice.invoiceNumber = fields[8];
                invoice.estimateCode = fields[7];
                invoice.billMemo = fields[3];
                break;
            case "32": // Disclaimers (Not stored but used for reference)
                break;
            case "33": // Payment Terms
                invoice.terms = fields[1];
                break;
            case "34": // Total Cost
                invoice.totalAmount = fields[2];
                break;
            case "41": // Schedule Information
                currentSchedule = {
                    scheduleNumber: fields[1],
                    days: fields[2],
                    startDate: fields[7],
                    endDate: fields[8],
                    daypartDescription: "",
                    spots: []
                };
                invoice.schedules.push(currentSchedule);
                break;
            case "42": // Daypart Description
                if (currentSchedule) {
                    currentSchedule.daypartDescription = fields[1];
                }
                break;
            case "51": // Spot Details
                if (currentSchedule) {
                    currentSchedule.spots.push({
                        date: fields[1],
                        time: fields[3],
                        length: fields[4],
                        copyCreative: fields[5],
                        rate: fields[6]
                    });
                }
                break;
        }
    });

    invoice.invoiceDate = getBroadcastEndDate(invoice.invoiceDate);
    return invoice;
};



app.post("/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = path.join(__dirname, req.file.path);
    const invoiceData = extractInvoiceData(filePath);

    // Check for duplicate invoice
    const existingInvoice = await Invoice.findOne({ invoiceNumber: invoiceData.invoiceNumber, advertiserID: invoiceData.advertiserID });

    // if (existingInvoice) {
    //     return res.status(409).json({ 
    //         error: "Duplicate invoice detected",
    //         invoiceNumber: invoiceData.invoiceNumber,
    //         advertiserID: invoiceData.advertiserID
    //     });
    // }

    // Save to MongoDB
    const newInvoice = new Invoice(invoiceData);
    await newInvoice.save();

    fs.unlinkSync(filePath);
    res.json({ message: "Invoice processed successfully", ...invoiceData });
});



// Export to CSV
app.get("/export", async (req, res) => {
    try {
        // Fetch invoices and convert Mongoose objects to plain JavaScript objects
        const invoices = await Invoice.find().lean(); // ✅ Convert to plain objects

        // Ensure only necessary fields are exported
        const filteredInvoices = invoices.map(({ $__ , $isNew, _doc, ...invoice }) => invoice);

        // Convert to CSV
        const csv = Papa.unparse(filteredInvoices);

        // Send CSV file
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
