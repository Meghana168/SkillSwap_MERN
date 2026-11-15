
import { Router } from "express";
import mongoose from "mongoose";

import { protect } from "../middleware/auth.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Review from "../models/Review.js";
import Notification from "../models/Notification.js";
import Session from "../models/Session.js";

const r = Router();

r.use(protect);

const validId = id => mongoose.isValidObjectId(id);

const notify = async (user, actor, type, text, link = "") => {
  return Notification.create({
    user,
    actor,
    type,
    text,
    link
  });
};


// GET CONVERSATION MESSAGES
r.get("/messages/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!validId(userId)) {
      return res.status(400).json({
        message: "Invalid user ID"
      });
    }

    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({
        message: "You cannot chat with yourself"
      });
    }

    const otherUser = await User.findById(userId).select("_id name");

    if (!otherUser) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const messages = await Message.find({
      $or: [
        { from: req.user._id, to: userId },
        { from: userId, to: req.user._id }
      ]
    })
      .sort({ createdAt: 1 })
      .limit(300);

    await Message.updateMany(
      {
        from: userId,
        to: req.user._id,
        read: false
      },
      {
        $set: { read: true }
      }
    );

    return res.json({
      user: otherUser,
      messages
    });

  } catch (error) {
    console.error("Load messages error:", error);

    return res.status(500).json({
      message: "Unable to load messages"
    });
  }
});


// SEND MESSAGE
r.post("/messages/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const text = String(req.body.text || "").trim();

    if (!validId(userId)) {
      return res.status(400).json({
        message: "Invalid user ID"
      });
    }

    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({
        message: "You cannot message yourself"
      });
    }

    if (!text) {
      return res.status(400).json({
        message: "Message is required"
      });
    }

    if (text.length > 5000) {
      return res.status(400).json({
        message: "Message cannot exceed 5000 characters"
      });
    }

    const recipient = await User.findById(userId).select("_id");

    if (!recipient) {
      return res.status(404).json({
        message: "Recipient not found"
      });
    }

    const msg = await Message.create({
      from: req.user._id,
      to: userId,
      text
    });

    await notify(
      userId,
      req.user._id,
      "message",
      `${req.user.name} sent you a message`,
      "chat"
    );

    return res.status(201).json({
      message: msg
    });

  } catch (error) {
    console.error("Send message error:", error);

    return res.status(500).json({
      message: "Unable to send message"
    });
  }
});


// GET REVIEWS
r.get("/reviews/:userId", async (req, res) => {
  try {
    if (!validId(req.params.userId)) {
      return res.status(400).json({
        message: "Invalid user ID"
      });
    }

    const reviews = await Review.find({
      reviewee: req.params.userId
    })
      .populate("reviewer", "name")
      .sort({ createdAt: -1 });

    const average = reviews.length
      ? reviews.reduce((sum, item) => sum + item.rating, 0) /
        reviews.length
      : 0;

    return res.json({
      reviews,
      average: Number(average.toFixed(1))
    });

  } catch (error) {
    console.error("Reviews error:", error);

    return res.status(500).json({
      message: "Unable to load reviews"
    });
  }
});


// CREATE REVIEW
r.post("/reviews", async (req, res) => {
  try {
    const { reviewee, rating, comment, request } = req.body;

    if (!validId(reviewee)) {
      return res.status(400).json({
        message: "Invalid user ID"
      });
    }

    if (
      !Number.isInteger(Number(rating)) ||
      Number(rating) < 1 ||
      Number(rating) > 5
    ) {
      return res.status(400).json({
        message: "Choose a rating from 1 to 5"
      });
    }

    if (String(reviewee) === String(req.user._id)) {
      return res.status(400).json({
        message: "You cannot review yourself"
      });
    }

    const review = await Review.create({
      reviewer: req.user._id,
      reviewee,
      rating: Number(rating),
      comment,
      request
    });

    await notify(
      reviewee,
      req.user._id,
      "review",
      `${req.user.name} left you a review`,
      "profile"
    );

    return res.status(201).json({ review });

  } catch (error) {
    console.error("Review creation error:", error);

    return res.status(500).json({
      message: error.message
    });
  }
});


// GET NOTIFICATIONS
r.get("/notifications", async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user._id
    })
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ notifications });

  } catch (error) {
    return res.status(500).json({
      message: "Unable to load notifications"
    });
  }
});


// MARK NOTIFICATIONS AS READ
r.patch("/notifications/read", async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id },
      { $set: { read: true } }
    );

    return res.json({ ok: true });

  } catch (error) {
    return res.status(500).json({
      message: "Unable to update notifications"
    });
  }
});


// CREATE SESSION
r.post("/sessions", async (req, res) => {
  try {
    const { guest, title, startsAt, notes } = req.body;

    if (
      !validId(guest) ||
      !title ||
      !startsAt ||
      !Number.isFinite(new Date(startsAt).getTime()) ||
      new Date(startsAt) <= new Date()
    ) {
      return res.status(400).json({
        message: "Choose a participant, title and future date"
      });
    }

    if (String(guest) === String(req.user._id)) {
      return res.status(400).json({
        message: "You cannot schedule a session with yourself"
      });
    }

    const session = await Session.create({
      host: req.user._id,
      guest,
      title,
      startsAt,
      notes
    });

    await notify(
      guest,
      req.user._id,
      "session",
      `${req.user.name} scheduled: ${title}`,
      "sessions"
    );

    return res.status(201).json({ session });

  } catch (error) {
    console.error("Session creation error:", error);

    return res.status(500).json({
      message: error.message
    });
  }
});


// GET SESSIONS
r.get("/sessions", async (req, res) => {
  try {
    const sessions = await Session.find({
      $or: [
        { host: req.user._id },
        { guest: req.user._id }
      ]
    })
      .populate("host guest", "name")
      .sort({ startsAt: 1 });

    return res.json({ sessions });

  } catch (error) {
    return res.status(500).json({
      message: "Unable to load sessions"
    });
  }
});


// UPDATE SESSION
r.patch("/sessions/:id", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid session ID"
      });
    }

    const session = await Session.findOne({
      _id: req.params.id,
      $or: [
        { host: req.user._id },
        { guest: req.user._id }
      ]
    });

    if (!session) {
      return res.status(404).json({
        message: "Session not found"
      });
    }

    if (!["completed", "cancelled"].includes(req.body.status)) {
      return res.status(400).json({
        message: "Invalid status"
      });
    }

    session.status = req.body.status;
    await session.save();

    return res.json({ session });

  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
});


// LEADERBOARD
r.get("/leaderboard", async (req, res) => {
  try {
    const users = await User.find()
      .select("name skillsOffered location")
      .limit(100);

    const scores = await Review.aggregate([
      {
        $group: {
          _id: "$reviewee",
          average: { $avg: "$rating" },
          reviews: { $sum: 1 }
        }
      }
    ]);

    const scoreMap = new Map(
      scores.map(item => [String(item._id), item])
    );

    const results = users.map(user => {
      const score = scoreMap.get(String(user._id));

      return {
        ...user.toObject(),
        rating: score?.average || 0,
        reviews: score?.reviews || 0
      };
    }).sort((a, b) => b.rating - a.rating);

    return res.json({ users: results });

  } catch (error) {
    return res.status(500).json({
      message: "Unable to load leaderboard"
    });
  }
});

export default r;
