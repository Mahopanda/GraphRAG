# 全文檢索功能說明

本專案已整合全文檢索功能，支援多種搜尋策略，包括 bigram、關鍵字匹配、模糊搜尋等。

## 功能特色

### 1. 多種搜尋策略
- **Bigram 搜尋**：將文字分解為兩個字元的片段進行匹配，適合中文搜尋
- **關鍵字搜尋**：提取關鍵詞進行精確匹配
- **模糊搜尋**：使用編輯距離算法進行相似度匹配
- **綜合搜尋**：結合多種策略，提供最佳搜尋結果

### 2. 智能索引系統
- **自動建立索引**：首次搜尋時自動建立全文檢索索引
- **多層索引**：支援 bigram、trigram、關鍵字等多種索引
- **記憶體優化**：高效的索引結構，支援大量資料

### 3. 相關度評分
- **加權評分**：不同搜尋方法有不同的權重
- **相關度排序**：結果按相關度自動排序
- **詳細資訊**：顯示每個結果的相關度和使用的搜尋方法

## 使用方法

### 命令列使用

```bash
# 基本搜尋（使用全文檢索）
node search_graph.js "宋江的身分"

# 停用全文檢索，使用傳統關鍵字搜尋
node search_graph.js "梁山泊" --no-fulltext

# 只使用 bigram 搜尋
node search_graph.js "晁蓋" --no-keywords --no-fuzzy

# 只使用關鍵字搜尋
node search_graph.js "吳用" --no-bigram --no-fuzzy

# 只使用模糊搜尋
node search_graph.js "林衝" --no-bigram --no-keywords --fuzzy-threshold 0.6

# 自訂搜尋參數
node search_graph.js "聚義廳" --fuzzy-threshold 0.8 --max-results 10
```

### 命令列選項

| 選項 | 說明 | 預設值 |
|------|------|--------|
| `--no-fulltext` | 停用全文檢索，使用傳統關鍵字搜尋 | false |
| `--no-bigram` | 停用 bigram 搜尋 | false |
| `--no-keywords` | 停用關鍵字搜尋 | false |
| `--no-fuzzy` | 停用模糊搜尋 | false |
| `--fuzzy-threshold <數值>` | 設定模糊搜尋閾值 (0-1) | 0.7 |
| `--max-results <數量>` | 設定最大結果數量 | 20 |

### API 使用

```javascript
const { handleQuery } = require('./search_graph');

// 基本查詢
const result = await handleQuery("宋江的身分");

// 自訂選項
const result = await handleQuery("梁山泊", {
  useFullText: true,
  useBigram: true,
  useKeywords: true,
  useFuzzy: true,
  fuzzyThreshold: 0.7,
  maxResults: 20
});
```

### HTTP API

```bash
# POST /api/query
{
  "query": "宋江的身分",
  "options": {
    "useFullText": true,
    "useBigram": true,
    "useKeywords": true,
    "useFuzzy": true,
    "fuzzyThreshold": 0.7,
    "maxResults": 20
  }
}
```

## 搜尋策略詳解

### 1. Bigram 搜尋
- **原理**：將查詢字串和文件內容分解為兩個字元的片段
- **優點**：對中文搜尋效果佳，能處理部分匹配
- **適用場景**：中文法律條文、專業術語搜尋

### 2. 關鍵字搜尋
- **原理**：提取查詢中的關鍵詞，在文件中尋找完全匹配
- **優點**：精確度高，速度快
- **適用場景**：精確的實體名稱、法條編號搜尋

### 3. 模糊搜尋
- **原理**：使用 Levenshtein 距離計算字串相似度
- **優點**：能處理拼寫錯誤、同義詞
- **適用場景**：使用者輸入可能有誤的情況

### 4. 綜合搜尋
- **原理**：結合多種搜尋策略，加權計算最終分數
- **權重分配**：
  - 關鍵字搜尋：60%
  - Bigram 搜尋：40%
  - 模糊搜尋：30%（僅在前兩種方法結果較少時使用）

## 效能優化

### 索引建立
- 首次搜尋時自動建立索引
- 索引建立後會快取在記憶體中
- 支援大量節點和邊的索引

### 搜尋效能
- Bigram 索引：O(1) 查找時間
- 關鍵字索引：O(1) 查找時間
- 模糊搜尋：O(n*m) 計算時間（n=查詢長度，m=候選字串長度）

## 範例搜尋結果

### 搜尋 "宋江"
```
使用全文檢索搜尋: "宋江"
搜尋選項: bigram=true, keywords=true, fuzzy=true
找到 20 個相關結果
從圖形中找到 20 個證據片段

--- 答案 ---
宋江是梁山泊的核心人物之一，為人仗義疏財，常被稱為「押司」。多次與晁蓋、吳用等人協同行動，對梁山勢力的整合與擴張有關鍵影響。

--- 圖形證據 ---
- 關係: 宋江 <-> 梁山泊
  - 描述: 宋江與梁山泊勢力關係密切，與多位頭領協同行動。
  - 相關度: 220.0% (方法: bigram, keyword)
```

## 技術實作

### 核心類別
- `FullTextSearch`：全文檢索主類別
- 支援多種索引：bigram、trigram、關鍵字
- 智能搜尋策略選擇

### 索引結構
```javascript
// Bigram 索引
bigramIndex: Map<string, Set<{id, type, text}>>

// 關鍵字索引
keywordIndex: Map<string, Set<{id, type, text}>>

// 實體索引
entityIndex: Map<string, {type, attrs, source?, target?}>
```

### 搜尋流程
1. 正規化查詢字串
2. 根據選項選擇搜尋策略
3. 執行對應的搜尋方法
4. 計算相關度分數
5. 排序並返回結果

## 注意事項

1. **首次搜尋較慢**：需要建立索引，後續搜尋會很快
2. **記憶體使用**：索引會佔用一定記憶體
3. **中文支援**：特別針對中文搜尋進行優化
4. **相關度計算**：分數可能超過 100%，表示多種方法都匹配到
