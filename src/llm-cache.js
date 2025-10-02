// LLM 結果快取機制
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class LlmCache {
  constructor(cacheDir = "./llm_cache") {
    this.cacheDir = cacheDir;
    this.ensureCacheDir();
  }

  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  // 生成快取鍵
  generateCacheKey(prompt, modelName = "gemini-2.5-flash-lite") {
    const content =
      typeof prompt === "string" ? prompt : JSON.stringify(prompt);
    return crypto
      .createHash("md5")
      .update(`${modelName}:${content}`)
      .digest("hex");
  }

  // 取得快取檔案路徑
  getCacheFilePath(cacheKey) {
    return path.join(this.cacheDir, `${cacheKey}.json`);
  }

  // 檢查快取是否存在
  hasCache(cacheKey) {
    const filePath = this.getCacheFilePath(cacheKey);
    return fs.existsSync(filePath);
  }

  // 取得快取結果
  getCache(cacheKey) {
    if (!this.hasCache(cacheKey)) {
      return null;
    }

    try {
      const filePath = this.getCacheFilePath(cacheKey);
      const data = fs.readFileSync(filePath, "utf8");
      const cache = JSON.parse(data);

      // 檢查快取是否過期（24 小時）
      const now = Date.now();
      const cacheAge = now - cache.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24小时

      if (cacheAge > maxAge) {
        console.log(`🗑️  快取已過期，刪除：${cacheKey}`);
        this.deleteCache(cacheKey);
        return null;
      }

      console.log(`💾 使用快取結果：${cacheKey}`);
      return cache.response;
    } catch (error) {
      console.error(`❌ 讀取快取失敗：${error.message}`);
      return null;
    }
  }

  // 儲存快取結果
  setCache(cacheKey, response) {
    try {
      const filePath = this.getCacheFilePath(cacheKey);
      const cache = {
        timestamp: Date.now(),
        response: response,
      };

      fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
      console.log(`💾 已儲存快取：${cacheKey}`);
    } catch (error) {
      console.error(`❌ 儲存快取失敗：${error.message}`);
    }
  }

  // 刪除快取
  deleteCache(cacheKey) {
    try {
      const filePath = this.getCacheFilePath(cacheKey);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`❌ 刪除快取失敗：${error.message}`);
    }
  }

  // 清理過期快取
  cleanExpiredCache() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 小時
      let cleaned = 0;

      for (const file of files) {
        if (file.endsWith(".json")) {
          const filePath = path.join(this.cacheDir, file);
          const stats = fs.statSync(filePath);
          const age = now - stats.mtime.getTime();

          if (age > maxAge) {
            fs.unlinkSync(filePath);
            cleaned++;
          }
        }
      }

      if (cleaned > 0) {
        console.log(`🧹 已清理 ${cleaned} 個過期快取檔案`);
      }
    } catch (error) {
      console.error(`❌ 清理快取失敗：${error.message}`);
    }
  }

  // 取得快取統計
  getCacheStats() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      let totalSize = 0;
      for (const file of jsonFiles) {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
      }

      return {
        count: jsonFiles.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      };
    } catch (error) {
      console.error(`❌ 取得快取統計失敗：${error.message}`);
      return { count: 0, totalSize: 0, totalSizeMB: "0.00" };
    }
  }
}

module.exports = { LlmCache };
