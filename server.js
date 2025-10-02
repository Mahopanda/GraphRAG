const http = require("http");
const fs = require("fs");
const path = require("path");
const { handleQuery } = require("./search_graph");

const PORT = 3000;

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // Allow CORS for local development
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/api/query" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", async () => {
      try {
        const { query, options = {} } = JSON.parse(body);
        if (!query) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "查詢是必需的" }));
          return;
        }

        // 伺服器模式預設使用依序搜尋
        const serverOptions = { ...options, sequential: true };
        const result = await handleQuery(query, serverOptions);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        console.error("伺服器錯誤:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "發生內部伺服器錯誤",
            details: error.message,
          })
        );
      }
    });
  } else if (req.url === "/api/graph-data" && req.method === "GET") {
    // Serve graph data for visualization
    try {
      const { loadGraphFromDb } = require("./search_graph");
      const graph = loadGraphFromDb();

      // Convert graph to vis-network format
      const nodes = [];
      const edges = [];

      graph.forEachNode((nodeId, attrs) => {
        nodes.push({
          id: nodeId,
          label: nodeId, // 顯示節點名稱
          title: `<b>${nodeId}</b><br><b>類型:</b> ${
            attrs.entity_type
          }<br><b>描述:</b> ${attrs.description || "無描述"}`,
          group: attrs.entity_type,
        });
      });

      graph.forEachEdge((edgeId, attrs, source, target) => {
        edges.push({
          id: edgeId,
          from: source,
          to: target,
          label: "", // 不顯示邊標籤
          title: `<b>關係</b><br><b>從:</b> ${source}<br><b>到:</b> ${target}<br><b>描述:</b> ${
            attrs.description || "無描述"
          }`,
        });
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ nodes, edges }));
    } catch (error) {
      console.error("Error loading graph data:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to load graph data" }));
    }
  } else if (
    req.url === "/" ||
    req.url === "/visualization" ||
    req.url === "/graph_visualization.html"
  ) {
    // Serve the visualization page
    const filePath = path.join(
      __dirname,
      "visualization",
      "graph_visualization.html"
    );
    try {
      const content = fs.readFileSync(filePath, "utf8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    } catch (error) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Visualization file not found");
    }
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

server.listen(PORT, () => {
  console.log(`伺服器正在監聽 http://localhost:${PORT}`);
  console.log("您現在可以在瀏覽器中開啟 http://localhost:3000 來查看視覺化。");
});
