const Database = require("better-sqlite3");
const Graph = require("graphology");
const { LlmService } = require("./src/llm-service");
const { FullTextSearch } = require("./src/fulltext-search");

const db = new Database("graphrag.db", { readonly: true });

// 全域全文檢索實例
let fullTextSearch = null;

/**
 * Loads the entire graph from the SQLite database into a graphology object.
 */
function loadGraphFromDb() {
  const graph = new Graph();
  const nodes = db.prepare("SELECT * FROM nodes").all();
  const edges = db.prepare("SELECT * FROM edges").all();

  nodes.forEach((node) => {
    graph.addNode(node.id, {
      entity_type: node.entity_type,
      description: node.description,
      source_ids: JSON.parse(node.source_ids),
    });
  });

  edges.forEach((edge) => {
    // Ensure nodes exist before adding edge, though DB constraints should handle this
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.addEdge(edge.source, edge.target, {
        description: edge.description,
        weight: edge.weight,
        keywords: JSON.parse(edge.keywords),
        source_ids: JSON.parse(edge.source_ids),
      });
    }
  });
  console.log(
    `Graph loaded from DB: ${graph.order} nodes, ${graph.size} edges.`
  );
  return graph;
}

/**
 * 初始化全文檢索索引
 * @param {Graph} graph The graphology graph object.
 */
function initializeFullTextSearch(graph) {
  if (!fullTextSearch) {
    fullTextSearch = new FullTextSearch();
    fullTextSearch.buildIndex(graph);
  }
}

/**
 * 使用全文檢索搜尋圖形
 * @param {Graph} graph The graphology graph object.
 * @param {string} query The user's search query.
 * @param {Object} options 搜尋選項
 * @returns {string} A formatted string of context from the graph.
 */
function searchGraphWithFullText(graph, query, options = {}) {
  // 確保索引已建立
  initializeFullTextSearch(graph);

  const {
    maxResults = 20,
    useBigram = true,
    useKeywords = true,
    useFuzzy = true,
    fuzzyThreshold = 0.7,
    sequential = false, // 新增依序搜尋選項
  } = options;

  console.log(`使用全文檢索搜尋: "${query}"`);
  console.log(
    `搜尋選項: bigram=${useBigram}, keywords=${useKeywords}, fuzzy=${useFuzzy}, sequential=${sequential}`
  );

  // 選擇搜尋策略
  const searchResults = sequential
    ? fullTextSearch.searchSequentially(query, {
        useBigram,
        useKeywords,
        useFuzzy,
        fuzzyThreshold,
        maxResults,
      })
    : fullTextSearch.search(query, {
        useBigram,
        useKeywords,
        useFuzzy,
        fuzzyThreshold,
        maxResults,
      });

  console.log(`找到 ${searchResults.length} 個相關結果`);

  // 格式化結果
  const context = new Set();
  let evidenceCount = 0;

  searchResults.forEach((result) => {
    const entity = fullTextSearch.entityIndex.get(result.id);
    if (!entity) return;

    if (entity.type === "node") {
      context.add(
        `- 實體: ${result.id} (類型: ${entity.attrs.entity_type})\n  - 描述: ${
          entity.attrs.description
        }\n  - 相關度: ${(result.totalScore * 100).toFixed(
          1
        )}% (方法: ${result.methods.join(", ")})`
      );
      evidenceCount++;
    } else if (entity.type === "edge") {
      context.add(
        `- 關係: ${entity.source} <-> ${entity.target}\n  - 描述: ${
          entity.attrs.description
        }\n  - 相關度: ${(result.totalScore * 100).toFixed(
          1
        )}% (方法: ${result.methods.join(", ")})`
      );
      evidenceCount++;
    }
  });

  console.log(`從圖形中找到 ${evidenceCount} 個證據片段`);
  return Array.from(context).join("\n");
}

/**
 * Performs a simple keyword search over the graph nodes and edges.
 * @param {Graph} graph The graphology graph object.
 * @param {string} query The user's search query.
 * @returns {string} A formatted string of context from the graph.
 */
function searchGraph(graph, query) {
  const query_terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2);
  const context = new Set();
  let evidenceCount = 0;

  graph.forEachNode((node, attrs) => {
    const node_content = `${node} ${attrs.description}`.toLowerCase();
    if (query_terms.some((term) => node_content.includes(term))) {
      context.add(
        `- Entity: ${node} (Type: ${attrs.entity_type})\n  - Description: ${attrs.description}`
      );
      evidenceCount++;
    }
  });

  graph.forEachEdge((edge, attrs, source, target) => {
    const edge_content =
      `${source} ${target} ${attrs.description}`.toLowerCase();
    if (query_terms.some((term) => edge_content.includes(term))) {
      context.add(
        `- Relationship: ${source} <-> ${target}\n  - Description: ${attrs.description}`
      );
      evidenceCount++;
    }
  });

  console.log(
    `Found ${evidenceCount} pieces of evidence in the graph for the query.`
  );
  return Array.from(context).join("\n");
}

/**
 * The main query handler function.
 * @param {string} query The user's search query.
 * @param {Object} options 搜尋選項
 * @returns {Promise<object>} An object containing the answer and the context.
 */
async function handleQuery(query, options = {}) {
  console.log(`Querying the knowledge graph for: "${query}"\n`);

  const graph = loadGraphFromDb();
  if (graph.order === 0) {
    throw new Error(
      "圖形為空。請先執行 'node water_margin_demo.js' 來建立圖形。"
    );
  }

  // 使用全文檢索或傳統搜尋
  const useFullText = options.useFullText !== false; // 預設使用全文檢索
  const useSequential = options.sequential === true; // 預設使用綜合搜尋，伺服器模式使用依序搜尋

  const context = useFullText
    ? searchGraphWithFullText(graph, query, {
        ...options,
        sequential: useSequential,
      })
    : searchGraph(graph, query);

  if (!context) {
    return {
      answer: "在知識圖形中找不到與您的查詢相關的資訊。",
      context: "",
      entities: [],
    };
  }

  const llmService = new LlmService();
  const prompt = `
        你是一位基於知識圖形回答問題的 AI 助理。
        請根據以下從圖形中提取的上下文，為使用者的問題提供簡潔且全面的答案。
        在答案結尾，請列出與你的答案最相關的具體實體名稱，以 JSON 陣列格式呈現，例如：["實體名稱_1", "實體名稱_2"]。

        --- 知識圖形上下文 ---
        ${context}
        ------------------------

        --- 使用者問題 ---
        ${query}
        ----------------

        答案:
    `;

  console.log("\n正在使用 Gemini 合成答案...\n");
  const rawAnswer = await llmService.chat(prompt);

  // 提取答案和實體 JSON 陣列
  const answerMatch = rawAnswer.match(/(.*)\[.*\]/s);
  const entitiesMatch = rawAnswer.match(/(\[".*?"\])/s);

  const answer = answerMatch ? answerMatch[1].trim() : rawAnswer.trim();
  let entities = [];
  if (entitiesMatch) {
    try {
      entities = JSON.parse(entitiesMatch[1]);
    } catch (e) {
      console.error("無法從 LLM 回應中解析實體。");
    }
  }

  return { answer, context, entities };
}

// Main execution logic for command-line usage
async function main() {
  const args = process.argv.slice(2);
  const query = args.join(" ");

  if (!query) {
    console.log(`
使用方法: node search_graph.js <查詢> [選項]

選項:
  --no-fulltext    停用全文檢索，使用傳統關鍵字搜尋
  --no-bigram      停用 bigram 搜尋
  --no-keywords    停用關鍵字搜尋
  --no-fuzzy       停用模糊搜尋
  --sequential     使用依序搜尋（先關鍵字，再 bigram，最後模糊）
  --fuzzy-threshold <數值>  設定模糊搜尋閾值 (0-1，預設 0.7)
  --max-results <數量>      設定最大結果數量 (預設 20)

範例:
  node search_graph.js "宋江的職責"
  node search_graph.js "梁山泊聚義" --no-fuzzy
  node search_graph.js "好漢" --fuzzy-threshold 0.8 --max-results 10
  node search_graph.js "晁蓋" --sequential
    `);
    return;
  }

  // 解析命令列選項
  const options = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--no-fulltext":
        options.useFullText = false;
        break;
      case "--no-bigram":
        options.useBigram = false;
        break;
      case "--no-keywords":
        options.useKeywords = false;
        break;
      case "--no-fuzzy":
        options.useFuzzy = false;
        break;
      case "--sequential":
        options.sequential = true;
        break;
      case "--fuzzy-threshold":
        options.fuzzyThreshold = parseFloat(args[++i]);
        break;
      case "--max-results":
        options.maxResults = parseInt(args[++i]);
        break;
    }
  }

  const result = await handleQuery(query, options);

  console.log("--- 答案 ---");
  console.log(result.answer);
  console.log("\n--- 圖形證據 ---");
  console.log(result.context);
  console.log("\n--- 相關實體 ---");
  console.log(result.entities);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("\n--- 搜尋過程中發生錯誤 ---");
      console.error(error);
    })
    .finally(() => {
      if (db) db.close();
    });
}

module.exports = { handleQuery, loadGraphFromDb };
