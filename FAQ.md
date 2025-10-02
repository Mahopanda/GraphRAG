# 📋 常見問題與解答 (FAQ)

## 🔧 基本設定

### Q1: 如何設定 API 金鑰？

**A:** 在終端機中設定環境變數：

```bash
export GEMINI_API_KEY=your_actual_api_key_here
```

### Q2: 如何驗證 API 金鑰是否正確設定？

**A:** 檢查環境變數：

```bash
echo $GEMINI_API_KEY
```

應該會顯示你的 API 金鑰（以 `AIza` 開頭）。

### Q3: 支援哪些 Gemini 模型？

**A:** 目前支援以下模型：

- `gemini-2.5-flash`（推薦）
- `gemini-2.5-flash-lite`（輕量版）

## 🚀 資料載入

### Q4: 如何使用統一載入腳本？

**A:** 推薦使用 `scripts/load_data.js`：

```bash
# 基本用法
node scripts/load_data.js data.csv

# 指定載入模式
node scripts/load_data.js data.csv --mode standard --rows 50
node scripts/load_data.js data.csv --mode slow --rows 20 --delay 2000
node scripts/load_data.js data.csv --mode ultra-slow --rows 5 --delay 5000
node scripts/load_data.js data.csv --mode robust --rows 100 --retries 5
node scripts/load_data.js data.csv --mode fixed --rows 10

# 查看所有選項
node scripts/load_data.js --help
```

### Q5: 載入模式有什麼差別？

**A:**

- **standard**: 標準模式，使用完整的 GraphRAG 流程
- **slow**: 慢速模式，在處理間加入延遲
- **ultra-slow**: 超慢速模式，逐個處理文字塊
- **robust**: 穩健模式，包含重試機制
- **fixed**: 修復模式，包含中文驗證和文字清理

### Q6: CSV 檔案格式有什麼要求？

**A:** CSV 檔案需要包含文字內容欄位，可以是：

- `text` 欄位
- `content` 欄位
- `description` 欄位
- 或第一欄

每列代表一份文件或文字片段。

## ❌ 錯誤處理

### Q7: 遇到 503 服務不可用錯誤怎麼辦？

**A:** 這通常是 API 限制或網路問題，可以嘗試：

1. **使用慢速模式**：

   ```bash
   node scripts/load_data.js data.csv --mode slow --delay 3000
   ```

2. **減少處理行數**：

   ```bash
   node scripts/load_data.js data.csv --rows 5
   ```

3. **使用穩健模式**：

   ```bash
   node scripts/load_data.js data.csv --mode robust --retries 5
   ```

4. **檢查 API 金鑰**：
   - 確認金鑰格式正確（以 `AIza` 開頭）
   - 確認有存取 Gemini 的權限
   - 檢查 Google Cloud 專案設定

### Q8: 遇到 404 錯誤怎麼辦？

**A:** 通常是模型名稱錯誤或 API 金鑰問題：

1. 檢查 API 金鑰是否正確設定
2. 確認模型名稱是否正確
3. 執行測試腳本驗證連線

### Q9: 遇到權限錯誤怎麼辦？

**A:** 檢查以下項目：

1. 確認 API 金鑰具有存取 Gemini 的權限
2. 檢查 Google Cloud 專案設定
3. 確認 API 金鑰所屬專案已啟用 Gemini API
4. 檢查配額限制

### Q10: 資料載入失敗怎麼辦？

**A:** 依序檢查：

1. **檢查 CSV 檔案格式**：確認有文字內容欄位
2. **確認檔案路徑正確**：使用絕對路徑或相對路徑
3. **查看詳細錯誤日誌**：檢查終端機輸出
4. **嘗試不同載入模式**：使用 `--mode fixed` 進行文字清理

## 🗄️ 資料庫管理

### Q11: 如何清空資料庫？

**A:** 使用清空腳本：

```bash
node clear_database.js
```

### Q12: 如何檢查資料庫是否有資料？

**A:** 使用 SQLite 指令：

```bash
sqlite3 graphrag.db "SELECT COUNT(*) FROM nodes;"
sqlite3 graphrag.db "SELECT COUNT(*) FROM edges;"
```

## 🎨 視覺化

### Q13: 如何啟動視覺化介面？

**A:**

1. 啟動伺服器：

   ```bash
   node server.js
   ```

2. 開啟瀏覽器前往：<http://localhost:3000>

### Q14: 視覺化頁面一直顯示 "Loading graph..." 怎麼辦？

**A:** 這表示資料庫沒有資料，需要：

1. 檢查資料庫是否有資料（見 Q12）
2. 若沒有資料，重新執行載入腳本
3. 確認載入完成後重新啟動伺服器

## 🔧 快取管理

### Q15: 如何管理 LLM 快取？

**A:** 使用快取管理腳本：

```bash
# 查看快取統計
node scripts/manage_cache.js stats

# 清理過期快取
node scripts/manage_cache.js clean

# 清空所有快取
node scripts/manage_cache.js clear

# 列出快取檔案
node scripts/manage_cache.js list
```

## 📊 效能優化

### Q16: 如何提升載入速度？

**A:**

1. **使用標準模式**：`--mode standard`
2. **增加處理行數**：`--rows 100` 或更多
3. **減少延遲時間**：`--delay 500` 或更少

### Q17: 如何處理大量資料？

**A:**

1. **分批處理**：使用較小的 `--rows` 參數
2. **使用穩健模式**：`--mode robust`
3. **監控 API 配額**：避免超出限制

### Q18: 如何處理中文資料？

**A:**

1. **使用修復模式**：`--mode fixed` 包含中文驗證
2. **確保 CSV 編碼正確**：使用 UTF-8 編碼
3. **檢查文字內容**：確認包含中文字元
