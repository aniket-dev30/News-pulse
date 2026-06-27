/**
 * server.js
 *
 * Entry point for the News Pulse backend API.
 * Mounts all route modules and starts the HTTP server.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const clustersRouter = require("./routes/clusters");
const timelineRouter = require("./routes/timeline");
const ingestRouter = require("./routes/ingest");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Simple request log — helpful while debugging locally
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "news-pulse-backend" });
});

app.use("/clusters", clustersRouter);
app.use("/timeline", timelineRouter);
app.use("/ingest", ingestRouter);

// 404 handler — anything not matched above
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Centralized error handler — catches errors thrown/passed in routes
// so individual routes don't need repetitive try/catch boilerplate
app.use((err, req, res, next) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[server] News Pulse backend running on port ${PORT}`);
});