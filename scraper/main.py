"""
main.py

Entry point for the full scrape -> normalize -> store -> extract ->
cluster pipeline. This is the script the Node backend's
POST /ingest/trigger endpoint runs as a subprocess. Designed to be
re-run repeatedly (e.g. by a scheduler or the "Refresh data" button
in the frontend) without manual intervention.

Pipeline steps:
  1. Fetch raw entries from all configured RSS feeds
  2. Normalize them into the internal schema (clean text, no HTML/URLs)
  3. Insert into Postgres, skipping duplicates by URL
  4. Extract full article body text for any articles that don't have it yet
  5. Re-cluster ALL articles into topic groups

Step 4 only processes articles where body IS NULL, so on repeat runs
it's fast — only genuinely new articles get extracted, not the full
history every time.

Exit code 0 = success, non-zero = failure (the backend uses this to
mark the ingest job as "done" vs "failed").
"""

import sys

from fetch_feeds import fetch_all_feeds
from normalize import normalize_all
from db import insert_articles
from extract_article import run_extraction
from cluster import run_clustering


def main():
    print("[main] Starting News Pulse ingestion pipeline")

    print("[main] Step 1/5: fetching RSS feeds...")
    raw_entries = fetch_all_feeds()

    print("[main] Step 2/5: normalizing entries...")
    articles = normalize_all(raw_entries)

    print("[main] Step 3/5: inserting into database...")
    inserted_count = insert_articles(articles)

    print("[main] Step 4/5: extracting full article bodies...")
    run_extraction()

    print("[main] Step 5/5: clustering articles...")
    run_clustering(reset=True)

    print(f"[main] Pipeline complete. {inserted_count} new articles inserted.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[main] FATAL ERROR: {e}", file=sys.stderr)
        sys.exit(1)