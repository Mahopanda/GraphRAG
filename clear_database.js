const Database = require("better-sqlite3");

/**
 * 清空資料庫的腳本
 * 使用方法: node clear_database.js
 */

const db = new Database("graphrag.db");

try {
  console.log("正在清空資料庫...");

  // 清空所有表
  db.exec("DELETE FROM edges;");
  db.exec("DELETE FROM nodes;");

  // 重置自增ID（如果有的話，忽略錯誤）
  try {
    db.exec('DELETE FROM sqlite_sequence WHERE name IN ("nodes", "edges");');
  } catch (e) {
    // 忽略 sqlite_sequence 表不存在的錯誤
  }

  console.log("資料庫已清空");

  // 顯示目前狀態
  const nodeCount = db
    .prepare("SELECT COUNT(*) as count FROM nodes")
    .get().count;
  const edgeCount = db
    .prepare("SELECT COUNT(*) as count FROM edges")
    .get().count;

  console.log(`目前狀態: ${nodeCount} 個節點, ${edgeCount} 條邊`);
} catch (error) {
  console.error("清空資料庫時出錯:", error);
} finally {
  db.close();
}
