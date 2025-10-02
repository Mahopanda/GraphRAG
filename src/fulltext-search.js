/**
 * 全文檢索模組
 * 支援多種搜尋策略：關鍵字匹配、bigram、模糊匹配、語義搜尋
 */

class FullTextSearch {
  constructor() {
    this.bigramIndex = new Map(); // bigram 索引
    this.trigramIndex = new Map(); // trigram 索引
    this.keywordIndex = new Map(); // 關鍵字索引
    this.entityIndex = new Map(); // 實體索引
  }

  /**
   * 建立 bigram 索引
   * @param {string} text 要索引的文字
   * @param {string} id 文件 ID
   * @param {string} type 文件類型 (node/edge)
   */
  addToBigramIndex(text, id, type = "node") {
    const normalizedText = this.normalizeText(text);
    const bigrams = this.generateBigrams(normalizedText);

    bigrams.forEach((bigram) => {
      if (!this.bigramIndex.has(bigram)) {
        this.bigramIndex.set(bigram, new Set());
      }
      this.bigramIndex.get(bigram).add({ id, type, text: normalizedText });
    });
  }

  /**
   * 建立 trigram 索引
   * @param {string} text 要索引的文字
   * @param {string} id 文件 ID
   * @param {string} type 文件類型 (node/edge)
   */
  addToTrigramIndex(text, id, type = "node") {
    const normalizedText = this.normalizeText(text);
    const trigrams = this.generateTrigrams(normalizedText);

    trigrams.forEach((trigram) => {
      if (!this.trigramIndex.has(trigram)) {
        this.trigramIndex.set(trigram, new Set());
      }
      this.trigramIndex.get(trigram).add({ id, type, text: normalizedText });
    });
  }

  /**
   * 建立關鍵字索引
   * @param {string} text 要索引的文字
   * @param {string} id 文件 ID
   * @param {string} type 文件類型 (node/edge)
   */
  addToKeywordIndex(text, id, type = "node") {
    const normalizedText = this.normalizeText(text);
    const keywords = this.extractKeywords(normalizedText);

    keywords.forEach((keyword) => {
      if (!this.keywordIndex.has(keyword)) {
        this.keywordIndex.set(keyword, new Set());
      }
      this.keywordIndex.get(keyword).add({ id, type, text: normalizedText });
    });
  }

  /**
   * 正規化文字
   * @param {string} text 原始文字
   * @returns {string} 正規化後的文字
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[^\u4e00-\u9fff\w\s]/g, " ") // 保留中文、英文、數字、空白
      .replace(/\s+/g, " ") // 合併多個空白
      .trim();
  }

  /**
   * 產生 bigram
   * @param {string} text 文字
   * @returns {Array<string>} bigram 陣列
   */
  generateBigrams(text) {
    const bigrams = [];
    for (let i = 0; i < text.length - 1; i++) {
      const bigram = text.substring(i, i + 2);
      if (bigram.trim().length === 2) {
        bigrams.push(bigram);
      }
    }
    return bigrams;
  }

  /**
   * 產生 trigram
   * @param {string} text 文字
   * @returns {Array<string>} trigram 陣列
   */
  generateTrigrams(text) {
    const trigrams = [];
    for (let i = 0; i < text.length - 2; i++) {
      const trigram = text.substring(i, i + 3);
      if (trigram.trim().length === 3) {
        trigrams.push(trigram);
      }
    }
    return trigrams;
  }

  /**
   * 提取關鍵字
   * @param {string} text 文字
   * @returns {Array<string>} 關鍵字陣列
   */
  extractKeywords(text) {
    // 分割成詞彙，過濾掉太短的詞
    const words = text.split(/\s+/).filter((word) => word.length >= 2);

    // 對於中文，也提取單字（如果長度足夠）
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
    chineseChars.forEach((char) => {
      if (char.length === 1) {
        words.push(char);
      }
    });

    return [...new Set(words)]; // 去重
  }

  /**
   * 計算編輯距離（Levenshtein distance）
   * @param {string} a 字串 A
   * @param {string} b 字串 B
   * @returns {number} 編輯距離
   */
  levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  /**
   * 模糊匹配搜尋
   * @param {string} query 查詢字串
   * @param {Array} candidates 候選字串陣列
   * @param {number} threshold 相似度閾值 (0-1)
   * @returns {Array} 匹配結果
   */
  fuzzySearch(query, candidates, threshold = 0.7) {
    const normalizedQuery = this.normalizeText(query);
    const results = [];

    candidates.forEach((candidate) => {
      const distance = this.levenshteinDistance(
        normalizedQuery,
        candidate.text
      );
      const maxLength = Math.max(normalizedQuery.length, candidate.text.length);
      const similarity = 1 - distance / maxLength;

      if (similarity >= threshold) {
        results.push({
          ...candidate,
          similarity,
          distance,
        });
      }
    });

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Bigram 搜尋
   * @param {string} query 查詢字串
   * @returns {Array} 搜尋結果
   */
  searchByBigram(query) {
    const normalizedQuery = this.normalizeText(query);
    const queryBigrams = this.generateBigrams(normalizedQuery);
    const results = new Map();

    queryBigrams.forEach((bigram) => {
      if (this.bigramIndex.has(bigram)) {
        this.bigramIndex.get(bigram).forEach((item) => {
          const key = `${item.type}:${item.id}`;
          if (!results.has(key)) {
            results.set(key, { ...item, score: 0, matchedBigrams: [] });
          }
          results.get(key).score += 1;
          results.get(key).matchedBigrams.push(bigram);
        });
      }
    });

    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .map((result) => ({
        ...result,
        relevance: result.score / queryBigrams.length,
      }));
  }

  /**
   * 關鍵字搜尋
   * @param {string} query 查詢字串
   * @returns {Array} 搜尋結果
   */
  searchByKeywords(query) {
    const normalizedQuery = this.normalizeText(query);
    const queryKeywords = this.extractKeywords(normalizedQuery);
    const results = new Map();

    queryKeywords.forEach((keyword) => {
      if (this.keywordIndex.has(keyword)) {
        this.keywordIndex.get(keyword).forEach((item) => {
          const key = `${item.type}:${item.id}`;
          if (!results.has(key)) {
            results.set(key, { ...item, score: 0, matchedKeywords: [] });
          }
          results.get(key).score += 1;
          results.get(key).matchedKeywords.push(keyword);
        });
      }
    });

    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .map((result) => ({
        ...result,
        relevance: result.score / queryKeywords.length,
      }));
  }

  /**
   * 綜合搜尋（結合多種策略）
   * @param {string} query 查詢字串
   * @param {Object} options 搜尋選項
   * @returns {Array} 搜尋結果
   */
  search(query, options = {}) {
    const {
      useBigram = true,
      useKeywords = true,
      useFuzzy = true,
      fuzzyThreshold = 0.7,
      maxResults = 50,
    } = options;

    const allResults = new Map();

    // Bigram 搜尋
    if (useBigram) {
      const bigramResults = this.searchByBigram(query);
      bigramResults.forEach((result) => {
        const key = `${result.type}:${result.id}`;
        if (!allResults.has(key)) {
          allResults.set(key, { ...result, totalScore: 0, methods: [] });
        }
        allResults.get(key).totalScore += result.relevance * 0.4; // Bigram 權重
        allResults.get(key).methods.push("bigram");
      });
    }

    // 關鍵字搜尋
    if (useKeywords) {
      const keywordResults = this.searchByKeywords(query);
      keywordResults.forEach((result) => {
        const key = `${result.type}:${result.id}`;
        if (!allResults.has(key)) {
          allResults.set(key, { ...result, totalScore: 0, methods: [] });
        }
        allResults.get(key).totalScore += result.relevance * 0.6; // 關鍵字權重較高
        allResults.get(key).methods.push("keyword");
      });
    }

    // 模糊搜尋（如果前兩種方法結果較少）
    if (useFuzzy && allResults.size < 10) {
      const allCandidates = [];
      this.bigramIndex.forEach((items) => {
        items.forEach((item) => allCandidates.push(item));
      });

      const fuzzyResults = this.fuzzySearch(
        query,
        allCandidates,
        fuzzyThreshold
      );
      fuzzyResults.forEach((result) => {
        const key = `${result.type}:${result.id}`;
        if (!allResults.has(key)) {
          allResults.set(key, { ...result, totalScore: 0, methods: [] });
        }
        allResults.get(key).totalScore += result.similarity * 0.3; // 模糊搜尋權重較低
        allResults.get(key).methods.push("fuzzy");
      });
    }

    return Array.from(allResults.values())
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, maxResults);
  }

  /**
   * 依序搜尋（先跑關鍵字，沒有結果再跑其他策略）
   * @param {string} query 查詢字串
   * @param {Object} options 搜尋選項
   * @returns {Array} 搜尋結果
   */
  searchSequentially(query, options = {}) {
    const {
      useKeywords = true,
      useBigram = true,
      useFuzzy = true,
      fuzzyThreshold = 0.7,
      maxResults = 50,
    } = options;

    console.log(`依序搜尋策略: "${query}"`);

    // 1. 先嘗試關鍵字搜尋
    if (useKeywords) {
      console.log("步驟 1: 嘗試關鍵字搜尋...");
      const keywordResults = this.searchByKeywords(query);
      if (keywordResults.length > 0) {
        console.log(`關鍵字搜尋找到 ${keywordResults.length} 個結果，停止搜尋`);
        return keywordResults
          .map((result) => ({
            ...result,
            totalScore: result.relevance,
            methods: ["keyword"],
          }))
          .slice(0, maxResults);
      }
      console.log("關鍵字搜尋無結果，繼續下一步");
    }

    // 2. 再嘗試 Bigram 搜尋
    if (useBigram) {
      console.log("步驟 2: 嘗試 Bigram 搜尋...");
      const bigramResults = this.searchByBigram(query);
      if (bigramResults.length > 0) {
        console.log(`Bigram 搜尋找到 ${bigramResults.length} 個結果，停止搜尋`);
        return bigramResults
          .map((result) => ({
            ...result,
            totalScore: result.relevance,
            methods: ["bigram"],
          }))
          .slice(0, maxResults);
      }
      console.log("Bigram 搜尋無結果，繼續下一步");
    }

    // 3. 最後嘗試模糊搜尋
    if (useFuzzy) {
      console.log("步驟 3: 嘗試模糊搜尋...");
      const allCandidates = [];
      this.bigramIndex.forEach((items) => {
        items.forEach((item) => allCandidates.push(item));
      });

      const fuzzyResults = this.fuzzySearch(
        query,
        allCandidates,
        fuzzyThreshold
      );
      if (fuzzyResults.length > 0) {
        console.log(`模糊搜尋找到 ${fuzzyResults.length} 個結果`);
        return fuzzyResults
          .map((result) => ({
            ...result,
            totalScore: result.similarity,
            methods: ["fuzzy"],
          }))
          .slice(0, maxResults);
      }
      console.log("模糊搜尋無結果");
    }

    console.log("所有搜尋策略都無結果");
    return [];
  }

  /**
   * 建立完整索引
   * @param {Graph} graph Graphology 圖形物件
   */
  buildIndex(graph) {
    console.log("正在建立全文檢索索引...");

    // 清空現有索引
    this.bigramIndex.clear();
    this.trigramIndex.clear();
    this.keywordIndex.clear();
    this.entityIndex.clear();

    let nodeCount = 0;
    let edgeCount = 0;

    // 索引節點
    graph.forEachNode((nodeId, attrs) => {
      const nodeText = `${nodeId} ${attrs.description || ""}`;
      this.addToBigramIndex(nodeText, nodeId, "node");
      this.addToTrigramIndex(nodeText, nodeId, "node");
      this.addToKeywordIndex(nodeText, nodeId, "node");
      this.entityIndex.set(nodeId, { type: "node", attrs });
      nodeCount++;
    });

    // 索引邊
    graph.forEachEdge((edgeId, attrs, source, target) => {
      const edgeText = `${source} ${target} ${attrs.description || ""}`;
      this.addToBigramIndex(edgeText, edgeId, "edge");
      this.addToTrigramIndex(edgeText, edgeId, "edge");
      this.addToKeywordIndex(edgeText, edgeId, "edge");
      this.entityIndex.set(edgeId, { type: "edge", attrs, source, target });
      edgeCount++;
    });

    console.log(`索引建立完成：${nodeCount} 個節點，${edgeCount} 條邊`);
    console.log(`Bigram 索引：${this.bigramIndex.size} 個項目`);
    console.log(`關鍵字索引：${this.keywordIndex.size} 個項目`);
  }

  /**
   * 取得索引統計資訊
   * @returns {Object} 統計資訊
   */
  getStats() {
    return {
      bigramCount: this.bigramIndex.size,
      trigramCount: this.trigramIndex.size,
      keywordCount: this.keywordIndex.size,
      entityCount: this.entityIndex.size,
    };
  }
}

module.exports = { FullTextSearch };
