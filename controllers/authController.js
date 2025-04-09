const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key";

// ✅ REGISTER
exports.register = async (req, res) => {
  const { username, password } = req.body;
  console.log("📥 Register Request:", { username });

  if (!username || !password) {
    console.warn("⚠️ Missing username or password.");
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], (err) => {
      if (err) {
        console.error("❌ Registration failed:", err.message);
        return res.status(500).json({ error: "Registration failed. Username might be taken." });
      }
      console.log("✅ User registered:", username);
      res.status(201).json({ message: "User registered successfully." });
    });
  } catch (err) {
    console.error("❌ Registration Error:", err);
    res.status(500).json({ error: "Unexpected registration error" });
  }
};

// ✅ LOGIN
exports.login = (req, res) => {
  const { username, password } = req.body;
  console.log("📥 Login Request:", { username });

  // ✅ Enforce domain restriction
  const allowedDomain = "@instinctivemediagroup.com";
  if (!username.endsWith(allowedDomain)) {
    console.warn("⛔ Login blocked: Unauthorized email domain");
    return res.status(403).json({ error: `Only users with '${allowedDomain}' can log in.` });
  }

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) {
      console.error("❌ DB Error during login:", err.message);
      return res.status(500).json({ error: "Login failed due to DB error." });
    }

    if (!user) {
      console.warn("⚠️ User not found:", username);
      return res.status(401).json({ error: "Invalid credentials." });
    }

    try {
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        console.warn("⚠️ Incorrect password for user:", username);
        return res.status(401).json({ error: "Invalid credentials." });
      }

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1h" });
      console.log("✅ Login successful:", username);
      res.json({ message: "Login successful.", token });
    } catch (err) {
      console.error("❌ Password comparison failed:", err.message);
      res.status(500).json({ error: "Login failed due to server error." });
    }
  });
};


// ✅ PROFILE
exports.profile = (req, res) => {
  const { username } = req.user;
  console.log("🔍 Profile fetch for:", username);

  db.get("SELECT username FROM users WHERE username = ?", [username], (err, user) => {
    if (err) {
      console.error("❌ Profile DB error:", err.message);
      return res.status(500).json({ error: "Error fetching profile" });
    }
    if (!user) {
      console.warn("⚠️ User not found during profile fetch:", username);
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ username: user.username });
  });
};

// ✅ LOGOUT
exports.logout = (req, res) => {
  console.log("🚪 Logout request received");
  res.status(200).json({ message: "Logged out successfully." });
};
