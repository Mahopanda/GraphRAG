const { PROMPTS } = require("./prompts");
const { perform_variable_replacements } = require("./utils");
const editDistance = require("edit-distance");

class EntityResolution {
  constructor(llm_invoker) {
    if (!llm_invoker) {
      throw new Error("An LLM invoker instance is required.");
    }
    this._llm = llm_invoker;
    this._resolution_prompt = PROMPTS.ENTITY_RESOLUTION_PROMPT;
    this.callback = (msg) => console.log(msg);
  }


  is_similarity(a, b) {
    const a_lower = a.toLowerCase();
    const b_lower = b.toLowerCase();

    // Simple edit distance check
    try {
      const distance = editDistance.levenshtein(a_lower, b_lower);
      if (distance <= Math.min(a.length, b.length) / 2) {
        return true;
      }
    } catch (error) {
      // Fallback to simple length comparison if edit distance fails
      if (Math.abs(a.length - b.length) <= Math.min(a.length, b.length) / 2) {
        return true;
      }
    }

    // Jaccard similarity for character sets
    const set_a = new Set(a_lower);
    const set_b = new Set(b_lower);
    const intersection = new Set([...set_a].filter((x) => set_b.has(x)));
    const union = new Set([...set_a, ...set_b]);
    const jaccard = intersection.size / union.size;

    if (Math.max(a.length, b.length) < 4) {
      return jaccard > 0.6;
    }
    return jaccard >= 0.8;
  }

  /**
   * Processes the LLM response to extract resolution decisions.
   */
  _process_results(num_records, results_str) {
    const decisions = [];
    const records = results_str.split("##"); // Default record delimiter

    for (const record of records) {
      const question_match = record.match(/<\|>(\d+)<\|>/);
      const decision_match = record.match(/<\|>([a-zA-Z]+)<\|>/);

      if (question_match && decision_match) {
        const question_index = parseInt(question_match[1], 10);
        const decision = decision_match[1].toLowerCase();

        if (question_index <= num_records && decision === "yes") {
          decisions.push(question_index - 1); // 0-indexed
        }
      }
    }
    return decisions;
  }

  /**
   * Merges nodes in the graph. This is a simplified version.
   * A real implementation would need a robust graph library like graphology.
   */
  async _merge_graph_nodes(graph, nodes_to_merge) {
    if (nodes_to_merge.length <= 1) return;

    const target_node_name = nodes_to_merge[0];
    const target_node = graph.getNodeAttributes(target_node_name);

    for (let i = 1; i < nodes_to_merge.length; i++) {
      const source_node_name = nodes_to_merge[i];
      const source_node = graph.getNodeAttributes(source_node_name);

      // Merge attributes
      target_node.description += ` <SEP> ${source_node.description}`;
      target_node.source_id = [
        ...new Set([...target_node.source_id, ...source_node.source_id]),
      ];

      // Re-wire edges
      graph.forEachNeighbor(source_node_name, (neighbor, edge_attrs) => {
        graph.dropEdge(source_node_name, neighbor);
        if (!graph.hasEdge(target_node_name, neighbor)) {
          graph.addEdge(target_node_name, neighbor, edge_attrs);
        }
      });

      // Drop the merged node
      graph.dropNode(source_node_name);
    }
    this.callback(
      `Merged ${nodes_to_merge.slice(1).join(", ")} into ${target_node_name}`
    );
  }

  async resolve(graph, callback) {
    if (callback) this.callback = callback;

    const nodes = graph.nodes();
    const node_clusters = {};

    // Group nodes by entity type
    nodes.forEach((node) => {
      const type = graph.getNodeAttribute(node, "entity_type") || "-";
      if (!node_clusters[type]) node_clusters[type] = [];
      node_clusters[type].push(node);
    });

    // Find candidate pairs for resolution
    const candidate_resolution = {};
    let num_candidates = 0;
    for (const type in node_clusters) {
      const cluster_nodes = node_clusters[type];
      candidate_resolution[type] = [];
      for (let i = 0; i < cluster_nodes.length; i++) {
        for (let j = i + 1; j < cluster_nodes.length; j++) {
          if (this.is_similarity(cluster_nodes[i], cluster_nodes[j])) {
            candidate_resolution[type].push([
              cluster_nodes[i],
              cluster_nodes[j],
            ]);
          }
        }
      }
      num_candidates += candidate_resolution[type].length;
    }
    this.callback(
      `Identified ${num_candidates} candidate pairs for resolution.`
    );

    if (num_candidates === 0) return graph;

    const pairs_to_merge = new Set();
    const resolution_batch_size = 50;

    // Process candidates in batches
    for (const type in candidate_resolution) {
      const candidates = candidate_resolution[type];
      for (let i = 0; i < candidates.length; i += resolution_batch_size) {
        const batch = candidates.slice(i, i + resolution_batch_size);

        const pair_txt = batch
          .map(
            (pair, index) =>
              `Question ${index + 1}: name of ${type} A is ${
                pair[0]
              }, name of ${type} B is ${pair[1]}`
          )
          .join("\n");

        const prompt = this._resolution_prompt.replace(
          "{input_text}",
          pair_txt
        );
        const response = await this._llm.chat(prompt);

        const decisions = this._process_results(batch.length, response);
        decisions.forEach((decision_index) => {
          pairs_to_merge.add(JSON.stringify(batch[decision_index].sort()));
        });
      }
    }

    this.callback(`LLM identified ${pairs_to_merge.size} pairs to merge.`);

    // Build a connection graph of merges
    const Graph = require("graphology");
    const connect_graph = new Graph();
    pairs_to_merge.forEach((pair_str) => {
      const pair = JSON.parse(pair_str);
      if (!connect_graph.hasNode(pair[0])) connect_graph.addNode(pair[0]);
      if (!connect_graph.hasNode(pair[1])) connect_graph.addNode(pair[1]);
      if (!connect_graph.hasEdge(pair[0], pair[1]))
        connect_graph.addEdge(pair[0], pair[1]);
    });

    // Find connected components to merge all related entities at once
    const components = require("graphology-components");
    const connected_components = components.connectedComponents(connect_graph);

    for (const component of connected_components) {
      await this._merge_graph_nodes(graph, component);
    }

    return graph;
  }
}

module.exports = { EntityResolution };
