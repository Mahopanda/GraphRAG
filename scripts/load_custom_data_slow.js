// 降低呼叫速度的資料載入腳本
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
require("dotenv").config();
const { runGraphRAG, setupSchema } = require("./src/index");
const { LlmService } = require("./src/llm-service");

const DATA_FILE_PATH = process.argv[2];
const ROW_LIMIT = parseInt(process.argv[3]) || 100;
const DELAY_MS = parseInt(process.argv[4]) || 1000; // 預設1秒延遲

if (!DATA_FILE_PATH) {
  console.error("請提供資料檔案路徑");
  console.error(
    "使用方法: node load_custom_data_slow.js <資料檔案路徑> [行數限制] [延遲毫秒]"
  );
  console.error("範例: node load_custom_data_slow.js my_data.csv 20 2000");
  process.exit(1);
}

if (!fs.existsSync(DATA_FILE_PATH)) {
  console.error(`資料檔案不存在: ${DATA_FILE_PATH}`);
  process.exit(1);
}

/**
 * 延遲函數
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
          const text =
            row.text ||
            row.content ||
            row.description ||
            row[Object.keys(row)[0]] ||
            JSON.stringify(row);
          if (text && text.trim()) {
            const maxLength = 800; // 進一步減少長度限制
            const trimmedText = text.trim();
            if (trimmedText.length > maxLength) {
              console.log(
                `文字過長 (${trimmedText.length} 字元)，截斷到 ${maxLength} 字元`
              );
              chunks.push(trimmedText.substring(0, maxLength) + "...");
            } else {
              chunks.push(trimmedText);
            }
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
    "//__DATA__HERE__",
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
 * 帶延遲的 GraphRAG 處理
 */
async function runGraphRAGWithDelay(docId, textChunks, llmService) {
  console.log(`使用 ${DELAY_MS}ms 延遲處理 ${textChunks.length} 個文字塊...`);

  // 修改提取器以加入延遲
  const {
    GraphExtractorBasic,
  } = require("./src/extractors/graph-extractor-basic");
  const entity_types = [
    "person",
    "location",
    "organization",
    "company",
    "product",
    "event",
    "concept",
  ];
  const language = "Chinese";

  const extractor = new GraphExtractorBasic(llmService, language, entity_types);

  // 重寫 _process_single_content 方法以加入延遲
  const originalProcess = extractor._process_single_content.bind(extractor);
  extractor._process_single_content = async function (
    chunk_info,
    chunk_seq,
    num_chunks
  ) {
    console.log(`處理第 ${chunk_seq + 1}/${num_chunks} 個文字塊...`);

    // 加入延遲
    if (chunk_seq > 0) {
      console.log(`等待 ${DELAY_MS}ms...`);
      await delay(DELAY_MS);
    }

    const result = await originalProcess(chunk_info, chunk_seq, num_chunks);
    console.log(`第 ${chunk_seq + 1} 個文字塊處理完成`);

    return result;
  };

  try {
    const results = await extractor.extract(docId, textChunks, (msg) => {
      console.log("進度:", msg);
    });
    return results;
  } catch (error) {
    console.error("處理失敗:", error.message);
    throw error;
  }
}

/**
 * 主執行函數
 */
async function main() {
  console.log("開始載入自訂資料 (慢速版)...");
  console.log(`資料檔案: ${DATA_FILE_PATH}`);
  console.log(`處理行數: ${ROW_LIMIT}`);
  console.log(`延遲設定: ${DELAY_MS}ms`);

  // 检查API密钥
  if (!process.env.GEMINI_API_KEY) {
    console.error("請設定 GEMINI_API_KEY 環境變數");
    console.error("範例: export GEMINI_API_KEY=your_api_key_here");
    process.exit(1);
  }

  try {
    // 1. 初始化資料庫
    console.log("初始化資料庫...");
    setupSchema();

    // 2. 读取数据
    const textChunks = await readCsvAndGetChunks();
    if (textChunks.length === 0) {
      console.error("無法從檔案中讀取到文字資料");
      return;
    }

    // 3. 執行 GraphRAG 流程 (帶延遲)
    console.log("開始 GraphRAG 處理...");
    const docId = `custom_data_${Date.now()}`;
    const llmService = new LlmService("gemini-2.5-flash-lite");
    const results = await runGraphRAGWithDelay(docId, textChunks, llmService);

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
    console.error(error.message);

    if (error.message.includes("503")) {
      console.log("\n503 錯誤解決建議:");
      console.log("1. 增加延遲時間 (如 3000ms)");
      console.log("2. 減少處理的行數 (如 5-10 行)");
      console.log("3. 檢查網路連線");
    }
  }
}

main();
