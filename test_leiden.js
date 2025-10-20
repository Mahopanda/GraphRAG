const { Graph } = require('graphology');
const { run, hierarchicalLeiden, calculateModularity, localMovingPhase, refinementPhase, aggregationPhase } = require('./src/community/leiden');

// 測試工具函式
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function createTestGraph(name, nodes, edges, weights = {}, seed = 123456) {
  const rng = (function xorshift32(s){ let x=s>>>0; return ()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/0x100000000; })(seed);
  const graph = new Graph({ type: 'undirected', multi: false, allowSelfLoops: true });
  
  // 新增節點
  nodes.forEach(node => {
    graph.addNode(node, { 
      rank: rng(), 
      weight: 1,
      ...weights[node] 
    });
  });
  
  // 新增邊
  edges.forEach(([source, target, weight = 1]) => {
    graph.addEdge(source, target, { weight });
  });
  
  console.log(`Created ${name}: ${graph.order} nodes, ${graph.size} edges`);
  return graph;
}

// 測試1: 基本功能測試
function testBasicFunctionality() {
  console.log('\n=== 測試1: 基本功能測試 ===');
  
  // 建立一個簡單的社群結構圖
  const nodes = ['A', 'B', 'C', 'D', 'E', 'F'];
  const edges = [
    ['A', 'B', 2], ['B', 'C', 2],  // 社群1: A-B-C
    ['D', 'E', 2], ['E', 'F', 2],  // 社群2: D-E-F
    ['C', 'D', 1]                  // 連結兩個社群的弱邊
  ];
  
  const graph = createTestGraph('基本社群圖', nodes, edges);
  
  // 測試模組度計算
  const singletonCommunities = { A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F' };
  const modularity1 = calculateModularity(graph, singletonCommunities);
  console.log(`單節點社群模組度: ${modularity1.toFixed(6)}`);
  
  const goodCommunities = { A: 'C1', B: 'C1', C: 'C1', D: 'C2', E: 'C2', F: 'C2' };
  const modularity2 = calculateModularity(graph, goodCommunities);
  console.log(`良好社群模組度: ${modularity2.toFixed(6)}`);
  
  assert(modularity2 > modularity1, '良好社群應該有更高的模組度');
  
  // 測試本地移動階段
  const movedCommunities = localMovingPhase(graph, singletonCommunities, { maxIterations: 5, seed: 42 });
  console.log('本地移動後的社群分配:', movedCommunities);
  
  // 測試精煉階段
  const refinedCommunities = refinementPhase(graph, movedCommunities);
  console.log('精煉後的社群分配:', refinedCommunities);
  
  // 測試聚合階段
  const aggregatedGraph = aggregationPhase(graph, refinedCommunities);
  console.log(`聚合圖: ${aggregatedGraph.order} 個超點, ${aggregatedGraph.size} 條邊`);
  
  // 驗證邊權重守恆
  let originalWeight = 0;
  graph.forEachEdge((key, attrs) => originalWeight += attrs.weight || 1);
  
  let aggregatedWeight = 0;
  aggregatedGraph.forEachEdge((key, attrs) => aggregatedWeight += attrs.weight || 1);
  
  console.log(`原始圖總權重: ${originalWeight}, 聚合圖總權重: ${aggregatedWeight}`);
  assert(Math.abs(originalWeight - aggregatedWeight) < 0.001, '邊權重應該守恆');
  
  // 檢查聚合圖 self-loop 總和 == 原圖社群內部邊權總和
  let loopSum = 0;
  aggregatedGraph.forEachEdge((key, attrs, s, t) => {
    if (s === t) loopSum += attrs.weight || 1;
  });
  
  let intraSum = 0;
  graph.forEachEdge((key, attrs, s, t) => {
    if (refinedCommunities[s] === refinedCommunities[t]) intraSum += attrs.weight || 1;
  });
  
  console.log(`聚合圖 self-loop 總權重: ${loopSum}, 原圖社群內部邊權總和: ${intraSum}`);
  assert(Math.abs(loopSum - intraSum) < 1e-9, '聚合圖 self-loop 加總應等於原圖社群內部邊權總和');
  
  console.log('✅ 基本功能測試通過');
}

// 測試2: 層級化社群檢測
function testHierarchicalDetection() {
  console.log('\n=== 測試2: 層級化社群檢測 ===');
  
  // 建立一個更複雜的圖
  const nodes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const edges = [
    // 社群1: A-B-C-D (緊密連結)
    ['A', 'B', 3], ['B', 'C', 3], ['C', 'D', 3], ['A', 'D', 2],
    // 社群2: E-F-G (緊密連結)
    ['E', 'F', 3], ['F', 'G', 3], ['E', 'G', 2],
    // 社群3: H-I-J (緊密連結)
    ['H', 'I', 3], ['I', 'J', 3], ['H', 'J', 2],
    // 跨社群連結
    ['D', 'E', 1], ['G', 'H', 1]
  ];
  
  const graph = createTestGraph('層級化測試圖', nodes, edges);
  
  // 測試完整的 Leiden 演算法
  const results = run(graph, { 
    maxLevels: 3, 
    verbose: true,
    useLcc: true 
  });
  
  console.log('層級化結果:');
  Object.keys(results).forEach(level => {
    const communities = results[level];
    console.log(`Level ${level}: ${Object.keys(communities).length} 個社群`);
    Object.entries(communities).forEach(([id, comm]) => {
      console.log(`  社群 ${id}: ${comm.nodes.length} 個節點, 權重 ${comm.weight.toFixed(3)}`);
    });
  });
  
  // 驗證結果合理性
  const level0 = results['0'];
  assert(level0, '應該有 Level 0 的結果');
  assert(Object.keys(level0).length > 0, 'Level 0 應該有社群');
  
  console.log('✅ 層級化社群檢測測試通過');
}

// 測試3: 邊界情形
function testEdgeCases() {
  console.log('\n=== 測試3: 邊界情況 ===');
  
  // 測試空圖
  const emptyGraph = new Graph({ type: 'undirected', multi: false, allowSelfLoops: true });
  const emptyResults = run(emptyGraph);
  assert(Object.keys(emptyResults).length === 0, '空圖應該返回空結果');
  
  // 測試單節點圖
  const singleNodeGraph = new Graph({ type: 'undirected', multi: false, allowSelfLoops: true });
  singleNodeGraph.addNode('A');
  const singleResults = run(singleNodeGraph);
  console.log('單節點圖結果:', singleResults);
  assert(typeof singleResults === 'object', '單節點圖應該回傳結果物件');
  
  // 測試單節點圖在 useLcc:false 下的行為
  const singleResults2 = run(singleNodeGraph, { useLcc: false });
  assert(typeof singleResults2 === 'object', '單節點圖（useLcc:false）回傳合法物件');
  
  // 測試無邊圖
  const noEdgeGraph = new Graph({ type: 'undirected', multi: false, allowSelfLoops: true });
  ['A', 'B', 'C'].forEach(node => noEdgeGraph.addNode(node));
  const noEdgeResults = run(noEdgeGraph, { useLcc: false });
  assert(Object.keys(noEdgeResults).length > 0, '無邊圖應該有結果（useLcc:false）');
  
  // 測試不連通圖
  const disconnectedGraph = new Graph({ type: 'undirected', multi: false, allowSelfLoops: true });
  ['A', 'B', 'C', 'D'].forEach(node => disconnectedGraph.addNode(node));
  disconnectedGraph.addEdge('A', 'B'); // 只有 A-B 連接
  const disconnectedResults = run(disconnectedGraph, { useLcc: true });
  assert(Object.keys(disconnectedResults).length > 0, '不連通圖應該有結果');
  
  console.log('✅ 邊界情況測試通過');
}

// 測試4: 模組度單調性
function testModularityMonotonicity() {
  console.log('\n=== 測試4: 模組度單調性 ===');
  
  const nodes = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const edges = [
    ['A', 'B', 2], ['B', 'C', 2], ['C', 'D', 2], ['A', 'D', 1],
    ['E', 'F', 2], ['F', 'G', 2], ['G', 'H', 2], ['E', 'H', 1],
    ['D', 'E', 1]
  ];
  
  const graph = createTestGraph('模組度測試圖', nodes, edges);
  
  // 測試本地移動階段的模組度變化
  let communities = {};
  graph.forEachNode(node => { communities[node] = node; });
  
  let prevModularity = calculateModularity(graph, communities);
  console.log(`初始模組度: ${prevModularity.toFixed(6)}`);
  
  for (let i = 0; i < 3; i++) {
    communities = localMovingPhase(graph, communities, { maxIterations: 2, seed: 42 });
    const currentModularity = calculateModularity(graph, communities);
    console.log(`第 ${i+1} 輪後模組度: ${currentModularity.toFixed(6)}`);
    
    assert(currentModularity >= prevModularity - 0.0001, '模組度不應該下降');
    prevModularity = currentModularity;
  }
  
  console.log('✅ 模組度單調性測試通過');
}

// 測試5: 權重圖測試
function testWeightedGraph() {
  console.log('\n=== 測試5: 權重圖測試 ===');
  
  const nodes = ['A', 'B', 'C', 'D', 'E', 'F'];
  const edges = [
    ['A', 'B', 5], ['B', 'C', 5],  // 強連結社群1
    ['D', 'E', 5], ['E', 'F', 5],  // 強連結社群2
    ['C', 'D', 1]                  // 弱連結
  ];
  
  const graph = createTestGraph('權重圖', nodes, edges);
  
  const results = run(graph, { verbose: true });
  
  // 檢查結果是否合理（應該形成兩個主要社群）
  const level0 = results['0'];
  const communityCount = Object.keys(level0).length;
  console.log(`檢測到 ${communityCount} 個社群`);
  
  // 驗證社群大小合理
  Object.entries(level0).forEach(([id, comm]) => {
    console.log(`社群 ${id}: ${comm.nodes.length} 個節點`);
    assert(comm.nodes.length >= 1, '每個社群至少應該有一個節點');
  });
  
  console.log('✅ 權重圖測試通過');
}

// 主測試函式
function runAllTests() {
  console.log('開始 Leiden 演算法測試...');
  
  try {
    testBasicFunctionality();
    testHierarchicalDetection();
    testEdgeCases();
    testModularityMonotonicity();
    testWeightedGraph();
    
    console.log('\n🎉 所有測試都通過了！');
    console.log('\n修正的問題:');
    console.log('✅ 修正了 run() 函數中高層級節點屬性獲取問題');
    console.log('✅ 修正了 refinementPhase 中的快取命名混淆');
    console.log('✅ 確保了圖的選項設定正確');
    console.log('✅ 驗證了演算法的正確性和穩定性');
    
  } catch (error) {
    console.error('\n❌ 測試失敗:', error.message);
    process.exit(1);
  }
}

// 如果直接執行此檔案，則執行測試
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  testBasicFunctionality,
  testHierarchicalDetection,
  testEdgeCases,
  testModularityMonotonicity,
  testWeightedGraph
};
