#!/usr/bin/env node

/**
 * 完整重建腳本
 * 執行完整的 GraphRAG 流程：資料載入 → 圖形提取 → 實體解析 → 社群報告 → 視覺化
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

console.log("=== 完整重建 GraphRAG 流程 ===\n");

// 檢查必要檔案
function checkRequiredFiles() {
  console.log("步驟 0: 檢查必要檔案...");

  const requiredFiles = [
    "Water_Margin.md",
    "water_margin_demo.js",
    "src/index.js",
  ];

  const missingFiles = [];
  requiredFiles.forEach((file) => {
    if (!fs.existsSync(file)) {
      missingFiles.push(file);
    }
  });

  if (missingFiles.length > 0) {
    console.error("❌ 缺少必要檔案:");
    missingFiles.forEach((file) => console.error(`   - ${file}`));
    process.exit(1);
  }

  console.log("✅ 所有必要檔案都存在");
}

// 執行命令的包裝函數
function runCommand(command, args, description, timeoutMs = 30 * 60 * 1000) {
  // 預設 30 分鐘 timeout
  return new Promise((resolve, reject) => {
    console.log(`\n${description}...`);
    console.log(`執行: ${command} ${args.join(" ")}`);
    console.log(`⏰ 設定 timeout: ${Math.round(timeoutMs / 60000)} 分鐘`);

    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
    });

    // 設定 timeout
    const timeout = setTimeout(() => {
      console.error(
        `\n⏰ ${description} 執行超時 (${Math.round(timeoutMs / 60000)} 分鐘)`
      );
      console.log("💡 建議:");
      console.log("  1. 檢查網路連線是否穩定");
      console.log("  2. 確認 GEMINI_API_KEY 設定正確");
      console.log("  3. 稍後再試，或使用更小的資料集");
      console.log(
        "  4. 考慮使用 slow 模式: node scripts/load_custom_data_slow.js"
      );

      child.kill("SIGTERM");
      reject(new Error(`命令執行超時: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        console.log(`✅ ${description} 完成`);
        resolve();
      } else {
        console.error(`❌ ${description} 失敗 (退出碼: ${code})`);
        reject(new Error(`命令執行失敗: ${command} ${args.join(" ")}`));
      }
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      console.error(`❌ ${description} 錯誤:`, error.message);
      reject(error);
    });
  });
}

// 主要重建流程
async function rebuildAll() {
  try {
    // 步驟 0: 檢查檔案
    checkRequiredFiles();

    // 步驟 1: 清空現有資料
    console.log("\n步驟 1: 清空現有資料...");
    await runCommand("node", ["scripts/clear_all.js"], "清空資料庫和快取");

    // 步驟 2: 載入資料並建立圖形
    console.log("\n步驟 2: 載入資料並建立圖形...");
    console.log("⚠️  此步驟可能需要 10-30 分鐘，請耐心等待...");
    await runCommand(
      "node",
      ["water_margin_demo.js"],
      "執行 GraphRAG 完整流程",
      45 * 60 * 1000
    ); // 45 分鐘 timeout

    // 步驟 3: 驗證結果
    console.log("\n步驟 3: 驗證重建結果...");
    await verifyResults();

    // 步驟 4: 產生視覺化
    console.log("\n步驟 4: 產生視覺化...");
    await generateVisualization();

    console.log("\n=== 重建完成 ===");
    console.log("🎉 GraphRAG 流程已成功重建！");
    console.log("\n📊 重建結果:");
    await showFinalStats();

    console.log("\n💡 下一步:");
    console.log("  1. 啟動伺服器: node server.js");
    console.log("  2. 開啟瀏覽器: http://localhost:3000");
    console.log("  3. 測試搜尋功能");
  } catch (error) {
    console.error("\n❌ 重建失敗:", error.message);
    console.log("\n🔧 故障排除:");
    console.log("  1. 檢查 GEMINI_API_KEY 環境變數是否設定");
    console.log("  2. 確認網路連線正常");
    console.log("  3. 檢查資料檔案是否存在");
    process.exit(1);
  }
}

// 驗證重建結果
async function verifyResults() {
  try {
    const Database = require("better-sqlite3");
    const db = new Database("graphrag.db", { readonly: true });

    const nodeCount = db
      .prepare("SELECT COUNT(*) as count FROM nodes")
      .get().count;
    const edgeCount = db
      .prepare("SELECT COUNT(*) as count FROM edges")
      .get().count;

    if (nodeCount === 0) {
      throw new Error("沒有節點資料");
    }

    if (edgeCount === 0) {
      throw new Error("沒有邊資料");
    }

    console.log(`✅ 驗證通過: ${nodeCount} 個節點, ${edgeCount} 條邊`);

    db.close();
  } catch (error) {
    throw new Error(`驗證失敗: ${error.message}`);
  }
}

// 產生視覺化
async function generateVisualization() {
  try {
    // 檢查視覺化檔案是否存在
    const vizFile = "visualization/graph_visualization.html";
    if (fs.existsSync(vizFile)) {
      console.log("✅ 視覺化檔案已存在");
    } else {
      console.log("ℹ️  視覺化檔案不存在，將在啟動伺服器時動態載入");
    }
  } catch (error) {
    console.log("ℹ️  視覺化產生跳過:", error.message);
  }
}

// 顯示最終統計
async function showFinalStats() {
  try {
    const Database = require("better-sqlite3");
    const db = new Database("graphrag.db", { readonly: true });

    // 節點統計
    const nodeStats = db
      .prepare(
        `
      SELECT entity_type, COUNT(*) as count 
      FROM nodes 
      GROUP BY entity_type 
      ORDER BY count DESC
    `
      )
      .all();

    // 邊統計
    const edgeCount = db
      .prepare("SELECT COUNT(*) as count FROM edges")
      .get().count;

    // 快取統計
    const cacheDir = "llm_cache";
    let cacheCount = 0;
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      cacheCount = files.filter((file) => file.endsWith(".json")).length;
    }

    console.log(
      `  - 總節點數: ${nodeStats.reduce((sum, stat) => sum + stat.count, 0)}`
    );
    console.log(`  - 總邊數: ${edgeCount}`);
    console.log(`  - LLM 快取: ${cacheCount} 個檔案`);

    console.log("\n  - 節點類型分布:");
    nodeStats.forEach((stat) => {
      console.log(`    ${stat.entity_type}: ${stat.count} 個`);
    });

    db.close();
  } catch (error) {
    console.log("  - 無法取得統計資訊:", error.message);
  }
}

// 執行重建
if (require.main === module) {
  rebuildAll();
}

module.exports = { rebuildAll };
