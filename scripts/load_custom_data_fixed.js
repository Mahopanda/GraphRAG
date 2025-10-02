// 修復 CSV 資料問題的載入腳本
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
require("dotenv").config();
const { setupSchema } = require("./src/index");
const { LlmService } = require("./src/llm-service");
const {
  GraphExtractorBasic,
} = require("./src/extractors/graph-extractor-basic");

const DATA_FILE_PATH = process.argv[2];
const ROW_LIMIT = parseInt(process.argv[3]) || 5;

if (!DATA_FILE_PATH) {
  console.error("請提供資料檔案路徑");
  console.error(
    "使用方法: node load_custom_data_fixed.js <資料檔案路徑> [行數限制]"
  );
  console.error("範例: node load_custom_data_fixed.js my_data.csv 3");
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
 * 清理和驗證文字內容
 */
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

  // 檢查是否包含中文字元
  if (!/[\u4e00-\u9fff]/.test(cleaned)) {
    console.log(`不包含中文字元，跳過: "${cleaned}"`);
    return null;
  }

  return cleaned;
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
          console.log(`處理行 ${chunks.length + 1}:`, Object.keys(row));

          // 優先使用 text 列，但需要驗證
          let text = row.text;

          // 如果 text 列有問題，嘗試其他列
          if (!text || text.trim().length < 10) {
            text = row.content || row.description || row[Object.keys(row)[0]];
          }

          // 清理和驗證文字
          const cleanedText = cleanAndValidateText(text);

          if (cleanedText) {
            const maxLength = 800;
            if (cleanedText.length > maxLength) {
              console.log(
                `文字過長 (${cleanedText.length} 字元)，截斷到 ${maxLength} 字元`
              );
              chunks.push(cleanedText.substring(0, maxLength) + "...");
            } else {
              chunks.push(cleanedText);
            }
            console.log(`新增文字: "${cleanedText.substring(0, 50)}..."`);
          } else {
            console.log(`跳過無效文字: "${text}"`);
          }
        }
      })
      .on("end", () => {
        console.log(`成功讀取 ${chunks.length} 行有效資料`);
        resolve(chunks);
      })
      .on("error", (error) => {
        console.error("讀取檔案時出錯:", error);
        reject(error);
      });
  });
}

/**
 * 逐個處理文字塊
 */
async function processChunksOneByOne(docId, textChunks, llmService) {
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
    console.log(`內容: ${chunk}`);

    try {
      // 處理單個文字塊
      const result = await extractor._process_single_content(
        { text: chunk, chunk_id: `chunk_${i}` },
        i,
        textChunks.length
      );

      if (result.maybe_nodes && result.maybe_nodes.length > 0) {
        allEntities.push(...result.maybe_nodes);
        console.log(`提取到 ${result.maybe_nodes.length} 個實體`);
        result.maybe_nodes.forEach((node, idx) => {
          console.log(
            `  ${idx + 1}. ${node.entity_name} (${node.entity_type})`
          );
        });
      }

      if (result.maybe_edges && result.maybe_edges.length > 0) {
        allRelationships.push(...result.maybe_edges);
        console.log(`提取到 ${result.maybe_edges.length} 個關係`);
        result.maybe_edges.forEach((edge, idx) => {
          console.log(`  ${idx + 1}. ${edge.src_id} -> ${edge.tgt_id}`);
        });
      }

      console.log(`第 ${i + 1} 個文字塊處理完成`);
    } catch (error) {
      console.error(`第 ${i + 1} 個文字塊處理失敗:`, error.message);
      // 繼續處理下一個
    }

    // 新增延遲（除了最後一個）
    if (i < textChunks.length - 1) {
      console.log(`等待 3 秒...`);
      await delay(3000);
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

/**
 * 生成視覺化檔案
 */
function generateVisualizationFile(entities, relationships) {
  const templatePath = path.join(__dirname, "visualization", "template.html");
  const outputPath = path.join(
    __dirname,
    "visualization",
    "graph_visualization.html"
  );

  // 建立簡單的圖形資料
  const nodes = entities.map((entity, index) => ({
    id: entity.entity_name || `entity_${index}`,
    label: entity.entity_name || `entity_${index}`,
    title: `<b>類型:</b> ${entity.entity_type || "unknown"}<br><b>描述:</b> ${
      entity.description || "無描述"
    }`,
    group: entity.entity_type || "unknown",
  }));

  const edges = relationships.map((rel, index) => ({
    from: rel.src_id || `src_${index}`,
    to: rel.tgt_id || `tgt_${index}`,
    title: `<b>權重:</b> ${rel.weight || 1}<br><b>描述:</b> ${
      rel.description || "無描述"
    }`,
  }));

  const graphData = { nodes, edges };

  const template = fs.readFileSync(templatePath, "utf8");
  const outputHtml = template.replace(
    "//__DATA__HERE__",
    JSON.stringify(graphData, null, 2)
  );

  fs.writeFileSync(outputPath, outputHtml);
  console.log(`\n視覺化檔案已生成: ${outputPath}`);
}

/**
 * 主執行函數
 */
async function main() {
  console.log("開始載入自訂資料 (修復版)...");
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
      console.error("無法從檔案中讀取到有效文字資料");
      return;
    }

    // 3. 逐個處理文字塊
    console.log("開始逐個處理文字塊...");
    const docId = `custom_data_${Date.now()}`;
    const llmService = new LlmService("gemini-2.5-flash-lite");
    const results = await processChunksOneByOne(docId, textChunks, llmService);

    // 4. 生成視覺化檔案
    console.log("生成視覺化檔案...");
    generateVisualizationFile(
      results.all_entities_data,
      results.all_relationships_data
    );

    console.log("\n資料載入完成!");
    console.log("現在可以存取: http://localhost:3000");
    console.log("提示: 確保伺服器正在執行 (node server.js)");
  } catch (error) {
    console.error("\n處理過程中出現錯誤:");
    console.error(error.message);
  }
}

main();
