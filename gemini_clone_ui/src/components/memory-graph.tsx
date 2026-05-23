import React, { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { Sparkles, Brain, RefreshCw, AlertCircle } from "lucide-react";

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  val: number; // percentage mastery (0-100)
  color: string;
  vx?: number;
  vy?: number;
}

interface Link {
  source: string;
  target: string;
}

export const MemoryGraph: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { subjectMastery, readinessScore } = useAppStore();
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [loading, setLoading] = useState(false);

  // Generate nodes: Center node + Subject nodes
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);

  useEffect(() => {
    // Width and height of canvas coordinate space
    const width = 600;
    const height = 400;

    // Create center node
    const newNodes: Node[] = [
      {
        id: "center",
        label: "Aura Core",
        x: width / 2,
        y: height / 2,
        val: readinessScore,
        color: "#6d5dfc",
        vx: 0,
        vy: 0,
      },
    ];

    const colors = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899"];

    // Create subject nodes surrounding the center
    subjectMastery.forEach((sm, index) => {
      const angle = (index / subjectMastery.length) * 2 * Math.PI;
      const radius = 130 + Math.random() * 20; // Radius distance
      newNodes.push({
        id: sm.subject.toLowerCase(),
        label: sm.subject,
        x: width / 2 + Math.cos(angle) * radius,
        y: height / 2 + Math.sin(angle) * radius,
        val: sm.readiness,
        color: colors[index % colors.length]!,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
      });
    });

    const newLinks = subjectMastery.map((sm) => ({
      source: "center",
      target: sm.subject.toLowerCase(),
    }));

    setNodes(newNodes);
    setLinks(newLinks);
    setSelectedNode(newNodes[0] || null);
  }, [subjectMastery, readinessScore]);

  // Canvas rendering & physics loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const width = canvas.width;
    const height = canvas.height;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Physics/Force-directed simulation step
      // Nodes attract center, repel each other slightly
      for (let i = 0; i < nodes.length; i++) {
        const nodeA = nodes[i]!;

        // Keep center stable
        if (nodeA.id === "center") {
          nodeA.x = width / 2;
          nodeA.y = height / 2;
          continue;
        }

        // Repel other nodes
        for (let j = i + 1; j < nodes.length; j++) {
          const nodeB = nodes[j]!;
          const dx = nodeB.x - nodeA.x;
          const dy = nodeB.y - nodeA.y;
          const dist = Math.hypot(dx, dy) || 1;
          const minDist = 80;

          if (dist < minDist) {
            const force = (minDist - dist) * 0.05;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            if (nodeA.id !== "center") {
              nodeA.vx = (nodeA.vx || 0) - fx;
              nodeA.vy = (nodeA.vy || 0) - fy;
            }
            if (nodeB.id !== "center") {
              nodeB.vx = (nodeB.vx || 0) + fx;
              nodeB.vy = (nodeB.vy || 0) + fy;
            }
          }
        }

        // Pull to center
        const dx = width / 2 - nodeA.x;
        const dy = height / 2 - nodeA.y;
        const dist = Math.hypot(dx, dy) || 1;
        const targetRadius = 140;
        const force = (dist - targetRadius) * 0.01;

        nodeA.vx = (nodeA.vx || 0) + (dx / dist) * force;
        nodeA.vy = (nodeA.vy || 0) + (dy / dist) * force;

        // Apply friction and update position
        nodeA.vx *= 0.92;
        nodeA.vy *= 0.92;
        nodeA.x += nodeA.vx;
        nodeA.y += nodeA.vy;

        // Clamp inside bounds
        nodeA.x = Math.max(30, Math.min(width - 30, nodeA.x));
        nodeA.y = Math.max(30, Math.min(height - 30, nodeA.y));
      }

      // Draw links with glowing visual connections
      ctx.lineWidth = 1.5;
      links.forEach((link) => {
        const sourceNode = nodes.find((n) => n.id === link.source);
        const targetNode = nodes.find((n) => n.id === link.target);

        if (sourceNode && targetNode) {
          ctx.beginPath();
          ctx.moveTo(sourceNode.x, sourceNode.y);
          ctx.lineTo(targetNode.x, targetNode.y);

          // Glowing gradient stroke
          const grad = ctx.createLinearGradient(sourceNode.x, sourceNode.y, targetNode.x, targetNode.y);
          grad.addColorStop(0, "rgba(99, 102, 241, 0.45)");
          grad.addColorStop(1, "rgba(59, 130, 246, 0.15)");
          
          ctx.strokeStyle = grad;
          ctx.shadowBlur = 4;
          ctx.shadowColor = "rgba(99, 102, 241, 0.3)";
          ctx.stroke();
          ctx.shadowBlur = 0; // reset
        }
      });

      // Draw nodes
      nodes.forEach((node) => {
        ctx.beginPath();
        const size = node.id === "center" ? 22 : 15;
        ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);

        // Fill style with gradients
        if (node.id === "center") {
          const grad = ctx.createRadialGradient(node.x, node.y, 2, node.x, node.y, size);
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.3, "#a78bfa");
          grad.addColorStop(0.7, "#6366f1");
          grad.addColorStop(1, "#3b82f6");
          ctx.fillStyle = grad;
          ctx.shadowBlur = 12;
          ctx.shadowColor = "rgba(99, 102, 241, 0.8)";
        } else {
          const grad = ctx.createRadialGradient(node.x, node.y, 1, node.x, node.y, size);
          grad.addColorStop(0, "#ffffff");
          grad.addColorStop(0.7, node.color);
          grad.addColorStop(1, node.color);
          ctx.fillStyle = grad;
          ctx.shadowBlur = 8;
          ctx.shadowColor = `${node.color}cc`;
        }

        ctx.fill();
        ctx.shadowBlur = 0; // reset shadow

        // Outline node for selected state
        if (selectedNode && selectedNode.id === node.id) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, size + 5, 0, 2 * Math.PI);
          ctx.strokeStyle = "rgba(99, 102, 241, 0.75)";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }

        // Add small text label under the node
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${node.val}%`, node.x, node.y + 3);

        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.font = "500 10.5px Inter, sans-serif";
        ctx.fillText(node.label, node.x, node.y + size + 16);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [nodes, links, selectedNode]);

  // Click interaction on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Search clicked node
    const clicked = nodes.find((node) => {
      const size = node.id === "center" ? 22 : 15;
      return Math.hypot(node.x - x, node.y - y) <= size + 10;
    });

    if (clicked) {
      setSelectedNode(clicked);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 800);
  };

  // Find info about the currently selected node
  const activeSM = subjectMastery.find((sm) => sm.subject.toLowerCase() === selectedNode?.id);

  return (
    <div className="flex flex-col md:flex-row gap-5 h-full w-full min-h-[400px]">
      
      {/* Dynamic Graph Canvas */}
      <div className="flex-1 bg-gradient-to-br from-[#121316] to-[#0a0a0c] border border-white/5 rounded-3xl relative overflow-hidden flex flex-col justify-between shadow-2xl p-4 min-h-[350px]">
        {/* Graph Header */}
        <div className="flex items-center justify-between z-10 w-full">
          <div className="flex items-center gap-2">
            <Brain className="size-4.5 text-blue-400 animate-pulse" />
            <span className="text-[13px] font-bold text-white/95 uppercase tracking-wider">Aura Memory Graph</span>
          </div>
          <button
            onClick={handleRefresh}
            className="size-8 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
            title="Recalculate cognitive links"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Visual Canvas Element */}
        <div className="flex-1 flex items-center justify-center w-full z-0 cursor-pointer">
          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            onClick={handleCanvasClick}
            className="w-full max-w-[600px] h-auto object-contain transition-all"
          />
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-white/30 z-10 select-none pb-1 pl-1">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-indigo-500" /> Mastery Center</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" /> Syllabus Link</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-500" /> Weakness Node</span>
        </div>
      </div>

      {/* Selected Node Analytics Card */}
      <div className="w-full md:w-[250px] shrink-0 bg-white/5 dark:bg-white/5 backdrop-blur-md border border-black/5 dark:border-white/5 rounded-3xl p-5 flex flex-col justify-between shadow-lg select-none text-foreground dark:text-white">
        {selectedNode ? (
          <div className="space-y-4 h-full flex flex-col justify-between">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h3 className="font-bold text-[15px]">{selectedNode.label}</h3>
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: selectedNode.id === "center" ? "rgba(99, 102, 241, 0.15)" : "rgba(59, 130, 246, 0.15)",
                    color: selectedNode.id === "center" ? "#a78bfa" : "#60a5fa",
                  }}
                >
                  {selectedNode.id === "center" ? "Core Node" : "Topic Node"}
                </span>
              </div>

              {/* Node Readiness Progress Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold text-muted-foreground">
                  <span>Syllabus Readiness</span>
                  <span>{selectedNode.val}%</span>
                </div>
                <div className="w-full h-1.5 bg-black/10 dark:bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${selectedNode.val}%` }}
                  />
                </div>
              </div>

              {/* Cognitive Weaknesses */}
              {activeSM ? (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Weakness Nodes</span>
                  {activeSM.weakAreas && activeSM.weakAreas.length > 0 ? (
                    <div className="space-y-1.5">
                      {activeSM.weakAreas.map((wa, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-foreground/80 dark:text-white/80 font-medium">
                          <AlertCircle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span>{wa}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11.5px] font-medium text-emerald-500">Perfect syllabus coverage!</span>
                  )}
                </div>
              ) : (
                /* Center Node details */
                <div className="space-y-2.5">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Cognitive Score</span>
                  <p className="text-[11.5px] leading-relaxed text-foreground/75 dark:text-white/75 font-medium">
                    Overall academic preparedness based on {subjectMastery.length} key curriculum domains.
                  </p>
                </div>
              )}
            </div>

            {/* AI Action Command */}
            <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Aura Recommendation</span>
              <button
                className="w-full py-2 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white text-xs font-bold rounded-xl border border-blue-500/20 transition-all flex items-center justify-center gap-1 active:scale-95"
                onClick={() => alert(`Aura neural agent is initiating study workspace for ${selectedNode.label} Weak areas...`)}
              >
                <Sparkles className="size-3.5" />
                <span>Optimize Domain</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-center text-xs text-muted-foreground">
            Select a neural connection node to inspect syllabus analytics.
          </div>
        )}
      </div>

    </div>
  );
};
