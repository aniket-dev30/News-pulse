"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCluster } from "../../lib/api";
import type { ClusterDetailResponse } from "../../lib/types";
import { format } from "date-fns";

const SOURCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "BBC News":   { bg:"#ef444418", text:"#f87171", border:"#ef4444" },
  "NPR":        { bg:"#3b82f618", text:"#60a5fa", border:"#3b82f6" },
  "Al Jazeera": { bg:"#f9731618", text:"#fb923c", border:"#f97316" },
};

function capitalize(s: string) {
  return s.split(", ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(", ");
}

function decodeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function truncate(str: string, max: number): string {
  const decoded = decodeHtml(str);
  return decoded.length > max ? decoded.slice(0, max) + "…" : decoded;
}

export default function ClusterPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params?.id);

  const [data, setData] = useState<ClusterDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    getCluster(id)
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div style={{ minHeight:"100vh", background:"#09090b", color:"#fafafa", fontFamily:"'JetBrains Mono','Fira Mono',monospace" }}>

      {/* Header */}
      <header style={{ borderBottom:"1px solid #27272a", padding:"0 24px", height:"56px", display:"flex", alignItems:"center", gap:"16px", position:"sticky", top:0, background:"rgba(9,9,11,0.92)", backdropFilter:"blur(8px)", zIndex:10 }}>
        <button onClick={() => router.push("/")}
          style={{ display:"flex", alignItems:"center", gap:"6px", background:"#18181b", border:"1px solid #27272a", borderRadius:"6px", color:"#a1a1aa", fontSize:"12px", fontFamily:"inherit", cursor:"pointer", padding:"6px 12px", transition:"all 0.15s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color="#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor="#52525b"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color="#a1a1aa"; (e.currentTarget as HTMLButtonElement).style.borderColor="#27272a"; }}>
          ← Back
        </button>
        <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
            <polyline points="1,11 5,11 7,4 9,18 11,8 13,14 15,11 21,11" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize:"14px", fontWeight:700, color:"#22d3ee" }}>NEWS</span>
          <span style={{ fontSize:"14px", fontWeight:700, color:"#fafafa" }}>PULSE</span>
        </div>
      </header>

      <main style={{ maxWidth:"800px", margin:"0 auto", padding:"40px 24px" }}>

        {loading && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"300px", gap:"10px", color:"#52525b", fontSize:"13px" }}>
            <span style={{ width:"8px", height:"8px", borderRadius:"50%", background:"#22d3ee", display:"inline-block", animation:"pulse 1s infinite" }} />
            Loading…
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.2}}`}</style>
          </div>
        )}

        {!loading && error && (
          <div style={{ textAlign:"center", color:"#ef4444", fontSize:"13px", paddingTop:"80px" }}>{error}</div>
        )}

        {!loading && !error && data && (
          <>
            <div style={{ marginBottom:"32px" }}>
              <p style={{ fontSize:"10px", color:"#52525b", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:"8px", margin:"0 0 8px" }}>
                Topic cluster #{data.cluster.id}
              </p>
              <h1 style={{ fontSize:"28px", fontWeight:700, color:"#fafafa", margin:"0 0 12px", lineHeight:1.2 }}>
                {capitalize(data.cluster.label)}
              </h1>
              <span style={{ background:"#22d3ee18", border:"1px solid #22d3ee40", color:"#22d3ee", fontSize:"11px", borderRadius:"20px", padding:"3px 10px", fontWeight:600 }}>
                {data.articles.length} article{data.articles.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div style={{ borderTop:"1px solid #18181b", marginBottom:"24px" }} />

            <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>
              {data.articles.map((article, i) => {
                const c = SOURCE_COLORS[article.source] ?? { bg:"#27272a", text:"#a1a1aa", border:"#3f3f46" };
                const summary = truncate(article.summary ?? "", 300);
                const headline = decodeHtml(article.headline);

                return (
                  <div key={article.id}
                    style={{ background:"#0f0f11", border:"1px solid #27272a", borderRadius:"10px", padding:"20px", transition:"border-color 0.15s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor="#3f3f46"}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor="#27272a"}>

                    <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"12px", flexWrap:"wrap" }}>
                      <span style={{ fontSize:"10px", fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", background:c.bg, color:c.text, border:`1px solid ${c.border}40`, borderRadius:"4px", padding:"2px 8px" }}>
                        {article.source}
                      </span>
                      <span style={{ fontSize:"10px", color:"#52525b" }}>
                        {format(new Date(article.published_at), "MMM d, yyyy · HH:mm")}
                      </span>
                      <span style={{ fontSize:"10px", color:"#3f3f46", marginLeft:"auto" }}>#{i + 1}</span>
                    </div>

                    <a href={article.url} target="_blank" rel="noopener noreferrer"
                      style={{ display:"block", fontSize:"15px", fontWeight:600, color:"#f4f4f5", textDecoration:"none", lineHeight:1.4, marginBottom:"10px", transition:"color 0.15s" }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color="#22d3ee"}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color="#f4f4f5"}>
                      {headline}
                    </a>

                    {summary && (
                      <p style={{ fontSize:"12px", color:"#71717a", lineHeight:1.7, margin:"0 0 14px" }}>
                        {summary}
                      </p>
                    )}

                    <a href={article.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize:"10px", color:"#52525b", textDecoration:"none", letterSpacing:"0.05em", transition:"color 0.15s", display:"inline-flex", alignItems:"center", gap:"4px" }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.color="#22d3ee"}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.color="#52525b"}>
                      Read full article ↗
                    </a>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}