# NewsPulse — Topic-Clustered News Timeline

A full-stack system that pulls live articles from RSS feeds, automatically groups related articles into topic clusters, and displays them on a visual timeline.

Built for the Xponentium Full-Stack Developer Internship assessment.

---

## Live URLs

| Component | URL |
|-----------|-----|
| Frontend  | https://news-pulse-five-omega.vercel.app/|
| Backend API | https://news-pulse-backend-q30x.onrender.com |

---

## Setup Instructions

### Prerequisites
- Python 3.9+ with `pip`
- Node.js 18+ with `npm`
- A [Neon](https://neon.tech) Postgres database (free tier works)

### 1. Clone the repo

```bash
git clone https://github.com/aniket-dev30/News-pulse.git
cd News-pulse
```

### 2. Database

Create a Neon project and run this SQL in the Neon SQL editor:

```sql
CREATE TABLE IF NOT EXISTS clusters (
    id SERIAL PRIMARY KEY,
    label TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS articles (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL,
    headline TEXT NOT NULL,
    summary TEXT,
    body TEXT,
    url TEXT NOT NULL UNIQUE,
    published_at TIMESTAMP NOT NULL,
    cluster_id INTEGER REFERENCES clusters(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingest_jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP DEFAULT NOW(),
    finished_at TIMESTAMP,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_cluster ON articles(cluster_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);
```

### 3. Scraper (Python)

```bash
cd scraper
pip install -r requirements.txt
```

Create `scraper/.env` (use `.env.example` as a template):
```
DATABASE_URL=your_neon_connection_string
```

Run the pipeline:
```bash
python main.py
```

This runs the full pipeline: fetch RSS feeds → normalize → insert into DB → extract full article bodies → cluster into topics.

### 4. Backend (Node.js)

```bash
cd backend
npm install
```

Create `backend/.env` (use `.env.example` as a template):
```
DATABASE_URL=your_neon_connection_string
PORT=4000
PYTHON_CMD=python   # use python3 on Linux/Mac
```

Start the server:
```bash
node server.js
```

API will be available at `http://localhost:4000`.

### 5. Frontend (Next.js)

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Start the dev server:
```bash
npm run dev
```

Open `http://localhost:3000`.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                        Frontend                         │
│              Next.js 16 · React 19 · inline styles      │
│         Timeline view · Cluster detail · Filters        │
└───────────────────────┬─────────────────────────────────┘
                        │ REST API
┌───────────────────────▼─────────────────────────────────┐
│                    Node.js Backend                       │
│                   Express · pg Pool                      │
│  /clusters  /timeline  /ingest/trigger  /ingest/status  │
└──────────┬────────────────────────────┬─────────────────┘
           │ subprocess                 │ SQL
┌──────────▼──────────┐    ┌───────────▼──────────────────┐
│   Python Scraper    │    │      Neon Postgres            │
│  feedparser · psycopg2   │  articles · clusters ·        │
│  fetch → normalize  │    │  ingest_jobs tables           │
│  → extract → cluster│    └──────────────────────────────┘
│  → store            │
└─────────────────────┘
```

**Data flow:**
1. User clicks "Refresh Data" → frontend calls `POST /ingest/trigger`
2. Backend spawns `python main.py` as a subprocess, returns a job ID immediately
3. Frontend polls `GET /ingest/status/:jobId` every 2 seconds
4. Python pipeline: fetches RSS feeds → normalizes articles → inserts into DB → extracts full article body text → runs clustering → saves clusters
5. On job completion, frontend auto-refreshes the timeline via `GET /timeline`

**What runs where:**
- Frontend → Vercel
- Backend API + Python pipeline → Render, deployed via Docker (a single image bundles both Node and Python, since Render's native runtimes are isolated per-language and a plain Node runtime doesn't include Python for the subprocess call)
- Database → Neon (managed Postgres, free tier)

---

## News Sources

| Source | Feed URL |
|--------|----------|
| BBC News | `http://feeds.bbci.co.uk/news/rss.xml` |
| NPR | `https://feeds.npr.org/1001/rss.xml` |
| Al Jazeera | `https://www.aljazeera.com/xml/rss/all.xml` |

These were chosen for geographic and editorial diversity — BBC (UK/international), NPR (US domestic focus), Al Jazeera (Middle East/Global South perspective) — which produces more interesting cross-source clustering on major stories.

---

## Topic Grouping Approach

**Method: Keyword-overlap clustering with union-find (Option A)**

### How it works

1. **Keyword extraction** — for each article, the headline and summary are tokenized. HTML tags, URLs, and punctuation are stripped first. Words are lowercased and filtered through a static stop-word list (common English filler: "the", "is", "and", etc.).

2. **Dynamic corpus filtering** — words appearing in more than 15% of all articles in a given run are also excluded. This catches day-specific high-frequency terms (e.g. "world" and "cup" during World Cup coverage) that a static stop-word list can't predict.

3. **Pairwise overlap** — every pair of articles is compared by the size of their keyword intersection. If two articles share enough significant words (see threshold below), they are considered related.

4. **Union-find grouping** — a union-find (disjoint set) data structure transitively merges groups: if A overlaps B and B overlaps C, all three end up in the same cluster, even if A and C share fewer words directly.

5. **Cluster labelling** — each cluster is labelled using its top 3 keywords, scored by frequency within the cluster weighted against rarity across the full corpus. This avoids generic labels and produces specific ones like "Venezuela, Earthquakes, Survivors" instead of "World, News, People".

### Why this approach

It requires no external ML dependencies, runs fast, is fully explainable, and produces coherent clusters on real news data. A production system might use TF-IDF vectors + cosine similarity or sentence embeddings, but keyword-overlap is a legitimate starting point used in real systems.

### Threshold choice

`OVERLAP_THRESHOLD = 6` was reached through iterative tuning as the dataset grew across repeated scraper runs:

- **Started at 3** — worked on a small (~77 article) corpus, but caused a false merge via transitive chaining (article A shares 3 words with B, B shares 3 *different* words with C, so A and C end up clustered together despite sharing nothing directly).
- **Raised to 4** — fixed that, but once the corpus grew past ~140 articles from repeated runs, incidental 4-word overlaps between unrelated articles became common just by chance, producing a new 12-article mega-cluster mixing Supreme Court rulings with Venezuela earthquake coverage.
- **Raised to 5** — improved but didn't fully separate them. Investigating revealed the actual bridge: an NPR "morning brief" headline literally combined both stories in one sentence ("Rescuers scramble to find Venezuela earthquake survivors. And, SCOTUS rules on asylum") — a single article mentioning both topics was enough to link them transitively.
- **Raised to 6** — finally separates both stories cleanly, even with the bridging headline present, without breaking the real multi-article clusters (which share far more than 6 words).

The takeaway: the right threshold isn't fixed — it depends on corpus size and is especially sensitive to multi-topic digest headlines, which a low fixed threshold is particularly vulnerable to.

### Known limitation

**Transitive false-merging** — union-find merges clusters transitively, which can still occasionally chain unrelated stories together through an intermediate article that shares different subsets of words with each group — combined/digest headlines mentioning multiple stories in one sentence are a particularly sharp edge case for this.

This is an inherent tradeoff of the union-find approach. It can be mitigated by raising the threshold (done) or eliminated entirely by switching to non-transitive overlap checking (requiring every pair of articles within a cluster to overlap directly, rather than just transitively through a chain). Given more time, this would be the first algorithmic improvement.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clusters` | List all clusters with label, article count, time range |
| GET | `/clusters/:id` | Full cluster detail with all articles sorted chronologically |
| GET | `/timeline` | Clusters formatted for visualization: start/end time, intensity (0–1). Supports `?source=` filtering. |
| POST | `/ingest/trigger` | Trigger the Python pipeline; returns `{ jobId, status }` |
| GET | `/ingest/status/:jobId` | Poll job status: pending → running → done/failed |

---

## Project Structure

```
news-pulse/
├── Dockerfile             # Bundles Node + Python for Render deployment
├── scraper/
│   ├── main.py            # Pipeline orchestrator (fetch → normalize → insert → extract → cluster)
│   ├── fetch_feeds.py     # RSS ingestion via feedparser
│   ├── normalize.py       # Schema normalization + HTML stripping
│   ├── extract_article.py # Full article body extraction via trafilatura
│   ├── cluster.py         # Keyword-overlap clustering (union-find)
│   ├── db.py              # Postgres read/write via psycopg2
│   └── requirements.txt
├── backend/
│   ├── server.js          # Express entry point
│   ├── db/index.js        # Shared pg.Pool connection
│   └── routes/
│       ├── clusters.js    # GET /clusters, GET /clusters/:id
│       ├── timeline.js    # GET /timeline (with optional source filtering)
│       └── ingest.js      # POST /ingest/trigger, GET /ingest/status/:jobId
└── frontend/
    └── src/app/
        ├── page.tsx              # Main timeline view (source filter, refresh, stats)
        ├── layout.tsx
        ├── lib/
        │   ├── api.ts            # Fetch helpers
        │   └── types.ts          # TypeScript types
        ├── components/
        │   ├── Timeline.tsx      # Bar-chart timeline, collapses single-article stories
        │   └── RefreshButton.tsx # Ingest trigger + polling, with phase-based styling
        └── clusters/[id]/
            └── page.tsx          # Cluster detail view
```
