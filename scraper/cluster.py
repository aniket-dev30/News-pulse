"""
cluster.py

Groups articles into topic clusters using keyword-overlap (Option A
from the assessment spec) — no NLP libraries required.

Approach:
  1. For each article, extract "meaningful words" from headline + summary:
     lowercase, strip punctuation, remove stop words.
  2. Build a per-corpus document-frequency count for every word, and
     exclude words that appear in more than CORPUS_FREQ_CUTOFF of all
     articles. This catches dataset-specific "stop words" that a static
     list can't predict in advance — e.g. on a day dominated by World
     Cup coverage, "world" and "cup" behave like stop words for THIS
     run even though they're meaningful in general.
  3. Compare every pair of articles by how many of the REMAINING words
     they share. If they share >= OVERLAP_THRESHOLD such words, they're
     considered part of the same story and grouped together (via
     union-find / graph connectivity — if A matches B and B matches C,
     all three end up in one cluster, even if A and C don't directly
     overlap enough).
  4. Each cluster's label = its most common shared words.

Threshold reasoning (documented for the README):
  OVERLAP_THRESHOLD = 6 meaningful words shared. This was tuned upward
  in stages as the dataset grew from repeated scraper runs:
    - Started at 3: worked on a small (~77 article) corpus, but caused
      a false merge via TRANSITIVE chaining — article A shares 3 words
      with B, B shares 3 different words with C, so A and C end up in
      the same cluster even though they share nothing directly.
    - Raised to 4: fixed that specific merge and held up well... until
      the corpus grew to ~140+ articles from multiple scraper runs.
      At that size, incidental 4-word overlaps between unrelated
      articles become statistically common just by chance, producing
      a new, larger mega-cluster (12+ articles mixing Supreme Court
      rulings with Venezuela earthquake coverage).
    - Raised to 5: improved things, but didn't fully separate the two
      stories. Investigating the merge revealed the actual bridge: an
      NPR "morning brief" headline literally combined both topics in
      one sentence ("Rescuers scramble to find Venezuela earthquake
      survivors. And, SCOTUS rules on asylum") — a single article
      mentioning both stories was enough to link them transitively.
    - Raised to 6: finally separates both stories cleanly, even with
      the bridging headline present, without breaking the real
      multi-article clusters (which share many more than 6 words).
  Takeaway: the right threshold isn't fixed — it depends on corpus
  size and is sensitive to edge cases like multi-topic digest
  headlines, which a fixed small threshold is especially vulnerable to.

  CORPUS_FREQ_CUTOFF = 0.15 (15%). First attempt without this produced
  one 41-article "mega-cluster" merging World Cup coverage, Venezuela
  earthquake stories, and US Supreme Court news — all linked transitively
  through generic high-frequency words like "world" and "cup" that
  happened to appear across many unrelated headlines that day. A static
  stop word list can't predict which words will spike on any given day,
  so we compute frequency dynamically per run instead.

Known limitation: even after tuning, keyword-overlap clustering can still
occasionally merge unrelated stories through transitive chaining if they
happen to share several generic-but-not-stop-word terms — combined/digest
headlines that mention multiple stories in one sentence are a notably
sharp edge case for this, since a single such article can bridge two
otherwise-unrelated clusters. A stricter alternative would require every
pair of articles within a cluster to overlap directly, not just
transitively — this would eliminate false merges entirely but is more
complex and was deprioritized given time constraints.
"""

import re
from collections import Counter

OVERLAP_THRESHOLD = 6
CORPUS_FREQ_CUTOFF = 0.15  # words appearing in >15% of articles are excluded

# A reasonably sized stop word list — common filler words that would
# otherwise dominate every article's keyword set without being meaningful.
STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "and", "or", "but", "if", "then", "else", "for", "to", "of", "in",
    "on", "at", "by", "with", "from", "as", "this", "that", "these",
    "those", "it", "its", "his", "her", "their", "they", "he", "she",
    "we", "you", "i", "will", "would", "could", "should", "can", "may",
    "might", "must", "shall", "has", "have", "had", "do", "does", "did",
    "not", "no", "yes", "all", "some", "more", "most", "other", "into",
    "over", "after", "before", "about", "what", "when", "where", "who",
    "how", "why", "which", "than", "also", "says", "said", "new", "news",
}

WORD_RE = re.compile(r"[a-z0-9]+")
URL_RE = re.compile(r"https?://\S+")
HTML_TAG_RE = re.compile(r"<[^>]+>")


def extract_keywords(text: str) -> set[str]:
    """Lowercases, strips HTML tags/URLs/punctuation, removes stop words and short tokens."""
    if not text:
        return set()
    text = HTML_TAG_RE.sub(" ", text)
    text = URL_RE.sub(" ", text)
    words = WORD_RE.findall(text.lower())
    return {w for w in words if w not in STOP_WORDS and len(w) > 2}


def cluster_articles(articles: list[dict]) -> list[dict]:
    """
    Takes a list of {"id", "headline", "summary"} dicts (as returned by
    db.get_unclustered_articles) and returns a list of clusters:

        [{"label": str, "article_ids": [int, ...]}, ...]

    Uses union-find so transitively-related articles end up in the same
    cluster even without every pair directly overlapping.
    """
    n = len(articles)
    if n == 0:
        return []

    raw_keyword_sets = [
        extract_keywords(f"{a['headline']} {a.get('summary', '')}")
        for a in articles
    ]

    # Dynamic corpus-frequency stop words: any word appearing in more
    # than CORPUS_FREQ_CUTOFF of articles is too generic for THIS run
    # to be a useful topic signal, even if it's not in the static list.
    doc_freq = Counter()
    for kw_set in raw_keyword_sets:
        doc_freq.update(kw_set)

    max_docs = max(1, int(n * CORPUS_FREQ_CUTOFF))
    corpus_stop_words = {w for w, count in doc_freq.items() if count > max_docs}

    if corpus_stop_words:
        print(f"[cluster] excluding {len(corpus_stop_words)} dataset-specific "
              f"high-frequency words: {sorted(corpus_stop_words)}")

    keyword_sets = [kw_set - corpus_stop_words for kw_set in raw_keyword_sets]

    # Union-find setup
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x, y):
        rx, ry = find(x), find(y)
        if rx != ry:
            parent[ry] = rx

    # Compare every pair — fine for assessment-scale data (dozens to low
    # hundreds of articles); would need a smarter index (e.g. inverted
    # index on keywords) at real production scale.
    for i in range(n):
        for j in range(i + 1, n):
            shared = keyword_sets[i] & keyword_sets[j]
            if len(shared) >= OVERLAP_THRESHOLD:
                union(i, j)

    # Group article indices by their root parent
    groups: dict[int, list[int]] = {}
    for i in range(n):
        root = find(i)
        groups.setdefault(root, []).append(i)

    clusters = []
    for indices in groups.values():
        # Label = the most common shared keywords across all articles in the cluster,
        # but weighted to prefer words that are rarer ACROSS THE WHOLE CORPUS —
        # this avoids labels like "images, venezuela, org" where "images"/"org"
        # are common-but-not-quite-stop-word-frequency terms that don't actually
        # describe the story. A word that's common within the cluster AND rare
        # in the corpus overall is a much better label candidate.
        in_cluster_freq = Counter()
        for idx in indices:
            in_cluster_freq.update(keyword_sets[idx])

        def label_score(word):
            # High in-cluster frequency is good; high overall corpus frequency is bad.
            return in_cluster_freq[word] / (1 + doc_freq[word])

        ranked_words = sorted(in_cluster_freq.keys(), key=label_score, reverse=True)
        top_keywords = ranked_words[:3]
        label = ", ".join(top_keywords) if top_keywords else "uncategorized"

        clusters.append({
            "label": label,
            "article_ids": [articles[idx]["id"] for idx in indices],
        })

    return clusters


def run_clustering(reset: bool = True):
    """
    Pulls articles from the DB, clusters them, and writes the results
    back using a single batched connection (see db.save_all_clusters).

    reset=True (default): wipes existing cluster assignments first, so
    you get a clean re-cluster of ALL articles. Useful while tuning
    thresholds.
    """
    from db import get_unclustered_articles, reset_all_clusters, save_all_clusters

    if reset:
        reset_all_clusters()
        print("[cluster] reset existing cluster assignments")

    articles = get_unclustered_articles()
    print(f"[cluster] clustering {len(articles)} articles")

    clusters = cluster_articles(articles)
    print(f"[cluster] formed {len(clusters)} clusters")

    save_all_clusters(clusters)

    for c in clusters:
        print(f"[cluster]   '{c['label']}' -> {len(c['article_ids'])} articles")


if __name__ == "__main__":
    run_clustering()