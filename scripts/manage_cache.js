// 快取管理工具
const { LlmCache } = require("../src/llm-cache");

function showHelp() {
  console.log(`
LLM 快取管理工具

使用方式：
  node manage_cache.js <命令> [選項]

指令：
  stats     - 顯示快取統計資訊
  clean     - 清理過期快取
  clear     - 清空所有快取
  list      - 列出所有快取檔案
  help      - 顯示此說明資訊

範例：
  node manage_cache.js stats
  node manage_cache.js clean
  node manage_cache.js clear
`);
}

async function main() {
  const command = process.argv[2];
  const cache = new LlmCache();

  switch (command) {
    case "stats":
      console.log("快取統計資訊：");
      const stats = cache.getCacheStats();
      console.log(`- 快取檔案數量：${stats.count}`);
      console.log(`- 總大小：${stats.totalSizeMB} MB`);
      break;

    case "clean":
      console.log("正在清理過期快取...");
      cache.cleanExpiredCache();
      console.log("清理完成");
      break;

    case "clear":
      console.log("正在清空所有快取...");
      const allStats = cache.getCacheStats();
      if (allStats.count > 0) {
        const fs = require("fs");
        const files = fs.readdirSync(cache.cacheDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            fs.unlinkSync(require("path").join(cache.cacheDir, file));
          }
        }
        console.log(`已刪除 ${allStats.count} 個快取檔案`);
      } else {
        console.log("沒有需要刪除的快取檔案");
      }
      break;

    case "list":
      console.log("快取檔案清單：");
      try {
        const fs = require("fs");
        const path = require("path");
        const files = fs.readdirSync(cache.cacheDir);
        const jsonFiles = files.filter((f) => f.endsWith(".json"));

        if (jsonFiles.length === 0) {
          console.log("沒有快取檔案");
        } else {
          for (const file of jsonFiles) {
            const filePath = path.join(cache.cacheDir, file);
            const stats = fs.statSync(filePath);
            const age = Date.now() - stats.mtime.getTime();
            const ageHours = Math.floor(age / (1000 * 60 * 60));
            console.log(`- ${file}（約 ${ageHours} 小時前）`);
          }
        }
      } catch (error) {
        console.error("列出快取檔案失敗：", error.message);
      }
      break;

    case "help":
    case undefined:
      showHelp();
      break;

    default:
      console.error(`未知指令：${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("執行失敗：", error.message);
  process.exit(1);
});
