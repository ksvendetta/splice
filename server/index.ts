// Minimal server for PWA - Frontend only (no backend API)
import "dotenv/config";
import express from "express";
import { setupVite, serveStatic, log } from "./vite";
import { createServer } from "http";
import { runGeminiOcr } from "./geminiOcr";

const app = express();

(async () => {
  const server = createServer(app);

  // JSON body parser for OCR endpoint
  app.use(express.json({ limit: "50mb" }));

  // Google Cloud Vision OCR endpoint
  app.post("/api/ocr", async (req, res) => {
    try {
      const { image } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ error: "Missing 'image' field (base64 data URL)" });
      }

      const base64 = image.includes(",") ? image.split(",")[1] : image;
      const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

      const result = await runGeminiOcr(base64, mimeType);
      console.log("OCR: Gemini succeeded");
      res.json({ ...result, engine: "Gemini Flash" });
    } catch (error: any) {
      console.error("OCR error:", error);
      res.status(500).json({ error: error.message || "OCR processing failed" });
    }
  });

  // Setup Vite dev server in development, static file serving in production
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Serve on port 5000 (Replit requirement)
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, '0.0.0.0', () => {
    log(`PWA dev server running on port ${port}`);
  });
})();
