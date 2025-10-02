/**
 * Cleans an input string by removing HTML escapes, control characters, and other unwanted characters.
 * @param {any} input The input to clean.
 * @returns {string} The cleaned string.
 */
function clean_str(input) {
  if (typeof input !== "string") {
    return input;
  }

  // Basic un-escaping for common HTML entities. A more robust library might be needed for full coverage.
  const unescaped = input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Removes control characters and other unwanted characters
  // eslint-disable-next-line no-control-regex
  let cleaned = unescaped.replace(/["\x00-\x1f\x7f-\x9f]/g, "").trim();

  // Remove angle brackets that LLM adds around entity names
  cleaned = cleaned.replace(/^<(.+)>$/, "$1");
  // Also remove any remaining angle brackets
  cleaned = cleaned.replace(/[<>]/g, "");

  return cleaned;
}

/**
 * Splits a string by multiple markers.
 * @param {string} content The string to split.
 * @param {string[]} markers An array of marker strings to split by.
 * @returns {string[]} An array of strings, with empty strings filtered out.
 */
function split_string_by_multi_markers(content, markers) {
  if (!markers || markers.length === 0) {
    return [content];
  }

  // Create a regex from the markers by escaping them
  const escapedMarkers = markers.map((marker) =>
    marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const regex = new RegExp(escapedMarkers.join("|"), "g");

  const results = content.split(regex);

  // Filter out empty strings that can result from splitting
  return results.filter((r) => r && r.trim() !== "");
}

/**
 * Parses a list of attributes from a record string to extract a single entity.
 * @param {string[]} record_attributes - The attributes split from a record string.
 * @param {string} chunk_key - The identifier for the source chunk.
 * @returns {object|null} An entity object or null if parsing fails.
 */
function handle_single_entity_extraction(record_attributes, chunk_key) {
  if (
    record_attributes.length < 4 ||
    clean_str(record_attributes[0]) !== "entity"
  ) {
    return null;
  }
  const entity_name = clean_str(record_attributes[1]).toUpperCase();
  if (!entity_name) {
    return null;
  }
  const entity_type = clean_str(record_attributes[2]).toUpperCase();
  const entity_description = clean_str(record_attributes[3]);

  return {
    entity_name,
    entity_type,
    description: entity_description,
    source_id: chunk_key,
  };
}

/**
 * Parses a list of attributes from a record string to extract a single relationship.
 * @param {string[]} record_attributes - The attributes split from a record string.
 * @param {string} chunk_key - The identifier for the source chunk.
 * @returns {object|null} A relationship object or null if parsing fails.
 */
function handle_single_relationship_extraction(record_attributes, chunk_key) {
  if (
    record_attributes.length < 5 ||
    clean_str(record_attributes[0]) !== "relationship"
  ) {
    return null;
  }
  const source = clean_str(record_attributes[1]).toUpperCase();
  const target = clean_str(record_attributes[2]).toUpperCase();
  const edge_description = clean_str(record_attributes[3]);
  const edge_keywords = clean_str(record_attributes[4]);

  const weight_str = record_attributes[record_attributes.length - 1];
  const weight = !isNaN(parseFloat(weight_str)) ? parseFloat(weight_str) : 1.0;

  const pair = [source, target].sort();

  return {
    src_id: pair[0],
    tgt_id: pair[1],
    weight,
    description: edge_description,
    keywords: edge_keywords,
    source_id: chunk_key,
    metadata: { created_at: Date.now() },
  };
}

module.exports = {
  clean_str,
  split_string_by_multi_markers,
  handle_single_entity_extraction,
  handle_single_relationship_extraction,
};
