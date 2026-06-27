import type {
  ClustersResponse,
  ClusterDetailResponse,
  TimelineResponse,
  IngestTriggerResponse,
  IngestStatusResponse,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const getClusters = (source?: string) => {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  return apiFetch<ClustersResponse>(`/clusters${qs}`);
};

export const getCluster = (id: number) =>
  apiFetch<ClusterDetailResponse>(`/clusters/${id}`);

export const getTimeline = (source?: string) => {
  const qs = source ? `?source=${encodeURIComponent(source)}` : "";
  return apiFetch<TimelineResponse>(`/timeline${qs}`);
};

export const triggerIngest = () =>
  apiFetch<IngestTriggerResponse>("/ingest/trigger", { method: "POST" });

export const getIngestStatus = (jobId: string) =>
  apiFetch<IngestStatusResponse>(`/ingest/status/${jobId}`);