import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = admin.firestore();
const fcm = admin.messaging();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to send notifications
  app.post("/api/notify", async (req, res) => {
    const { userId, title, body, data } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const token = userData?.fcmToken;

      if (!token) {
        console.log(`No FCM token for user ${userId}`);
        return res.json({ success: false, message: "No token found for user" });
      }

      const message = {
        notification: {
          title,
          body,
        },
        data: data || {},
        token: token,
      };

      const response = await fcm.send(message);
      console.log("Successfully sent message:", response);
      res.json({ success: true, response });
    } catch (error) {
      console.error("Error sending notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // API Route to notify all admins
  app.post("/api/notify-admins", async (req, res) => {
    const { title, body, data } = req.body;

    try {
      const adminsSnapshot = await db.collection("users").where("role", "==", "admin").get();
      const tokens: string[] = [];
      
      adminsSnapshot.forEach(doc => {
        const d = doc.data();
        if (d.fcmToken) tokens.push(d.fcmToken);
      });

      if (tokens.length === 0) {
        return res.json({ success: false, message: "No admin tokens found" });
      }

      const message = {
        notification: {
          title,
          body,
        },
        data: data || {},
        tokens: tokens,
      };

      const response = await fcm.sendEachForMulticast(message);
      console.log("Successfully sent multicast message:", response);
      res.json({ success: true, response });
    } catch (error) {
      console.error("Error sending admin notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // API Route to notify all assemblers
  app.post("/api/notify-assemblers", async (req, res) => {
    const { title, body, data } = req.body;

    try {
      const assemblersSnapshot = await db.collection("users").where("role", "==", "assembler").get();
      const tokens: string[] = [];
      
      assemblersSnapshot.forEach(doc => {
        const d = doc.data();
        if (d.fcmToken) tokens.push(d.fcmToken);
      });

      if (tokens.length === 0) {
        return res.json({ success: false, message: "No assembler tokens found" });
      }

      const message = {
        notification: {
          title,
          body,
        },
        data: data || {},
        tokens: tokens,
      };

      const response = await fcm.sendEachForMulticast(message);
      console.log("Successfully sent multicast message to assemblers:", response);
      res.json({ success: true, response });
    } catch (error) {
      console.error("Error sending assembler notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
