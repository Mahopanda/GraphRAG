const fs = require("fs");
const path = require("path");

/**
 * 將 graphology 圖形資料轉換為與 vis-network 相容的格式
 * @param {Graph} graph - graphology 圖形物件
 * @param {object} options - 設定選項
 * @returns {object} 格式化為 vis-network 的資料
 */
function formatGraphForVisualization(graph, options = {}) {
  const nodes = [];
  const edges = [];

  // 為不同類型的節點定義顏色
  const defaultNodeColors = {
    PERSON: "#FF6B6B", // 人物 - 紅色
    LOCATION: "#4ECDC4", // 地點 - 青色
    ORGANIZATION: "#45B7D1", // 組織 - 藍色
    EVENT: "#96CEB4", // 事件 - 綠色
    CONCEPT: "#FECA57", // 概念 - 黃色
    OTHER: "#DDA0DD", // 其他 - 紫色
  };

  const nodeColors = options.nodeColors || defaultNodeColors;

  graph.forEachNode((node, attrs) => {
    nodes.push({
      id: node,
      label: node,
      title: `<b>類型：</b> ${attrs.entity_type || "OTHER"}<br><b>描述：</b> ${
        attrs.description || ""
      }`,
      group: attrs.entity_type || "OTHER",
      color: {
        background: nodeColors[attrs.entity_type] || nodeColors["OTHER"],
        border: "#2E3440",
      },
      font: {
        color: "#2E3440",
        face: "Arial",
        size: 12,
      },
    });
  });

  graph.forEachEdge((edge, attrs, source, target) => {
    edges.push({
      from: source,
      to: target,
      title: `<b>權重：</b> ${attrs.weight || 1}<br><b>描述：</b> ${
        attrs.description || ""
      }`,
      width: Math.max(1, Math.min(5, (attrs.weight || 1) * 2)),
      color: {
        color: "#5E6C86",
        opacity: 0.7,
      },
    });
  });

  return { nodes, edges };
}

/**
 * 產生通用的視覺化 HTML 檔案
 * @param {object} graphData - 格式化為 vis-network 的圖形資料
 * @param {object} options - 設定選項
 */
function generateGenericVisualizationFile(graphData, options = {}) {
  const {
    title = "GraphRAG 知識圖譜視覺化",
    subtitle = "展示文本中提取的實體及其關係",
    outputFileName = "graph_visualization.html",
    templatePath,
  } = options;

  const defaultTemplatePath = path.join(
    __dirname,
    "../../visualization",
    "template.html"
  );
  const templateFile = templatePath || defaultTemplatePath;

  const outputPath = path.join(
    __dirname,
    "../../visualization",
    outputFileName
  );

  if (!fs.existsSync(templateFile)) {
    // 如果沒有template檔案，建立visualization目錄並建立一個簡單的HTML
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        body {
            font-family: 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8f9fa;
        }
        #network {
            width: 100%;
            height: 800px;
            border: 2px solid #ddd;
            border-radius: 8px;
            background-color: white;
        }
        h1 {
            color: #d32f2f;
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
        }
        .info {
            background-color: #e3f2fd;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            border-left: 4px solid #2196f3;
        }
    </style>
</head>
<body>
    <h1>${title}</h1>
    <div class="info">
        <strong>說明：</strong>${subtitle}
        節點大小表示重要程度，連線粗細表示關係強度。
    </div>
    <div id="network"></div>

    <script type="text/javascript">
        var nodes = new vis.DataSet();
        var edges = new vis.DataSet();
        
        var container = document.getElementById('network');
        var data = ${JSON.stringify(graphData, null, 2)};
        
        // 更新節點和邊的資料
        nodes.clear();
        nodes.add(data.nodes);
        edges.clear();
        edges.add(data.edges);

        var options = {
            nodes: {
                shape: 'dot',
                size: 20,
                font: {
                    size: 12,
                    color: '#333'
                },
                borderWidth: 2
            },
            edges: {
                width: 2,
                color: { color: '#848484' },
                smooth: {
                    type: 'continuous'
                }
            },
            physics: {
                stabilization: { iterations: 150 },
                barnesHut: {
                    gravitationalConstant: -80000,
                    springConstant: 0.001,
                    springLength: 200
                }
            },
            layout: {
                improvedLayout: true
            },
            interaction: {
                hover: true,
                tooltipDelay: 200
            }
        };

        var network = new vis.Network(container, { nodes: nodes, edges: edges }, options);
        
        // 新增網路重置按鈕功能
        network.on('doubleClick', function (params) {
            if (params.nodes.length === 0) {
                network.fit();
            }
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(outputPath, htmlContent);
  } else {
    const template = fs.readFileSync(templateFile, "utf8");
    const outputHtml = template.replace(
      "//__DATA__HERE__",
      JSON.stringify(graphData, null, 2)
    );
    fs.writeFileSync(outputPath, outputHtml);
  }

  console.log(`\n視覺化檔案已產生！`);
  console.log(`檔案位置：${outputPath}`);
  console.log(`請在瀏覽器中開啟：file://${outputPath}`);
}

/**
 * 顯示 GraphRAG 結果的有用資訊
 * @param {object} results - GraphRAG 處理結果
 * @param {string} sourceName - 資料來源名稱
 */
function displayGraphInsights(results, sourceName = "資料") {
  console.log(`\n === ${sourceName} GraphRAG 分析結果 ===`);

  // 分析節點類型分佈
  const nodeTypes = {};
  results.resolved_graph.forEachNode((node, attrs) => {
    const type = attrs.entity_type || "OTHER";
    nodeTypes[type] = (nodeTypes[type] || 0) + 1;
  });

  console.log("\n實體類型分佈：");
  Object.entries(nodeTypes)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      console.log(`   ${type}: ${count} 個`);
    });

  // 分析連線數量分佈
  const edgeWeights = [];
  results.resolved_graph.forEachEdge((edge, attrs) => {
    edgeWeights.push(attrs.weight || 1);
  });

  if (edgeWeights.length > 0) {
    edgeWeights.sort((a, b) => b - a);
    console.log(`\n關係分析：`);
    console.log(`   總關係數量：${edgeWeights.length}`);
    console.log(`   最強關係權重：${edgeWeights[0]}`);
    console.log(
      `   平均關係權重：${(
        edgeWeights.reduce((a, b) => a + b, 0) / edgeWeights.length
      ).toFixed(2)}`
    );
  }

  // 顯示社群報告簡要
  if (results.community_reports && results.community_reports.length > 0) {
    console.log(`\n社群分析報告數量：${results.community_reports.length}`);
  }
}

/**
 * 將文字按智慧方式分割為適合的塊大小
 * @param {string} text - 原始文字
 * @param {number} maxChunkSize - 最大塊大小
 * @returns {string[]} 分割後的文字塊陣列
 */
function smartChunkText(text, maxChunkSize = 300) {
  const chunks = [];
  const sentences = text.split(/([。！？；])/); // 儲存分隔符

  let currentChunk = "";

  for (let i = 0; i < sentences.length; i += 2) {
    const sentence = sentences[i];
    const separator = sentences[i + 1] || "";
    const sentenceWithSeparator = sentence + separator;

    if (
      (currentChunk + sentenceWithSeparator).length > maxChunkSize &&
      currentChunk.trim()
    ) {
      chunks.push(currentChunk.trim());
      currentChunk = sentenceWithSeparator;
    } else {
      currentChunk += sentenceWithSeparator;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * 讀取 Markdown 檔案並按段分割為文字塊
 * @param {string} filePath - 檔案路徑
 * @param {object} options - 設定選項
 * @returns {string[]} 文字塊陣列
 */
function readMarkdownAndGetChunks(filePath, options = {}) {
  const { maxChunkSize = 300, minChunkSize = 50 } = options;

  try {
    const content = fs.readFileSync(filePath, "utf8");

    // 先按段落（雙換行）分割
    const paragraphs = content.split(/\n\s*\n/);
    const chunks = [];

    for (const paragraph of paragraphs) {
      if (paragraph.trim().length === 0) continue;

      // 清理文字：移除多餘的空白和標點
      const cleanParagraph = paragraph
        .replace(/\s+/g, " ")
        .replace(/　/g, " ")
        .trim();

      if (cleanParagraph.length > maxChunkSize) {
        // 如果段落太長，智慧分割
        const subChunks = smartChunkText(cleanParagraph, maxChunkSize);
        chunks.push(...subChunks);
      } else if (cleanParagraph.length > minChunkSize) {
        // 只要長度合理的段落
        chunks.push(cleanParagraph);
      }
    }

    console.log(
      `從檔案讀取並分割為 ${chunks.length} 個文字塊，來源檔案：${path.basename(
        filePath
      )}`
    );
    return chunks;
  } catch (error) {
    console.error("讀取檔案時發生錯誤：", error);
    return [];
  }
}

/**
 * 通用的 GraphRAG 處理包裝函數
 * @param {string} sourceName - 資料來源名稱
 * @param {string} filePath - 檔案路徑
 * @param {Function} chunkFunction - 分割文字塊的函數據
 * @param {object} vizOptions - 視覺化選項
 */
async function processGraphRAG(
  sourceName,
  filePath,
  chunkFunction,
  vizOptions = {}
) {
  const { runGraphRAG, setupSchema } = require("../index");
  const { LlmService } = require("../llm-service");

  console.log(` === ${sourceName} GraphRAG 智慧分析系統 ===`);
  console.log(`正在分析${sourceName}文本...`);

  // 1. 初始化資料庫
  console.log("\n步驟 1: 初始化知識圖譜資料庫...");
  setupSchema();

  // 2. 讀取和預處理文本
  console.log("\n步驟 2: 讀取並分割文本...");
  const textChunks = chunkFunction();

  if (textChunks.length === 0) {
    console.error(`無法從${sourceName}檔案讀取文字資料`);
    return null;
  }

  console.log(`成功分割為 ${textChunks.length} 個文字塊`);

  // 顯示文字塊預覽
  console.log("\n文字塊預覽：");
  textChunks.slice(0, 3).forEach((chunk, index) => {
    console.log(
      `\n塊 ${index + 1}: ${chunk.substring(0, 120)}${
        chunk.length > 120 ? "..." : ""
      }`
    );
  });

  // 3. 執行 GraphRAG 分析
  console.log("\n步驟 3: 執行 GraphRAG 智慧分析...");
  console.log("正在使用 NLP 技術提取實體和關係...");

  const docId = `${sourceName
    .toLowerCase()
    .replace(/\s+/g, "_")}_demo_${Date.now()}`;
  const llmService = new LlmService("gemini-2.5-flash-lite");
  const results = await runGraphRAG(docId, textChunks, llmService);

  console.log("GraphRAG 分析完成！");

  // 4. 顯示詳細結果
  displayGraphInsights(results, sourceName);

  // 5. 產生視覺化
  console.log("\n步驟 4: 產生知識圖譜視覺化...");
  const vizData = formatGraphForVisualization(results.resolved_graph);
  generateGenericVisualizationFile(vizData, vizOptions);

  console.log(`\n === ${sourceName} GraphRAG 分析完成 ===`);
  console.log("分析摘要：");
  console.log(
    `┌─ 初始圖譜: ${results.initial_graph_stats?.nodeCount || 0} 節點, ${
      results.initial_graph_stats?.edgeCount || 0
    } 邊`
  );
  console.log(
    `├─ 最終圖譜: ${results.resolved_graph_stats?.nodeCount || 0} 節點, ${
      results.resolved_graph_stats?.edgeCount || 0
    } 邊`
  );
  console.log(`└─ 社群報告: ${results.community_reports?.length || 0} 份`);

  return results;
}

module.exports = {
  formatGraphForVisualization,
  generateGenericVisualizationFile,
  displayGraphInsights,
  smartChunkText,
  readMarkdownAndGetChunks,
  processGraphRAG,
};
