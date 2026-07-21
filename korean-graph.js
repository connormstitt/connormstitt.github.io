// Obsidian-style graph view — optimised for large vaults (300-1000+ nodes).
// Uses spatial-grid repulsion (O(n) per cell) instead of O(n²) brute force.
//
// Data: window.VAULT_GRAPH  (from the Obsidian dev-console snippet)
// Falls back to window.PLACEHOLDER_GRAPH if vault data is absent.

window.PLACEHOLDER_GRAPH = {
  nodes: [
    { id: "root",          label: "한국어",           group: "topic",   deg: 4 },
    { id: "vocab-topic",   label: "어휘",             group: "topic",   deg: 3 },
    { id: "grammar-topic", label: "문법",             group: "topic",   deg: 3 },
    { id: "v1", label: "안녕하세요", gloss: "hello (formal)",       group: "vocab",   deg: 1 },
    { id: "v2", label: "감사합니다", gloss: "thank you",            group: "vocab",   deg: 1 },
    { id: "v3", label: "사랑",       gloss: "love (n.)",            group: "vocab",   deg: 2 },
    { id: "v4", label: "가다",       gloss: "to go",                group: "vocab",   deg: 3 },
    { id: "v5", label: "먹다",       gloss: "to eat",               group: "vocab",   deg: 2 },
    { id: "v6", label: "괜찮아요",   gloss: "it's okay",            group: "vocab",   deg: 2 },
    { id: "g1", label: "-는데",      gloss: "background / contrast",group: "grammar", deg: 2 },
    { id: "g2", label: "-아/어서",   gloss: "reason / sequence",    group: "grammar", deg: 2 },
    { id: "g3", label: "-(으)ㄹ 것 같다", gloss: "I think / seems", group: "grammar", deg: 3 },
    { id: "g4", label: "-고 있다",   gloss: "progressive",          group: "grammar", deg: 3 },
  ],
  links: [
    { source:"root", target:"vocab-topic"   }, { source:"root", target:"grammar-topic" },
    { source:"vocab-topic",   target:"v1"   }, { source:"vocab-topic",   target:"v2"   },
    { source:"vocab-topic",   target:"v3"   }, { source:"vocab-topic",   target:"v4"   },
    { source:"vocab-topic",   target:"v5"   }, { source:"vocab-topic",   target:"v6"   },
    { source:"grammar-topic", target:"g1"   }, { source:"grammar-topic", target:"g2"   },
    { source:"grammar-topic", target:"g3"   }, { source:"grammar-topic", target:"g4"   },
    { source:"v4", target:"g4" }, { source:"v5", target:"g4" },
    { source:"v4", target:"g2" }, { source:"v3", target:"g3" }, { source:"v6", target:"g1" },
  ],
};

(function initGraph() {
  const wrap    = document.getElementById("graph-wrap");
  const svg     = document.getElementById("graph-svg");
  const tooltip = document.getElementById("graph-tooltip");
  const legendEl= document.getElementById("graph-legend");
  const countEl = document.getElementById("node-count");
  if (!wrap || !svg) return;

  const usingVault = !!(window.VAULT_GRAPH &&
                        window.VAULT_GRAPH.nodes &&
                        window.VAULT_GRAPH.nodes.length);
  const raw = usingVault ? window.VAULT_GRAPH : window.PLACEHOLDER_GRAPH;

  const svgNS = "http://www.w3.org/2000/svg";
  let clientW = wrap.clientWidth;
  let clientH = wrap.clientHeight;

  // ── colours ──────────────────────────────────────────────────────────────
  const PALETTE = [
    "#1e407c","#6b93d6","#d9a900","#7c6bb0","#3f8f7a",
    "#c46a4f","#8a6d3b","#4d7ea8","#5a9e6f","#a05070",
    "#4a7090","#9a7030","#607890","#706090","#508060",
  ];
  const groupOrder = [];
  raw.nodes.forEach(n => {
    if (!groupOrder.includes(n.group)) groupOrder.push(n.group);
  });
  const colorOf = n => PALETTE[groupOrder.indexOf(n.group) % PALETTE.length] || "#888";

  // ── collect all tags across nodes ────────────────────────────────────────
  const allTags = [...new Set(raw.nodes.flatMap(n => n.tags || []))].sort();

  // ── legend & count ────────────────────────────────────────────────────────
  if (legendEl) {
    legendEl.innerHTML = groupOrder.map((g, i) =>
      `<span><span class="dot" style="background:${PALETTE[i % PALETTE.length]}"></span>${g}</span>`
    ).join("");
  }
  if (countEl) {
    countEl.textContent = `${raw.nodes.length} nodes · ${raw.links.length} links` +
      (usingVault ? ` · ${raw.source || "vault"}` : " · sample data");
  }

  // ── tag filter chips ──────────────────────────────────────────────────────
  const filterEl = document.getElementById("graph-filters");
  const hiddenTags = new Set();   // tags currently filtered OUT

  function renderFilters() {
    if (!filterEl || allTags.length === 0) return;
    filterEl.innerHTML = "<span style='opacity:.6;font-size:.85em'>hide tag:</span> " +
      allTags.map(t => {
        const active = hiddenTags.has(t);
        return `<button class="tag-chip${active ? " active" : ""}" data-tag="${t}">${t}</button>`;
      }).join("");
    filterEl.querySelectorAll(".tag-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const tag = btn.dataset.tag;
        if (hiddenTags.has(tag)) hiddenTags.delete(tag);
        else hiddenTags.add(tag);
        applyFilter();
        renderFilters();
      });
    });
  }

  function applyFilter() {
    const visibleIds = new Set();
    nodes.forEach((n, i) => {
      const nodeTags = n.tags || [];
      const hide = nodeTags.some(t => hiddenTags.has(t));
      nodeGroups[i].style.display = hide ? "none" : "";
      if (!hide) visibleIds.add(n.id);
    });
    linkEls.forEach((line, i) => {
      const s = links[i].source, t = links[i].target;
      line.style.display = (visibleIds.has(s.id) && visibleIds.has(t.id)) ? "" : "none";
    });
    // update count
    if (countEl) {
      const vis = visibleIds.size;
      const suffix = hiddenTags.size > 0 ? ` (${vis} shown)` : "";
      countEl.textContent = `${raw.nodes.length} nodes · ${raw.links.length} links` +
        (usingVault ? ` · ${raw.source || "vault"}` : " · sample data") + suffix;
    }
  }

  renderFilters();

  // ── build node objects ────────────────────────────────────────────────────
  // For vault data: generate a URL from the .md path so clicking opens the note.
  // We assume the vault export lives at vault/ relative to this page.
  const VAULT_PREFIX = "vault/";
  function urlFor(n) {
    if (n.url) return n.url;                         // already set
    if (!usingVault) return null;
    if (!n.id.endsWith(".md")) return null;
    return VAULT_PREFIX + n.id;                      // e.g. vault/한국어 어휘/02. 음식/가루.md
  }

  const jitter = () => (Math.random() - 0.5) * 8;
  const nodes = raw.nodes.map((n, i) => {
    const angle  = (i / raw.nodes.length) * Math.PI * 2;
    const spread = Math.min(clientW, clientH) * 0.15 + (i % 7) * 8;
    return {
      ...n,
      url: urlFor(n),
      r: Math.max(4, Math.min(14, 4 + 1.8 * Math.sqrt(n.deg || 1))),
      x: clientW / 2 + Math.cos(angle) * spread + jitter(),
      y: clientH / 2 + Math.sin(angle) * spread + jitter(),
      vx: 0, vy: 0,
    };
  });
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const links = raw.links
    .filter(l => nodeById[l.source] && nodeById[l.target])
    .map(l => ({ source: nodeById[l.source], target: nodeById[l.target] }));

  // ── camera ────────────────────────────────────────────────────────────────
  const vb = { x: 0, y: 0, w: clientW, h: clientH };
  let userMoved = false;
  const applyVB = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const toWorld = (px, py) => ({
    x: vb.x + (px / clientW) * vb.w,
    y: vb.y + (py / clientH) * vb.h,
  });

  function autoFit() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach(n => {
      x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x);
      y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y);
    });
    const pad = 30, aspect = clientW / clientH;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    let w = x1 - x0, h = y1 - y0;
    if (w / h < aspect) { const nw = h * aspect; x0 -= (nw - w) / 2; w = nw; }
    else                 { const nh = w / aspect; y0 -= (nh - h) / 2; h = nh; }
    vb.x = x0; vb.y = y0; vb.w = w; vb.h = h;
    applyVB();
  }

  // ── SVG elements ──────────────────────────────────────────────────────────
  const linkEls = links.map(() => {
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("stroke", "rgba(30,64,124,0.18)");
    line.setAttribute("stroke-width", "1");
    svg.appendChild(line);
    return line;
  });

  const nodeGroups = nodes.map(n => {
    const g = document.createElementNS(svgNS, "g");
    g.style.cursor = n.url ? "pointer" : "grab";

    const glow = document.createElementNS(svgNS, "circle");
    glow.setAttribute("r", n.r + 4);
    glow.setAttribute("fill", colorOf(n));
    glow.setAttribute("opacity", "0.12");
    g.appendChild(glow);

    const circle = document.createElementNS(svgNS, "circle");
    circle.setAttribute("r", n.r);
    circle.setAttribute("fill", colorOf(n));
    circle.setAttribute("stroke", "#fff");
    circle.setAttribute("stroke-width", "1.5");
    g.appendChild(circle);

    const text = document.createElementNS(svgNS, "text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("y", n.r + 13);
    text.setAttribute("fill", "#33415c");
    text.setAttribute("font-size", "10");
    text.setAttribute("font-family", "Noto Sans KR, sans-serif");
    text.style.pointerEvents = "none";
    text.textContent = n.label;
    g.appendChild(text);

    svg.appendChild(g);
    return g;
  });

  // ── spatial-grid repulsion (O(n) per cell, fast for large graphs) ──────────
  // Divide the world into cells; only repel nodes in nearby cells.
  const CELL = 120;   // world-space cell size
  const REPEL = 2200; // repulsion strength

  function buildGrid() {
    const grid = new Map();
    const key = (cx, cy) => `${cx},${cy}`;
    nodes.forEach(n => {
      const cx = Math.floor(n.x / CELL), cy = Math.floor(n.y / CELL);
      const k = key(cx, cy);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(n);
    });
    return { grid, key };
  }

  function repelFromGrid(a, grid, key) {
    const cx = Math.floor(a.x / CELL), cy = Math.floor(a.y / CELL);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const cell = grid.get(key(cx + di, cy + dj));
        if (!cell) continue;
        for (const b of cell) {
          if (b === a) continue;
          let dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 0.01;
          if (d2 > CELL * CELL * 4) continue;
          const d = Math.sqrt(d2);
          const f = REPEL / d2;
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
        }
      }
    }
  }

  // ── physics loop ──────────────────────────────────────────────────────────
  let alpha   = 1;
  let running = false;
  let draggingNode = null;
  const LINK_LEN = 55;

  function step() {
    const { grid, key } = buildGrid();
    const cx = clientW / 2, cy = clientH / 2;

    nodes.forEach(n => {
      if (n === draggingNode) return;
      repelFromGrid(n, grid, key);
      // gentle centering
      n.vx += (cx - n.x) * 0.004 * alpha;
      n.vy += (cy - n.y) * 0.004 * alpha;
    });

    links.forEach(l => {
      const dx = l.target.x - l.source.x, dy = l.target.y - l.source.y;
      const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f  = (d - LINK_LEN) * 0.022 * alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      if (l.source !== draggingNode) { l.source.vx += fx; l.source.vy += fy; }
      if (l.target !== draggingNode) { l.target.vx -= fx; l.target.vy -= fy; }
    });

    nodes.forEach(n => {
      if (n === draggingNode) return;
      n.vx *= 0.82; n.vy *= 0.82;
      n.x  += n.vx;  n.y  += n.vy;
    });

    linkEls.forEach((line, i) => {
      line.setAttribute("x1", links[i].source.x);
      line.setAttribute("y1", links[i].source.y);
      line.setAttribute("x2", links[i].target.x);
      line.setAttribute("y2", links[i].target.y);
    });
    nodeGroups.forEach((g, i) => {
      g.setAttribute("transform", `translate(${nodes[i].x},${nodes[i].y})`);
    });

    if (!userMoved) autoFit();
    alpha *= 0.993;
    if (alpha > 0.015 || draggingNode) requestAnimationFrame(step);
    else running = false;
  }

  function kick(a = 1) {
    alpha = Math.max(alpha, a);
    if (!running) { running = true; requestAnimationFrame(step); }
  }

  // ── interaction helpers ───────────────────────────────────────────────────
  function localPoint(evt) {
    const rect = wrap.getBoundingClientRect();
    const cx   = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const cy   = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  }

  // ── node: drag + click-to-open + tooltip ──────────────────────────────────
  nodeGroups.forEach((g, i) => {
    const n = nodes[i];
    let downAt = null;

    const startDrag = evt => {
      evt.stopPropagation();
      evt.preventDefault();
      draggingNode = n; downAt = localPoint(evt);
      userMoved = true; kick(0.3);
    };
    g.addEventListener("mousedown", startDrag);
    g.addEventListener("touchstart", startDrag, { passive: false });

    g.addEventListener("mouseup", evt => {
      if (!downAt) return;
      const p = localPoint(evt);
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) < 5 && n.url)
        window.open(n.url, "_blank");
      downAt = null;
    });

    const showTip = evt => {
      if (!tooltip) return;
      const p = localPoint(evt);
      tooltip.style.left = p.x + "px";
      tooltip.style.top  = p.y + "px";
      const detail = n.gloss  ? n.gloss
                   : n.url    ? `${n.group} · click to open`
                               : n.group;
      tooltip.innerHTML = `<span class="kr">${n.label}</span>${detail}`;
      tooltip.style.opacity = "1";
    };
    g.addEventListener("mouseenter", showTip);
    g.addEventListener("mousemove",  showTip);
    g.addEventListener("mouseleave", () => { if (tooltip) tooltip.style.opacity = "0"; });
  });

  // ── background pan ────────────────────────────────────────────────────────
  let panFrom = null;
  svg.addEventListener("mousedown",  evt => { panFrom = localPoint(evt); userMoved = true; });
  svg.addEventListener("touchstart", evt => {
    if (evt.touches.length === 1 && !draggingNode) {
      panFrom = localPoint(evt); userMoved = true;
    }
  }, { passive: true });

  const onMove = evt => {
    const p = localPoint(evt);
    if (draggingNode) {
      const w = toWorld(p.x, p.y);
      draggingNode.x = w.x; draggingNode.y = w.y;
      draggingNode.vx = 0;  draggingNode.vy = 0;
      kick(0.2);
      if (evt.cancelable) evt.preventDefault();
    } else if (panFrom) {
      vb.x -= (p.x - panFrom.x) * (vb.w / clientW);
      vb.y -= (p.y - panFrom.y) * (vb.h / clientH);
      panFrom = p;
      applyVB();
    }
  };
  const onEnd = () => { draggingNode = null; panFrom = null; };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("mouseup",   onEnd);
  window.addEventListener("touchend",  onEnd);

  // ── wheel zoom ────────────────────────────────────────────────────────────
  // Must be registered on the SVG element AND the wrap with passive:false
  // so the browser doesn't swallow the event for page scrolling
  function onWheel(evt) {
    evt.preventDefault();
    evt.stopPropagation();
    userMoved = true;
    const factor = evt.deltaY > 0 ? 1.25 : 1 / 1.25;
    const scale  = clientW / (vb.w * factor);
    if (scale < 0.02 || scale > 12) return;
    const p = localPoint(evt), w = toWorld(p.x, p.y);
    vb.x = w.x - (w.x - vb.x) * factor;
    vb.y = w.y - (w.y - vb.y) * factor;
    vb.w *= factor; vb.h *= factor;
    applyVB();
  }
  wrap.addEventListener("wheel", onWheel, { passive: false });
  svg.addEventListener("wheel",  onWheel, { passive: false });

  window.addEventListener("resize", () => {
    clientW = wrap.clientWidth; clientH = wrap.clientHeight;
    if (!userMoved) autoFit();
  });

  applyVB();
  kick(1);
})();
