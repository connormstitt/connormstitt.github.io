// Obsidian-style graph — Barnes-Hut quad-tree repulsion for organic layout.
// Tags from Obsidian are used to drive filter chips.

window.PLACEHOLDER_GRAPH = {
  nodes: [
    { id:"root", label:"한국어", group:"topic", deg:4, tags:[] },
    { id:"v1", label:"안녕하세요", group:"vocab", deg:1, tags:[] },
    { id:"v2", label:"감사합니다", group:"vocab", deg:1, tags:[] },
    { id:"v3", label:"사랑", group:"vocab", deg:2, tags:[] },
    { id:"v4", label:"가다", group:"vocab", deg:3, tags:[] },
    { id:"v5", label:"먹다", group:"vocab", deg:2, tags:[] },
    { id:"g1", label:"-는데", group:"grammar", deg:2, tags:[] },
    { id:"g2", label:"-아/어서", group:"grammar", deg:2, tags:[] },
    { id:"g3", label:"-고 있다", group:"grammar", deg:3, tags:[] },
  ],
  links:[
    {source:"root",target:"v1"},{source:"root",target:"v2"},{source:"root",target:"g1"},
    {source:"v4",target:"g3"},{source:"v5",target:"g3"},{source:"v4",target:"g2"},
    {source:"v3",target:"g1"},{source:"v1",target:"v2"},{source:"g1",target:"g2"},
  ],
};

// ── Barnes-Hut quad-tree ──────────────────────────────────────────────────
function buildTree(nodes) {
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  nodes.forEach(n=>{ x0=Math.min(x0,n.x);y0=Math.min(y0,n.y);x1=Math.max(x1,n.x);y1=Math.max(y1,n.y); });
  const root = { x0,y0,x1,y1, cx:0,cy:0, mass:0, children:null, node:null };

  function insert(cell, n) {
    if (cell.node === null && cell.children === null) {
      cell.node = n; cell.cx = n.x; cell.cy = n.y; cell.mass = 1; return;
    }
    if (cell.children === null) {
      cell.children = subdivide(cell);
      const old = cell.node; cell.node = null;
      insert(cell.children[quadrant(cell,old)], old);
    }
    insert(cell.children[quadrant(cell,n)], n);
    cell.mass++; cell.cx += (n.x - cell.cx) / cell.mass; cell.cy += (n.y - cell.cy) / cell.mass;
  }

  function subdivide(c) {
    const mx=(c.x0+c.x1)/2, my=(c.y0+c.y1)/2;
    return [
      {x0:c.x0,y0:c.y0,x1:mx,  y1:my,   cx:0,cy:0,mass:0,children:null,node:null},
      {x0:mx,  y0:c.y0,x1:c.x1,y1:my,   cx:0,cy:0,mass:0,children:null,node:null},
      {x0:c.x0,y0:my,  x1:mx,  y1:c.y1, cx:0,cy:0,mass:0,children:null,node:null},
      {x0:mx,  y0:my,  x1:c.x1,y1:c.y1, cx:0,cy:0,mass:0,children:null,node:null},
    ];
  }

  function quadrant(c,n) {
    const mx=(c.x0+c.x1)/2, my=(c.y0+c.y1)/2;
    return (n.x<mx?0:1) + (n.y<my?0:2);
  }

  nodes.forEach(n => insert(root, n));
  return root;
}

function applyRepulsion(n, cell, theta, strength) {
  if (!cell || cell.mass === 0) return;
  const dx = n.x - cell.cx, dy = n.y - cell.cy;
  const d2 = dx*dx + dy*dy || 0.01;
  const d  = Math.sqrt(d2);
  const size = Math.max(cell.x1-cell.x0, cell.y1-cell.y0);
  if (cell.node !== null && cell.node !== n || size/d < theta) {
    const f = strength * cell.mass / d2;
    n.vx += (dx/d)*f; n.vy += (dy/d)*f;
  } else if (cell.children) {
    cell.children.forEach(ch => applyRepulsion(n, ch, theta, strength));
  }
}

(function initGraph() {
  const wrap     = document.getElementById("graph-wrap");
  const svg      = document.getElementById("graph-svg");
  const tooltip  = document.getElementById("graph-tooltip");
  const filterEl = document.getElementById("graph-filters");
  const countEl  = document.getElementById("node-count");
  if (!wrap || !svg) return;

  const usingVault = !!(window.VAULT_GRAPH?.nodes?.length);
  const raw = usingVault ? window.VAULT_GRAPH : window.PLACEHOLDER_GRAPH;

  const svgNS = "http://www.w3.org/2000/svg";
  let clientW = wrap.clientWidth;
  let clientH = wrap.clientHeight;

  // ── palette ───────────────────────────────────────────────────────────────
  const PALETTE = [
    "#1e407c","#6b93d6","#d9a900","#7c6bb0","#3f8f7a",
    "#c46a4f","#8a6d3b","#4d7ea8","#5a9e6f","#a05070",
    "#4a7090","#9a7030","#607890","#706090","#508060",
  ];
  const groupOrder = [];
  raw.nodes.forEach(n => { if (!groupOrder.includes(n.group)) groupOrder.push(n.group); });
  const colorOf = n => PALETTE[groupOrder.indexOf(n.group) % PALETTE.length] || "#888";

  // ── all tags ──────────────────────────────────────────────────────────────
  const allTags = [...new Set(raw.nodes.flatMap(n => n.tags || []))].sort();

  const updateCount = (visN) => {
    if (!countEl) return;
    const base = `${raw.nodes.length} nodes · ${raw.links.length} links` +
      (usingVault ? ` · ${raw.source||"vault"}` : " · sample data");
    countEl.textContent = visN < raw.nodes.length ? base + ` (${visN} shown)` : base;
  };
  updateCount(raw.nodes.length);

  // ── nodes ─────────────────────────────────────────────────────────────────
  const jitter = () => (Math.random()-0.5)*60;
  const nodes = raw.nodes.map((n,i) => {
    // Random Gaussian-ish spread, not a ring — avoids grid artefacts
    const angle = Math.random()*Math.PI*2;
    const r = Math.sqrt(Math.random()) * Math.min(clientW,clientH)*0.3;
    return {
      ...n,
      tags: n.tags || [],
      url: usingVault && n.id.endsWith(".md") ? "vault/"+n.id : null,
      r: Math.max(4, Math.min(14, 4 + 1.6*Math.sqrt(n.deg||1))),
      x: clientW/2 + Math.cos(angle)*r + jitter(),
      y: clientH/2 + Math.sin(angle)*r + jitter(),
      vx:0, vy:0,
    };
  });
  const nodeById = Object.fromEntries(nodes.map(n=>[n.id,n]));
  const links = (raw.links||[])
    .filter(l=>nodeById[l.source]&&nodeById[l.target])
    .map(l=>({source:nodeById[l.source],target:nodeById[l.target]}));

  // ── camera ────────────────────────────────────────────────────────────────
  const vb = {x:0,y:0,w:clientW,h:clientH};
  let userMoved = false;
  const applyVB = () => svg.setAttribute("viewBox",`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  const toWorld = (px,py) => ({x:vb.x+(px/clientW)*vb.w, y:vb.y+(py/clientH)*vb.h});

  function autoFit() {
    const src = activeNodes.length ? activeNodes : nodes;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    src.forEach(n=>{ x0=Math.min(x0,n.x);x1=Math.max(x1,n.x);y0=Math.min(y0,n.y);y1=Math.max(y1,n.y); });
    const pad=50, aspect=clientW/clientH;
    x0-=pad;y0-=pad;x1+=pad;y1+=pad;
    let w=x1-x0,h=y1-y0;
    if(w/h<aspect){const nw=h*aspect;x0-=(nw-w)/2;w=nw;}
    else{const nh=w/aspect;y0-=(nh-h)/2;h=nh;}
    vb.x=x0;vb.y=y0;vb.w=w;vb.h=h;applyVB();
  }

  // ── SVG ──────────────────────────────────────────────────────────────────
  const linkEls = links.map(()=>{
    const line=document.createElementNS(svgNS,"line");
    line.setAttribute("stroke","rgba(30,64,124,0.18)");
    line.setAttribute("stroke-width","1");
    svg.appendChild(line); return line;
  });

  const nodeGroups = nodes.map(n=>{
    const g=document.createElementNS(svgNS,"g");
    g.style.cursor=n.url?"pointer":"grab";

    const glow=document.createElementNS(svgNS,"circle");
    glow.setAttribute("r",n.r+4);
    glow.setAttribute("fill",colorOf(n));
    glow.setAttribute("opacity","0.12");
    g.appendChild(glow);

    const circle=document.createElementNS(svgNS,"circle");
    circle.setAttribute("r",n.r);
    circle.setAttribute("fill",colorOf(n));
    circle.setAttribute("stroke","#fff");
    circle.setAttribute("stroke-width","1.5");
    g.appendChild(circle);

    const text=document.createElementNS(svgNS,"text");
    text.setAttribute("text-anchor","middle");
    text.setAttribute("y",n.r+13);
    text.setAttribute("fill","#33415c");
    text.setAttribute("font-size","10");
    text.setAttribute("font-family","Noto Sans KR, sans-serif");
    text.style.pointerEvents="none";
    text.textContent=n.label;
    g.appendChild(text);

    svg.appendChild(g); return g;
  });

  // ── tag filter (tags only; #synthetic_node hidden by default) ─────────────
  const hiddenTags = new Set();
  if (allTags.includes("#synthetic_node")) hiddenTags.add("#synthetic_node");

  // activeNodes / activeLinks are what the physics actually simulates
  let activeNodes = nodes.slice();
  let activeLinks = links.slice();

  function applyFilter() {
    const visibleIds = new Set();
    nodes.forEach((n,i)=>{
      const hide = n.tags.some(t=>hiddenTags.has(t));
      nodeGroups[i].style.display = hide ? "none" : "";
      if (!hide) visibleIds.add(n.id);
    });
    linkEls.forEach((line,i)=>{
      const s=links[i].source, t=links[i].target;
      line.style.display = (visibleIds.has(s.id) && visibleIds.has(t.id)) ? "" : "none";
    });

    // Re-scope the simulation to visible nodes/links, then re-estimate layout
    activeNodes = nodes.filter(n => visibleIds.has(n.id));
    activeLinks = links.filter(l => visibleIds.has(l.source.id) && visibleIds.has(l.target.id));
    userMoved = false;      // camera re-fits to the new layout
    kick(1);                // full re-run of the force simulation

    updateCount(visibleIds.size);
  }

  function renderFilters() {
    if (!filterEl) return;
    if (allTags.length === 0) {
      filterEl.innerHTML = usingVault
        ? `<span class="chip-label">no tags in data — re-run the console snippet (tag-capturing version) and re-paste into korean-graph-data.js</span>`
        : "";
      return;
    }
    filterEl.innerHTML =
      `<span class="chip-label">hide:</span>` +
      allTags.map(t =>
        `<button class="tag-chip${hiddenTags.has(t)?" active":""}" data-val="${t}">${t}</button>`
      ).join("");
    filterEl.querySelectorAll(".tag-chip").forEach(btn=>{
      btn.addEventListener("click",()=>{
        const val = btn.dataset.val;
        hiddenTags.has(val) ? hiddenTags.delete(val) : hiddenTags.add(val);
        applyFilter(); renderFilters();
      });
    });
  }

  // ── physics: Barnes-Hut + spring + centering ──────────────────────────────
  let alpha=1, running=false, draggingNode=null;
  const REPEL=3200, THETA=0.8, LINK_LEN=60, LINK_K=0.03, CENTER_K=0.0015;

  function step() {
    // Barnes-Hut repulsion — only active nodes
    const tree = buildTree(activeNodes);
    activeNodes.forEach(n=>{
      if(n===draggingNode)return;
      applyRepulsion(n, tree, THETA, REPEL*alpha);
    });

    // Spring attraction — only active links
    activeLinks.forEach(l=>{
      const dx=l.target.x-l.source.x, dy=l.target.y-l.source.y;
      const d=Math.sqrt(dx*dx+dy*dy)||0.01;
      const f=(d-LINK_LEN)*LINK_K*alpha;
      const fx=(dx/d)*f, fy=(dy/d)*f;
      if(l.source!==draggingNode){l.source.vx+=fx;l.source.vy+=fy;}
      if(l.target!==draggingNode){l.target.vx-=fx;l.target.vy-=fy;}
    });

    // Centering + integrate + dampen — only active nodes
    const cx=clientW/2, cy=clientH/2;
    activeNodes.forEach(n=>{
      if(n===draggingNode)return;
      n.vx+=(cx-n.x)*CENTER_K*alpha;
      n.vy+=(cy-n.y)*CENTER_K*alpha;
      if(alpha>0.3){n.vx+=(Math.random()-0.5)*0.4;n.vy+=(Math.random()-0.5)*0.4;}
      n.vx*=0.78; n.vy*=0.78;
      n.x+=n.vx; n.y+=n.vy;
    });

    linkEls.forEach((line,i)=>{
      line.setAttribute("x1",links[i].source.x);
      line.setAttribute("y1",links[i].source.y);
      line.setAttribute("x2",links[i].target.x);
      line.setAttribute("y2",links[i].target.y);
    });
    nodeGroups.forEach((g,i)=>g.setAttribute("transform",`translate(${nodes[i].x},${nodes[i].y})`));

    if(!userMoved) autoFit();
    alpha*=0.994;
    if(alpha>0.01||draggingNode) requestAnimationFrame(step);
    else running=false;
  }

  function kick(a=1){alpha=Math.max(alpha,a);if(!running){running=true;requestAnimationFrame(step);}}

  // ── pointer helpers ───────────────────────────────────────────────────────
  function localPoint(evt){
    const rect=wrap.getBoundingClientRect();
    const cx=evt.touches?evt.touches[0].clientX:evt.clientX;
    const cy=evt.touches?evt.touches[0].clientY:evt.clientY;
    return{x:cx-rect.left,y:cy-rect.top};
  }

  // ── node interactions ─────────────────────────────────────────────────────
  nodeGroups.forEach((g,i)=>{
    const n=nodes[i]; let downAt=null;
    const startDrag=evt=>{
      evt.stopPropagation();evt.preventDefault();
      draggingNode=n;downAt=localPoint(evt);userMoved=true;kick(0.3);
    };
    g.addEventListener("mousedown",startDrag);
    g.addEventListener("touchstart",startDrag,{passive:false});
    g.addEventListener("mouseup",evt=>{
      if(!downAt)return;
      const p=localPoint(evt);
      if(Math.hypot(p.x-downAt.x,p.y-downAt.y)<5&&n.url) window.open(n.url,"_blank");
      downAt=null;
    });
    const showTip=evt=>{
      if(!tooltip)return;
      const p=localPoint(evt);
      tooltip.style.left=p.x+"px";tooltip.style.top=p.y+"px";
      const detail=n.url?`${n.group} · click to open`:n.group;
      const tagStr=n.tags.length?` <span style="opacity:.6">${n.tags.join(" ")}</span>`:"";
      tooltip.innerHTML=`<span class="kr">${n.label}</span>${detail}${tagStr}`;
      tooltip.style.opacity="1";
    };
    g.addEventListener("mouseenter",showTip);
    g.addEventListener("mousemove",showTip);
    g.addEventListener("mouseleave",()=>{if(tooltip)tooltip.style.opacity="0";});
  });

  // ── pan ───────────────────────────────────────────────────────────────────
  let panFrom=null;
  svg.addEventListener("mousedown",evt=>{panFrom=localPoint(evt);userMoved=true;});
  svg.addEventListener("touchstart",evt=>{
    if(evt.touches.length===1&&!draggingNode){panFrom=localPoint(evt);userMoved=true;}
  },{passive:true});
  const onMove=evt=>{
    const p=localPoint(evt);
    if(draggingNode){
      const w=toWorld(p.x,p.y);draggingNode.x=w.x;draggingNode.y=w.y;
      draggingNode.vx=0;draggingNode.vy=0;kick(0.2);
      if(evt.cancelable)evt.preventDefault();
    } else if(panFrom){
      vb.x-=(p.x-panFrom.x)*(vb.w/clientW);
      vb.y-=(p.y-panFrom.y)*(vb.h/clientH);
      panFrom=p;applyVB();
    }
  };
  const onEnd=()=>{draggingNode=null;panFrom=null;};
  window.addEventListener("mousemove",onMove);
  window.addEventListener("touchmove",onMove,{passive:false});
  window.addEventListener("mouseup",onEnd);
  window.addEventListener("touchend",onEnd);

  // ── wheel zoom ────────────────────────────────────────────────────────────
  function onWheel(evt){
    evt.preventDefault();evt.stopPropagation();userMoved=true;
    const factor=evt.deltaY>0?1.2:1/1.2;
    const scale=clientW/(vb.w*factor);
    if(scale<0.02||scale>12)return;
    const p=localPoint(evt),w=toWorld(p.x,p.y);
    vb.x=w.x-(w.x-vb.x)*factor;vb.y=w.y-(w.y-vb.y)*factor;
    vb.w*=factor;vb.h*=factor;applyVB();
  }
  wrap.addEventListener("wheel",onWheel,{passive:false});
  svg.addEventListener("wheel",onWheel,{passive:false});

  window.addEventListener("resize",()=>{
    clientW=wrap.clientWidth;clientH=wrap.clientHeight;
    if(!userMoved)autoFit();
  });

  applyVB();
  renderFilters();
  applyFilter();   // applies the default #synthetic_node filter and starts the sim
})();
