# Scripts 資料夾說明

這個資料夾包含了專案中所有的腳本檔案，用於資料載入、處理和管理。

## 檔案結構

```
scripts/
├── README.md                    # 本說明檔案
├── clear_all.js                 # 完全清空腳本 (新增)
├── rebuild_all.js               # 完整重建腳本 (新增)
├── load_data.js                 # 統一的資料載入腳本 (推薦使用)
├── load_custom_data.js          # 原始標準載入腳本
├── load_custom_data_fixed.js    # 修復版載入腳本
├── load_custom_data_slow.js     # 慢速載入腳本
├── load_custom_data_ultra_slow.js # 超慢速載入腳本
├── load_custom_data_robust.js   # 穩健載入腳本
└── manage_cache.js              # 快取管理腳本
```

## 推薦使用方式

### 快速開始（推薦）

```bash
# 1. 完全重建 GraphRAG 流程
node scripts/rebuild_all.js

# 2. 啟動伺服器
node server.js

# 3. 開啟瀏覽器
# http://localhost:3000
```

### 完全清空腳本 (`clear_all.js`)

清空所有資料，包括資料庫、快取和暫存檔案：

```bash
node scripts/clear_all.js
```

**功能：**
- 清空 SQLite 資料庫（節點和邊）
- 清空 LLM 快取檔案
- 刪除暫存檔案
- 顯示清空後的狀態

### 完整重建腳本 (`rebuild_all.js`)

執行完整的 GraphRAG 流程，從清空到重建：

```bash
node scripts/rebuild_all.js
```

**執行流程：**
1. 檢查必要檔案
2. 清空現有資料
3. 載入資料並建立圖形
4. 驗證重建結果
5. 產生視覺化
6. 顯示統計資訊

### 統一載入腳本 (`load_data.js`)

這是整合了所有載入模式的統一腳本，推薦使用：

```bash
# 基本用法
node scripts/load_data.js data.csv

# 指定載入模式
node scripts/load_data.js data.csv --mode standard --rows 50
node scripts/load_data.js data.csv --mode slow --rows 20 --delay 2000
node scripts/load_data.js data.csv --mode ultra-slow --rows 5 --delay 5000
node scripts/load_data.js data.csv --mode robust --rows 100 --retries 5
node scripts/load_data.js data.csv --mode fixed --rows 10

# 查看說明
node scripts/load_data.js --help
```

### 載入模式說明

| 模式 | 說明 | 適用場景 |
|------|------|----------|
| `standard` | 標準模式，使用完整的 GraphRAG 流程 | 一般使用，資料量中等 |
| `slow` | 慢速模式，在處理間加入延遲 | API 限制較嚴格時 |
| `ultra-slow` | 超慢速模式，逐個處理文字塊 | 大量資料或網路不穩定 |
| `robust` | 穩健模式，包含重試機制 | 網路環境不穩定 |
| `fixed` | 修復模式，包含中文驗證和文字清理 | 資料品質較差時 |

## 其他腳本

### 快取管理 (`manage_cache.js`)

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

### 個別載入腳本

如果你需要特定的載入行為，也可以直接使用個別的腳本：

```bash
# 標準載入
node scripts/load_custom_data.js data.csv 50

# 修復版載入
node scripts/load_custom_data_fixed.js data.csv 5

# 慢速載入
node scripts/load_custom_data_slow.js data.csv 20 2000

# 超慢速載入
node scripts/load_custom_data_ultra_slow.js data.csv 3 10000

# 穩健載入
node scripts/load_custom_data_robust.js data.csv 100
```

## 使用建議

1. **新使用者**：建議使用 `load_data.js` 統一腳本
2. **大量資料**：使用 `--mode ultra-slow` 或 `--mode slow`
3. **網路不穩定**：使用 `--mode robust`
4. **資料品質問題**：使用 `--mode fixed`
5. **一般使用**：使用 `--mode standard`

## 注意事項

- 所有腳本都需要設定 `GEMINI_API_KEY` 環境變數
- 建議先使用較少的行數測試，確認無誤後再處理完整資料
- 如果遇到 503 錯誤，可以嘗試增加延遲時間或減少處理行數
- 視覺化檔案會自動生成在 `visualization/graph_visualization.html`
