const Database = require("better-sqlite3");
const Graph = require("graphology");
const { GraphExtractorBasic } = require("./extractors/graph-extractor-basic");
const { EntityResolution } = require("./entity-resolution");
const {
  CommunityReportsExtractor,
} = require("./community/community-reports-extractor");

// --- Database Setup ---
const db = new Database("graphrag.db");

function setupSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      entity_type TEXT,
      description TEXT,
      source_ids TEXT
    );
    CREATE TABLE IF NOT EXISTS edges (
      source TEXT,
      target TEXT,
      description TEXT,
      weight REAL,
      keywords TEXT,
      source_ids TEXT,
      PRIMARY KEY (source, target)
    );
  `);
  console.log("Database schema is ready.");
}

function saveGraphToDb(graph) {
  const insertNode = db.prepare(
    "INSERT OR REPLACE INTO nodes (id, entity_type, description, source_ids) VALUES (?, ?, ?, ?)"
  );
  const insertEdge = db.prepare(
    "INSERT OR REPLACE INTO edges (source, target, description, weight, keywords, source_ids) VALUES (?, ?, ?, ?, ?, ?)"
  );

  db.transaction(() => {
    graph.forEachNode((node, attrs) => {
      insertNode.run(
        node,
        attrs.entity_type,
        attrs.description,
        JSON.stringify(attrs.source_id)
      );
    });
    graph.forEachEdge((edge, attrs, source, target) => {
      insertEdge.run(
        source,
        target,
        attrs.description,
        attrs.weight,
        JSON.stringify(attrs.keywords),
        JSON.stringify(attrs.source_id)
      );
    });
  })();
  console.log(`Graph saved to DB: ${graph.order} nodes, ${graph.size} edges.`);
}

// --- Main Orchestration ---

async function runGraphRAG(doc_id, text_chunks, llmService, options = {}) {
  console.log(`--- Starting GraphRAG process for doc_id: ${doc_id} ---`);

  // 1. Graph Extraction
  const entity_types = [
    "person",
    "organization",
    "company",
    "location",
    "agreement",
    "law",
  ];
  const extractor = new GraphExtractorBasic(
    llmService,
    "Chinese",
    entity_types
  );
  const { all_entities_data, all_relationships_data } = await extractor.extract(
    doc_id,
    text_chunks
  );

  const graph = new Graph();
  all_entities_data.forEach((node) => {
    graph.addNode(node.entity_name, { ...node });
  });
  all_relationships_data.forEach((edge) => {
    if (graph.hasNode(edge.src_id) && graph.hasNode(edge.tgt_id)) {
      graph.addEdge(edge.src_id, edge.tgt_id, { ...edge });
    }
  });

  console.log(
    `Initial graph created: ${graph.order} nodes, ${graph.size} edges.`
  );

  // 2. Save initial graph to Database
  saveGraphToDb(graph);

  // 3. Entity Resolution
  const resolver = new EntityResolution(llmService);
  const resolved_graph = await resolver.resolve(graph);
  console.log(
    `Resolved graph: ${resolved_graph.order} nodes, ${resolved_graph.size} edges.`
  );

  // 4. Community Detection & Reporting
  console.log("正在進行社群檢測與報告生成...");
  const reporter = new CommunityReportsExtractor(llmService, options);
  const reports = await reporter.extract(resolved_graph);

  console.log(`--- GraphRAG process finished ---`);

  return {
    initial_graph_stats: { nodes: graph.order, edges: graph.size },
    resolved_graph_stats: {
      nodes: resolved_graph.order,
      edges: resolved_graph.size,
    },
    resolved_graph: resolved_graph, // Return the actual graph object
    community_reports: reports.structured_output,
  };
}

module.exports = { runGraphRAG, setupSchema };
