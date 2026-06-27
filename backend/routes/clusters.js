/**
 * routes/clusters.js
 *
 * GET /clusters       -> list of clusters with label, article count, time range
 * GET /clusters/:id   -> full cluster detail with all articles, sorted chronologically
 */

const express = require("express");
const pool = require("../db");

const router = express.Router();

// GET /clusters
router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.label,
        COUNT(a.id) AS article_count,
        MIN(a.published_at) AS earliest_article,
        MAX(a.published_at) AS latest_article
      FROM clusters c
      JOIN articles a ON a.cluster_id = c.id
      GROUP BY c.id, c.label
      ORDER BY article_count DESC, latest_article DESC;
    `);

    res.json({ clusters: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /clusters/:id
router.get("/:id", async (req, res, next) => {
  const { id } = req.params;

  // Validate that :id is actually a number before querying —
  // avoids a confusing DB error turning into a 500 for a bad request.
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: "Cluster id must be a number" });
  }

  try {
    const clusterResult = await pool.query(
      "SELECT id, label FROM clusters WHERE id = $1;",
      [id]
    );

    if (clusterResult.rows.length === 0) {
      return res.status(404).json({ error: "Cluster not found" });
    }

    const articlesResult = await pool.query(
      `SELECT id, source, headline, summary, url, published_at
       FROM articles
       WHERE cluster_id = $1
       ORDER BY published_at ASC;`,
      [id]
    );

    res.json({
      cluster: clusterResult.rows[0],
      articles: articlesResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;