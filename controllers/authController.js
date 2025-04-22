const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

exports.register = async (req, res) => {
  const { username, password } = req.body;

  try {
    const hashed = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashed]);
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: "Registration failed." });
  }
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  const allowedDomain = "@instinctivemediagroup.com";

  if (!username.endsWith(allowedDomain)) {
    return res.status(403).json({ error: `Only '${allowedDomain}' logins allowed.` });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE username = ?", [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials." });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials." });

    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: "1h" });
    res.json({ message: "Login successful.", token });
  } catch (err) {
    res.status(500).json({ error: "Login error" });
  }
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
