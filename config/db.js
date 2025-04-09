const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Define the database file path
const DB_PATH = path.join(__dirname, "..", "database", "invoices.db");

// Connect to SQLite Database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("❌ Error connecting to SQLite database:", err.message);
    } else {
        console.log("✅ Connected to SQLite database");
    }
});

// Create Table for Invoices
db.serialize(() => {
     db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);
    db.run(`
        CREATE TABLE IF NOT EXISTS invoices (
             id INTEGER PRIMARY KEY AUTOINCREMENT,
    advertiser TEXT,
    vendor TEXT,
    ownershipGroup TEXT,
    invoiceNumber TEXT UNIQUE,
    invoiceDate TEXT,
    billMemo TEXT,
    totalAmount TEXT,
    terms TEXT,
    invoiceSource TEXT,
    category TEXT,
    isProcessed INTEGER DEFAULT 0
        )
    `, (err) => {
        if (err) {
            console.error("❌ Error creating invoices table:", err.message);
        } else {
            console.log("✅ Invoices table is ready");
        }
    });
});

module.exports = db;
