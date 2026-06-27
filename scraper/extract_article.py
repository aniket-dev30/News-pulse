"""
extract_article.py

Fetches the full article body text for each article's URL using
trafilatura, and writes it into the `body` column. RSS feeds only give
a short summary — this step gets the actual full article content from
the source page itself.

Design notes:
  - Only processes articles where body IS NULL (db.get_articles_without_body),
    so re-running this is safe and only does new work each time.
  - Each article is wrapped in its own try/except — if one page fails to
    parse (paywall, JS-rendered content, dead link, network timeout),
    we log it and move on rather than crashing the whole batch.
  - A small delay between requests avoids hammering news sites too fast,
    which some sites rate-limit or block outright.
  - trafilatura.fetch_url() handles the HTTP request; extract() pulls the
    main article text out of the full page HTML (stripping nav, ads,
    comments, etc. automatically).
"""

import time
import trafilatura

from db import get_articles_without_body, update_article_body

# Polite delay between requests so we don't hammer news sites with
# rapid-fire requests, which some outlets rate-limit or block.
REQUEST_DELAY_SECONDS = 1.0


def extract_one(url: str) -> str | None:
    """
    Fetches and extracts the main body text from a single article URL.
    Returns None if the page couldn't be fetched or no usable text
    could be extracted (paywall, JS-only content, dead link, etc.)
    """
    try:
        downloaded = trafilatura.fetch_url(url)
        if downloaded is None:
            return None

        text = trafilatura.extract(downloaded)
        return text
    except Exception as e:
        print(f"[extract_article] ERROR extracting {url}: {e}")
        return None


def run_extraction(limit: int = 100):
    """
    Processes up to `limit` articles that don't have body text yet.
    Each success/failure is written individually so partial progress
    is saved even if the run is interrupted partway through.
    """
    articles = get_articles_without_body(limit=limit)
    print(f"[extract_article] {len(articles)} articles need body extraction")

    success_count = 0
    fail_count = 0

    for i, article in enumerate(articles, start=1):
        body = extract_one(article["url"])

        if body and len(body.strip()) > 0:
            update_article_body(article["id"], body)
            success_count += 1
        else:
            # Store an empty string rather than leaving it NULL forever —
            # NULL would make get_articles_without_body() retry this URL
            # on every future run even though it's known to fail.
            update_article_body(article["id"], "")
            fail_count += 1
            print(f"[extract_article]   ({i}/{len(articles)}) FAILED: {article['url']}")

        # Progress heartbeat every 10 articles — extraction is silent on
        # success otherwise, which can look like it's hung on large batches
        # (e.g. 60+ articles at 1 req/sec is well over a minute of no output).
        if i % 10 == 0:
            print(f"[extract_article]   ({i}/{len(articles)}) processed so far...")

        time.sleep(REQUEST_DELAY_SECONDS)

    print(f"[extract_article] done — {success_count} succeeded, {fail_count} failed")


if __name__ == "__main__":
    run_extraction()