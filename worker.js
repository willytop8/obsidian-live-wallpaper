// Force-simulation worker. Runs d3.forceSimulation off the main thread and
// transfers [x,y,vx,vy] Float32Array back to the main thread on each tick.
importScripts('/vendor/d3.min.js');

let sim = null;
let nodes = [];
let links = [];
let clusterByTag = true;
let idleFrames = 0;
let generation = 0;

function forceCluster(alpha) {
  if (!clusterByTag) return;
  const centroids = Object.create(null);
  const counts = Object.create(null);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n.tag) continue;
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    if (!centroids[n.tag]) { centroids[n.tag] = { x: 0, y: 0 }; counts[n.tag] = 0; }
    centroids[n.tag].x += n.x;
    centroids[n.tag].y += n.y;
    counts[n.tag] += 1;
  }
  for (const t in centroids) {
    centroids[t].x /= counts[t];
    centroids[t].y /= counts[t];
  }
  const strength = 0.03 * alpha;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n.tag || !centroids[n.tag]) continue;
    n.vx = (Number.isFinite(n.vx) ? n.vx : 0) + (centroids[n.tag].x - n.x) * strength;
    n.vy = (Number.isFinite(n.vy) ? n.vy : 0) + (centroids[n.tag].y - n.y) * strength;
  }
}

function sendTick(type) {
  const len = nodes.length;
  const buf = new Float32Array(len * 4);
  for (let i = 0; i < len; i++) {
    const n = nodes[i];
    buf[i * 4] = n.x || 0;
    buf[i * 4 + 1] = n.y || 0;
    buf[i * 4 + 2] = n.vx || 0;
    buf[i * 4 + 3] = n.vy || 0;
  }
  postMessage(
    { type, buffer: buf.buffer, alpha: sim ? sim.alpha() : 0, generation, count: len },
    [buf.buffer]
  );
}

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg) return;

  if (msg.type === 'start') {
    if (sim) { sim.stop(); sim = null; }
    generation = msg.generation || (generation + 1);
    nodes = msg.nodes || [];
    links = msg.links || [];
    clusterByTag = !!msg.clusterByTag;
    idleFrames = 0;

    const count = nodes.length;
    if (count === 0) { sendTick('stopped'); return; }

    const isMassive = count > 3000;
    const charge = isMassive ? -4 : count > 600 ? -10 : count > 200 ? -15 : count > 50 ? -25 : -30;
    const distance = isMassive ? 16 : count > 600 ? 24 : count > 200 ? 30 : 40;

    sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(n => n.id).distance(distance).strength(isMassive ? 0.15 : 0.3))
      .force('charge', d3.forceManyBody().strength(charge).theta(isMassive ? 1.2 : 0.9))
      .force('center', d3.forceCenter(msg.centerX || 0, msg.centerY || 0))
      .force('collide', isMassive ? null : d3.forceCollide().radius(n => (n.r || 4) + 2))
      .alphaDecay(isMassive ? 0.05 : count > 600 ? 0.03 : 0.02)
      .velocityDecay(isMassive ? 0.75 : count > 600 ? 0.68 : 0.6)
      .on('tick', () => {
        const a = sim.alpha();
        if (a < 0.02) {
          idleFrames += 1;
          if (idleFrames >= 30) {
            sim.stop();
            sendTick('stopped');
            return;
          }
        } else {
          idleFrames = 0;
        }
        forceCluster(a);
        sendTick('tick');
      });
  } else if (msg.type === 'stop') {
    if (sim) { sim.stop(); }
  } else if (msg.type === 'setCluster') {
    clusterByTag = !!msg.clusterByTag;
  }
};
