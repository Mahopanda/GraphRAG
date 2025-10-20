#!/usr/bin/env node

/**
 * 統一的資料載入腳本
 * 整合了多種載入模式，支援不同的處理策略
 *
 * 使用方法:
 * node scripts/load_data.js <資料檔案路徑> [選項]
 *
 * 選項:
 * --mode <模式>     載入模式: standard|slow|ultra-slow|robust|fixed (預設: standard)
 * --rows <數量>     處理行數 (預設: 100)
 * --delay <毫秒>    延遲時間 (預設: 1000)
 * --retries <次數>  重試次數 (預設: 3)
 * --algorithm <演算法> 社群檢測演算法: leiden|louvain (預設: leiden)
 * --hierarchical   使用層次化檢測 (僅適用於 Leiden 演算法)
 * --help           顯示說明
 *
 * 範例:
 * node scripts/load_data.js data.csv --mode standard --rows 50
 * node scripts/load_data.js data.csv --mode slow --rows 20 --delay 2000
 * node scripts/load_data.js data.csv --mode ultra-slow --rows 5 --delay 5000
 * node scripts/load_data.js data.csv --mode robust --rows 100 --retries 5
 */

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
require("dotenv").config();
const { runGraphRAG, setupSchema } = require("../src/index");
const { LlmService } = require("../src/llm-service");
const {
  GraphExtractorBasic,
} = require("../src/extractors/graph-extractor-basic");

// 解析命令列參數
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dataFile: null,
    mode: "standard",
    rows: 100,
    delay: 1000,
    retries: 3,
    algorithm: "leiden",
    hierarchical: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const value = args[i + 1];

      switch (key) {
        case "mode":
          options.mode = value;
          i++;
          break;
        case "rows":
          options.rows = parseInt(value);
          i++;
          break;
        case "delay":
          options.delay = parseInt(value);
          i++;
          break;
        case "retries":
          options.retries = parseInt(value);
          i++;
          break;
        case "algorithm":
          options.algorithm = value;
          i++;
          break;
        case "hierarchical":
          options.hierarchical = true;
          break;
        case "help":
          showHelp();
          process.exit(0);
      }
    } else if (!options.dataFile) {
      options.dataFile = arg;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
統一資料載入腳本

使用方法:
  node scripts/load_data.js <資料檔案路徑> [選項]

選項:
  --mode <模式>     載入模式: standard|slow|ultra-slow|robust|fixed (預設: standard)
  --rows <數量>     處理行數 (預設: 100)
  --delay <毫秒>    延遲時間 (預設: 1000)
  --retries <次數>  重試次數 (預設: 3)
  --algorithm <演算法> 社群檢測演算法: leiden|louvain (預設: leiden)
  --hierarchical   使用層次化檢測 (僅適用於 Leiden 演算法)
  --help           顯示此說明

載入模式說明:
  standard     - 標準模式，使用 runGraphRAG 完整流程
  slow         - 慢速模式，在處理間加入延遲
  ultra-slow   - 超慢速模式，逐個處理文本塊
  robust       - 穩健模式，包含重試機制
  fixed        - 修復模式，包含中文驗證和文本清理

範例:
  node scripts/load_data.js data.csv --mode standard --rows 50
  node scripts/load_data.js data.csv --mode slow --rows 20 --delay 2000
  node scripts/load_data.js data.csv --mode ultra-slow --rows 5 --delay 5000
  node scripts/load_data.js data.csv --mode robust --rows 100 --retries 5
`);
}

// 延遲函式
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 清理與驗證文字內容
function cleanAndValidateText(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  // 移除多餘的空格
  let cleaned = text.trim().replace(/\s+/g, " ");

  // 檢查是否包含有效內容（不只是標點符號）
  if (cleaned.length < 10) {
    console.log(`文字太短，跳過: "${cleaned}"`);
    return null;
  }

  return cleaned;
}

// 從 CSV 檔案讀取資料並提取文字內容
function readCsvAndGetChunks(dataFilePath, rowLimit, mode) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    console.log(`正在讀取檔案: ${path.basename(dataFilePath)}`);

    fs.createReadStream(dataFilePath)
      .pipe(csv())
      .on("data", (row) => {
        if (chunks.length < rowLimit) {
          // 嘗試從常見列名中提取文字
          const text =
            row.text ||
            row.content ||
            row.description ||
            row[Object.keys(row)[0]] ||
            JSON.stringify(row);

          if (text && text.trim()) {
            let processedText = text.trim();

            // 依模式進行不同處理
            if (mode === "fixed") {
              const cleanedText = cleanAndValidateText(text);
              if (!cleanedText) return;
              processedText = cleanedText;
            }

            // 限制文字長度
            const maxLength =
              mode === "ultra-slow" ? 500 : mode === "slow" ? 800 : 1000;

            if (processedText.length > maxLength) {
              console.log(
                `文字過長 (${processedText.length} 字元)，截斷到 ${maxLength} 字元`
              );
              processedText = processedText.substring(0, maxLength) + "...";
            }

            chunks.push(processedText);
          }
        }
      })
      .on("end", () => {
        console.log(`成功讀取 ${chunks.length} 行資料`);
        resolve(chunks);
      })
      .on("error", (error) => {
        console.error("讀取檔案時發生錯誤:", error);
        reject(error);
      });
  });
}

// 產生視覺化檔案
function generateVisualizationFile(graphData) {
  const templatePath = path.join(
    __dirname,
    "..",
    "visualization",
    "template.html"
  );
  const outputPath = path.join(
    __dirname,
    "..",
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

// 格式化圖形資料用於視覺化
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

// 逐一處理文字塊（用於 ultra-slow 與 fixed 模式）
async function processChunksOneByOne(docId, textChunks, llmService, delayMs) {
  console.log(`逐個處理 ${textChunks.length} 個文字塊...`);

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

  let allEntities = [];
  let allRelationships = [];

  for (let i = 0; i < textChunks.length; i++) {
    const chunk = textChunks[i];
    console.log(`\n處理第 ${i + 1}/${textChunks.length} 個文字塊...`);
    console.log(`內容預覽: ${chunk.substring(0, 100)}...`);

    try {
      // 處理單一文字塊
      const result = await extractor._process_single_content(
        { text: chunk, chunk_id: `chunk_${i}` },
        i,
        textChunks.length
      );

      if (result.maybe_nodes && result.maybe_nodes.length > 0) {
        allEntities.push(...result.maybe_nodes);
        console.log(`提取到 ${result.maybe_nodes.length} 個實體`);
      }

      if (result.maybe_edges && result.maybe_edges.length > 0) {
        allRelationships.push(...result.maybe_edges);
        console.log(`提取到 ${result.maybe_edges.length} 個關係`);
      }

      console.log(`第 ${i + 1} 個文字塊處理完成`);
    } catch (error) {
      console.error(`第 ${i + 1} 個文字塊處理失敗:`, error.message);
      // 繼續處理下一個
    }

    // 加入延遲（除了最後一個）
    if (i < textChunks.length - 1 && delayMs > 0) {
      console.log(`等待 ${delayMs}ms...`);
      await delay(delayMs);
    }
  }

  console.log(`\n總計提取結果:`);
  console.log(`- 實體: ${allEntities.length} 個`);
  console.log(`- 關係: ${allRelationships.length} 個`);

  return {
    all_entities_data: allEntities,
    all_relationships_data: allRelationships,
  };
}

// 具重試機制的 GraphRAG 處理
async function runGraphRAGWithRetry(docId, textChunks, llmService, maxRetries, algorithmOptions = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`嘗試第 ${attempt} 次處理...`);
      const results = await runGraphRAG(docId, textChunks, llmService, algorithmOptions);
      return results;
    } catch (error) {
      console.error(`第 ${attempt} 次嘗試失敗:`, error.message);

      if (attempt === maxRetries) {
        throw error;
      }

      // 等待一段時間後重試
      const waitTime = attempt * 2000; // 2 秒、4 秒、6 秒
      console.log(`等待 ${waitTime / 1000} 秒後重試...`);
      await delay(waitTime);
    }
  }
}

// 具延遲的 GraphRAG 處理
async function runGraphRAGWithDelay(docId, textChunks, llmService, delayMs, algorithmOptions = {}) {
  console.log(`使用 ${delayMs}ms 延遲處理 ${textChunks.length} 個文字塊...`);

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

  // 改寫 _process_single_content 以加入延遲
  const originalProcess = extractor._process_single_content.bind(extractor);
  extractor._process_single_content = async function (
    chunk_info,
    chunk_seq,
    num_chunks
  ) {
    console.log(`處理第 ${chunk_seq + 1}/${num_chunks} 個文字塊...`);

    // 添加延遲
    if (chunk_seq > 0) {
      console.log(`等待 ${delayMs}ms...`);
      await delay(delayMs);
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

// 主執行函式
async function main() {
  const options = parseArgs();

  if (!options.dataFile) {
    console.error("請提供資料檔案路徑");
    console.error("使用 --help 查看說明");
    process.exit(1);
  }

  if (!fs.existsSync(options.dataFile)) {
    console.error(`資料檔案不存在: ${options.dataFile}`);
    process.exit(1);
  }

  console.log("開始載入自訂資料...");
  console.log(`資料檔案: ${options.dataFile}`);
  console.log(`載入模式: ${options.mode}`);
  console.log(`處理行數: ${options.rows}`);
  console.log(`社群檢測算法: ${options.algorithm}`);
  if (options.algorithm === 'leiden' && options.hierarchical) {
    console.log(`層次化檢測: 啟用`);
  }
  if (options.mode === "slow" || options.mode === "ultra-slow") {
    console.log(`延遲設定: ${options.delay}ms`);
  }
  if (options.mode === "robust") {
    console.log(`重試次數: ${options.retries}`);
  }

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
    const textChunks = await readCsvAndGetChunks(
      options.dataFile,
      options.rows,
      options.mode
    );
    if (textChunks.length === 0) {
      console.error("無法從檔案中讀取到文字資料");
      return;
    }

    // 3. 依模式執行不同處理流程
    console.log("開始 GraphRAG 處理...");
    const docId = `custom_data_${Date.now()}`;
    const llmService = new LlmService("gemini-2.5-flash-lite");

    // 準備算法選項
    const algorithmOptions = {
      algorithm: options.algorithm,
      verbose: true
    };
    
    if (options.algorithm === 'leiden' && options.hierarchical) {
      algorithmOptions.levels = [0, 1, 2];
    }

    let results;

    switch (options.mode) {
      case "standard":
        results = await runGraphRAG(docId, textChunks, llmService, algorithmOptions);
        break;

      case "slow":
        results = await runGraphRAGWithDelay(
          docId,
          textChunks,
          llmService,
          options.delay,
          algorithmOptions
        );
        break;

      case "ultra-slow":
      case "fixed":
        const extractionResults = await processChunksOneByOne(
          docId,
          textChunks,
          llmService,
          options.delay
        );
        // 為這些模式生成簡化的視覺化資料
        results = {
          all_entities_data: extractionResults.all_entities_data,
          all_relationships_data: extractionResults.all_relationships_data,
          resolved_graph: null, // 這些模式不產生完整的圖形物件
        };
        break;

      case "robust":
        results = await runGraphRAGWithRetry(
          docId,
          textChunks,
          llmService,
          options.retries,
          algorithmOptions
        );
        break;

      default:
        throw new Error(`未知的載入模式: ${options.mode}`);
    }

    // 4. 顯示結果統計
    if (results.resolved_graph) {
      console.log("\n處理結果統計:");
      console.log(
        JSON.stringify(
          {
            initial_nodes: results.initial_graph_stats?.nodes || 0,
            initial_edges: results.initial_graph_stats?.edges || 0,
            resolved_nodes: results.resolved_graph_stats?.nodes || 0,
            resolved_edges: results.resolved_graph_stats?.edges || 0,
            community_reports: results.community_reports?.length || 0,
          },
          null,
          2
        )
      );

      // 5. 產生視覺化檔案
      console.log("產生視覺化檔案...");
      const vizData = formatGraphForVisualization(results.resolved_graph);
      generateVisualizationFile(vizData);
    } else {
      // 對於 ultra-slow 與 fixed 模式，產生簡化的視覺化
      console.log("產生簡化視覺化檔案...");
      const nodes = results.all_entities_data.map((entity, index) => ({
        id: entity.entity_name || `entity_${index}`,
        label: entity.entity_name || `entity_${index}`,
        title: `<b>類型:</b> ${
          entity.entity_type || "unknown"
        }<br><b>描述:</b> ${entity.description || "無描述"}`,
        group: entity.entity_type || "unknown",
      }));

      const edges = results.all_relationships_data.map((rel, index) => ({
        from: rel.src_id || `src_${index}`,
        to: rel.tgt_id || `tgt_${index}`,
        title: `<b>權重:</b> ${rel.weight || 1}<br><b>描述:</b> ${
          rel.description || "無描述"
        }`,
      }));

      const graphData = { nodes, edges };
      generateVisualizationFile(graphData);
    }

    console.log("\n資料載入完成!");
    console.log("現在可以存取: http://localhost:3000");
    console.log("提示: 請確保伺服器正在執行 (node server.js)");
  } catch (error) {
    console.error("\n處理過程中發生錯誤:");
    console.error(error.message);

    if (error.message.includes("503")) {
      console.log("\n503 錯誤解決建議:");
      console.log("1. 使用 --mode slow 或 --mode ultra-slow");
      console.log("2. 增加 --delay 參數 (如 3000)");
      console.log("3. 減少 --rows 參數 (如 5-10)");
      console.log("4. 檢查網路連線");
    }
  }
}

main();
