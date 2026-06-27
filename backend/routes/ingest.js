/**
 * routes/ingest.js
 *
 * POST /ingest/trigger        -> kicks off the Python pipeline (scrape + cluster)
 *                                 as a subprocess, returns a job ID immediately
 * GET  /ingest/status/:jobId  -> lets the frontend poll job status
 *
 * Design notes:
 *  - The Python pipeline runs as a detached child process so this
 *    endpoint returns immediately rather than blocking the HTTP
 *    response for however long scraping+clustering takes.
 *  - Job status is persisted in the `ingest_jobs` table (not just
 *    in-memory) so status survives a backend restart.
 */

const express = require("express");
const { randomUUID } = require("crypto");
const { spawn } = require("child_process");
const path = require("path");
const pool = require("../db");

const router = express.Router();

// Path to the Python pipeline's entry point. Adjust if your folder
// layout differs — assumes /scraper sits next to /backend.
const SCRAPER_ENTRY = path.join(__dirname, "..", "..", "scraper", "main.py");
const PYTHON_CMD = process.env.PYTHON_CMD || "python"; // "python3" on Mac/Linux

router.post("/trigger", async (req, res, next) => {
  const jobId = randomUUID();

  try {
    await pool.query(
      `INSERT INTO ingest_jobs (id, status, started_at) VALUES ($1, 'running', NOW());`,
      [jobId]
    );

    const child = spawn(PYTHON_CMD, [SCRAPER_ENTRY], {
      cwd: path.join(__dirname, "..", "..", "scraper"),
      detached: true,
    });

    child.stdout.on("data", (data) => {
      console.log(`[ingest ${jobId}] ${data}`);
    });

    child.stderr.on("data", (data) => {
      console.error(`[ingest ${jobId}] ERROR: ${data}`);
    });

    child.on("close", async (code) => {
      const status = code === 0 ? "done" : "failed";
      const errorMsg = code === 0 ? null : `Process exited with code ${code}`;

      try {
        await pool.query(
          `UPDATE ingest_jobs SET status = $1, finished_at = NOW(), error = $2 WHERE id = $3;`,
          [status, errorMsg, jobId]
        );
      } catch (updateErr) {
        console.error(`[ingest ${jobId}] failed to update job status:`, updateErr);
      }
    });

    // Don't let a crashed child process crash the backend itself
    child.on("error", (err) => {
      console.error(`[ingest ${jobId}] failed to start subprocess:`, err);
    });

    res.status(202).json({ jobId, status: "running" });
  } catch (err) {
    next(err);
  }
});

router.get("/status/:jobId", async (req, res, next) => {
  const { jobId } = req.params;

  try {
    const result = await pool.query(
      "SELECT id, status, started_at, finished_at, error FROM ingest_jobs WHERE id = $1;",
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json({ job: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;