"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { TimelineItem } from "../lib/types";

interface Props {
  items: TimelineItem[];
}

function capitalize(s: string) {
  return s
    .split(", ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(", ");
}

export default function Timeline({ items }: Props) {
  const router = useRouter();
  const [showSingletons, setShowSingletons] = useState(false);

  if (!items.length) {
    return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"16rem", color:"#71717a", fontFamily:"monospace", fontSize:"0.875rem" }}>
        <span style={{ fontSize:"2rem", marginBottom:"0.75rem" }}>◌</span>
        No clusters yet. Hit Refresh Data to pull today&apos;s news.
      </div>
    );
  }

  const sorted = [...items].sort(
    (a, b) =>
      b.article_count - a.article_count ||
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Multi-article clusters are real, confirmed stories with overlap
  // across multiple articles — these are the interesting signal and
  // always shown. Singletons (article_count === 1) are one-off stories
  // with nothing to cluster against; at scale there can be 100+ of
  // these, which buries the real stories in noise, so they're
  // collapsed behind a toggle instead of always rendered.
  const multiArticle = sorted.filter(i => i.article_count > 1);
  const singletons = sorted.filter(i => i.article_count === 1);

  // Use max of multi-article clusters for scaling; fall back to overall max
  const multiMax = sorted.find(i => i.article_count > 1)?.article_count ?? sorted[0]?.article_count ?? 1;

  const renderRow = (item: TimelineItem) => {
    const isSingleton = item.article_count === 1;
    // Singletons get a fixed small bar; multi-article clusters scale relative to each other
    const barPct = isSingleton ? 4 : Math.max((item.article_count / multiMax) * 100, 8);
    const startFmt = format(new Date(item.start_time), "HH:mm");
    const endFmt = format(new Date(item.end_time), "HH:mm");
    const barColor = isSingleton
      ? "#155e75"
      : `rgba(34,211,238,${0.5 + item.intensity * 0.5})`;

    return (
      <div
        key={item.cluster_id}
        onClick={() => router.push(`/clusters/${item.cluster_id}`)}
        style={{ display:"flex", alignItems:"center", gap:"1rem", padding:"5px 8px", borderRadius:"4px", cursor:"pointer" }}
        onMouseEnter={e => (e.currentTarget.style.background = "#18181b")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        <span
          style={{ width:"220px", flexShrink:0, fontFamily:"monospace", fontSize:"12px", color: isSingleton ? "#71717a" : "#e4e4e7", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}
          title={capitalize(item.label)}
        >
          {capitalize(item.label)}
        </span>

        <div style={{ flex:1, height:"10px", background:"#27272a", borderRadius:"3px", overflow:"hidden" }}>
          <div style={{ width:`${barPct}%`, height:"100%", background:barColor, borderRadius:"3px" }} />
        </div>

        <span style={{ width:"120px", flexShrink:0, fontFamily:"monospace", fontSize:"10px", color:"#71717a" }}>
          {startFmt === endFmt ? startFmt : `${startFmt} – ${endFmt}`}
        </span>

        <span style={{ width:"60px", flexShrink:0, fontFamily:"monospace", fontSize:"12px", fontWeight:"bold", textAlign:"right", color: isSingleton ? "#3f3f46" : "#22d3ee" }}>
          {item.article_count}
        </span>
      </div>
    );
  };

  return (
    <div style={{ width:"100%" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:"1rem", marginBottom:"0.5rem", padding:"0 0.5rem", fontFamily:"monospace", fontSize:"10px", color:"#52525b", textTransform:"uppercase", letterSpacing:"0.1em" }}>
        <span style={{ width:"220px", flexShrink:0 }}>Topic</span>
        <span style={{ flex:1 }}>Coverage</span>
        <span style={{ width:"120px", flexShrink:0 }}>Time range</span>
        <span style={{ width:"60px", flexShrink:0, textAlign:"right" }}>Articles</span>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:"2px" }}>
        {multiArticle.map(renderRow)}
      </div>

      {singletons.length > 0 && (
        <>
          <button
            onClick={() => setShowSingletons(s => !s)}
            style={{
              display:"flex", alignItems:"center", gap:"8px", width:"100%",
              marginTop:"12px", padding:"8px", background:"transparent",
              border:"1px solid #27272a", borderRadius:"4px", cursor:"pointer",
              fontFamily:"monospace", fontSize:"11px", color:"#71717a",
            }}
          >
            <span style={{ display:"inline-block", transition:"transform 0.15s", transform: showSingletons ? "rotate(90deg)" : "rotate(0deg)" }}>›</span>
            {showSingletons ? "Hide" : "Show"} {singletons.length} single-article stories
          </button>

          {showSingletons && (
            <div style={{ display:"flex", flexDirection:"column", gap:"2px", marginTop:"4px" }}>
              {singletons.map(renderRow)}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop:"1.5rem", fontFamily:"monospace", fontSize:"10px", color:"#52525b" }}>
        Bar width = relative article count &nbsp;·&nbsp; Dimmed rows = single-source articles &nbsp;·&nbsp; Click any row to read
      </div>
    </div>
  );
}