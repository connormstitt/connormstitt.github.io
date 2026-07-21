// Minimal force-directed graph, mimicking Obsidian's graph view.
// Placeholder data — will be replaced once the real vault is exported.

window.graphData = {
  nodes: [
    { id: "root", label: "한국어", type: "topic", r: 16 },
    { id: "vocab-topic", label: "어휘", type: "topic", r: 12 },
    { id: "grammar-topic", label: "문법", type: "topic", r: 12 },

    { id: "v1", label: "안녕하세요", gloss: "hello (formal)", type: "vocab", r: 8 },
    { id: "v2", label: "감사합니다", gloss: "thank you", type: "vocab", r: 8 },
    { id: "v3", label: "사랑", gloss: "love (n.)", type: "vocab", r: 8 },
    { id: "v4", label: "가다", gloss: "to go", type: "vocab", r: 8 },
    { id: "v5", label: "먹다", gloss: "to eat", type: "vocab", r: 8 },
    { id: "v6", label: "괜찮아요", gloss: "it's okay", type: "vocab", r: 8 },

    { id: "g1", label: "-는데", gloss: "background / contrast connector", type: "grammar", r: 9 },
    { id: "g2", label: "-아/어서", gloss: "reason / sequence connector", type: "grammar", r: 9 },
    { id: "g3", label: "-(으)ㄹ 것 같다", gloss: "I think / it seems", type: "grammar", r: 9 },
    { id: "g4", label: "-고 있다", gloss: "present progressive", type: "grammar", r: 9 },
  ],
  links: [
    { source: "root", target: "vocab-topic" },
    { source: "root", target: "grammar-topic" },
    { source: "vocab-topic", target: "v1" },
    { source: "vocab-topic", target: "v2" },
    { source: "vocab-topic", target: "v3" },
    { source: "vocab-topic", target: "v4" },
    { source: "vocab-topic", target: "v5" },
    { source: "vocab-topic", target: "v6" },
    { source: "grammar-topic", target: "g1" },
    { source: "grammar-topic", target: "g2" },
    { source: "grammar-topic", target: "g3" },
    { source: "grammar-topic", target: "g4" },
    { source: "v4", target: "g4" },
    { source: "v5", target: "g4" },
    { source: "v4", target: "g2" },
    { source: "v3", target: "g3" },
    { source: "v6", target: "g1" },
  ]
};

(function initGraph() {
  const wrap = document.getElementById("graph-wrap");
  const svg = document.getElementById("graph-svg");
  const tooltip = document.getElementById("graph-tooltip");
  if (!wrap || !svg) return;

  const svgNS = "http://www.w3.org/2000/svg";
  let width = wrap.clientWidth;
  let height = wrap.clientHeight;

  const colorFor = (type) => {
    if (type === "topic") return "var(--node-topic)";
    if (type === "grammar") return "var(--node-grammar)";
    return "var(--node-vocab)";
  };

  // Seed initial positions in a rough circle to help the sim settle fast.
  const nodes = graphData.nodes.map((n, i) => {
    const angle = (i / graphData.nodes.length) * Math.PI * 2;
    const radius = Math.min(width, height) * 0.28;
    return {
      ...n,
      x: width / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 10,
      y: height / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 10,
      vx: 0,
      vy: 0,
    };
  });
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const links = graphData.links.map(l => ({ source: nodeById[l.source], target: nodeById[l.target] }));

  // Build SVG elements
  const linkEls = links.map(() => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("stroke", "rgba(30,64,124,0.28)");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);
    return line;
  });

  const nodeGroups = nodes.map(n => {
    const g = document.createElementNS(svgNS, "g");
    g.style.cursor = "pointer";

    const glow = document.createElementNS(svgNS, "circle");
    glow.setAttribute("r", n.r + 6);
    glow.setAttribute("fill", colorFor(n.type));
    glow.setAttribute("opacity", "0.14");
    g.appendChild(glow);

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("r", n.r);
    circle.setAttribute("fill", colorFor(n.type));
    circle.setAttribute("stroke", "#ffffff");
    circle.setAttribute("stroke-width", "2");
    g.appendChild(circle);

    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("y", n.r + 16);
    text.setAttribute("fill", "#33415c");
    text.setAttribute("font-size", n.type === "topic" ? "13" : "11");
    text.setAttribute("font-family", "Noto Sans KR, sans-serif");
    text.style.pointerEvents = "none";
    text.textContent = n.label;
    g.appendChild(text);

    svg.appendChild(g);
    return g;
  });

  function tick() {
    // Repulsion between all nodes
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let dist2 = dx * dx + dy * dy || 0.01;
        let dist = Math.sqrt(dist2);
        const minDist = 70;
        if (dist < minDist * 3) {
          const force = 900 / dist2;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx; a.vy += fy;
          b.vx -= fx; b.vy -= fy;
        }
      }
    }
    // Spring attraction along links
    links.forEach(l => {
      let dx = l.target.x - l.source.x, dy = l.target.y - l.source.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const targetLen = 90;
      const force = (dist - targetLen) * 0.02;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      l.source.vx += fx; l.source.vy += fy;
      l.target.vx -= fx; l.target.vy -= fy;
    });
    // Centering + integrate + damping
    nodes.forEach(n => {
      if (n.dragging) return;
      n.vx += (width / 2 - n.x) * 0.001;
      n.vy += (height / 2 - n.y) * 0.001;
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;
      n.x = Math.max(n.r + 4, Math.min(width - n.r - 4, n.x));
      n.y = Math.max(n.r + 4, Math.min(height - n.r - 4, n.y));
    });

    linkEls.forEach((line, i) => {
      line.setAttribute("x1", links[i].source.x);
      line.setAttribute("y1", links[i].source.y);
      line.setAttribute("x2", links[i].target.x);
      line.setAttribute("y2", links[i].target.y);
    });
    nodeGroups.forEach((g, i) => {
      g.setAttribute("transform", `translate(${nodes[i].x}, ${nodes[i].y})`);
    });

    requestAnimationFrame(tick);
  }

  // Drag interaction
  let draggingNode = null;
  function svgPoint(evt) {
    const rect = svg.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  nodeGroups.forEach((g, i) => {
    const n = nodes[i];
    const start = (evt) => {
      draggingNode = n;
      n.dragging = true;
      evt.preventDefault();
    };
    g.addEventListener("mousedown", start);
    g.addEventListener("touchstart", start, { passive: false });

    const showTip = (evt) => {
      if (!tooltip) return;
      const p = svgPoint(evt);
      tooltip.style.left = p.x + "px";
      tooltip.style.top = p.y + "px";
      tooltip.innerHTML = `<span class="kr">${n.label}</span>${n.gloss ? n.gloss : n.type}`;
      tooltip.style.opacity = "1";
    };
    g.addEventListener("mouseenter", showTip);
    g.addEventListener("mousemove", showTip);
    g.addEventListener("mouseleave", () => { if (tooltip) tooltip.style.opacity = "0"; });
  });

  const move = (evt) => {
    if (!draggingNode) return;
    const p = svgPoint(evt);
    draggingNode.x = p.x;
    draggingNode.y = p.y;
    draggingNode.vx = 0;
    draggingNode.vy = 0;
  };
  const end = () => {
    if (draggingNode) draggingNode.dragging = false;
    draggingNode = null;
  };
  svg.addEventListener("mousemove", move);
  svg.addEventListener("touchmove", move, { passive: false });
  window.addEventListener("mouseup", end);
  window.addEventListener("touchend", end);

  window.addEventListener("resize", () => {
    width = wrap.clientWidth;
    height = wrap.clientHeight;
  });

  requestAnimationFrame(tick);
})();
