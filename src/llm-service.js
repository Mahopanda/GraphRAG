const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();
const { LlmCache } = require("./llm-cache");

const apiKey = process.env.GEMINI_API_KEY;
let ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

class LlmService {
  constructor(modelName = "gemini-2.5-flash-lite", enableCache = true) {
    this.modelName = modelName;
    this.cache = enableCache ? new LlmCache() : null;

    if (ai) {
      console.log(`LLM Service initialized with model: ${modelName}`);
      if (this.cache) {
        console.log("💾 LLM 快取已啟用");
        this.cache.cleanExpiredCache();
        const stats = this.cache.getCacheStats();
        console.log(
          `📊 快取統計：${stats.count} 個檔案，${stats.totalSizeMB} MB`
        );
      }
    } else {
      console.log(
        "LLM Service initialized without API key - features disabled"
      );
    }
  }

  // 將任意輸入標準化成 contents[]
  _normalizeContents(input) {
    // 1) 字串 => 單輪 user 訊息
    if (typeof input === "string" && input.trim()) {
      return [{ role: "user", parts: [{ text: input }] }];
    }
    // 2) 陣列 => 逐筆轉 {role, parts:[{text}]}
    if (Array.isArray(input)) {
      return input.map((m) => {
        if (typeof m === "string") {
          return { role: "user", parts: [{ text: m }] };
        }
        // 支援 { role, content } 或 { role, parts }
        if (m && m.role) {
          if (m.parts && Array.isArray(m.parts)) {
            // 將 assistant 角色轉換為 model
            const role = m.role === "assistant" ? "model" : m.role;
            return { role, parts: m.parts };
          }
          const text = (m.content ?? "").toString();
          const role = m.role === "assistant" ? "model" : m.role;
          return { role, parts: [{ text }] };
        }
        // Fallback
        return { role: "user", parts: [{ text: JSON.stringify(m) }] };
      });
    }
    // 3) 其他物件 => stringify 當作一段 user 訊息
    return [{ role: "user", parts: [{ text: JSON.stringify(input) }] }];
  }

  async chat(promptOrHistory, timeoutMs = 30000) {
    if (!ai) {
      return "Error: LLM service is not available. Please set GEMINI_API_KEY.";
    }

    const contents = this._normalizeContents(promptOrHistory);

    // 生成快取鍵
    const cacheKey = this.cache
      ? this.cache.generateCacheKey(contents, this.modelName)
      : null;

    // 檢查快取
    if (this.cache && cacheKey) {
      const cachedResponse = this.cache.getCache(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // 簡單的 503/UNAVAILABLE 重試（含抖動）
    const maxRetries = 4;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 建立 timeout Promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(
              new Error(
                `Request timeout after ${timeoutMs}ms. 請稍後再試，或檢查網路連線。`
              )
            );
          }, timeoutMs);
        });

        // 建立 API 呼叫 Promise
        const apiPromise = ai.models.generateContent({
          model: this.modelName,
          contents,
          // 可選：加上 generationConfig 以降低負載峰值
          generationConfig: { temperature: 0.2, topK: 40, topP: 0.95 },
        });

        // 使用 Promise.race 來實現 timeout
        const resp = await Promise.race([apiPromise, timeoutPromise]);
        const responseText = resp.text;

        // 儲存到快取
        if (this.cache && cacheKey) {
          this.cache.setCache(cacheKey, responseText);
        }

        return responseText;
      } catch (err) {
        const msg = `${err?.status || ""} ${err?.message || err}`;

        // 檢查是否為 timeout 錯誤
        if (msg.includes("timeout")) {
          console.error(`⏰ LLM 呼叫超時 (${timeoutMs}ms):`, err.message);
          return `Error: LLM 呼叫超時。請稍後再試，或檢查網路連線。詳細資訊: ${err.message}`;
        }

        const retriable =
          /UNAVAILABLE|DEADLINE_EXCEEDED|ECONNRESET|ETIMEDOUT/.test(msg);
        if (!retriable || attempt === maxRetries - 1) {
          console.error("Error calling Gemini API:", err);
          return `Error: LLM call failed. Details: ${msg}`;
        }
        const backoff =
          400 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        console.log(
          `⏳ 重試 ${attempt + 1}/${maxRetries}，等待 ${backoff}ms...`
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
}

module.exports = { LlmService };
