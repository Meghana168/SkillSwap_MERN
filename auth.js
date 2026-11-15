import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";
const router = Router();
const makeToken = id => jwt.sign({ id }, process.env.JWT_SECRET || "dev_secret_change_me", { expiresIn: "7d" });
const safe = user => ({ id: user._id, name: user.name, email: user.email, bio: user.bio, location: user.location, skillsOffered: user.skillsOffered, skillsWanted: user.skillsWanted });
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 6) return res.status(400).json({ message: "Name, email and password (minimum 6 characters) are required" });
    if (await User.findOne({ email })) return res.status(409).json({ message: "Email already registered" });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) });
    res.status(201).json({ token: makeToken(user._id), user: safe(user) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});
router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !(await bcrypt.compare(req.body.password || "", user.password))) return res.status(401).json({ message: "Invalid email or password" });
    res.json({ token: makeToken(user._id), user: safe(user) });
  } catch (e) { res.status(500).json({ message: e.message }); }
});
router.get("/me", protect, (req, res) => res.json({ user: safe(req.user) }));
export default router;
