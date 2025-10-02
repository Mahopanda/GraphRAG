/**
 * 專案設定檔案
 * 集中管理所有硬編碼的設定值
 */

module.exports = {
  // LLM 相關設定
  llm: {
    // 預設模型名稱
    defaultModel: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",

    // 生成參數
    generationConfig: {
      temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.2,
      topK: parseInt(process.env.GEMINI_TOP_K) || 40,
      topP: parseFloat(process.env.GEMINI_TOP_P) || 0.95,
    },

    // 重試設定
    retry: {
      maxRetries: parseInt(process.env.LLM_MAX_RETRIES) || 4,
      baseDelay: parseInt(process.env.LLM_BASE_DELAY) || 400,
      maxJitter: parseInt(process.env.LLM_MAX_JITTER) || 200,
    },

    // 超時設定
    timeout: {
      default: parseInt(process.env.LLM_TIMEOUT) || 30000, // 30 秒
      long: parseInt(process.env.LLM_LONG_TIMEOUT) || 60000, // 60 秒
    },
  },

  // 快取設定
  cache: {
    // 快取目錄
    directory: process.env.CACHE_DIR || "./llm_cache",

    // 快取過期時間（毫秒）
    maxAge: parseInt(process.env.CACHE_MAX_AGE) || 24 * 60 * 60 * 1000, // 24 小時
  },

  // 資料處理設定
  data: {
    // 預設處理行數
    defaultRowLimit: parseInt(process.env.DEFAULT_ROW_LIMIT) || 50,

    // 延遲設定
    delays: {
      slow: parseInt(process.env.SLOW_DELAY) || 1000,
      ultraSlow: parseInt(process.env.ULTRA_SLOW_DELAY) || 5000,
    },
  },

  // 伺服器設定
  server: {
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || "localhost",
  },

  // 資料庫設定
  database: {
    path: process.env.DATABASE_PATH || "./graphrag.db",
  },
};
