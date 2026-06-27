# News Pulse backend image — bundles Node (Express API) and Python
# (RSS scraper/clustering pipeline) together, since the API spawns the
# Python pipeline as a subprocess for POST /ingest/trigger.
#
# Render's native runtimes are isolated per-language (a Node runtime
# has no Python, and vice versa), so Docker is used here specifically
# to get both runtimes in one deployable image without changing the
# Node-spawns-Python architecture that's already built and tested.

FROM node:20-slim

# Install Python 3 + pip alongside the base Node image.
# --no-install-recommends keeps the image smaller; we only need the
# interpreter and pip, not the full Debian Python toolchain.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Make `python` resolve to python3, since ingest.js's PYTHON_CMD env
# var defaults to "python" (matching the convention used in local
# testing) rather than "python3".
RUN ln -s /usr/bin/python3 /usr/bin/python

WORKDIR /app

# --- Python scraper dependencies ---
COPY scraper/requirements.txt ./scraper/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r ./scraper/requirements.txt

# --- Node backend dependencies ---
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev

# --- Copy actual source code (after deps, so dependency layers cache
# even when only application code changes between builds) ---
COPY scraper ./scraper
COPY backend ./backend

WORKDIR /app/backend

# Render forwards inbound traffic to whatever port the app binds to,
# read from the PORT env var Render sets automatically.
EXPOSE 10000

CMD ["node", "server.js"]