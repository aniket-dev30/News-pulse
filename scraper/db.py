"""
db.py

Handles all Postgres writes for the scraper. Uses psycopg2 directly
(no ORM) since the schema is small and fixed.

Responsibilities:
  - Insert normalized articles, skipping duplicates by URL
    (ON CONFLICT DO NOTHING — re-running the scraper is safe).
  - Update an article's cluster_id once clustering has run.
  - Track ingest job status (used by the Node /ingest endpoints).
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")


def get_connection():
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set. Create a .env file in /scraper "
            "with DATABASE_URL=<your neon connection string>"
        )
    return psycopg2.connect(DATABASE_URL)


def insert_articles(articles: list[dict]) -> int:
    """
    Inserts normalized articles into the `articles` table.
    Duplicate URLs are silently skipped (ON CONFLICT DO NOTHING) so
    re-running the scraper never double-inserts the same story.

    Returns the number of NEW rows actually inserted.
    """
    if not articles:
        return 0

    conn = get_connection()
    inserted_count = 0

    try:
        with conn.cursor() as cur:
            for article in articles:
                cur.execute(
                    """
                    INSERT INTO articles (source, headline, summary, body, url, published_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (url) DO NOTHING
                    RETURNING id;
                    """,
                    (
                        article["source"],
                        article["headline"],
                        article.get("summary", ""),
                        article.get("body"),  # None until extract_article.py fills it in
                        article["url"],
                        article["published_at"],
                    ),
                )
                if cur.fetchone() is not None:
                    inserted_count += 1
        conn.commit()
    finally:
        conn.close()

    print(f"[db] inserted {inserted_count} new articles "
          f"({len(articles) - inserted_count} were duplicates)")
    return inserted_count


def get_articles_without_body(limit: int = 100) -> list[dict]:
    """
    Returns articles that don't have full body text yet, so
    extract_article.py can process them (and skip ones it already did).
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, url FROM articles
                WHERE body IS NULL
                LIMIT %s;
                """,
                (limit,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    return [{"id": r[0], "url": r[1]} for r in rows]


def update_article_body(article_id: int, body: str | None):
    """Sets the full extracted body text for one article (or None on failure)."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE articles SET body = %s WHERE id = %s;",
                (body, article_id),
            )
        conn.commit()
    finally:
        conn.close()


def get_unclustered_articles() -> list[dict]:
    """Returns all articles that don't yet belong to a cluster, for cluster.py to process."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, headline, summary FROM articles
                WHERE cluster_id IS NULL;
                """
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    return [{"id": r[0], "headline": r[1], "summary": r[2]} for r in rows]


def create_cluster(label: str) -> int:
    """Creates a new cluster row and returns its id."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO clusters (label) VALUES (%s) RETURNING id;",
                (label,),
            )
            cluster_id = cur.fetchone()[0]
        conn.commit()
    finally:
        conn.close()
    return cluster_id


def assign_articles_to_cluster(article_ids: list[int], cluster_id: int):
    """Assigns a batch of articles to a cluster."""
    if not article_ids:
        return
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE articles SET cluster_id = %s WHERE id = ANY(%s);",
                (cluster_id, article_ids),
            )
        conn.commit()
    finally:
        conn.close()

def reset_all_clusters():
    """
    Clears all cluster assignments and deletes existing cluster rows.
    Used when re-running cluster.py during threshold tuning so each
    run starts from a clean slate instead of only touching articles
    that happen to still be unclustered.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE articles SET cluster_id = NULL;")
            cur.execute("DELETE FROM clusters;")
        conn.commit()
    finally:
        conn.close()
def save_all_clusters(clusters: list[dict]):
    """
    Writes ALL clusters and their article assignments using a SINGLE
    connection, instead of opening a new connection per cluster.
    Avoids the connection-storm that caused the earlier
    "Authentication timed out" error against Neon.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            for c in clusters:
                cur.execute(
                    "INSERT INTO clusters (label) VALUES (%s) RETURNING id;",
                    (c["label"],),
                )
                cluster_id = cur.fetchone()[0]

                if c["article_ids"]:
                    cur.execute(
                        "UPDATE articles SET cluster_id = %s WHERE id = ANY(%s);",
                        (cluster_id, c["article_ids"]),
                    )
        conn.commit()
    finally:
        conn.close()

if __name__ == "__main__":
    # Quick manual test: confirms the DB connection works and prints
    # how many articles currently lack a body / cluster.
    conn = get_connection()
    print("[db] connection OK")
    conn.close()

    no_body = get_articles_without_body()
    print(f"[db] {len(no_body)} articles without body text")

    unclustered = get_unclustered_articles()
    print(f"[db] {len(unclustered)} unclustered articles")