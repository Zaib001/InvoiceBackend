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

// DB Ready Log
db.serialize(() => {
  console.log("✅ Database is ready.");
});

app.use("/api/auth", authRoutes);
app.use("/api/invoices", invoiceRoutes);

module.exports = app;
