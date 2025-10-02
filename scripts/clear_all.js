#!/usr/bin/env node

/**
 * 完全清空腳本
 * 清空資料庫、快取、索引等所有資料
 */

const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

console.log("=== 完全清空 GraphRAG 資料 ===\n");

// 1. 清空 SQLite 資料庫
console.log("步驟 1: 清空 SQLite 資料庫...");
try {
  const db = new Database("graphrag.db");

  // 刪除所有節點和邊
  db.prepare("DELETE FROM nodes").run();
  db.prepare("DELETE FROM edges").run();

  // 重置自增 ID（如果 sqlite_sequence 表存在）
  try {
    db.prepare(
      'DELETE FROM sqlite_sequence WHERE name IN ("nodes", "edges")'
    ).run();
  } catch (error) {
    // sqlite_sequence 表可能不存在，這是正常的
    console.log("ℹ️  sqlite_sequence 表不存在，跳過重置");
  }

  // 檢查結果
  const nodeCount = db
    .prepare("SELECT COUNT(*) as count FROM nodes")
    .get().count;
  const edgeCount = db
    .prepare("SELECT COUNT(*) as count FROM edges")
    .get().count;

  console.log(`✅ 資料庫已清空: ${nodeCount} 個節點, ${edgeCount} 條邊`);

  db.close();
} catch (error) {
  console.error("❌ 清空資料庫失敗:", error.message);
}

// 2. 清空 LLM 快取
console.log("\n步驟 2: 清空 LLM 快取...");
try {
  const cacheDir = "llm_cache";
  if (fs.existsSync(cacheDir)) {
    const files = fs.readdirSync(cacheDir);
    let deletedCount = 0;

    files.forEach((file) => {
      if (file.endsWith(".json")) {
        fs.unlinkSync(path.join(cacheDir, file));
        deletedCount++;
      }
    });

    console.log(`✅ LLM 快取已清空: 刪除 ${deletedCount} 個快取檔案`);
  } else {
    console.log("ℹ️  LLM 快取目錄不存在，跳過");
  }
} catch (error) {
  console.error("❌ 清空 LLM 快取失敗:", error.message);
}

// 3. 清空其他暫存檔案
console.log("\n步驟 3: 清空其他暫存檔案...");
try {
  const tempFiles = ["graph_visualization.html", "visualization_output.html"];

  let deletedCount = 0;
  tempFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      deletedCount++;
      console.log(`✅ 刪除暫存檔案: ${file}`);
    }
  });

  if (deletedCount === 0) {
    console.log("ℹ️  沒有找到暫存檔案");
  }
} catch (error) {
  console.error("❌ 清空暫存檔案失敗:", error.message);
}

// 4. 顯示清空後的狀態
console.log("\n=== 清空完成 ===");
console.log("📊 目前狀態:");
console.log("  - 資料庫: 已清空");
console.log("  - LLM 快取: 已清空");
console.log("  - 暫存檔案: 已清空");
console.log("\n💡 提示: 現在可以執行重建腳本來重新建立圖形資料");
console.log("   執行: node scripts/rebuild_all.js");
