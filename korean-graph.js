// Obsidian-style graph view on d3-force, with Obsidian's settings panel:
//   Filters:  search query (supports  text, #tag, -exclusions ) · Tags ·
//             Attachments · Existing files only · Orphans
//   Groups:   color rules by query
//   Display:  Arrows · Text fade threshold · Node size · Link thickness · Animate
//   Forces:   Center force · Repel force · Link force · Link distance
// Tag chips below the toolbar use INCLUDE semantics; #synthetic_node starts off.

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

  // ── settings & defaults ───────────────────────────────────────────────────
  const DEFAULTS = {
    query: "",
    showTagNodes: false,
    showAttachments: false,   // no attachments in this data; kept for parity
    existingOnly: true,
    showOrphans: true,
    showArrows: false,
    textFade: 0.7,
    nodeSize: 1,
    linkThickness: 1,
    centerForce: 0.4,
    repelForce: 15,
    linkForce: 1,
    linkDistance: 60,
  };
  const S = { ...DEFAULTS };
  let groups = [];   // [{query, color}]

  // ── palette ───────────────────────────────────────────────────────────────
  const PALETTE = [
    "#1e407c","#6b93d6","#d9a900","#7c6bb0","#3f8f7a",
    "#c46a4f","#8a6d3b","#4d7ea8","#5a9e6f","#a05070",
    "#4a7090","#9a7030","#607890","#706090","#508060",
  ];
  const TAGNODE_COLOR = "#98a3b8";
  const groupOrder = [];
  raw.nodes.forEach(n => { if (!groupOrder.includes(n.group)) groupOrder.push(n.group); });
  const baseColor = n => n.isTag ? TAGNODE_COLOR :
    (PALETTE[groupOrder.indexOf(n.group) % PALETTE.length] || "#888");

  const allTags = [...new Set(raw.nodes.flatMap(n => n.tags || []))].sort();
  const edgeTypes = [...new Set((raw.links||[]).map(l => l.type || "link"))].sort();
  const EDGE_COLORS = ["rgba(30,64,124,0.25)","rgba(205,7,30,0.4)","rgba(63,143,122,0.45)",
                       "rgba(217,169,0,0.5)","rgba(124,107,176,0.45)","rgba(196,106,79,0.45)"];
  const edgeColorOf = t => edgeTypes.length > 1
      ? EDGE_COLORS[edgeTypes.indexOf(t || "link") % EDGE_COLORS.length]
      : "rgba(30,64,124,0.2)";
  const includedEdgeTypes = new Set(edgeTypes);

  const updateCount = visN => {
    if (!countEl) return;
    const base = `${raw.nodes.length} nodes · ${raw.links.length} links` +
      (usingVault ? ` · ${raw.source||"vault"}` : " · sample data");
    countEl.textContent = visN < raw.nodes.length ? base + ` (${visN} shown)` : base;
  };

  // ── node & link objects (notes + tag nodes) ───────────────────────────────
  // seed each group's nodes around its own compass angle: this breaks the
  // start-up symmetry so group gravity can form distinct free-floating clusters
  const seedR = Math.min(clientW, clientH) * 0.42;
  const noteNodes = raw.nodes.map(n => {
    const gi = groupOrder.indexOf(n.group);
    const ang = (gi / Math.max(1, groupOrder.length)) * Math.PI * 2;
    return {
      ...n,
      tags: n.tags || [],
      url: usingVault && n.id.endsWith(".md") ? "vault/"+n.id : (n.url || null),
      baseR: Math.max(3.5, Math.min(12, 3.5 + 1.5*Math.sqrt(n.deg||1))),
      x: clientW/2 + Math.cos(ang)*seedR + (Math.random()-0.5)*170,
      y: clientH/2 + Math.sin(ang)*seedR + (Math.random()-0.5)*170,
    };
  });
  const tagNodes = allTags.map(t => ({
    id: "tag:"+t, label: t, group: "(tag)", tags: [], isTag: true, url: null,
    baseR: 6,
    x: clientW/2 + (Math.random()-0.5)*clientW*0.4,
    y: clientH/2 + (Math.random()-0.5)*clientH*0.4,
  }));
  const nodes = [...noteNodes, ...tagNodes];
  const nodeById = Object.fromEntries(nodes.map(n=>[n.id,n]));

  const noteLinks = (raw.links||[])
    .filter(l => nodeById[l.source] && nodeById[l.target])
    .map(l => ({ source: nodeById[l.source], target: nodeById[l.target], type: l.type || "link", isTagLink:false }));
  const tagLinks = [];
  noteNodes.forEach(n => n.tags.forEach(t => {
    tagLinks.push({ source: n, target: nodeById["tag:"+t], isTagLink:true });
  }));
  const links = [...noteLinks, ...tagLinks];

  // ── camera ────────────────────────────────────────────────────────────────
  const vb = {x:0, y:0, w:clientW, h:clientH};
  let userMoved = false;
  const scale  = () => clientW / vb.w;
  const applyVB = () => { svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); syncLabels(); };
  const toWorld = (px,py) => ({x: vb.x + (px/clientW)*vb.w, y: vb.y + (py/clientH)*vb.h});

  let activeNodes = noteNodes.slice();
  let activeLinks = noteLinks.slice();

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

  // ── SVG: arrow marker def + elements ──────────────────────────────────────
  const defs = document.createElementNS(svgNS,"defs");
  defs.innerHTML = `<marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4"
      markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0,0 L8,4 L0,8 z" fill="rgba(30,64,124,0.45)"/></marker>`;
  svg.appendChild(defs);

  const linkEls = links.map((l) => {
    const line = document.createElementNS(svgNS,"line");
    line.setAttribute("stroke", l.isTagLink ? "rgba(152,163,184,0.35)" : edgeColorOf(l.type));
    line.setAttribute("stroke-width", S.linkThickness);
    svg.appendChild(line);
    return line;
  });

  const nodeEls = nodes.map(n => {
    const g = document.createElementNS(svgNS,"g");
    g.style.cursor = n.url ? "pointer" : "grab";

    const circle = document.createElementNS(svgNS,"circle");
    circle.setAttribute("r", n.baseR * S.nodeSize);
    circle.setAttribute("fill", baseColor(n));
    circle.setAttribute("stroke", "#fff");
    circle.setAttribute("stroke-width", "1.2");
    if (n.isTag) circle.setAttribute("opacity","0.75");
    g.appendChild(circle);

    const text = document.createElementNS(svgNS,"text");
    text.setAttribute("text-anchor","middle");
    text.setAttribute("y", n.baseR*S.nodeSize + 12);
    text.setAttribute("fill", n.isTag ? "#7a8499" : "#33415c");
    text.setAttribute("font-size","10");
    text.setAttribute("font-family","Noto Sans KR, sans-serif");
    text.style.pointerEvents = "none";
    text.textContent = n.label;
    g.appendChild(text);

    svg.appendChild(g);
    return { g, circle, text };
  });

  function syncLabels() {
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
  function syncArrows() {
    linkEls.forEach(l => {
      if (S.showArrows) l.setAttribute("marker-end","url(#arrow)");
      else l.removeAttribute("marker-end");
    });
  }
  function recolor() {
    nodes.forEach((n,i)=>{
      let c = baseColor(n);
      groups.forEach(gr => { if (gr.query && matchQuery(n, gr.query)) c = gr.color; });
      nodeEls[i].circle.setAttribute("fill", c);
    });
  }

  // ── query matcher: "text #tag -excluded -#tag" ────────────────────────────
  function matchQuery(n, q) {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const hay = (n.label + " " + n.id).toLowerCase();
    const ntags = n.tags.map(t=>t.toLowerCase());
    for (const tok of tokens) {
      const neg = tok.startsWith("-");
      const body = neg ? tok.slice(1) : tok;
      if (!body) continue;
      let hit;
      if (body.startsWith("#")) hit = ntags.some(t => t.includes(body));
      else hit = hay.includes(body) || ntags.some(t => t.includes(body));
      if (neg && hit) return false;
      if (!neg && !hit) return false;
    }
    return true;
  }

  // ── d3 force simulation ───────────────────────────────────────────────────
  // constant-magnitude pull toward center: holds the graph together without
  // creating a circular envelope (a linear spring always makes a disc)
  function constantGravity() {
    let ns;
    function force(alpha) {
      const G = S.centerForce * 2.6 * alpha;
      if (G <= 0) return;
      const cx = clientW/2, cy = clientH/2;
      // group centroids: nodes drift toward their folder-siblings, so even
      // unlinked notes form meaningful clusters instead of a uniform fog
      const cents = {};
      for (const n of ns) {
        if (n.isTag) continue;
        const c = (cents[n.group] ??= {x:0, y:0, c:0});
        c.x += n.x; c.y += n.y; c.c++;
      }
      for (const k in cents) { cents[k].x /= cents[k].c; cents[k].y /= cents[k].c; }
      for (const n of ns) {
        const cent = (!n.isTag && cents[n.group] && cents[n.group].c > 2) ? cents[n.group] : null;
        if (cent) {
          let dx = cent.x - n.x, dy = cent.y - n.y;
          const d = Math.hypot(dx, dy) || 1;
          n.vx += (dx/d) * G;
          n.vy += (dy/d) * G;
        }
        // faint global pull keeps clusters from drifting off entirely
        let dx = cx - n.x, dy = cy - n.y;
        const d = Math.hypot(dx, dy) || 1;
        n.vx += (dx/d) * G * 0.35;
        n.vy += (dy/d) * G * 0.35;
      }
    }
    force.initialize = arr => ns = arr;
    return force;
  }

  function linkStrength(l) {
    const cnt = id => activeLinks.reduce((a,x)=>a+(x.source.id===id||x.target.id===id?1:0),0);
    return S.linkForce * Math.min(1, 1/Math.min(cnt(l.source.id), cnt(l.target.id)));
  }

  const sim = d3.forceSimulation(activeNodes)
    .force("link", d3.forceLink(activeLinks).distance(() => S.linkDistance))
    .force("charge", d3.forceManyBody())
    .force("gravity", constantGravity())
    .force("collide", d3.forceCollide().radius(n => n.baseR*S.nodeSize + 2))
    .velocityDecay(0.4)
    .alphaMin(0.003)
    .alphaDecay(0.028)
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
    sim.force("charge").strength(-S.repelForce * 10);
  }
  function reheat(a=1){ sim.alpha(a).restart(); }

  // ── include-style tag chips (#synthetic_node off by default) ──────────────
  const includedTags = new Set(allTags.filter(t => t !== "#synthetic_node"));

  // ── the master filter pipeline ────────────────────────────────────────────
  function applyFilter() {
    // 1. existing files only
    let vis = noteNodes.filter(n => !(S.existingOnly && n.missing));
    // 2. include-tags: untagged always pass; tagged need >=1 included tag
    vis = vis.filter(n => n.tags.length === 0 || n.tags.some(t => includedTags.has(t)));
    // 3. search query
    if (S.query.trim()) vis = vis.filter(n => matchQuery(n, S.query));
    let visIds = new Set(vis.map(n=>n.id));
    // 4. orphans (linked via note links, or via tag nodes when shown)
    if (!S.showOrphans) {
      const linked = new Set();
      noteLinks.forEach(l => {
        if (includedEdgeTypes.has(l.type) && visIds.has(l.source.id) && visIds.has(l.target.id)) {
          linked.add(l.source.id); linked.add(l.target.id);
        }
      });
      if (S.showTagNodes) {
        tagLinks.forEach(l => { if (visIds.has(l.source.id)) linked.add(l.source.id); });
      }
      visIds = new Set([...visIds].filter(id => linked.has(id)));
    }
    // 5. tag nodes if enabled: tags present on visible notes
    const visTagIds = new Set();
    if (S.showTagNodes) {
      noteNodes.forEach(n => {
        if (visIds.has(n.id)) n.tags.forEach(t => visTagIds.add("tag:"+t));
      });
    }

    const allVis = new Set([...visIds, ...visTagIds]);
    nodes.forEach((n,i)=> nodeEls[i].g.style.display = allVis.has(n.id) ? "" : "none");
    linkEls.forEach((line,i)=>{
      const l = links[i];
      const show = l.isTagLink
        ? (S.showTagNodes && visIds.has(l.source.id) && visTagIds.has(l.target.id))
        : (includedEdgeTypes.has(l.type) && allVis.has(l.source.id) && allVis.has(l.target.id));
      line.style.display = show ? "" : "none";
    });

    activeNodes = nodes.filter(n => allVis.has(n.id));
    activeLinks = links.filter((l,i) => linkEls[i].style.display !== "none");

    sim.nodes(activeNodes);
    sim.force("link").links(activeLinks);
    applyForceSettings();
    recolor();
    syncArrows();
    userMoved = false;
    reheat(1);
    updateCount(visIds.size);
  }

  function renderChips() {
    if (!filterEl) return;
    if (allTags.length === 0) { filterEl.innerHTML = ""; return; }
    filterEl.innerHTML =
      `<span class="chip-label">show:</span>` +
      allTags.map(t =>
        `<button class="tag-chip${includedTags.has(t)?" active":""}" data-val="${t}">${t}</button>`
      ).join("");
    filterEl.querySelectorAll(".tag-chip").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const v = btn.dataset.val;
        includedTags.has(v) ? includedTags.delete(v) : includedTags.add(v);
        applyFilter(); renderChips();
      });
    });
  }

  // ── settings panel (Obsidian-style) ───────────────────────────────────────
  const gear = document.createElement("button");
  gear.className = "graph-gear";
  gear.textContent = "⚙";
  wrap.appendChild(gear);

  const panel = document.createElement("div");
  panel.className = "graph-settings";
  panel.style.display = "none";
  panel.innerHTML = `
    <div class="gs-head">
      <button class="gs-icon" id="gs-reset" title="Restore default settings">↺</button>
      <button class="gs-icon" id="gs-close" title="Close">×</button>
    </div>

    <div class="gs-sec" data-sec="filters">
      <div class="gs-sec-head">Filters</div>
      <div class="gs-sec-body">
        <div class="gs-search"><input type="text" id="gs-query" placeholder="Search…  ( text · #tag · -exclude )"></div>
        <label class="gs-toggle-row">Tags<span class="gs-switch"><input type="checkbox" id="gs-tags"><i></i></span></label>
        <label class="gs-toggle-row">Attachments<span class="gs-switch"><input type="checkbox" id="gs-attach"><i></i></span></label>
        <label class="gs-toggle-row">Existing files only<span class="gs-switch"><input type="checkbox" id="gs-existing" checked><i></i></span></label>
        <label class="gs-toggle-row">Orphans<span class="gs-switch"><input type="checkbox" id="gs-orphans" checked><i></i></span></label>
      </div>
    </div>

    <div class="gs-sec" data-sec="edges" id="gs-edges-sec">
      <div class="gs-sec-head">Edges</div>
      <div class="gs-sec-body" id="gs-edges"></div>
    </div>

    <div class="gs-sec" data-sec="groups">
      <div class="gs-sec-head">Groups</div>
      <div class="gs-sec-body">
        <div id="gs-groups"></div>
        <button class="gs-btn" id="gs-newgroup">New group</button>
      </div>
    </div>

    <div class="gs-sec" data-sec="display">
      <div class="gs-sec-head">Display</div>
      <div class="gs-sec-body">
        <label class="gs-toggle-row">Arrows<span class="gs-switch"><input type="checkbox" id="gs-arrows"><i></i></span></label>
        <label class="gs-row">Text fade threshold<input type="range" id="gs-textfade" min="0" max="2.5" step="0.05" value="${S.textFade}"></label>
        <label class="gs-row">Node size<input type="range" id="gs-nodesize" min="0.4" max="3" step="0.1" value="${S.nodeSize}"></label>
        <label class="gs-row">Link thickness<input type="range" id="gs-linkthick" min="0.3" max="4" step="0.1" value="${S.linkThickness}"></label>
        <button class="gs-btn" id="gs-animate">Animate</button>
      </div>
    </div>

    <div class="gs-sec" data-sec="forces">
      <div class="gs-sec-head">Forces</div>
      <div class="gs-sec-body">
        <label class="gs-row">Center force<input type="range" id="gs-center" min="0" max="1" step="0.05" value="${S.centerForce}"></label>
        <label class="gs-row">Repel force<input type="range" id="gs-repel" min="0" max="20" step="0.5" value="${S.repelForce}"></label>
        <label class="gs-row">Link force<input type="range" id="gs-linkforce" min="0" max="1" step="0.05" value="${S.linkForce}"></label>
        <label class="gs-row">Link distance<input type="range" id="gs-linkdist" min="5" max="300" step="5" value="${S.linkDistance}"></label>
      </div>
    </div>
  `;
  wrap.appendChild(panel);

  gear.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "" : "none";
  });
  panel.addEventListener("mousedown", e=>e.stopPropagation());
  panel.addEventListener("wheel", e=>e.stopPropagation());
  panel.querySelector("#gs-close").addEventListener("click", ()=> panel.style.display="none");

  // collapsible sections
  panel.querySelectorAll(".gs-sec-head").forEach(h => {
    h.addEventListener("click", () => h.parentElement.classList.toggle("collapsed"));
  });

  // edges UI: one toggle per edge:: type
  const edgesSec = panel.querySelector("#gs-edges-sec");
  const edgesBody = panel.querySelector("#gs-edges");
  function renderEdgeToggles() {
    if (edgeTypes.length <= 1) { edgesSec.style.display = "none"; return; }
    edgesBody.innerHTML = edgeTypes.map(t => `
      <label class="gs-toggle-row"><span><span class="edge-dot" style="background:${edgeColorOf(t)}"></span>${t}</span>
        <span class="gs-switch"><input type="checkbox" data-etype="${t}" ${includedEdgeTypes.has(t)?"checked":""}><i></i></span>
      </label>`).join("");
    edgesBody.querySelectorAll("input[data-etype]").forEach(inp => {
      inp.addEventListener("input", e => {
        const t = e.target.dataset.etype;
        e.target.checked ? includedEdgeTypes.add(t) : includedEdgeTypes.delete(t);
        applyFilter();
      });
    });
  }
  renderEdgeToggles();

  // groups UI
  const groupsEl = panel.querySelector("#gs-groups");
  function renderGroups() {
    groupsEl.innerHTML = groups.map((g,i)=>`
      <div class="gs-group">
        <input type="color" value="${g.color}" data-i="${i}" class="gs-gcolor">
        <input type="text" value="${g.query.replace(/"/g,'&quot;')}" placeholder="query e.g. #tag or 채소" data-i="${i}" class="gs-gquery">
        <button class="gs-icon gs-gdel" data-i="${i}">×</button>
      </div>`).join("");
    groupsEl.querySelectorAll(".gs-gcolor").forEach(inp =>
      inp.addEventListener("input", e => { groups[+e.target.dataset.i].color = e.target.value; recolor(); }));
    groupsEl.querySelectorAll(".gs-gquery").forEach(inp =>
      inp.addEventListener("input", e => { groups[+e.target.dataset.i].query = e.target.value; recolor(); }));
    groupsEl.querySelectorAll(".gs-gdel").forEach(btn =>
      btn.addEventListener("click", e => { groups.splice(+e.target.dataset.i,1); renderGroups(); recolor(); }));
  }
  panel.querySelector("#gs-newgroup").addEventListener("click", () => {
    groups.push({query:"", color:"#CD071E"});
    renderGroups();
  });

  // wire inputs
  const $ = id => panel.querySelector(id);
  let queryTimer;
  $("#gs-query").addEventListener("input", e => {
    clearTimeout(queryTimer);
    queryTimer = setTimeout(()=>{ S.query = e.target.value; applyFilter(); }, 250);
  });
  $("#gs-tags").addEventListener("input",     e => { S.showTagNodes = e.target.checked; applyFilter(); });
  $("#gs-attach").addEventListener("input",   e => { S.showAttachments = e.target.checked; /* no attachments in data */ });
  $("#gs-existing").addEventListener("input", e => { S.existingOnly = e.target.checked; applyFilter(); });
  $("#gs-orphans").addEventListener("input",  e => { S.showOrphans = e.target.checked; applyFilter(); });
  $("#gs-arrows").addEventListener("input",   e => { S.showArrows = e.target.checked; syncArrows(); });
  $("#gs-textfade").addEventListener("input", e => { S.textFade = +e.target.value; syncLabels(); });
  $("#gs-nodesize").addEventListener("input", e => { S.nodeSize = +e.target.value; syncNodeSize(); reheat(0.3); });
  $("#gs-linkthick").addEventListener("input",e => { S.linkThickness = +e.target.value; syncLinkThickness(); });
  $("#gs-animate").addEventListener("click",  () => { userMoved=false; reheat(1); });
  $("#gs-center").addEventListener("input",   e => { S.centerForce = +e.target.value; applyForceSettings(); reheat(0.5); });
  $("#gs-repel").addEventListener("input",    e => { S.repelForce = +e.target.value; applyForceSettings(); reheat(0.5); });
  $("#gs-linkforce").addEventListener("input",e => { S.linkForce = +e.target.value; applyForceSettings(); reheat(0.5); });
  $("#gs-linkdist").addEventListener("input", e => { S.linkDistance = +e.target.value; applyForceSettings(); reheat(0.5); });

  $("#gs-reset").addEventListener("click", () => {
    Object.assign(S, DEFAULTS);
    groups = [];
    includedTags.clear();
    allTags.forEach(t => { if (t !== "#synthetic_node") includedTags.add(t); });
    // sync UI
    $("#gs-query").value = "";
    $("#gs-tags").checked = S.showTagNodes;
    $("#gs-attach").checked = S.showAttachments;
    $("#gs-existing").checked = S.existingOnly;
    $("#gs-orphans").checked = S.showOrphans;
    $("#gs-arrows").checked = S.showArrows;
    $("#gs-textfade").value = S.textFade;
    $("#gs-nodesize").value = S.nodeSize;
    $("#gs-linkthick").value = S.linkThickness;
    $("#gs-center").value = S.centerForce;
    $("#gs-repel").value = S.repelForce;
    $("#gs-linkforce").value = S.linkForce;
    $("#gs-linkdist").value = S.linkDistance;
    includedEdgeTypes.clear();
    edgeTypes.forEach(t => includedEdgeTypes.add(t));
    renderEdgeToggles();
    renderGroups(); renderChips();
    syncNodeSize(); syncLinkThickness(); syncLabels(); syncArrows();
    applyFilter();
  });

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
      const detail = n.isTag ? "tag" : (n.url ? `${n.group} · click to open` : n.group);
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
  renderChips();
  applyFilter();
})();
