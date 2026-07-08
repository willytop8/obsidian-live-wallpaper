// Force-simulation worker. Runs d3.forceSimulation off the main thread.
// When SharedArrayBuffer is available, positions are written into shared memory
// and the main thread reads them directly; otherwise we fall back to throttled
// postMessage snapshots of x/y only.
importScripts('/vendor/d3.min.js');

let sim = null;
let nodes = [];
let links = [];
let clusterByTag = true;
let idleFrames = 0;
let generation = 0;
let sharedPositions = null;
let useSharedPositions = false;
let lastTickPostAt = 0;
let snapBuf = null; // reused snapshot buffer for the non-shared fallback path

const SNAPSHOT_INTERVAL_MS = 50;

// Node-count tiers driving simulation cost: fewer/weaker forces as the graph
// grows, so a large vault stays responsive instead of grinding to a crawl.
const MASSIVE_NODE_THRESHOLD = 3000;
const LARGE_NODE_THRESHOLD = 600;
const MEDIUM_NODE_THRESHOLD = 200;
const SMALL_NODE_THRESHOLD = 50;

// Simulation is considered settled once alpha decays below this and stays
// there for IDLE_FRAMES_TO_STOP consecutive ticks.
const IDLE_ALPHA_THRESHOLD = 0.02;
const IDLE_FRAMES_TO_STOP = 30;

function forceCluster(alpha) {
  if (!clusterByTag) return;
  const centroids = Object.create(null);
  const counts = Object.create(null);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.tag) continue;
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
    if (!centroids[node.tag]) {
      centroids[node.tag] = { x: 0, y: 0 };
      counts[node.tag] = 0;
    }
    centroids[node.tag].x += node.x;
    centroids[node.tag].y += node.y;
    counts[node.tag] += 1;
  }
  for (const tag in centroids) {
    centroids[tag].x /= counts[tag];
    centroids[tag].y /= counts[tag];
  }
  const strength = 0.03 * alpha;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node.tag || !centroids[node.tag]) continue;
    node.vx = (Number.isFinite(node.vx) ? node.vx : 0) + (centroids[node.tag].x - node.x) * strength;
    node.vy = (Number.isFinite(node.vy) ? node.vy : 0) + (centroids[node.tag].y - node.y) * strength;
  }
}

function publishPositions() {
  if (!useSharedPositions || !sharedPositions) return;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    sharedPositions[i * 2] = Number.isFinite(node.x) ? node.x : 0;
    sharedPositions[i * 2 + 1] = Number.isFinite(node.y) ? node.y : 0;
  }
}

function sendSnapshot(type, force) {
  const now = performance.now();
  if (!force && now - lastTickPostAt < SNAPSHOT_INTERVAL_MS) return;
  lastTickPostAt = now;

  if (useSharedPositions) {
    postMessage({ type, alpha: sim ? sim.alpha() : 0, generation, count: nodes.length });
    return;
  }

  const len = nodes.length;
  // Reuse one buffer across ticks instead of allocating each time. We post a
  // (structured-clone) copy rather than transferring, so the buffer stays owned
  // by the worker and the main thread receives its own copy.
  if (!snapBuf || snapBuf.length !== len * 2) snapBuf = new Float32Array(len * 2);
  for (let i = 0; i < len; i++) {
    const node = nodes[i];
    snapBuf[i * 2] = Number.isFinite(node.x) ? node.x : 0;
    snapBuf[i * 2 + 1] = Number.isFinite(node.y) ? node.y : 0;
  }
  postMessage({ type, buffer: snapBuf.buffer, alpha: sim ? sim.alpha() : 0, generation, count: len });
}

self.onmessage = (e) => {
  const msg = e.data;
  if (!msg) return;

  if (msg.type === 'start') {
    if (sim) {
      sim.stop();
      sim = null;
    }

    generation = msg.generation || (generation + 1);
    nodes = msg.nodes || [];
    links = msg.links || [];
    clusterByTag = !!msg.clusterByTag;
    idleFrames = 0;
    lastTickPostAt = 0;

    useSharedPositions = !!msg.sharedBuffer;
    sharedPositions = useSharedPositions ? new Float32Array(msg.sharedBuffer) : null;

    const count = nodes.length;
    if (count === 0) {
      sendSnapshot('stopped', true);
      return;
    }

    const isMassive = count > MASSIVE_NODE_THRESHOLD;
    const charge = isMassive ? -4
      : count > LARGE_NODE_THRESHOLD ? -10
      : count > MEDIUM_NODE_THRESHOLD ? -15
      : count > SMALL_NODE_THRESHOLD ? -25
      : -30;
    const distance = isMassive ? 16
      : count > LARGE_NODE_THRESHOLD ? 24
      : count > MEDIUM_NODE_THRESHOLD ? 30
      : 40;

    sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(node => node.id).distance(distance).strength(isMassive ? 0.15 : 0.3))
      .force('charge', d3.forceManyBody().strength(charge).theta(isMassive ? 1.2 : 0.9))
      .force('center', d3.forceCenter(msg.centerX || 0, msg.centerY || 0))
      .force('collide', isMassive ? null : d3.forceCollide().radius(node => (node.r || 4) + 2))
      .alphaDecay(isMassive ? 0.05 : count > LARGE_NODE_THRESHOLD ? 0.03 : 0.02)
      .velocityDecay(isMassive ? 0.75 : count > LARGE_NODE_THRESHOLD ? 0.68 : 0.6)
      .on('tick', () => {
        const alpha = sim.alpha();
        if (alpha < IDLE_ALPHA_THRESHOLD) {
          idleFrames += 1;
          if (idleFrames >= IDLE_FRAMES_TO_STOP) {
            publishPositions();
            sim.stop();
            sendSnapshot('stopped', true);
            return;
          }
        } else {
          idleFrames = 0;
        }

        forceCluster(alpha);
        publishPositions();
        sendSnapshot('tick', false);
      });

    publishPositions();
    sendSnapshot('tick', true);
  } else if (msg.type === 'stop') {
    if (sim) sim.stop();
    publishPositions();
    sendSnapshot('stopped', true);
  } else if (msg.type === 'setCluster') {
    clusterByTag = !!msg.clusterByTag;
  }
};
