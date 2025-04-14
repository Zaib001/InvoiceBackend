const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

router.post("/register", authController.register);
router.post("/login", authController.login);
router.get("/profile",  authController.profile);
router.post("/logout", authController.logout);

// NEW
router.get("/users", authController.getAllUsers);
router.put("/users/:id", authController.updateUser);
router.delete("/users/:id", authController.deleteUser);

module.exports = router;
