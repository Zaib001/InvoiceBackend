const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_key";

// ✅ REGISTER
exports.register = async (req, res) => {
  const { username, password } = req.body;
  console.log("📥 Register Request:", { username });

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], (err) => {
      if (err) {
        return res.status(500).json({ error: "Registration failed. Username might be taken." });
      }
      res.status(201).json({ message: "User registered successfully." });
    });
  } catch (err) {
    res.status(500).json({ error: "Unexpected registration error" });
  }
};

// ✅ LOGIN (restricted to instinctivemediagroup.com)
exports.login = (req, res) => {
  const { username, password } = req.body;
  const allowedDomain = "@instinctivemediagroup.com";

  if (!username.endsWith(allowedDomain)) {
    return res.status(403).json({ error: `Only users with '${allowedDomain}' can log in.` });
  }

  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) return res.status(500).json({ error: "Login failed due to DB error." });
    if (!user) return res.status(401).json({ error: "Invalid credentials." });

    try {
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) return res.status(401).json({ error: "Invalid credentials." });

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "1h" });
      res.json({ message: "Login successful.", token });
    } catch (err) {
      res.status(500).json({ error: "Login failed due to server error." });
    }
  });
};

// ✅ GET ALL USERS
exports.getAllUsers = (req, res) => {
  db.all("SELECT id, username FROM users", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch users" });
    res.json(rows);
  });
};

// ✅ UPDATE USER
exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run("UPDATE users SET username = ?, password = ? WHERE id = ?", [username, hashedPassword, id], function (err) {
      if (err) return res.status(500).json({ error: "Failed to update user" });
      if (this.changes === 0) return res.status(404).json({ error: "User not found" });
      res.json({ message: "User updated successfully" });
    });
  } catch (error) {
    res.status(500).json({ error: "Unexpected error updating user" });
  }
};

// ✅ DELETE USER
exports.deleteUser = (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM users WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: "Failed to delete user" });
    if (this.changes === 0) return res.status(404).json({ error: "User not found" });
    res.json({ message: "User deleted successfully" });
  });
};

// ✅ PROFILE
exports.profile = (req, res) => {
  const { username } = req.user;
  db.get("SELECT username FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).json({ error: "Error fetching profile" });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ username: user.username });
  });
};

// ✅ LOGOUT
exports.logout = (req, res) => {
  res.status(200).json({ message: "Logged out successfully." });
};
