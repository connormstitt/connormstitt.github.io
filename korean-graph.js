// Obsidian-style graph view built on d3-force — same physics family as
// Obsidian's own graph, with an Obsidian-style settings panel:
//   Filters:  tag chips (#synthetic_node hidden by default) · orphans toggle
//   Display:  node size · link thickness · text fade threshold
//   Forces:   center force · repel force · link force · link distance
// Data: window.VAULT_GRAPH (from the Obsidian console snippet).

window.PLACEHOLDER_GRAPH = {
  nodes: [
    { id:"root", label:"한국어", group:"topic", deg:4, tags:[] },
    { id:"v1", label:"안녕하세요", group:"vocab", deg:1, tags:[] },
    { id:"v2", label:"감사합니다", group:"vocab", deg:1, tags:[] },
    { id:"v3", label:"사랑", group:"vocab", deg:2, tags:[] },
    { id:"v4", label:"가다", group:"vocab", deg:3, tags:[] },
    { id:"g1", label:"-는데", group:"grammar", deg:2, tags:[] },
    { id:"g2", label:"-아/어서", group:"grammar", deg:2, tags:[] },
  ],
  links: [
    {source:"root",target:"v1"},{source:"root",target:"v2"},{source:"root",target:"g1"},
    {source:"v4",target:"g2"},{source:"v3",target:"g1"},{source:"v1",target:"v2"},
  ],
};

(function initGraph() {
  const wrap    = document.getElementById("graph-wrap");
  const svg     = document.getElementById("graph-svg");
  const tooltip = document.getElementById("graph-tooltip");
  const filterEl= document.getElementById("graph-filters");
  const countEl = document.getElementById("node-count");
  if (!wrap || !svg || typeof d3 === "undefined") return;

  const usingVault = !!(window.VAULT_GRAPH?.nodes?.length);
  const raw = usingVault ? window.VAULT_GRAPH : window.PLACEHOLDER_GRAPH;

  const svgNS = "http://www.w3.org/2000/svg";
  let clientW = wrap.clientWidth;
  let clientH = wrap.clientHeight;

  // ── settings (Obsidian-style, live-adjustable) ────────────────────────────
  const S = {
    centerForce: 0.4,     // 0–1
    repelForce: 10,       // 0–20
    linkForce: 1,         // 0–1
    linkDistance: 30,     // 0–300
    nodeSize: 1,          // 0.4–3
    linkThickness: 1,     // 0.3–4
    textFade: 0.7,        // labels appear when zoom scale > this
    showOrphans: true,
  };

  // ── palette ───────────────────────────────────────────────────────────────
  const PALETTE = [
    "#1e407c","#6b93d6","#d9a900","#7c6bb0","#3f8f7a",
    "#c46a4f","#8a6d3b","#4d7ea8","#5a9e6f","#a05070",
    "#4a7090","#9a7030","#607890","#706090","#508060",
  ];
  const groupOrder = [];
  raw.nodes.forEach(n => { if (!groupOrder.includes(n.group)) groupOrder.push(n.group); });
  const colorOf = n => PALETTE[groupOrder.indexOf(n.group) % PALETTE.length] || "#888";

  const allTags = [...new Set(raw.nodes.flatMap(n => n.tags || []))].sort();

  const updateCount = visN => {
    if (!countEl) return;
    const base = `${raw.nodes.length} nodes · ${raw.links.length} links` +
      (usingVault ? ` · ${raw.source||"vault"}` : " · sample data");
    countEl.textContent = visN < raw.nodes.length ? base + ` (${visN} shown)` : base;
  };

  // ── nodes / links ─────────────────────────────────────────────────────────
  const nodes = raw.nodes.map(n => ({
    ...n,
    tags: n.tags || [],
    url: usingVault && n.id.endsWith(".md") ? "vault/"+n.id : (n.url || null),
    baseR: Math.max(3.5, Math.min(12, 3.5 + 1.5*Math.sqrt(n.deg||1))),
    x: clientW/2 + (Math.random()-0.5)*clientW*0.5,
    y: clientH/2 + (Math.random()-0.5)*clientH*0.5,
  }));
  const nodeById = Object.fromEntries(nodes.map(n=>[n.id,n]));
  const links = (raw.links||[])
    .filter(l => nodeById[l.source] && nodeById[l.target])
    .map(l => ({ source: nodeById[l.source], target: nodeById[l.target] }));

  // ── camera ────────────────────────────────────────────────────────────────
  const vb = {x:0, y:0, w:clientW, h:clientH};
  let userMoved = false;
  const scale  = () => clientW / vb.w;
  const applyVB = () => { svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); syncLabels(); };
  const toWorld = (px,py) => ({x: vb.x + (px/clientW)*vb.w, y: vb.y + (py/clientH)*vb.h});

  let activeNodes = nodes.slice();
  let activeLinks = links.slice();

  function fitTarget() {
    const src = activeNodes.length ? activeNodes : nodes;
    const xs = src.map(n=>n.x).sort((a,b)=>a-b);
    const ys = src.map(n=>n.y).sort((a,b)=>a-b);
    const q = 0.03, lo = i=>Math.floor(i);
    let x0 = xs[lo(xs.length*q)], y0 = ys[lo(ys.length*q)];
    let x1 = xs[Math.min(xs.length-1, lo(xs.length*(1-q)))],
        y1 = ys[Math.min(ys.length-1, lo(ys.length*(1-q)))];
    const pad = 60, aspect = clientW/clientH;
    x0-=pad; y0-=pad; x1+=pad; y1+=pad;
    let w=x1-x0, h=y1-y0;
    if (w/h < aspect){ const nw=h*aspect; x0-=(nw-w)/2; w=nw; }
    else             { const nh=w/aspect; y0-=(nh-h)/2; h=nh; }
    return {x:x0, y:y0, w, h};
  }
  function autoFit(lerp=0.12){
    const t = fitTarget();
    vb.x+=(t.x-vb.x)*lerp; vb.y+=(t.y-vb.y)*lerp;
    vb.w+=(t.w-vb.w)*lerp; vb.h+=(t.h-vb.h)*lerp;
    applyVB();
  }
  function fitNow(){ const t=fitTarget(); vb.x=t.x;vb.y=t.y;vb.w=t.w;vb.h=t.h; applyVB(); }

  // ── SVG elements ──────────────────────────────────────────────────────────
  const linkEls = links.map(() => {
    const line = document.createElementNS(svgNS,"line");
    line.setAttribute("stroke","rgba(30,64,124,0.2)");
    line.setAttribute("stroke-width", S.linkThickness);
    svg.appendChild(line);
    return line;
  });

  const nodeEls = nodes.map(n => {
    const g = document.createElementNS(svgNS,"g");
    g.style.cursor = n.url ? "pointer" : "grab";

    const circle = document.createElementNS(svgNS,"circle");
    circle.setAttribute("r", n.baseR * S.nodeSize);
    circle.setAttribute("fill", colorOf(n));
    circle.setAttribute("stroke", "#fff");
    circle.setAttribute("stroke-width", "1.2");
    g.appendChild(circle);

    const text = document.createElementNS(svgNS,"text");
    text.setAttribute("text-anchor","middle");
    text.setAttribute("y", n.baseR*S.nodeSize + 12);
    text.setAttribute("fill","#33415c");
    text.setAttribute("font-size","10");
    text.setAttribute("font-family","Noto Sans KR, sans-serif");
    text.style.pointerEvents = "none";
    text.textContent = n.label;
    g.appendChild(text);

    svg.appendChild(g);
    return { g, circle, text };
  });

  function syncLabels() {
    // Obsidian-style text fade: labels appear as you zoom past the threshold
    const s = scale();
    const op = Math.max(0, Math.min(1, (s - S.textFade) * 4));
    nodeEls.forEach(el => el.text.style.opacity = op);
  }
  function syncNodeSize() {
    nodes.forEach((n,i)=>{
      nodeEls[i].circle.setAttribute("r", n.baseR*S.nodeSize);
      nodeEls[i].text.setAttribute("y", n.baseR*S.nodeSize + 12);
    });
    sim.force("collide").radius(n => n.baseR*S.nodeSize + 2);
  }
  function syncLinkThickness() {
    linkEls.forEach(l => l.setAttribute("stroke-width", S.linkThickness));
  }

  // ── d3 force simulation — the Obsidian look ───────────────────────────────
  // degree-scaled link strength (leaves hug hubs), bounded repulsion
  // (clusters don't push each other apart evenly), light collision.
  function linkStrength(l) {
    const cnt = id => activeLinks.reduce((a,x)=>a+(x.source.id===id||x.target.id===id?1:0),0);
    return S.linkForce * Math.min(1, 1/Math.min(cnt(l.source.id), cnt(l.target.id)));
  }

  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).distance(() => S.linkDistance))
    .force("charge", d3.forceManyBody().distanceMax(500))
    .force("x", d3.forceX(clientW/2))
    .force("y", d3.forceY(clientH/2))
    .force("collide", d3.forceCollide().radius(n => n.baseR*S.nodeSize + 2))
    .velocityDecay(0.4)
    .alphaMin(0.003)
    .alphaDecay(0.035)
    .on("tick", () => {
      linkEls.forEach((line,i)=>{
        line.setAttribute("x1",links[i].source.x);
        line.setAttribute("y1",links[i].source.y);
        line.setAttribute("x2",links[i].target.x);
        line.setAttribute("y2",links[i].target.y);
      });
      nodeEls.forEach((el,i)=>el.g.setAttribute("transform",`translate(${nodes[i].x},${nodes[i].y})`));
      if (!userMoved) autoFit();
    })
    .on("end", () => { if (!userMoved) fitNow(); });

  function applyForceSettings() {
    sim.force("link").strength(linkStrength).distance(() => S.linkDistance);
    sim.force("charge").strength(-S.repelForce * 30);
    sim.force("x").strength(S.centerForce * 0.12);
    sim.force("y").strength(S.centerForce * 0.12);
  }
  applyForceSettings();

  function reheat(a=1){ sim.alpha(a).restart(); }

  // ── filtering: tags (#synthetic_node default-hidden) + orphans ────────────
  const hiddenTags = new Set();
  if (allTags.includes("#synthetic_node")) hiddenTags.add("#synthetic_node");

  function applyFilter() {
    const tagVisible = new Set();
    nodes.forEach(n => {
      if (!n.tags.some(t=>hiddenTags.has(t))) tagVisible.add(n.id);
    });
    const linkedIds = new Set();
    links.forEach(l => {
      if (tagVisible.has(l.source.id) && tagVisible.has(l.target.id)) {
        linkedIds.add(l.source.id); linkedIds.add(l.target.id);
      }
    });
    const visibleIds = new Set(
      [...tagVisible].filter(id => S.showOrphans || linkedIds.has(id))
    );

    nodes.forEach((n,i)=> nodeEls[i].g.style.display = visibleIds.has(n.id) ? "" : "none");
    linkEls.forEach((line,i)=>{
      const l = links[i];
      line.style.display = (visibleIds.has(l.source.id)&&visibleIds.has(l.target.id)) ? "" : "none";
    });

    activeNodes = nodes.filter(n => visibleIds.has(n.id));
    activeLinks = links.filter(l => visibleIds.has(l.source.id) && visibleIds.has(l.target.id));

    // re-scope the simulation and re-estimate the layout
    sim.nodes(activeNodes);
    sim.force("link").links(activeLinks);
    applyForceSettings();
    userMoved = false;
    reheat(1);
    updateCount(visibleIds.size);
  }

  function renderFilters() {
    if (!filterEl) return;
    if (allTags.length === 0) {
      filterEl.innerHTML = usingVault
        ? `<span class="chip-label">no tags in data — re-run the console snippet (tag version)</span>` : "";
      return;
    }
    filterEl.innerHTML =
      `<span class="chip-label">hide:</span>` +
      allTags.map(t =>
        `<button class="tag-chip${hiddenTags.has(t)?" active":""}" data-val="${t}">${t}</button>`
      ).join("");
    filterEl.querySelectorAll(".tag-chip").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const v = btn.dataset.val;
        hiddenTags.has(v) ? hiddenTags.delete(v) : hiddenTags.add(v);
        applyFilter(); renderFilters();
      });
    });
  }

  // ── settings panel (gear) ─────────────────────────────────────────────────
  const gear = document.createElement("button");
  gear.className = "graph-gear";
  gear.textContent = "⚙";
  wrap.appendChild(gear);

  const panel = document.createElement("div");
  panel.className = "graph-settings";
  panel.style.display = "none";
  panel.innerHTML = `
    <div class="gs-section">Filters</div>
    <label class="gs-row gs-check"><input type="checkbox" id="gs-orphans" checked> Orphans</label>
    <div class="gs-section">Display</div>
    <label class="gs-row">Node size<input type="range" id="gs-nodesize" min="0.4" max="3" step="0.1" value="${S.nodeSize}"></label>
    <label class="gs-row">Link thickness<input type="range" id="gs-linkthick" min="0.3" max="4" step="0.1" value="${S.linkThickness}"></label>
    <label class="gs-row">Text fade threshold<input type="range" id="gs-textfade" min="0" max="2.5" step="0.05" value="${S.textFade}"></label>
    <div class="gs-section">Forces</div>
    <label class="gs-row">Center force<input type="range" id="gs-center" min="0" max="1" step="0.05" value="${S.centerForce}"></label>
    <label class="gs-row">Repel force<input type="range" id="gs-repel" min="0" max="20" step="0.5" value="${S.repelForce}"></label>
    <label class="gs-row">Link force<input type="range" id="gs-linkforce" min="0" max="1" step="0.05" value="${S.linkForce}"></label>
    <label class="gs-row">Link distance<input type="range" id="gs-linkdist" min="5" max="300" step="5" value="${S.linkDistance}"></label>
  `;
  wrap.appendChild(panel);

  gear.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "" : "none";
  });
  panel.addEventListener("mousedown", e=>e.stopPropagation());
  panel.addEventListener("wheel", e=>e.stopPropagation());

  const on = (id, fn) => panel.querySelector(id).addEventListener("input", fn);
  on("#gs-orphans",  e => { S.showOrphans = e.target.checked; applyFilter(); });
  on("#gs-nodesize", e => { S.nodeSize = +e.target.value; syncNodeSize(); reheat(0.3); });
  on("#gs-linkthick",e => { S.linkThickness = +e.target.value; syncLinkThickness(); });
  on("#gs-textfade", e => { S.textFade = +e.target.value; syncLabels(); });
  on("#gs-center",   e => { S.centerForce = +e.target.value; applyForceSettings(); reheat(0.5); });
  on("#gs-repel",    e => { S.repelForce = +e.target.value; applyForceSettings(); reheat(0.5); });
  on("#gs-linkforce",e => { S.linkForce = +e.target.value; applyForceSettings(); reheat(0.5); });
  on("#gs-linkdist", e => { S.linkDistance = +e.target.value; applyForceSettings(); reheat(0.5); });

  // ── pointer helpers ───────────────────────────────────────────────────────
  function localPoint(evt){
    const rect = wrap.getBoundingClientRect();
    const cx = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const cy = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {x: cx-rect.left, y: cy-rect.top};
  }

  // ── node drag / click / tooltip ───────────────────────────────────────────
  let draggingNode = null;
  nodeEls.forEach((el,i)=>{
    const n = nodes[i];
    let downAt = null;
    const start = evt => {
      evt.stopPropagation(); evt.preventDefault();
      draggingNode = n; downAt = localPoint(evt);
      userMoved = true;
      sim.alphaTarget(0.3).restart();
    };
    el.g.addEventListener("mousedown", start);
    el.g.addEventListener("touchstart", start, {passive:false});
    el.g.addEventListener("mouseup", evt => {
      if (!downAt) return;
      const p = localPoint(evt);
      if (Math.hypot(p.x-downAt.x, p.y-downAt.y) < 5 && n.url) window.open(n.url, "_blank");
      downAt = null;
    });
    const showTip = evt => {
      if (!tooltip) return;
      const p = localPoint(evt);
      tooltip.style.left = p.x+"px"; tooltip.style.top = p.y+"px";
      const detail = n.url ? `${n.group} · click to open` : n.group;
      const tagStr = n.tags.length ? ` <span style="opacity:.6">${n.tags.join(" ")}</span>` : "";
      tooltip.innerHTML = `<span class="kr">${n.label}</span>${detail}${tagStr}`;
      tooltip.style.opacity = "1";
    };
    el.g.addEventListener("mouseenter", showTip);
    el.g.addEventListener("mousemove", showTip);
    el.g.addEventListener("mouseleave", ()=>{ if (tooltip) tooltip.style.opacity="0"; });
  });

  // ── pan ───────────────────────────────────────────────────────────────────
  let panFrom = null;
  svg.addEventListener("mousedown", evt=>{ panFrom = localPoint(evt); userMoved = true; });
  svg.addEventListener("touchstart", evt=>{
    if (evt.touches.length===1 && !draggingNode){ panFrom = localPoint(evt); userMoved = true; }
  }, {passive:true});

  const onMove = evt => {
    const p = localPoint(evt);
    if (draggingNode){
      const w = toWorld(p.x,p.y);
      draggingNode.fx = w.x; draggingNode.fy = w.y;
      if (evt.cancelable) evt.preventDefault();
    } else if (panFrom){
      vb.x -= (p.x-panFrom.x)*(vb.w/clientW);
      vb.y -= (p.y-panFrom.y)*(vb.h/clientH);
      panFrom = p; applyVB();
    }
  };
  const onEnd = () => {
    if (draggingNode){ draggingNode.fx = null; draggingNode.fy = null; sim.alphaTarget(0); }
    draggingNode = null; panFrom = null;
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("touchmove", onMove, {passive:false});
  window.addEventListener("mouseup", onEnd);
  window.addEventListener("touchend", onEnd);

  // ── wheel zoom ────────────────────────────────────────────────────────────
  function onWheel(evt){
    evt.preventDefault(); evt.stopPropagation(); userMoved = true;
    const factor = evt.deltaY > 0 ? 1.3 : 1/1.3;
    const s = clientW/(vb.w*factor);
    if (s < 0.005 || s > 25) return;
    const p = localPoint(evt), w = toWorld(p.x,p.y);
    vb.x = w.x-(w.x-vb.x)*factor; vb.y = w.y-(w.y-vb.y)*factor;
    vb.w *= factor; vb.h *= factor; applyVB();
  }
  wrap.addEventListener("wheel", onWheel, {passive:false});
  svg.addEventListener("wheel", onWheel, {passive:false});

  // ── zoom buttons ──────────────────────────────────────────────────────────
  const btns = document.createElement("div");
  btns.className = "zoom-btns";
  btns.innerHTML = `<button data-z="in">+</button><button data-z="out">−</button><button data-z="fit">⤢</button>`;
  wrap.appendChild(btns);
  function zoomCenter(factor){
    userMoved = true;
    const w = {x: vb.x+vb.w/2, y: vb.y+vb.h/2};
    vb.x = w.x-(w.x-vb.x)*factor; vb.y = w.y-(w.y-vb.y)*factor;
    vb.w *= factor; vb.h *= factor; applyVB();
  }
  btns.addEventListener("click", e=>{
    const z = e.target.dataset.z;
    if (z==="in") zoomCenter(1/1.4);
    else if (z==="out") zoomCenter(1.4);
    else if (z==="fit"){ userMoved=false; fitNow(); }
  });
  btns.addEventListener("mousedown", e=>e.stopPropagation());

  window.addEventListener("resize", ()=>{
    clientW = wrap.clientWidth; clientH = wrap.clientHeight;
    if (!userMoved) fitNow();
  });

  // ── go ────────────────────────────────────────────────────────────────────
  applyVB();
  renderFilters();
  applyFilter();   // applies default #synthetic_node hide and starts the sim
})();
