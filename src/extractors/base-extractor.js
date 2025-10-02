const { PROMPTS } = require("../prompts");
const {
  handle_single_entity_extraction,
  handle_single_relationship_extraction,
  split_string_by_multi_markers,
} = require("../utils");

class Extractor {
  constructor(llm_invoker, language = "English", entity_types = []) {
    if (!llm_invoker) {
      throw new Error("An LLM invoker instance is required.");
    }
    this._llm = llm_invoker;
    this._language = language;
    this._entity_types = entity_types;
    this.callback = (msg) => console.log(msg); // Default callback
  }

  async _chat(prompt) {
    // Use the provided LLM service instance
    return this._llm.chat(prompt);
  }

  _entities_and_relations(chunk_key, records, tuple_delimiter) {
    const maybe_nodes = new Map();
    const maybe_edges = new Map();
    const ent_types = new Set(this._entity_types.map((t) => t.toLowerCase()));

    for (const record of records) {
      const record_attributes = record.split(tuple_delimiter);

      const entity = handle_single_entity_extraction(
        record_attributes,
        chunk_key
      );
      if (entity && ent_types.has(entity.entity_type.toLowerCase())) {
        if (!maybe_nodes.has(entity.entity_name)) {
          maybe_nodes.set(entity.entity_name, []);
        }
        maybe_nodes.get(entity.entity_name).push(entity);
        continue;
      }

      const relation = handle_single_relationship_extraction(
        record_attributes,
        chunk_key
      );
      if (relation) {
        const edge_key = JSON.stringify(
          [relation.src_id, relation.tgt_id].sort()
        );
        if (!maybe_edges.has(edge_key)) {
          maybe_edges.set(edge_key, []);
        }
        maybe_edges.get(edge_key).push(relation);
      }
    }
    return { maybe_nodes, maybe_edges };
  }

  async _merge_nodes(entity_name, entities) {
    if (!entities || entities.length === 0) {
      return null;
    }

    // Find the most common entity type
    const type_counts = entities.reduce((acc, { entity_type }) => {
      acc[entity_type] = (acc[entity_type] || 0) + 1;
      return acc;
    }, {});
    const entity_type = Object.keys(type_counts).reduce((a, b) =>
      type_counts[a] > type_counts[b] ? a : b
    );

    const descriptions = [...new Set(entities.map((e) => e.description))].join(
      " <SEP> "
    );
    const source_ids = [...new Set(entities.flatMap((e) => e.source_id))];

    let final_description = descriptions;
    if (descriptions.split(" <SEP> ").length > 12) {
      this.callback(`Triggering summary for entity: ${entity_name}`);
      const prompt = PROMPTS.SUMMARIZE_DESCRIPTIONS_PROMPT.replace(
        "{entity_name}",
        entity_name
      )
        .replace("{description_list}", descriptions)
        .replace("{language}", this._language);
      final_description = await this._chat(prompt);
    }

    return {
      entity_name,
      entity_type,
      description: final_description,
      source_id: source_ids,
    };
  }

  async _merge_edges(edge_key, edges_data) {
    if (!edges_data || edges_data.length === 0) {
      return null;
    }

    const { src_id, tgt_id } = edges_data[0];
    const weight = edges_data.reduce((sum, edge) => sum + edge.weight, 0);
    const descriptions = [
      ...new Set(edges_data.map((e) => e.description)),
    ].join(" <SEP> ");
    const keywords = [...new Set(edges_data.flatMap((e) => e.keywords))];
    const source_ids = [...new Set(edges_data.flatMap((e) => e.source_id))];

    let final_description = descriptions;
    if (descriptions.split(" <SEP> ").length > 12) {
      this.callback(`Triggering summary for edge: ${src_id} -> ${tgt_id}`);
      const prompt = PROMPTS.SUMMARIZE_DESCRIPTIONS_PROMPT.replace(
        "{entity_name}",
        `${src_id} -> ${tgt_id}`
      )
        .replace("{description_list}", descriptions)
        .replace("{language}", this._language);
      final_description = await this._chat(prompt);
    }

    return {
      src_id,
      tgt_id,
      description: final_description,
      keywords,
      weight,
      source_id: source_ids,
    };
  }

  // This is the main entry point for the extractor.
  // It will be called by the specific extractor implementations (basic/general).
  async extract(doc_id, chunks, callback) {
    if (callback) this.callback = callback;
    const start_ts = Date.now();

    // Process chunks in parallel
    const extraction_promises = chunks.map((chunk, i) =>
      this._process_single_content({ doc_id, content: chunk }, i, chunks.length)
    );
    const all_results = await Promise.all(extraction_promises);

    const combined_nodes = new Map();
    const combined_edges = new Map();
    let sum_token_count = 0;

    for (const { maybe_nodes, maybe_edges, token_count } of all_results) {
      for (const [key, value] of maybe_nodes.entries()) {
        if (!combined_nodes.has(key)) combined_nodes.set(key, []);
        combined_nodes.get(key).push(...value);
      }
      for (const [key, value] of maybe_edges.entries()) {
        if (!combined_edges.has(key)) combined_edges.set(key, []);
        combined_edges.get(key).push(...value);
      }
      sum_token_count += token_count;
    }

    this.callback(
      `Entities and relationships extraction done. ${
        combined_nodes.size
      } nodes, ${combined_edges.size} edges, ${sum_token_count} tokens, ${
        (Date.now() - start_ts) / 1000
      }s.`
    );

    // Merge entities in parallel
    const node_merge_promises = [];
    for (const [entity_name, entities] of combined_nodes.entries()) {
      node_merge_promises.push(this._merge_nodes(entity_name, entities));
    }
    const all_entities_data = (await Promise.all(node_merge_promises)).filter(
      Boolean
    );
    this.callback(`Entities merging done. ${(Date.now() - start_ts) / 1000}s.`);

    // Merge relationships in parallel
    const edge_merge_promises = [];
    for (const [edge_key, edges] of combined_edges.entries()) {
      edge_merge_promises.push(this._merge_edges(edge_key, edges));
    }
    const all_relationships_data = (
      await Promise.all(edge_merge_promises)
    ).filter(Boolean);
    this.callback(
      `Relationships merging done. ${(Date.now() - start_ts) / 1000}s.`
    );

    return { all_entities_data, all_relationships_data };
  }

  // This method needs to be implemented by the subclasses (basic/general)
  async _process_single_content(chunk_info, chunk_seq, num_chunks) {
    throw new Error(
      "_process_single_content must be implemented by a subclass"
    );
  }
}

module.exports = { Extractor };
