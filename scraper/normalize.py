"""
normalize.py

Takes raw feedparser entries (different shapes per feed) and converts
them into one consistent internal schema:

    {
        "source": str,
        "headline": str,
        "summary": str,
        "url": str,
        "published_at": datetime (UTC),
    }

Design note: across BBC, NPR, and Al Jazeera, the core fields
(title/link/summary/published) are actually consistent. The real
inconsistency we handle here is:
  - NPR exposes a richer `content` field; BBC/Al Jazeera don't.
    We prefer `content` over `summary` when available, since it gives
    extract_article.py a better starting point.
  - `published` strings differ in UTC offset formatting, but feedparser's
    `published_parsed` already gives us a normalized time.struct, so we
    convert that to a UTC datetime instead of parsing the string ourselves.
  - Some entries may be missing `published` entirely (rare, but possible
    on malformed feeds) — we skip those rather than guessing a timestamp.
"""

import re
from calendar import timegm
from datetime import datetime, timezone

HTML_TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def strip_html(text: str) -> str:
    """Removes HTML tags and collapses extra whitespace left behind."""
    if not text:
        return ""
    text = HTML_TAG_RE.sub(" ", text)
    text = WHITESPACE_RE.sub(" ", text)
    return text.strip()


def normalize_entry(source: str, raw_entry: dict) -> dict | None:
    """
    Converts a single raw feedparser entry into the internal schema.
    Returns None if the entry is missing required fields (no headline,
    no link, or no usable published date) — callers should skip Nones.
    """
    headline = raw_entry.get("title")
    url = raw_entry.get("link")

    if not headline or not url:
        print(f"[normalize] WARNING: skipping entry from {source} — missing title/link")
        return None

    # Prefer richer content field (NPR) over summary when present
    content_field = raw_entry.get("content")
    fallback_summary = raw_entry.get("summary", "")

    if content_field and isinstance(content_field, list) and len(content_field) > 0:
        summary = content_field[0].get("value", fallback_summary)
    else:
        summary = fallback_summary

    # Some NPR entries' `content` field is JUST an image caption
    # ("(Image credit: ...)") with no real article text — in that case
    # the plain `summary` field usually has the actual one-line synopsis,
    # so prefer that instead of storing an empty-feeling caption-only row.
    cleaned_preview = strip_html(summary)
    if len(cleaned_preview) < 40 and fallback_summary and fallback_summary != summary:
        summary = fallback_summary

    published_at = _parse_published(raw_entry)
    if published_at is None:
        print(f"[normalize] WARNING: skipping entry from {source} — no usable published date")
        return None

    return {
        "source": source,
        "headline": headline.strip(),
        "summary": strip_html(summary),
        "url": url.strip(),
        "published_at": published_at,
    }


def _parse_published(raw_entry: dict):
    """
    Uses feedparser's pre-parsed time.struct_time (published_parsed) to
    build a UTC datetime. Falls back to None if it's missing — we don't
    try to hand-parse the raw `published` string since formats vary.
    """
    parsed_time = raw_entry.get("published_parsed")
    if parsed_time is None:
        return None
    # time.struct_time from feedparser is already in UTC
    return datetime.fromtimestamp(timegm(parsed_time), tz=timezone.utc)


def normalize_all(raw_entries: list[dict]) -> list[dict]:
    """
    Takes the list of {"source", "raw_entry"} dicts from fetch_feeds.py
    and returns a clean list of normalized article dicts, skipping any
    entries that failed to normalize.
    """
    normalized = []
    skipped = 0

    for item in raw_entries:
        result = normalize_entry(item["source"], item["raw_entry"])
        if result is None:
            skipped += 1
            continue
        normalized.append(result)

    print(f"[normalize] {len(normalized)} normalized, {skipped} skipped")
    return normalized


if __name__ == "__main__":
    # Quick manual test: fetch real feeds and normalize them, print a sample.
    from fetch_feeds import fetch_all_feeds

    raw = fetch_all_feeds()
    clean = normalize_all(raw)

    if clean:
        print("\nSample normalized article:")
        for k, v in clean[0].items():
            print(f"  {k}: {v}")