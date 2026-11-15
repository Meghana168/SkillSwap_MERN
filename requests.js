
import { Router } from "express";
import mongoose from "mongoose";

import SkillRequest from "../models/SkillRequest.js";
import Notification from "../models/Notification.js";
import { protect } from "../middleware/auth.js";

const router = Router();

router.use(protect);

// SEND A SKILL EXCHANGE REQUEST
router.post("/", async (req, res) => {
  try {
    const { to, skillOffered, skillWanted, message } = req.body;

    if (!to || !skillOffered || !skillWanted) {
      return res.status(400).json({
        message: "Recipient and both skills are required"
      });
    }

    if (!mongoose.isValidObjectId(to)) {
      return res.status(400).json({
        message: "Invalid recipient ID"
      });
    }

    if (String(to) === String(req.user._id)) {
      return res.status(400).json({
        message: "You cannot request an exchange with yourself"
      });
    }

    const request = await SkillRequest.create({
      from: req.user._id,
      to,
      skillOffered,
      skillWanted,
      message: message || ""
    });

    await Notification.create({
      user: to,
      actor: req.user._id,
      type: "request",
      text: `${req.user.name} sent you a skill exchange request`,
      link: "requests"
    });

    return res.status(201).json({
      message: "Skill exchange request sent successfully",
      request
    });

  } catch (error) {
    console.error("Send request error:", error);

    return res.status(500).json({
      message: error.message
    });
  }
});


// GET ALL INCOMING AND OUTGOING REQUESTS
router.get("/mine", async (req, res) => {
  try {
    const requests = await SkillRequest.find({
      $or: [
        { from: req.user._id },
        { to: req.user._id }
      ]
    })
      .populate("from", "name email")
      .populate("to", "name email")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      requests
    });

  } catch (error) {
    console.error("Get requests error:", error);

    return res.status(500).json({
      message: error.message
    });
  }
});


// ACCEPT OR DECLINE A REQUEST
router.patch("/:id", async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    // Validate request ID
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid request ID"
      });
    }

    // Validate status
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be accepted or rejected"
      });
    }

    // Only the recipient can accept or decline
    const request = await SkillRequest.findOne({
      _id: id,
      to: req.user._id,
      status: "pending"
    });

    if (!request) {
      return res.status(404).json({
        message: "Request not found, or it has already been processed"
      });
    }

    // Update request status
    request.status = status;
    await request.save();

    // Notify the person who sent the request
    await Notification.create({
      user: request.from,
      actor: req.user._id,
      type: "request_update",
      text: `${req.user.name} ${status} your skill exchange request`,
      link: "requests"
    });

    // Return updated request
    const updatedRequest = await SkillRequest.findById(id)
      .populate("from", "name email")
      .populate("to", "name email");

    return res.status(200).json({
      message: status === "accepted"
        ? "Skill exchange request accepted successfully"
        : "Skill exchange request declined successfully",
      request: updatedRequest
    });

  } catch (error) {
    console.error("Update request error:", error);

    return res.status(500).json({
      message: error.message
    });
  }
});

export default router;
