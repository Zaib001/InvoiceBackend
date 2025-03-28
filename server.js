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
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");


app.use(cors({
    origin: ["http://localhost:5173", "https://demo.vdigo.com"]
}));
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
    return invoiceDate;
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

    let invoices = [];
    let invoice = {};
    let station = "N/A";
    let stationFullName = "N/A";
    let ownershipGroup = "";
    let vendorField1 = "N/A";
    let foundVendorFrom23 = false;

    data.forEach((line) => {
        const fields = line.split(";");
        const recordCode = fields[0];

        switch (recordCode) {
            case "22":
                station = fields[1] || "N/A";
                stationFullName = fields[3] || "N/A";
                ownershipGroup = fields[5] || "N/A";
                break;

            case "23":
                if (invoiceType === "Radio Invoices") {
                    vendorField1 = fields[1] || "N/A";
                    foundVendorFrom23 = true;
                }
                break;

            case "31":
                if (invoice.invoiceNumber && invoice.invoiceNumber !== "N/A") {
                    invoices.push({ ...invoice });
                }

                const rawFallbackDate = fields[4];

                invoice = {
                    advertiser: fields[3] || "N/A",
                    invoiceNumber: fields[8] || "N/A",
                    invoiceDate: parseInvoiceDate(fields[5]),
                    estimateCode: fields[7] || "N/A",
                    dueDate: fields[21] ? parseInvoiceDate(fields[21]) : "N/A",
                    billMemo: `${fields[3] || "N/A"} - ${fields[7] || "N/A"}`,
                    totalAmount: "N/A",
                    terms: "N/A",
                    invoiceSource: invoiceType,
                    category: "5015 COS - Radio",
                    vendor: "N/A",
                    ownershipGroup: ownershipGroup,
                };
                break;





            case "33":
                invoice.terms = fields[1] || "N/A";
                break;

            case "34":
                invoice.totalAmount = fields[4] || "N/A";
                break;
        }
    });

    if (invoice.invoiceNumber && invoice.invoiceNumber !== "N/A") {
        invoices.push(invoice);
    }

    // ✅ Assign vendor values after all parsing is done
    invoices = invoices.map((inv) => {
        if (inv.invoiceSource === "Marketron") {
            inv.vendor = `${ownershipGroup} - ${station} - ${stationFullName}`;
        } else {
            inv.vendor = `${vendorField1} - ${station} - ${stationFullName}`;
        }
        return inv;
    });

    return invoices;
};


const JWT_SECRET = process.env.JWT_SECRET || "e3892006d7feb3ce1391d95aa9f7b4c1e454869c48414e5b6253a35a5dfc806fd2e19f3bff7f2191b11dbe78b4d8d42bb6e872ff9d0a9970ba08e996174b7a25";

// ✅ Middleware to Verify JWT Token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access denied. No token provided." });
    }
  
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: "Invalid token." });
      }
      req.user = decoded;
      next();
    });
  };
  
  // ✅ Get User Profile API
  app.get("/profile", (req, res) => {
    const { username } = req.user;
  
    db.get("SELECT username FROM users WHERE username = ?", [username], (err, user) => {
      if (err) {
        console.error("❌ Error fetching user profile:", err);
        return res.status(500).json({ error: "Error fetching user profile" });
      }
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ username: user.username });
    });
  });

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
)`);

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], (err) => {
    if (err) {
      console.error("❌ Registration Error:", err);
      return res.status(500).json({ error: "User registration failed." });
    }
    res.status(201).json({ message: "User registered successfully." });
  });
});

app.post("/", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) {
      console.error("❌ Login Error:", err);
      return res.status(500).json({ error: "Login failed." });
    }

    if (!user) return res.status(401).json({ error: "Invalid username or password." });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).json({ error: "Invalid username or password." });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Login successful.", token });
  });
});

app.get("/protected", verifyToken, (req, res) => {
    res.status(200).json({
      message: `Welcome, ${req.user.username}. You have successfully accessed a protected resource.`,
      user: { id: req.user.id, username: req.user.username }
    });
  });
  
  // ✅ Logout API (Professional)
  app.post("/logout", (req, res) => {
    // Invalidate token on client-side (No server storage in this implementation)
    res.status(200).json({ message: "You have been successfully logged out. Please log in again to continue." });
  });

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

// ✅ API to delete all invoices
app.delete("/invoices", (req, res) => {
    db.run("DELETE FROM invoices", [], function (err) {
        if (err) {
            console.error("❌ Failed to delete invoices:", err);
            return res.status(500).json({ error: "Failed to delete invoices" });
        }

        console.log("✅ All invoices deleted");
        res.json({ message: "All invoices deleted successfully" });
    });
});
// ✅ Update Invoice API
app.put("/invoices/:invoiceNumber", (req, res) => {
    const { invoiceNumber } = req.params;
    const {
        advertiser,
        vendor,
        ownershipGroup,
        invoiceDate,
        billMemo,
        totalAmount,
        terms,
        invoiceSource,
        category
    } = req.body;

    const query = `
        UPDATE invoices
        SET 
            advertiser = COALESCE(?, advertiser),
            vendor = COALESCE(?, vendor),
            ownershipGroup = COALESCE(?, ownershipGroup),
            invoiceDate = COALESCE(?, invoiceDate),
            billMemo = COALESCE(?, billMemo),
            totalAmount = COALESCE(?, totalAmount),
            terms = COALESCE(?, terms),
            invoiceSource = COALESCE(?, invoiceSource),
            category = COALESCE(?, category)
        WHERE invoiceNumber = ?
    `;

    const values = [
        advertiser || null, vendor || null, ownershipGroup || null,
        invoiceDate || null, billMemo || null, totalAmount || null,
        terms || null, invoiceSource || null, category || null,
        invoiceNumber
    ];

    db.run(query, values, function (err) {
        if (err) {
            console.error("❌ Failed to update invoice:", err.message);
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            console.warn("⚠ No invoice found with Invoice Number:", invoiceNumber);
            return res.status(404).json({ error: "Invoice not found" });
        }
        console.log("✅ Invoice updated:", invoiceNumber);
        res.json({ message: "Invoice updated successfully" });
    });
});

app.put("/invoices/override/:invoiceNumber", (req, res) => {
    const { invoiceNumber } = req.params;
    const { isProcessed } = req.body;

    const query = `UPDATE invoices SET isProcessed = ? WHERE invoiceNumber = ?`;

    db.run(query, [isProcessed, invoiceNumber], (err) => {
        if (err) {
            console.error("❌ Failed to update invoice:", err);
            return res.status(500).json({ error: "Failed to update invoice" });
        }
        console.log(`✅ Invoice ${invoiceNumber} status updated to ${isProcessed}`);
        res.json({ message: "Invoice status updated successfully" });
    });
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
