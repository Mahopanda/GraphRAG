const { PROMPTS } = require("../prompts");
const louvain = require("graphology-communities-louvain");
const { ZodError } = require("zod");
const z = require("zod");
const { run: leidenRun, hierarchicalLeiden, addCommunityInfo2Graph } = require("./leiden");

// 定義社群報告的 Zod Schema
const ReportSchema = z.object({
  title: z.string().min(1, "標題不能為空"),
  summary: z.string().min(1, "摘要不能為空"),
  rating: z.number().min(0).max(10),
  rating_explanation: z.string().min(1, "評分說明不能為空"),
  findings: z
    .array(
      z.object({
        summary: z.string().min(1, "發現摘要不能為空"),
        explanation: z.string().min(1, "說明不能為空"),
      })
    )
    .min(1, "至少需要一個發現"),
});

class CommunityReportsExtractor {
  constructor(llm_invoker, options = {}) {
    if (!llm_invoker) {
      throw new Error("An LLM invoker instance is required.");
    }
    this._llm = llm_invoker;
    this._extraction_prompt = PROMPTS.COMMUNITY_REPORT_PROMPT;
    this.callback = (msg) => console.log(msg);
    
    // Community detection algorithm options
    this.options = {
      algorithm: options.algorithm || 'leiden', // Default to 'leiden', also supports 'louvain'
      leidenOptions: {
        maxClusterSize: options.maxClusterSize || 12,
        useLcc: options.useLcc !== false, // Default to true
        seed: options.seed || 0xDEADBEEF,
        resolution: options.resolution || 1.0,
        levels: options.levels || [0], // Default to single level
        verbose: options.verbose || false
      },
      ...options
    };
  }

  /**
   * Generates a text-based report from the structured JSON output.
   */
  _get_text_output(parsed_output) {
    const { title, summary, findings } = parsed_output;
    const report_sections = findings
      .map((f) => `## ${f.summary}\n\n${f.explanation}`)
      .join("\n\n");
    return `# ${title}\n\n${summary}\n\n${report_sections}`;
  }

  /**
   * Extracts a report for a single community.
   */
  async _extract_community_report(graph, community_nodes) {
    if (community_nodes.length < 2) {
      console.log(`跳過社群 (節點數 < 2)`);
      return null;
    }

    const entity_list = community_nodes.map((node) => ({
      entity: node,
      description: graph.getNodeAttribute(node, "description"),
    }));

    const rela_list = [];
    for (let i = 0; i < community_nodes.length; i++) {
      for (let j = i + 1; j < community_nodes.length; j++) {
        const source = community_nodes[i];
        const target = community_nodes[j];
        if (graph.hasEdge(source, target)) {
          // 以 edge key 取得屬性，避免在 multi/有向/混合圖設定下踩雷
          const edgeKey = graph.edge(source, target);
          if (edgeKey) {
            const edge_attrs = graph.getEdgeAttributes(edgeKey);
            rela_list.push({
              source,
              target,
              description: edge_attrs.description,
            });
          }
        }
      }
    }

    // 產生給提示用的簡易 CSV 文字，並跳脫雙引號與換行
    const escapeCsvField = (value) =>
      String(value ?? '')
        .replace(/"/g, '""')
        .replace(/\r?\n/g, ' ');

    const entity_df =
      "id,entity,description\n" +
      entity_list
        .map((e, i) => `${i},${escapeCsvField(e.entity)},"${escapeCsvField(e.description)}"`)
        .join("\n");
    const relation_df =
      "id,source,target,description\n" +
      rela_list
        .map((r, i) => `${i},${r.source},${r.target},"${escapeCsvField(r.description)}"`)
        .join("\n");

    const prompt = this._extraction_prompt
      .replace("{entity_df}", entity_df)
      .replace("{relation_df}", relation_df);

    console.log(`  正在呼叫 LLM 生成報告...`);
    const response_str = await this._llm.chat(prompt);

    try {
      // 更強的 JSON 清理邏輯
      let cleaned_response = response_str.trim();

      // 移除各種 markdown 程式碼區塊包裝
      cleaned_response = cleaned_response
        .replace(/^```json\s*/g, "")
        .replace(/^```\s*/g, "")
        .replace(/\s*```$/g, "")
        .replace(/^```markdown\s*/g, "")
        .replace(/^```text\s*/g, "");

      // 移除可能的額外文字前綴
      if (cleaned_response.includes("{")) {
        const jsonStart = cleaned_response.indexOf("{");
        cleaned_response = cleaned_response.substring(jsonStart);
      }

      // 尋找最後一個完整的 JSON 物件，處理可能的截斷
      const lastBrace = cleaned_response.lastIndexOf("}");
      const firstBrace = cleaned_response.indexOf("{");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        cleaned_response = cleaned_response.substring(
          firstBrace,
          lastBrace + 1
        );
      }

      // 最後清理：移除可能的尾隨逗號
      cleaned_response = cleaned_response.replace(/,(\s*[}\]])/g, "$1");

      console.log(`  正在解析 JSON 回應 (${cleaned_response.length} 字元)...`);

      let response_json = JSON.parse(cleaned_response);

      // Validate the structure of the JSON response
      const validated_response = ReportSchema.parse(response_json);

      const total_rank = community_nodes.reduce(
        (sum, node) => sum + (graph.getNodeAttribute(node, "pagerank") || 0),
        0
      );

      console.log(`  社群報告生成完成`);
      return {
        ...validated_response,
        weight: total_rank,
        entities: community_nodes,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        console.log(`  社群報告格式驗證失敗: ${error.message}`);
        console.log(`  原始回應: ${response_str.substring(0, 200)}...`);
        this.callback(
          `ERROR: Community report validation failed: ${error.message}`
        );
      } else if (error instanceof SyntaxError) {
        console.log(`  JSON 解析錯誤: ${error.message}`);
        console.log(`  清理後的內容: ${cleaned_response.substring(0, 200)}...`);
        console.log(`  原始回應長度: ${response_str.length} 字元`);
        this.callback(`ERROR: JSON parsing failed - ${error.message}`);
      } else {
        console.log(`  未知錯誤: ${error.message}`);
        console.log(`  原始回應: ${response_str.substring(0, 200)}...`);
        this.callback(
          `ERROR: Unexpected error in community report generation: ${error.message}`
        );
      }
      return null;
    }
  }

  async extract(graph, callback) {
    if (callback) this.callback = callback;

    // 檢查圖是否為空
    if (graph.order === 0) {
      console.log("圖中沒有節點，跳過社群檢測");
      this.callback("Graph is empty, skipping community detection.");
      return {
        structured_output: [],
        output: []
      };
    }

    console.log("步驟 1/4: 計算節點 PageRank...");
    // Add PageRank to nodes if not present, as it's used for community weight
    // Check if any node has pagerank attribute
    let hasPagerank = false;
    graph.forEachNode((node, attrs) => {
      if (attrs.pagerank !== undefined) {
        hasPagerank = true;
      }
    });

    if (!hasPagerank) {
      try {
        const pagerank = require("graphology-metrics/centrality/pagerank");
        // 若 assign 介面不可用，可改取函式回傳分數並逐節點 set
        pagerank.assign(graph);
        console.log("PageRank 計算完成");
      } catch (error) {
        console.log("PageRank 計算失敗，使用預設權重");
        // 如果PageRank計算失敗，為每個節點設定預設權重
        graph.forEachNode((node, attrs) => {
          graph.setNodeAttribute(node, 'pagerank', 1.0);
        });
      }
    } else {
      console.log("使用現有的 PageRank 值");
    }

    console.log(`步驟 2/4: 執行 ${this.options.algorithm.toUpperCase()} 社群檢測...`);
    
    let community_groups = {};
    
    if (this.options.algorithm === 'leiden') {
      // Run Leiden community detection
      const { useLcc, seed, levels, verbose } = this.options.leidenOptions;
      // run() 僅支援 useLcc/seed/maxLevels/verbose：由 levels 推導 maxLevels（最大等級索引 + 1）
      const maxLevels = Array.isArray(levels) && levels.length
        ? Math.max(...levels) + 1
        : undefined;
      const leidenRunOptions = { useLcc, seed, maxLevels, verbose };
      const leidenResults = leidenRun(graph, leidenRunOptions);

      // Use requested level(s) if provided, otherwise fallback to the first level
      const availableLevels = Object.keys(leidenResults);
      const requestedLevel = Array.isArray(levels) && levels.length ? String(levels[0]) : undefined;
      const level = (requestedLevel && availableLevels.includes(requestedLevel))
        ? requestedLevel
        : availableLevels[0];

      if (level !== undefined) {
        const levelResults = leidenResults[level];

        // Convert Leiden results to community groups format
        Object.entries(levelResults).forEach(([communityId, communityData]) => {
          community_groups[communityId] = communityData.nodes;
        });

        // Add community information to graph nodes
        Object.entries(levelResults).forEach(([communityId, communityData]) => {
          addCommunityInfo2Graph(graph, communityData.nodes, `leiden_community_${communityId}`);
        });
      }
    } else {
      // Run Louvain community detection (when algorithm === 'louvain')
      const communities = louvain(graph, {
        attributes: {
          weight: "weight", // Use edge weight for detection
        },
      });

      // Group nodes by community ID
      for (const node_id in communities) {
        const community_id = communities[node_id];
        if (!community_groups[community_id]) {
          community_groups[community_id] = [];
        }
        community_groups[community_id].push(node_id);
      }
    }

    const num_communities = Object.keys(community_groups).length;
    console.log(`檢測到 ${num_communities} 個社群`);
    this.callback(`Detected ${num_communities} communities.`);

    console.log("步驟 3/4: 生成社群報告...");
    const report_promises = [];
    let reportIndex = 0;
    for (const community_id in community_groups) {
      let community_nodes = community_groups[community_id];

      // 若社群過大，依 PageRank 取前 N 名以控制 LLM token 成本
      const maxClusterSize = this.options.leidenOptions?.maxClusterSize;
      if (typeof maxClusterSize === 'number' && maxClusterSize > 0 && community_nodes.length > maxClusterSize) {
        community_nodes = [...community_nodes]
          .map((node) => ({ node, pr: graph.getNodeAttribute(node, 'pagerank') || 0 }))
          .sort((a, b) => b.pr - a.pr)
          .slice(0, maxClusterSize)
          .map((x) => x.node);
      }
      reportIndex++;
      console.log(
        `正在處理社群 ${reportIndex}/${num_communities} (${community_nodes.length} 個節點)`
      );
      report_promises.push(
        this._extract_community_report(graph, community_nodes)
      );
    }

    console.log("步驟 4/4: 等待所有報告完成...");
    const structured_reports = (await Promise.all(report_promises)).filter(
      Boolean
    );
    const text_reports = structured_reports.map((report) =>
      this._get_text_output(report)
    );

    console.log(`成功生成 ${structured_reports.length} 個社群報告`);
    this.callback(
      `Successfully generated ${structured_reports.length} community reports.`
    );

    return {
      structured_output: structured_reports,
      output: text_reports,
    };
  }
}

module.exports = { CommunityReportsExtractor };
