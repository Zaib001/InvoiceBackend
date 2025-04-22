require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/authRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");

const app = express();

// CORS
app.use(cors({
  origin: ["http://localhost:5173", "https://demo.vdigo.com"]
}));
app.use(express.json());

// ✅ MongoDB Connection (cleaned up)
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected."))
  .catch((err) => console.error("❌ MongoDB connection error:", err.message));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/invoices", invoiceRoutes);

module.exports = app;
