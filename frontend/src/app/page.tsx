"use client";
import { useState, useEffect, useCallback } from "react";
import { getTimeline } from "./lib/api";
import type { TimelineItem } from "./lib/types";
import Timeline from "./components/Timeline";
import RefreshButton from "./components/RefreshButton";
import { format } from "date-fns";

const ALL_SOURCES = ["BBC News", "NPR", "Al Jazeera"];

const SOURCE_COLORS: Record<string, { dot: string; active: string; inactive: string }> = {
  "BBC News": { dot: "#ef4444", active: "#ef4444", inactive: "#3f3f46" },
  "NPR":      { dot: "#3b82f6", active: "#3b82f6", inactive: "#3f3f46" },
  "Al Jazeera": { dot: "#f97316", active: "#f97316", inactive: "#3f3f46" },
};

export default function Home() {
  const [allItems, setAllItems] = useState<TimelineItem[]>([]);
  const [activeSources, setActiveSources] = useState<Set<string>>(new Set(ALL_SOURCES));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

const load = useCallback(async (sources: Set<string>) => {
    setLoading(true);
    setError("");
    try {
      // Omit the filter entirely when every source is active — keeps the
      // request/URL clean for the common "show everything" case and avoids
      // relying on the backend to special-case "all sources selected".
      const sourceParam =
        sources.size === ALL_SOURCES.length ? undefined : Array.from(sources).join(",");
      const data = await getTimeline(sourceParam);
      setAllItems(data.timeline);
      setLastFetched(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(activeSources); }, [activeSources, load]);

  const toggle = (src: string) => {
    setActiveSources(prev => {
      const next = new Set(prev);
      if (next.has(src)) { if (next.size === 1) return prev; next.delete(src); }
      else next.add(src);
      return next;
    });
  };

  return (
    <div style={{ minHeight:"100vh", background:"#09090b", color:"#fafafa", fontFamily:"'JetBrains Mono', 'Fira Mono', monospace" }}>

      {/* ── Top nav ── */}
      <header style={{ borderBottom:"1px solid #27272a", padding:"0 24px", height:"56px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, background:"rgba(9,9,11,0.92)", backdropFilter:"blur(8px)", zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          {/* Pulse icon */}
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <polyline points="1,11 5,11 7,4 9,18 11,8 13,14 15,11 21,11" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
          <span style={{ fontSize:"15px", fontWeight:700, letterSpacing:"0.08em", color:"#22d3ee" }}>NEWS</span>
          <span style={{ fontSize:"15px", fontWeight:700, letterSpacing:"0.08em", color:"#fafafa" }}>PULSE</span>
          <span style={{ marginLeft:"4px", fontSize:"11px", color:"#52525b", letterSpacing:"0.04em" }}>/ topic-clustered news</span>
        </div>
        <RefreshButton onDone={() => load(activeSources)} />
      </header>

      {/* ── Sub bar ── */}
      <div style={{ borderBottom:"1px solid #18181b", padding:"10px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"10px", background:"#0c0c0e" }}>
        {/* Source toggles */}
        <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
          <span style={{ fontSize:"10px", color:"#52525b", letterSpacing:"0.12em", textTransform:"uppercase", marginRight:"4px" }}>Sources</span>
          {ALL_SOURCES.map(src => {
            const active = activeSources.has(src);
            const c = SOURCE_COLORS[src];
            return (
              <button key={src} onClick={() => toggle(src)} style={{
                display:"flex", alignItems:"center", gap:"6px",
                padding:"4px 12px", borderRadius:"20px", border:`1px solid ${active ? c.active : "#27272a"}`,
                background: active ? `${c.active}18` : "transparent",
                color: active ? c.active : "#71717a",
                fontSize:"11px", fontFamily:"inherit", cursor:"pointer",
                transition:"all 0.15s", fontWeight: active ? 600 : 400,
              }}>
                <span style={{ width:"6px", height:"6px", borderRadius:"50%", background: active ? c.dot : "#3f3f46", display:"inline-block", flexShrink:0 }} />
                {src}
              </button>
            );
          })}
        </div>

        {/* Stats */}
        <div style={{ display:"flex", alignItems:"center", gap:"16px" }}>
          {!loading && !error && allItems.length > 0 && (
            <span style={{ fontSize:"11px", color:"#52525b" }}>
              <span style={{ color:"#22d3ee", fontWeight:700 }}>{allItems.length}</span> clusters
            </span>
          )}
          {lastFetched && (
            <span style={{ fontSize:"11px", color:"#3f3f46" }}>
              Updated {format(lastFetched, "HH:mm:ss")}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <main style={{ padding:"32px 24px", maxWidth:"1400px", margin:"0 auto" }}>
        {loading && (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"300px", gap:"12px", color:"#52525b", fontSize:"13px" }}>
            <span style={{ display:"inline-block", width:"8px", height:"8px", borderRadius:"50%", background:"#22d3ee", animation:"pulse 1s infinite" }} />
            Loading clusters…
            <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
          </div>
        )}
        {!loading && error && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"300px", gap:"12px" }}>
            <span style={{ color:"#ef4444", fontSize:"13px" }}>{error}</span>
<button onClick={() => load(activeSources)} style={{ fontSize:"11px", color:"#71717a", background:"none", border:"none", cursor:"pointer", textDecoration:"underline", fontFamily:"inherit" }}>Try again</button>          </div>
        )}
        {!loading && !error && <Timeline items={allItems} />}
      </main>

      {/* ── Footer ── */}
      <footer style={{ borderTop:"1px solid #18181b", padding:"16px 24px", marginTop:"40px", display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:"8px" }}>
        <span style={{ fontSize:"10px", color:"#3f3f46" }}>BBC News · NPR · Al Jazeera</span>
        <span style={{ fontSize:"10px", color:"#3f3f46" }}>Keyword-overlap clustering · union-find · threshold=6 · Built for Xponentium</span>
      </footer>
    </div>
  );
}