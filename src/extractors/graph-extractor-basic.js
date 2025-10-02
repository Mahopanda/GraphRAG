const { Extractor } = require("./base-extractor");
const { PROMPTS } = require("../prompts");
const {
  perform_variable_replacements,
  split_string_by_multi_markers,
} = require("../utils");

const MAX_GLEANINGS = 2; // Corresponds to ENTITY_EXTRACTION_MAX_GLEANINGS

class GraphExtractorBasic extends Extractor {
  constructor(llm_invoker, language, entity_types) {
    super(llm_invoker, language, entity_types);

    this._context_base = {
      tuple_delimiter: PROMPTS.DEFAULT_TUPLE_DELIMITER,
      record_delimiter: PROMPTS.DEFAULT_RECORD_DELIMITER,
      completion_delimiter: PROMPTS.DEFAULT_COMPLETION_DELIMITER,
      entity_types: this._entity_types.join(","),
      language: this._language,
    };
  }

  async _process_single_content(chunk_info, chunk_seq, num_chunks) {
    const { doc_id, content } = chunk_info;
    let token_count = 0;

    const hint_prompt = PROMPTS.BASIC_ENTITY_EXTRACTION.replace(
      "{entity_types}",
      this._context_base.entity_types
    )
      .replace("{language}", this._context_base.language)
      .replace("{input_text}", content);

    let final_result = await this._chat(hint_prompt);
    token_count += (hint_prompt + final_result).length; // Simple token count for now

    let history = [
      { role: "user", parts: [{ text: hint_prompt }] },
      { role: "model", parts: [{ text: final_result }] },
    ];

    for (let i = 0; i < MAX_GLEANINGS; i++) {
      history.push({
        role: "user",
        parts: [{ text: PROMPTS.BASIC_ENTITY_CONTINUE_EXTRACTION }],
      });
      const glean_result = await this._chat(history);
      token_count += glean_result.length;
      final_result += glean_result;
      history.push({ role: "model", parts: [{ text: glean_result }] });

      if (i >= MAX_GLEANINGS - 1) break;

      history.push({
        role: "user",
        parts: [{ text: PROMPTS.BASIC_ENTITY_IF_LOOP_EXTRACTION }],
      });
      const if_loop_result = await this._chat(history);
      token_count += if_loop_result.length;
      history.push({ role: "model", parts: [{ text: if_loop_result }] });

      if (if_loop_result.toLowerCase().trim().includes("no")) {
        break;
      }

      // 限制歷史長度，避免 context 過長導致 503
      if (history.length > 8) {
        // 保留最新的 4 筆紀錄（2 輪對話）
        history = history.slice(-4);
      }
    }

    this.callback(
      `Chunk ${chunk_seq + 1}/${num_chunks} processed. Tokens: ${token_count}`
    );

    // 僅使用 ## 作為記錄分隔符，不要使用 <|> 作為分隔符
    const records = final_result
      .split("##")
      .map((r) => r.trim())
      .filter((r) => r && !r.includes("<|COMPLETE|>"));

    const cleaned_records = records
      .map((r) => {
        const match = r.match(/\((.*)\)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);

    const { maybe_nodes, maybe_edges } = this._entities_and_relations(
      doc_id,
      cleaned_records,
      this._context_base.tuple_delimiter
    );

    return { maybe_nodes, maybe_edges, token_count };
  }
}

module.exports = { GraphExtractorBasic };
