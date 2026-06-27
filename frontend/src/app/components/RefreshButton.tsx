"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { triggerIngest, getIngestStatus } from "../lib/api";

interface Props {
  onDone: () => void;
}

type Phase = "idle" | "running" | "done" | "failed";

const PHASE_STYLE: Record<Phase, { border: string; bg: string; color: string }> = {
  idle:    { border: "#27272a", bg: "transparent", color: "#e4e4e7" },
  running: { border: "#a16207", bg: "#a1620718",  color: "#facc15" },
  done:    { border: "#15803d", bg: "#15803d18",  color: "#4ade80" },
  failed:  { border: "#991b1b", bg: "#991b1b18",  color: "#f87171" },
};

export default function RefreshButton({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  // Tracks the active poll chain so a stale poll from a previous click
  // (or one left running after unmount) can't overwrite newer state.
  const pollToken = useRef(0);

  useEffect(() => {
    return () => { pollToken.current += 1; };
  }, []);

  const handleClick = useCallback(async () => {
    if (phase === "running") return;
    const myToken = ++pollToken.current;

    setPhase("running");
    setMessage("Starting ingestion…");

    const finish = (nextPhase: Phase, nextMessage: string, hideAfterMs: number) => {
      if (pollToken.current !== myToken) return;
      setPhase(nextPhase);
      setMessage(nextMessage);
      setTimeout(() => {
        if (pollToken.current !== myToken) return;
        setPhase("idle");
        setMessage("");
      }, hideAfterMs);
    };

    try {
      const { jobId } = await triggerIngest();
      if (pollToken.current !== myToken) return;
      setMessage("Pipeline running…");

      const poll = async () => {
        if (pollToken.current !== myToken) return;
        try {
          const { job } = await getIngestStatus(jobId);
          if (pollToken.current !== myToken) return;

          if (job.status === "done") {
            finish("done", "Done — timeline refreshed", 3000);
            onDone();
          } else if (job.status === "failed") {
            finish("failed", job.error ?? "Pipeline failed", 4000);
          } else {
            setTimeout(poll, 2000);
          }
        } catch {
          finish("failed", "Could not reach server", 4000);
        }
      };

      setTimeout(poll, 2000);
    } catch {
      finish("failed", "Failed to start pipeline", 4000);
    }
  }, [phase, onDone]);

  const isRunning = phase === "running";
  const style = PHASE_STYLE[phase];

  const icon = {
    idle: "↻",
    running: "◐",
    done: "✓",
    failed: "✗",
  }[phase];

  const label = {
    idle: "Refresh Data",
    running: "Running",
    done: "Done",
    failed: "Failed",
  }[phase];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <button
        onClick={handleClick}
        disabled={isRunning}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          padding: "6px 14px",
          borderRadius: "6px",
          border: `1px solid ${style.border}`,
          background: style.bg,
          color: style.color,
          fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.02em",
          cursor: isRunning ? "wait" : "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!isRunning) e.currentTarget.style.borderColor = "#22d3ee";
        }}
        onMouseLeave={(e) => {
          if (!isRunning) e.currentTarget.style.borderColor = style.border;
        }}
      >
        <span
          style={{
            display: "inline-block",
            animation: isRunning ? "spin 0.9s linear infinite" : "none",
          }}
        >
          {icon}
        </span>
        {label}
      </button>

      {message && (
        <span style={{ fontFamily: "'JetBrains Mono', 'Fira Mono', monospace", fontSize: "11px", color: "#52525b" }}>
          {message}
        </span>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}