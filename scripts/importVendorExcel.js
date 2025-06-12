// scripts/importVendorExcel.js
const mongoose = require("mongoose");
const XLSX = require("xlsx");
const path = require("path");
const Vendor = require("../models/Vendor");

const MONGO_URI = "mongodb+srv://zebimalik4567:0JRah3RfhsqTCOwI@cluster0.6jhoy.mongodb.net/demovdigo_invoice_db";

const importVendors = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    const filePath = path.join(__dirname, "vendors.xlsx"); // rename your file to vendors.xlsx or adjust this
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets["Tab 2"];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const cleaned = rows.map(row => ({
      qbStationList: row["QB station list"]?.toString().trim() || "N/A",
      station: row["Station"]?.toString().trim() || "N/A",
      qbVendorOwner: row["QB Vendor Owner"]?.toString().trim() || "N/A"
    }));

    console.log(cleaned.slice(0, 10)); // optional: preview first 10 rows

    await Vendor.deleteMany();
    await Vendor.insertMany(cleaned);

    console.log(`✅ Imported ${cleaned.length} vendor records.`);
    process.exit();
  } catch (error) {
    console.error("❌ Import error:", error);
    process.exit(1);
  }
};

importVendors();
