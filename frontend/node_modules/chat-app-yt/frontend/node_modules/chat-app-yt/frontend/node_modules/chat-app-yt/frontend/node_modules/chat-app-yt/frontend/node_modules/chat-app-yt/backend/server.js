// server.js

import path from "path";
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import multer from "multer";
import fs from "fs";

import authRoutes from "./routes/auth.routes.js";
import messageRoutes from "./routes/message.routes.js";
import userRoutes from "./routes/user.routes.js";

import connectToMongoDB from "./db/connectToMongoDB.js";
import { app, server } from "./socket/socket.js";  // Ensure these are correctly set up in socket.js

// Load environment variables
dotenv.config();

console.log("Environment Variables Loaded:");
console.log("MONGO_URI:", process.env.MONGO_URI);
console.log("PORT:", process.env.PORT);

const __dirname = path.resolve();
const PORT = process.env.PORT || 5000;

// Ensure the "uploads" directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Set up multer storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir); // Files will be stored in the "uploads" directory
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename based on timestamp
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "video/mp4", "audio/mpeg"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Invalid file type"));
    }
    cb(null, true);
  },
});

// Middleware
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/users", userRoutes);

// Handle media message in the message route
app.post("/api/messages/send/:conversationId", upload.single("media"), async (req, res) => {
  const { message } = req.body;  // Get the message from the body
  const media = req.file;         // Get the media file from the request

  // Check if either message or media is provided
  if (!message && !media) {
    return res.status(400).json({ error: "Message or media must be provided" });
  }

  // Prepare the media URL if media is uploaded
  let mediaUrl = null;
  if (media) {
    mediaUrl = `/uploads/${media.filename}`; // Path to the media file
  }

  // Save the message in the database
  try {
    const newMessage = new Message({
      senderId: req.user._id,        // Assuming the sender is authenticated
      receiverId: req.body.receiverId, // Receiver ID from the request body
      message,
      media: mediaUrl,
    });

    const savedMessage = await newMessage.save();

    // Send the saved message data back to the client
    res.status(200).json({
      success: true,
      message: "Message sent successfully",
      data: savedMessage,
    });

  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
});


// Error handling middleware for Multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(500).json({ error: `Multer Error: ${err.message}` });
  }
  if (err) {
    return res.status(500).json({ error: `Server Error: ${err.message}` });
  }
  next();
});

// Static files serving (for frontend)
app.use("/uploads", express.static(uploadsDir)); // Serve uploaded media files

app.use(express.static(path.join(__dirname, "/frontend/dist")));

// Catch-all route for frontend SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

// Start the server
server.listen(PORT, () => {
  connectToMongoDB();
  console.log(`Server Running on port ${PORT}`);
});
