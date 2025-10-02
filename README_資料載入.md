# 資料載入指南

## 關於「Loading graph...」狀態

這是**正常現象**！代表視覺化頁面正在等待圖形資料載入。若長時間維持此狀態，可能表示：
1. 資料庫沒有資料，或
2. 需要重新載入資料

## 重新載入你的自有資料

### 步驟 1：準備資料檔
預設示範範例已改為讀取 Markdown 的《水滸傳》片段（`Water_Margin.md`）。
若要改用你自己的資料，可以放置於專案根目錄，例如：
- `my_data.csv`
- `novel_chapters.md`
- `documents.csv`

**資料檔要求**：
- 若為 CSV：必須有文字內容欄位（可為 `text`、`content`、`description` 或第一欄），每一列代表一份文件或文字片段。
- 若為 Markdown（如本範例 `Water_Margin.md`）：系統會自動以空白行分段，並切成固定大小的文字塊。

### 步驟 2：設定 API 金鑰
```bash
export GEMINI_API_KEY=your_actual_api_key_here
```

### 步驟 2.5：測試 API 連線（可選）
```bash
node test_gemini.js
```

### 步驟 3：清空現有資料（可選）
```bash
node clear_database.js
```

### 步驟 4：載入新資料
```bash
# 方式 A：執行水滸傳示範（讀取 Markdown 檔）
node water_margin_demo.js

# 方式 B：使用統一載入腳本（CSV 資料，推薦）
node scripts/load_data.js your_data_file.csv

# 指定載入模式（CSV）
node scripts/load_data.js your_data_file.csv --mode standard --rows 50
node scripts/load_data.js your_data_file.csv --mode slow --rows 20 --delay 2000
node scripts/load_data.js your_data_file.csv --mode ultra-slow --rows 5 --delay 5000

# 查看所有選項
node scripts/load_data.js --help
```

### 步驟 5：重新啟動伺服器
```bash
# 停止目前的伺服器（Ctrl+C）
# 然後重新啟動
node server.js
```

### 步驟 6：查看結果
開啟瀏覽器前往：http://localhost:3000

## 完整範例

```bash
# 1. 設定 API 金鑰
export GEMINI_API_KEY=AIzaSyC...

# 2. 進入專案目錄
cd /graphrag-node-dev

# 3. 清空資料庫
node clear_database.js

# 4. 載入資料（先測試 50 行）
node scripts/load_data.js my_data.csv --mode standard --rows 50

# 5. 啟動伺服器
node server.js

# 6. 開啟瀏覽器前往 http://localhost:3000
```

## 疑難排解

### 若持續顯示「Loading graph...」
1. 檢查資料庫是否有資料：
   ```bash
   sqlite3 graphrag.db "SELECT COUNT(*) FROM nodes;"
   ```

2. 若沒有資料，重新執行載入腳本：
   ```bash
   node scripts/load_data.js your_data_file.csv
   ```

3. 檢查 API 金鑰是否正確設定：
   ```bash
   echo $GEMINI_API_KEY
   ```

### 若載入失敗
1. 檢查 CSV 檔案格式
2. 確認 API 金鑰有效
3. 查看錯誤日誌

## 資料格式範例

**CSV 檔案範例**（`my_data.csv`）：
```csv
text,source
"梁山泊是水滸傳中的著名山寨",wikipedia
"宋江是梁山泊的領導者之一",water_margin
"晁蓋被稱為托塔天王，是早期梁山好漢",classic
```

**或是簡單格式**：
```csv
content
"這是第一段文字內容"
"這是第二段文字內容"
"這是第三段文字內容"
```

**Markdown 檔案範例**（`novel_chapters.md`）：
```
第一回  王倫心胸狹隘

  林沖殺了王倫……（段落內容）

第二回  晁蓋上位

  晁蓋推讓、吳用為軍師……（段落內容）
```
