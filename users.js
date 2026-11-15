import { Router } from "express";
import User from "../models/User.js";
import { protect } from "../middleware/auth.js";
const router = Router();
const publicFields = "name bio location skillsOffered skillsWanted createdAt";
router.get("/", protect, async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const filter = { _id: { $ne: req.user._id } };
    if (search) filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { skillsOffered: { $regex: search, $options: "i" } },
      { skillsWanted: { $regex: search, $options: "i" } }
    ];
    const users = await User.find(filter).select(publicFields).limit(50);
    res.json({ users });
  } catch (e) { res.status(500).json({ message: e.message }); }
});
router.put("/me", protect, async (req, res) => {
  try {
    const allowed = ["name", "bio", "location", "skillsOffered", "skillsWanted"];
    for (const key of allowed) if (req.body[key] !== undefined) req.user[key] = req.body[key];
    await req.user.save();
    res.json({ user: { id: req.user._id, name: req.user.name, email: req.user.email, bio: req.user.bio, location: req.user.location, skillsOffered: req.user.skillsOffered, skillsWanted: req.user.skillsWanted } });
  } catch (e) { res.status(400).json({ message: e.message }); }
});
export default router;
