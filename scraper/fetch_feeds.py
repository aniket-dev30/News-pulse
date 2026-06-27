"""
fetch_feeds.py

Pulls raw entries from a list of RSS feeds using feedparser.
Returns a list of raw feed entries tagged with their source name —
normalization into a consistent schema happens in normalize.py,
NOT here. This file's only job is fetching.
"""

import feedparser

# Add/remove feeds here. Keep names human-readable — they're stored
# directly in the `source` column and shown in the frontend filter.
FEEDS = {
    "BBC News": "http://feeds.bbci.co.uk/news/rss.xml",
    "NPR": "https://feeds.npr.org/1001/rss.xml",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
}


def fetch_all_feeds() -> list[dict]:
    """
    Fetches all configured feeds and returns a flat list of raw entries,
    each tagged with its source name. Does not normalize or deduplicate —
    that's handled downstream.

    A feed that fails entirely (bad URL, network error, malformed XML)
    is skipped with a warning rather than crashing the whole run.
    """
    raw_entries = []

    for source_name, url in FEEDS.items():
        try:
            parsed = feedparser.parse(url)

            # feedparser doesn't raise on HTTP errors — it just returns
            # an empty/partial feed and sets bozo=1. Check explicitly.
            if parsed.bozo and not parsed.entries:
                print(f"[fetch_feeds] WARNING: failed to parse {source_name} "
                      f"({url}): {parsed.get('bozo_exception')}")
                continue

            if not parsed.entries:
                print(f"[fetch_feeds] WARNING: {source_name} returned 0 entries")
                continue

            for entry in parsed.entries:
                raw_entries.append({
                    "source": source_name,
                    "raw_entry": entry,  # kept as-is; normalize.py does the field mapping
                })

            print(f"[fetch_feeds] {source_name}: {len(parsed.entries)} entries")

        except Exception as e:
            # Catch-all so one broken feed never kills the whole pipeline run
            print(f"[fetch_feeds] ERROR fetching {source_name}: {e}")
            continue

    return raw_entries


if __name__ == "__main__":
    # Quick manual test: run `python fetch_feeds.py` to sanity-check
    # that feeds are reachable and parsing correctly from your machine.
    entries = fetch_all_feeds()
    print(f"\nTotal entries fetched: {len(entries)}")
    if entries:
        sample = entries[0]
        print(f"\nSample entry from {sample['source']}:")
        print(f"  title: {sample['raw_entry'].get('title')}")
        print(f"  link: {sample['raw_entry'].get('link')}")
        print(f"  available fields: {list(sample['raw_entry'].keys())}")