const { Graph } = require('graphology');
const { connectedComponents } = require('graphology-components');


function xorshift32(seed) {
  let x = seed >>> 0;
  return function() {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    // map to [0,1)
    return (x >>> 0) / 0x100000000;
  };
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function edgeWeight(graph, s, t) {
  const ek = graph.edge(s, t);
  return ek ? (graph.getEdgeAttribute(ek, 'weight') ?? 1) : 0;
}

/* ----------------------- 前置快取 ----------------------- */
// 建立圖的基本量：m、k[i]（度數）
function computeGraphBase(graph) {
  let m = 0;
  const k = {};
  graph.forEachNode(n => { k[n] = 0; });
  graph.forEachEdge((key, attrs, s, t) => {
    const w = attrs.weight ?? 1;
    m += w;
    k[s] += w;
    k[t] += w;
  });
  return { m, k }; // m 是「每邊算一次」的總權重
}

// 依 communities 彙總 tot[c]（社群度數總和）
function computeTotByCommunity(graph, communities, k) {
  const tot = {};
  for (const n in communities) {
    const c = communities[n];
    tot[c] = (tot[c] ?? 0) + (k[n] ?? 0);
  }
  return tot;
}

/* ----------------------- 模組度 Q（正確公式） ----------------------- */
function calculateModularity(graph, communities) {
  if (graph.order === 0) return 0;
  let m = 0;
  const k = {};
  graph.forEachNode(n => { k[n] = 0; });
  graph.forEachEdge((key, attrs, s, t) => {
    const w = attrs.weight ?? 1;
    m += w;
    k[s] += w;
    k[t] += w;
  });
  if (m === 0) return 0;

  const Lc = {};
  const dc = {};
  for (const n in communities) {
    const c = communities[n];
    dc[c] = (dc[c] ?? 0) + (k[n] ?? 0);
  }
  graph.forEachEdge((key, attrs, s, t) => {
    const w = attrs.weight ?? 1;
    if (communities[s] === communities[t]) {
      Lc[communities[s]] = (Lc[communities[s]] ?? 0) + w;
    }
  });

  let Q = 0;
  for (const c in dc) {
    const L = Lc[c] ?? 0;
    const d = dc[c];
    Q += (L / m) - (d * d) / (4 * m * m);
  }
  return Q;
}

/* ----------------------- ΔQ（加入目標社群的增益） ----------------------- */

function deltaQ_addToCommunity(graph, node, targetC, communities, cache) {
  const { m, k, tot } = cache;
  if (m === 0) return 0;
  let kin = 0; // k_{i,in(C)}
  graph.forEachEdge(node, (ek, attrs, s, t) => {
    const nb = s === node ? t : s;
    if (communities[nb] === targetC) {
      kin += (attrs.weight ?? 1);
    }
  });
  const ki = k[node] ?? 0;
  const totC = tot[targetC] ?? 0;
  return (kin / m) - (ki * totC) / (2 * m * m);
}

/* ----------------------- 局部移動（Louvain 核心） ----------------------- */
// 維護 tot[c]。每次移動節點 i：先自原社群 R 移除並更新 tot，
// 再計算將 i 加入各個鄰近社群 C 的 ΔQ，選擇正增益中最大的目標。
function localMovingPhase(graph, initialCommunities, options = {}) {
  const { seed = 0xDEADBEEF, maxIterations = 10 } = options;
  if (graph.order === 0) return initialCommunities;

  // 初始
  const communities = { ...initialCommunities };
  const { m, k } = computeGraphBase(graph);
  const tot = computeTotByCommunity(graph, communities, k);
  const cache = { m, k, tot };

  const nodes = graph.nodes();

  const rng = xorshift32(seed >>> 0);
  let improved = true;
  let iter = 0;

  while (improved && iter < maxIterations) {
    iter += 1;
    improved = false;

    const order = nodes.slice();
    shuffleInPlace(order, rng);

    for (const i of order) {
      const Ri = communities[i];         // 原社群
      const ki = k[i] ?? 0;
      if (ki === 0) continue;

      // 找鄰接的候選社群
      const neighborCommunities = new Set();
      graph.forEachEdge(i, (ek, attrs, s, t) => {
        const nb = s === i ? t : s;
        neighborCommunities.add(communities[nb]);
      });

      // 先從原社群移除（更新 tot[Ri]）
      cache.tot[Ri] = (cache.tot[Ri] ?? 0) - ki;
      communities[i] = null; // 暫時移出

      let bestGain = 0;
      let bestC = Ri;

      for (const C of neighborCommunities) {
        if (C == null) continue;
        const gainAdd = deltaQ_addToCommunity(graph, i, C, communities, cache);
        if (gainAdd > bestGain) {
          bestGain = gainAdd;
          bestC = C;
        }
      }

      // 若沒有正增益，回到原社群；否則加入最佳社群
      const target = bestGain > 0 ? bestC : Ri;
      communities[i] = target;
      cache.tot[target] = (cache.tot[target] ?? 0) + ki;

      if (target !== Ri) improved = true;
    }
  }

  return communities;
}

/* ----------------------- Leiden 精煉（refinement） ----------------------- */
// 對每個社群建立誘導子圖；若不連通，先拆成連通分量（分離出弱連結子集）。
// 接著對被拆出的單點／小分量，僅允許其合併回「可提升 Q 且合併後仍維持連通」的鄰近社群。
function refinementPhase(graph, communities, options = {}) {
  const { m, k } = computeGraphBase(graph);
  if (m === 0) return communities;

  // 1) 依社群分組
  const byC = {};
  for (const n in communities) {
    const c = communities[n];
    (byC[c] ??= []).push(n);
  }

  // 2) 對每個社群：建立子圖並檢查連通分量
  for (const cId of Object.keys(byC)) {
    const nodes = byC[cId];
    if (nodes.length <= 1) continue;

    // 建子圖
    const sub = new Graph({ type: 'undirected', multi: false, allowSelfLoops: true });
    nodes.forEach(n => sub.addNode(n));
    nodes.forEach(n => {
      graph.forEachEdge(n, (ek, attrs, s, t) => {
        const nb = s === n ? t : s;
        if (sub.hasNode(nb) && !sub.hasEdge(n, nb)) {
          sub.addEdge(n, nb, { weight: attrs.weight ?? 1 });
        }
      });
    });

    const comps = connectedComponents(sub);
    if (comps.length <= 1) continue;

    // 3) 釋放不連通子集：將每個分量分配新社群ID（先做拆分）
    comps.forEach((comp, idx) => {
      const newC = `${cId}~${idx}`;
      comp.forEach(n => { communities[n] = newC; });
    });
  }

  // 4) 受限合併：對剛拆出的單點／小分量，嘗試合併到鄰近社群，但需同時滿足：
  //    (a) ΔQ > 0（沿用局部移動的計算），
  //    (b) 合併後目標社群在 C ∪ {i} 的誘導子圖中仍為單一連通成分。
  //    這裡以「單次掃描」的簡化版本實作：逐點檢查並合併。
  const tot = computeTotByCommunity(graph, communities, k);
  const cache = { m, k, tot };

  const nodeOrder = graph.nodes();
  for (const i of nodeOrder) {
    const Ci = communities[i];
    const ki = k[i] ?? 0;
    if (ki === 0) continue;

    // 找鄰接社群
    const neighborCommunities = new Set();
    graph.forEachEdge(i, (ek, attrs, s, t) => {
      const nb = s === i ? t : s;
      neighborCommunities.add(communities[nb]);
    });

    // 從原社群暫時移除
    cache.tot[Ci] = (cache.tot[Ci] ?? 0) - ki;
    communities[i] = null;

    let bestGain = 0;
    let bestC = Ci;

    for (const C of neighborCommunities) {
      if (C == null) continue;
      const gainAdd = deltaQ_addToCommunity(graph, i, C, communities, cache);
      if (gainAdd > bestGain) {
        // 連通性檢查：將 i 併入 C 後，C ∪ {i} 的誘導子圖是否仍為單一連通成分？
        // 簡化作法：直接在 C ∪ {i} 的誘導子圖上做一次連通性檢查
        if (isConnectedAfterMerge(graph, C, i, communities)) {
          bestGain = gainAdd;
          bestC = C;
        }
      }
    }

    const target = bestGain > 0 ? bestC : Ci;
    communities[i] = target;
    cache.tot[target] = (cache.tot[target] ?? 0) + ki;
  }

  return communities;
}

// 在 C ∪ {i} 的誘導子圖檢查是否連通（簡化版：以一次 BFS/連通分量檢查）
function isConnectedAfterMerge(graph, C, i, communities) {
  const nodes = [];
  for (const n in communities) {
    if (communities[n] === C) nodes.push(n);
  }
  nodes.push(i);
  if (nodes.length <= 2) return true;

  const sub = new Graph({ type: 'undirected', multi: false, allowSelfLoops: true });
  nodes.forEach(n => sub.addNode(n));
  nodes.forEach(n => {
    graph.forEachEdge(n, (ek, attrs, s, t) => {
      const nb = s === n ? t : s;
      if (sub.hasNode(nb) && !sub.hasEdge(n, nb)) {
        sub.addEdge(n, nb, { weight: attrs.weight ?? 1 });
      }
    });
  });
  const comps = connectedComponents(sub);
  return comps.length === 1;
}

/* ----------------------- 聚合（含自迴圈 self-loop） ----------------------- */
function aggregationPhase(graph, communities) {
  const agg = new Graph({ type: 'undirected', multi: false, allowSelfLoops: true });

  // 超節點
  const members = {};
  graph.forEachNode(n => {
    const c = communities[n];
    if (!agg.hasNode(c)) agg.addNode(c, { size: 0, nodes: [] });
    agg.setNodeAttribute(c, 'size', agg.getNodeAttribute(c, 'size') + 1);
    agg.setNodeAttribute(c, 'nodes', [...agg.getNodeAttribute(c, 'nodes'), n]);
    (members[c] ??= []).push(n);
  });

  // 自迴圈權重
  const selfW = {};
  graph.forEachEdge((key, attrs, s, t) => {
    const w = attrs.weight ?? 1;
    const cs = communities[s], ct = communities[t];
    if (cs === ct) {
      selfW[cs] = (selfW[cs] ?? 0) + w;
    }
  });
  for (const c in selfW) {
    if (!agg.hasEdge(c, c)) agg.addEdge(c, c, { weight: selfW[c] });
    else {
      const ek = agg.edge(c, c);
      agg.setEdgeAttribute(ek, 'weight', agg.getEdgeAttribute(ek, 'weight') + selfW[c]);
    }
  }

  // 跨社群邊
  const inter = new Map(); // key: a|b (a<b)
  graph.forEachEdge((key, attrs, s, t) => {
    const w = attrs.weight ?? 1;
    const cs = communities[s], ct = communities[t];
    if (cs !== ct) {
      const [a, b] = cs < ct ? [cs, ct] : [ct, cs];
      const k2 = `${a}|${b}`;
      inter.set(k2, (inter.get(k2) ?? 0) + w);
    }
  });
  for (const [k2, w] of inter) {
    const [a, b] = k2.split('|');
    if (!agg.hasEdge(a, b)) agg.addEdge(a, b, { weight: w });
    else {
      const ek = agg.edge(a, b);
      agg.setEdgeAttribute(ek, 'weight', agg.getEdgeAttribute(ek, 'weight') + w);
    }
  }

  return agg;
}

/* ----------------------- 完整 Leiden（層級化） ----------------------- */
function _computeLeidenCommunities(graph, options = {}) {
  const {
    useLcc = true,
    maxLevels = 3,
    seed = 0xDEADBEEF,
    maxLocalIters = 10,
    verbose = false
  } = options;

  if (graph.order === 0) return {};

  // 可選：僅取最大連通分量（Largest Connected Component, LCC）
  let working = graph;
  if (useLcc) {
    const comps = connectedComponents(graph);
    if (comps.length === 0) {
      return {};
    }
    
    const lcc = comps.reduce((a, b) => (b.length > a.length ? b : a));
    const sub = new Graph({ type: 'undirected', multi: false, allowSelfLoops: true });
    lcc.forEach(n => sub.addNode(n, graph.getNodeAttributes(n)));
    graph.forEachEdge((key, attrs, s, t) => {
      if (sub.hasNode(s) && sub.hasNode(t) && !sub.hasEdge(s, t)) {
        sub.addEdge(s, t, attrs);
      }
    });
    working = sub;
  }

  // 初始：每個節點為一個社群
  let communities = {};
  working.forEachNode(n => { communities[n] = n; });

  const perLevel = {};
  let current = working;
  let level = 0;

  while (level < maxLevels && current.order >= 1) {
    if (verbose) console.log(`[Leiden] Level ${level}: nodes=${current.order}, edges=${current.size}`);

    // 1) Local moving（嚴謹 Louvain）
    communities = localMovingPhase(current, communities, {
      seed: (seed + level) >>> 0,
      maxIterations: maxLocalIters
    });

    // 2) Refinement（Leiden 精煉）
    communities = refinementPhase(current, communities);

    perLevel[level] = { ...communities };

    // 3) 計算 Q（可選）
    if (verbose) {
      const Q = calculateModularity(current, communities);
      console.log(`[Leiden] Level ${level} Q=${Q.toFixed(6)}`);
    }

    // 4) 聚合
    const agg = aggregationPhase(current, communities);
    
    // 若聚合後沒有變化（僅單一節點或無邊），則停止
    if (agg.order <= 1 || agg.order === current.order) break;

    // 下一層：每個超節點成為自己的社群
    current = agg;
    communities = {};
    current.forEachNode(sn => { communities[sn] = sn; });
    level += 1;
  }

  return perLevel;
}

/* ----------------------- 封裝 run / hierarchicalLeiden ----------------------- */
function run(graph, args = {}) {
  const { useLcc = true, seed = 0xDEADBEEF, maxLevels = 3, verbose = false } = args;
  const nodeIdToCommunityMap = _computeLeidenCommunities(graph, {
    useLcc, seed, maxLevels, verbose
  });

  
  const results = {};
  for (const lvl of Object.keys(nodeIdToCommunityMap)) {
    const cmap = nodeIdToCommunityMap[lvl];
    const out = {};
    for (const n in cmap) {
      const c = String(cmap[n]);
      if (!out[c]) out[c] = { weight: 0, nodes: [] };
      out[c].nodes.push(n);
      
      // 安全地取得節點屬性：較高層級的節點可能是超節點 ID，未必存在於原始圖中
      let rank = 0, w = 1;
      if (graph.hasNode(n)) {
        const attrs = graph.getNodeAttributes(n);
        rank = attrs.rank ?? attrs.pagerank ?? 0;
        w = attrs.weight ?? 1;
      }
      out[c].weight += rank * w;
    }
    // 正規化（normalize）
    const arr = Object.values(out);
    if (arr.length) {
      const mx = Math.max(...arr.map(x => x.weight));
      if (mx > 0) arr.forEach(x => x.weight /= mx);
    }
    results[lvl] = out;
  }
  return results;
}

function hierarchicalLeiden(graph, options = {}) {
  return run(graph, options);
}

/* ----------------------- 其餘工具 ----------------------- */
function addCommunityInfo2Graph(graph, nodes, communityTitle) {
  nodes.forEach(n => {
    if (!graph.hasNode(n)) return;
    const curr = graph.getNodeAttribute(n, 'communities') || [];
    graph.setNodeAttribute(n, 'communities', [...new Set([...curr, communityTitle])]);
  });
}

module.exports = {
  run,
  hierarchicalLeiden,
  addCommunityInfo2Graph,
  _computeLeidenCommunities,
  calculateModularity,          
  localMovingPhase,             
  refinementPhase,              
  aggregationPhase              
};