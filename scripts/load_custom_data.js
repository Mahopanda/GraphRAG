const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
require("dotenv").config();
const { runGraphRAG, setupSchema } = require("./src/index");
const { LlmService } = require("./src/llm-service");

/**
 * 載入自訂資料的腳本
 * 使用方法：
 * 1. 將你的資料檔案放在專案根目錄
 * 2. 設定 GEMINI_API_KEY 環境變數
 * 3. 執行: node load_custom_data.js your_data_file.csv
 */

const DATA_FILE_PATH = process.argv[2];
const ROW_LIMIT = parseInt(process.argv[3]) || 100; // 預設處理100行

if (!DATA_FILE_PATH) {
  console.error("❌ 請提供資料檔案路徑");
  console.error("使用方法: node load_custom_data.js <資料檔案路徑> [行數限制]");
  console.error("範例: node load_custom_data.js my_data.csv 50");
  process.exit(1);
}

if (!fs.existsSync(DATA_FILE_PATH)) {
  console.error(`❌ 資料檔案不存在: ${DATA_FILE_PATH}`);
  process.exit(1);
}

/**
 * 從 CSV 檔案讀取資料並提取文字內容
 */
function readCsvAndGetChunks() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    console.log(`正在讀取檔案: ${path.basename(DATA_FILE_PATH)}`);

    fs.createReadStream(DATA_FILE_PATH)
      .pipe(csv())
      .on("data", (row) => {
        if (chunks.length < ROW_LIMIT) {
          // 嘗試從常見列名中提取文字
          const text =
            row.text ||
            row.content ||
            row.description ||
            row[Object.keys(row)[0]] ||
            JSON.stringify(row);
          if (text && text.trim()) {
            chunks.push(text.trim());
          }
        }
      })
      .on("end", () => {
        console.log(`成功讀取 ${chunks.length} 行資料`);
        resolve(chunks);
      })
      .on("error", (error) => {
        console.error("讀取檔案時出錯:", error);
        reject(error);
      });
  });
}

/**
 * 生成視覺化檔案
 */
function generateVisualizationFile(graphData) {
  const templatePath = path.join(__dirname, "visualization", "template.html");
  const outputPath = path.join(
    __dirname,
    "visualization",
    "graph_visualization.html"
  );

  const template = fs.readFileSync(templatePath, "utf8");
  const outputHtml = template.replace(
    "{ nodes: [], edges: [] }; // Default empty graph",
    JSON.stringify(graphData, null, 2)
  );

  fs.writeFileSync(outputPath, outputHtml);
  console.log(`\n視覺化檔案已生成: ${outputPath}`);
}

/**
 * 格式化圖形資料用於視覺化
 */
function formatGraphForVisualization(graph) {
  const nodes = [];
  const edges = [];

  graph.forEachNode((node, attrs) => {
    nodes.push({
      id: node,
      label: node,
      title: `<b>類型:</b> ${attrs.entity_type || "unknown"}<br><b>描述:</b> ${
        attrs.description || "無描述"
      }`,
      group: attrs.entity_type || "unknown",
    });
  });

  graph.forEachEdge((edge, attrs, source, target) => {
    edges.push({
      from: source,
      to: target,
      title: `<b>權重:</b> ${attrs.weight || 1}<br><b>描述:</b> ${
        attrs.description || "無描述"
      }`,
    });
  });

  return { nodes, edges };
}

/**
 * 主執行函數
 */
async function main() {
  console.log("開始載入自訂資料...");
  console.log(`資料檔案: ${DATA_FILE_PATH}`);
  console.log(`處理行數: ${ROW_LIMIT}`);

  // 檢查 API 金鑰
  if (!process.env.GEMINI_API_KEY) {
    console.error("請設定 GEMINI_API_KEY 環境變數");
    console.error("範例: export GEMINI_API_KEY=your_api_key_here");
    process.exit(1);
  }

  try {
    // 1. 初始化資料庫
    console.log("初始化資料庫...");
    setupSchema();

    // 2. 讀取資料
    const textChunks = await readCsvAndGetChunks();
    if (textChunks.length === 0) {
      console.error("無法從檔案中讀取到文字資料");
      return;
    }

    // 3. 執行 GraphRAG 流程
    console.log("開始 GraphRAG 處理...");
    const docId = `custom_data_${Date.now()}`;
    const llmService = new LlmService("gemini-2.5-flash-lite");
    const results = await runGraphRAG(docId, textChunks, llmService);

    console.log("\n處理結果統計:");
    console.log(
      JSON.stringify(
        {
          initial_nodes: results.initial_graph_stats.nodes,
          initial_edges: results.initial_graph_stats.edges,
          resolved_nodes: results.resolved_graph_stats.nodes,
          resolved_edges: results.resolved_graph_stats.edges,
          community_reports: results.community_reports.length,
        },
        null,
        2
      )
    );

    // 4. 生成視覺化檔案
    console.log("生成視覺化檔案...");
    const vizData = formatGraphForVisualization(results.resolved_graph);
    generateVisualizationFile(vizData);

    console.log("\n資料載入完成!");
    console.log("現在可以存取: http://localhost:3000");
    console.log("提示: 確保伺服器正在執行 (node server.js)");
  } catch (error) {
    console.error("\n處理過程中出現錯誤:");
    console.error(error);
  }
}

main();
