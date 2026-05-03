(function (global) {
  "use strict";

  const STORAGE_KEY = "aevra_memory_graph";

  function load() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{"nodes":[],"edges":[]}'); }
    catch (error) { return { nodes: [], edges: [] }; }
  }

  function save(graph) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
  }

  function addNode(type, data) {
    const graph = load();
    const node = { id: crypto.randomUUID(), type, data: data || {}, createdAt: new Date().toISOString() };
    graph.nodes.push(node);
    save(graph);
    return node.id;
  }

  function addRelationship(fromId, toId, type) {
    const graph = load();
    const edge = { id: crypto.randomUUID(), fromId, toId, type, createdAt: new Date().toISOString() };
    graph.edges.push(edge);
    save(graph);
    return edge.id;
  }

  function queryRelated(conceptName) {
    const graph = load();
    const needle = String(conceptName || "").toLowerCase();
    const concepts = graph.nodes.filter((n) => n.type === "concept" && String(n.data && n.data.name || "").toLowerCase().includes(needle));
    const ids = new Set(concepts.map((n) => n.id));
    graph.edges.forEach((e) => { if (ids.has(e.fromId)) ids.add(e.toId); if (ids.has(e.toId)) ids.add(e.fromId); });
    return graph.nodes.filter((n) => ids.has(n.id));
  }

  async function getStudyGraph(userId) {
    try {
      const res = await fetch(`/memory/graph?user_id=${encodeURIComponent(userId || "")}`);
      if (res.ok) return res.json();
    } catch (error) {}
    return load();
  }

  async function getWeakAreas(userId) {
    const graph = await getStudyGraph(userId);
    const counts = {};
    (graph.edges || []).filter((e) => e.type === "struggled_with").forEach((e) => { counts[e.toId] = (counts[e.toId] || 0) + 1; });
    return (graph.nodes || [])
      .filter((n) => counts[n.id])
      .sort((a, b) => counts[b.id] - counts[a.id])
      .map((n) => n.data && n.data.name || n.id);
  }

  async function summarizeForPrompt(userId) {
    const weak = await getWeakAreas(userId);
    return weak.length ? `The student may need more support with: ${weak.slice(0, 5).join(", ")}.` : "No weak areas are known yet.";
  }

  global.AevraMemoryGraph = { addNode, addRelationship, queryRelated, getWeakAreas, getStudyGraph, summarizeForPrompt };
})(window);
