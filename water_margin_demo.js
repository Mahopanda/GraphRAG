const fs = require("fs");
const path = require("path");

require("dotenv").config();
const { runGraphRAG, setupSchema } = require("./src/index");
const { LlmService } = require("./src/llm-service");

const MD_FILE_PATH = path.join(__dirname, "Water_Margin.md");
const CHUNK_SIZE = 500; // 每個文字塊的大小（字符數）

/**
 * 從 Markdown 檔案讀取內容並分割成適當的文字塊
 * @returns {Promise<string[]>} 回傳文字塊陣列的 Promise
 */
function readMarkdownAndGetChunks() {
  return new Promise((resolve, reject) => {
    try {
      const content = fs.readFileSync(MD_FILE_PATH, "utf8");

      // 將內容分割成段落
      const paragraphs = content
        .split(/\n\s*\n/) // 以雙換行符分割段落
        .map((p) => p.trim()) // 去除首尾空白
        .filter((p) => p.length > 0); // 過濾空段落

      const chunks = [];

      // 將段落組合成適當大小的文字塊
      let currentChunk = "";
      for (const paragraph of paragraphs) {
        if (
          currentChunk.length + paragraph.length > CHUNK_SIZE &&
          currentChunk.length > 0
        ) {
          chunks.push(currentChunk.trim());
          currentChunk = paragraph;
        } else {
          currentChunk += (currentChunk.length > 0 ? "\n\n" : "") + paragraph;
        }
      }

      // 加入最後一塊
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
      }

      console.log(
        `成功讀取 ${chunks.length} 個文字塊，來源檔案：${path.basename(
          MD_FILE_PATH
        )}`
      );
      resolve(chunks);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 將 graphology 圖形資料轉換為與 vis-network 相容的格式
 * @param {Graph} graph - graphology 圖形物件
 * @returns {object} 格式化為 vis-network 的資料
 */
function formatGraphForVisualization(graph) {
  const nodes = [];
  const edges = [];

  graph.forEachNode((node, attrs) => {
    nodes.push({
      id: node,
      label: node,
      title: `<b>類型:</b> ${attrs.entity_type}<br><b>描述:</b> ${attrs.description}`,
      group: attrs.entity_type, // 依實體類型分組節點以進行樣式設定
    });
  });

  graph.forEachEdge((edge, attrs, source, target) => {
    edges.push({
      from: source,
      to: target,
      title: `<b>權重:</b> ${attrs.weight}<br><b>描述:</b> ${attrs.description}`,
    });
  });

  return { nodes, edges };
}

/**
 * 產生最終的視覺化 HTML 檔案
 * @param {object} graphData - 格式化為 vis-network 的圖形資料
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
  console.log(`\n視覺化檔案已產生！`);
  console.log(`>> 請在瀏覽器中開啟以下檔案：`);
  console.log(`>> file://${outputPath}`);
}

/**
 * 水滸傳資料 GraphRAG 示範的主要執行函數
 */
async function main() {
  console.log("--- 開始水滸傳資料 GraphRAG 示範 ---");

  if (!fs.existsSync(MD_FILE_PATH)) {
    console.error(`\n錯誤：找不到資料檔案`);
    console.error(
      `請確認 'Water_Margin.md' 檔案位於 'graphrag-node-dev' 目錄中`
    );
    return;
  }

  // 1. 初始化資料庫
  setupSchema();

  // 2. 從 Markdown 讀取資料
  const textChunks = await readMarkdownAndGetChunks();
  if (textChunks.length === 0) {
    console.error("無法從 Markdown 檔案讀取文字資料，請檢查檔案格式");
    return;
  }

  // 3. 使用即時 LLM 服務執行完整的 GraphRAG 流程
  const docId = `water_margin_demo_${Date.now()}`;
  const llmService = new LlmService("gemini-2.5-flash-lite"); // 全使用 gemini-2.5-flash-lite
  const results = await runGraphRAG(docId, textChunks, llmService);

  console.log("\n--- RAG 流程摘要 ---");
  console.log(
    JSON.stringify(
      {
        initial_graph_stats: results.initial_graph_stats,
        resolved_graph_stats: results.resolved_graph_stats,
        community_reports_count: results.community_reports.length,
      },
      null,
      2
    )
  );

  // 4. 從解析後的圖形產生視覺化檔案
  const vizData = formatGraphForVisualization(results.resolved_graph);
  generateVisualizationFile(vizData);

  console.log("\n--- 示範完成 ---");
}

main().catch((error) => {
  console.error("\n--- 示範執行過程中發生錯誤 ---");
  console.error(error);
});
