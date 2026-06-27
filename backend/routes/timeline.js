/**
 * routes/timeline.js
 *
 * GET /timeline -> clusters formatted specifically for charting:
 *   label, start/end timestamps, article count, and a size/intensity
 *   metric (used by the frontend to size markers — bigger cluster =
 *   bigger marker, per the spec's stretch goal).
 *
 * Supports optional ?source=NPR (repeatable) or ?source=NPR,BBC News
 * query params to filter by news source. When filtering, article_count,
 * start_time/end_time, and intensity are all recomputed from ONLY the
 * matching articles — so a cluster with 5 BBC + 3 NPR articles shows
 * count=3 and NPR's own time range when filtered to NPR only. Clusters
 * with zero matching articles are omitted entirely.
 *
 * This is deliberately a different shape than GET /clusters — that
 * endpoint is for a cluster list view, this one is shaped for a
 * charting library (recharts/visx/vis-timeline), which wants explicit
 * start/end values per item rather than a flat list with dates buried
 * inside each row.
 */

const express = require("express");
const pool = require("../db");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    // Accept ?source=NPR or ?source=NPR,BBC News or repeated ?source=NPR&source=BBC News
    let sources = req.query.source;
    if (sources && !Array.isArray(sources)) {
      sources = String(sources).split(",");
    }
    sources = sources ? sources.map((s) => s.trim()).filter(Boolean) : null;

    const params = [];
    let whereClause = "";
    if (sources && sources.length > 0) {
      params.push(sources);
      whereClause = "WHERE a.source = ANY($1)";
    }

    const result = await pool.query(
      `
      SELECT
        c.id,
        c.label,
        COUNT(a.id) AS article_count,
        MIN(a.published_at) AS start_time,
        MAX(a.published_at) AS end_time
      FROM clusters c
      JOIN articles a ON a.cluster_id = c.id
      ${whereClause}
      GROUP BY c.id, c.label
      ORDER BY start_time ASC;
      `,
      params
    );

    // Intensity metric: normalized 0-1 score based on article count,
    // relative to the largest cluster in this (possibly filtered) result set.
    const maxCount = Math.max(
      ...result.rows.map((r) => Number(r.article_count)),
      1
    );

    const timeline = result.rows.map((row) => ({
      cluster_id: row.id,
      label: row.label,
      article_count: Number(row.article_count),
      start_time: row.start_time,
      end_time: row.end_time,
      intensity: Number(row.article_count) / maxCount,
    }));

    res.json({ timeline });
  } catch (err) {
    next(err);
  }
});

module.exports = router;