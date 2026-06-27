export type ClusterListItem = {
  id: number;
  label: string;
  article_count: string; // comes back as string from Postgres COUNT()
  earliest_article: string;
  latest_article: string;
};

export type ClustersResponse = { clusters: ClusterListItem[] };

export type Article = {
  id: number;
  source: string;
  headline: string;
  summary: string;
  url: string;
  published_at: string;
};

export type ClusterDetailResponse = {
  cluster: { id: number; label: string };
  articles: Article[];
};

export type TimelineItem = {
  cluster_id: number;
  label: string;
  article_count: number;
  start_time: string;
  end_time: string;
  intensity: number; // 0–1
};

export type TimelineResponse = { timeline: TimelineItem[] };

export type IngestTriggerResponse = { jobId: string; status: "running" };

export type IngestJob = {
  id: string;
  status: "pending" | "running" | "done" | "failed";
  started_at: string;
  finished_at: string | null;
  error: string | null;
};

export type IngestStatusResponse = { job: IngestJob };