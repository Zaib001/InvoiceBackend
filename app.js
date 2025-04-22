require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");

const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "https://demo.vdigo.com"]
}));
app.use(express.json());

// ✅ MySQL connection test
(async () => {
  try {
    await db.getConnection(); // test the pool
    console.log("✅ MySQL Database is connected.");
  } catch (error) {
    console.error("❌ MySQL Connection Error:", error.message);
  }
})();

app.use("/api/auth", authRoutes);
app.use("/api/invoices", invoiceRoutes);

module.exports = app;
