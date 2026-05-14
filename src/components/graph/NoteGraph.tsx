"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { GraphNode, GraphEdge } from "@/hooks/useGraph";

interface NoteGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectNote: (id: string) => void;
}

type SimNode = GraphNode & { x: number; y: number; vx: number; vy: number };

export function NoteGraph({ nodes, edges, onSelectNote }: NoteGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const dragStart = useRef({ x: 0, y: 0 });
  const simNodesRef = useRef<SimNode[]>([]);
  const animFrameRef = useRef<number>(0);
  const stoppedRef = useRef(false);
  const clickCandidateRef = useRef<string | null>(null);
  // Mirrors draggingId state so the tick loop (inside useEffect) can read it
  const draggingIdRef = useRef<string | null>(null);
  // Lets handlers outside the useEffect restart the simulation
  const restartSimRef = useRef<(() => void) | null>(null);

  // Initialize simulation nodes
  useEffect(() => {
    const initial: SimNode[] = nodes.map((n) => ({
      ...n,
      x:  (Math.random() - 0.5) * 400,
      y:  (Math.random() - 0.5) * 400,
      vx: 0,
      vy: 0,
    }));
    simNodesRef.current = initial;
    setSimNodes([...initial]);
    stoppedRef.current = false;

    // Center the graph in the SVG on mount
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      setPan({ x: rect.width / 2, y: rect.height / 2 });
    }

    // Run force simulation
    function tick() {
      const ns = simNodesRef.current;
      if (ns.length === 0) return;

      const pinnedId = draggingIdRef.current;

      // Build index map for quick lookup
      const idxMap = new Map<string, number>();
      ns.forEach((n, i) => idxMap.set(n.id, i));

      // Repulsion between all pairs
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x;
          const dy = ns[j].y - ns[i].y;
          const dist2 = dx * dx + dy * dy + 1;
          const force = 3000 / dist2;
          const dist = Math.sqrt(dist2);
          const fx = (force * dx) / dist;
          const fy = (force * dy) / dist;
          ns[i].vx -= fx;
          ns[i].vy -= fy;
          ns[j].vx += fx;
          ns[j].vy += fy;
        }
      }

      // Edge attraction (spring)
      for (const edge of edges) {
        const si = idxMap.get(edge.source);
        const ti = idxMap.get(edge.target);
        if (si === undefined || ti === undefined) continue;
        const dx = ns[ti].x - ns[si].x;
        const dy = ns[ti].y - ns[si].y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const force = (dist - 120) * 0.03;
        const fx = (force * dx) / dist;
        const fy = (force * dy) / dist;
        ns[si].vx += fx;
        ns[si].vy += fy;
        ns[ti].vx -= fx;
        ns[ti].vy -= fy;
      }

      // Center gravity + damping + position update
      // Skip velocity/position for the pinned (dragged) node so the sim
      // doesn't fight the cursor position set by handleMouseMove.
      let maxV = 0;
      for (const n of ns) {
        if (n.id === pinnedId) {
          // Keep the dragged node exactly where the mouse put it
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx += -n.x * 0.008;
        n.vy += -n.y * 0.008;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x = Math.max(-500, Math.min(500, n.x + n.vx));
        n.y = Math.max(-500, Math.min(500, n.y + n.vy));
        const v = Math.abs(n.vx) + Math.abs(n.vy);
        if (v > maxV) maxV = v;
      }

      setSimNodes([...ns]);

      // Keep running while dragging (so neighbours react) or while nodes move
      const keepGoing = pinnedId !== null || maxV > 0.001;
      if (keepGoing && !stoppedRef.current) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else if (!keepGoing) {
        stoppedRef.current = true;
      }
    }

    // Expose restart so handlers can kick the loop back alive
    restartSimRef.current = () => {
      if (stoppedRef.current) {
        stoppedRef.current = false;
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      stoppedRef.current = true;
      restartSimRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  // Zoom via wheel
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.2, Math.min(4, z * (1 - e.deltaY * 0.001))));
  }, []);

  // Background drag (pan)
  const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as SVGElement).closest("circle, text")) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
      return;
    }

    if (draggingId) {
      const dx = (e.clientX - dragStart.current.x) / zoom;
      const dy = (e.clientY - dragStart.current.y) / zoom;
      // Mouse actually moved → this is a drag, cancel the pending click
      if (dx !== 0 || dy !== 0) clickCandidateRef.current = null;
      dragStart.current = { x: e.clientX, y: e.clientY };
      const ns = simNodesRef.current;
      const node = ns.find((n) => n.id === draggingId);
      if (node) {
        node.x += dx;
        node.y += dy;
        node.vx = 0;
        node.vy = 0;
        // Kick the simulation so neighbours react to the new position
        restartSimRef.current?.();
      }
    }
  }, [isPanning, draggingId, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggingId(null);
    draggingIdRef.current = null;
    // Let nodes settle now that the dragged node is released
    restartSimRef.current?.();
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDraggingId(id);
    draggingIdRef.current = id;
    dragStart.current = { x: e.clientX, y: e.clientY };
    clickCandidateRef.current = id;
    // Do NOT stop the simulation — neighbours should react while dragging
  }, []);

  const handleNodeClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Only fire click if we didn't drag
    if (clickCandidateRef.current === id) {
      onSelectNote(id);
    }
    clickCandidateRef.current = null;
  }, [onSelectNote]);

  // Build id → position map for edges
  const posMap = new Map<string, { x: number; y: number }>();
  for (const n of simNodes) posMap.set(n.id, { x: n.x, y: n.y });

  return (
    <svg
      ref={svgRef}
      style={{ width: "100%", height: "100%", cursor: isPanning ? "grabbing" : "default" }}
      overflow="visible"
      onWheel={handleWheel}
      onMouseDown={handleSvgMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
        {/* Edges */}
        {edges.map((edge, i) => {
          const s = posMap.get(edge.source);
          const t = posMap.get(edge.target);
          if (!s || !t) return null;
          return (
            <line
              key={i}
              x1={s.x} y1={s.y}
              x2={t.x} y2={t.y}
              stroke="var(--app-border-strong)"
              strokeWidth={1 / zoom}
              opacity={0.6}
            />
          );
        })}

        {/* Nodes */}
        {simNodes.map((node) => {
          const r = Math.max(6, 6 + node.linkCount * 1.5);
          const isHovered = hoveredId === node.id;
          const fill = node.linkCount > 0
            ? (isHovered ? "#818cf8" : "#6366f1")
            : (isHovered ? "#9ca3af" : "#6b7280");
          const label = node.title.length > 20
            ? node.title.slice(0, 20) + "…"
            : node.title;

          return (
            <g
              key={node.id}
              style={{ cursor: draggingId === node.id ? "grabbing" : "pointer" }}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              onClick={(e) => handleNodeClick(e, node.id)}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill={fill}
                stroke={isHovered ? "white" : "none"}
                strokeWidth={isHovered ? 1.5 / zoom : 0}
              >
                <title>{node.title}</title>
              </circle>
              <text
                x={node.x}
                y={node.y + r + 12 / zoom}
                textAnchor="middle"
                fontSize={10 / zoom}
                fill="var(--app-text-muted)"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {label}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
