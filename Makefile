# GraphRAG Makefile
# 簡化專案操作的統一介面

.PHONY: help install clean rebuild load server search test demo kill-port

# 預設目標
help:
	@echo "GraphRAG 專案操作指令"
	@echo "===================="
	@echo ""
	@echo "基本操作:"
	@echo "  make install     - 安裝相依套件"
	@echo "  make clean       - 清空所有資料（資料庫、快取、暫存檔案）"
	@echo "  make rebuild     - 完整重建 GraphRAG 流程"
	@echo "  make server      - 啟動視覺化伺服器"
	@echo "  make kill-port   - 清掉佔用 port 3000 的行程"
	@echo ""
	@echo "資料載入:"
	@echo "  make load FILE=data.csv MODE=standard ROWS=50"
	@echo "  make load-slow FILE=data.csv ROWS=20"
	@echo "  make load-ultra FILE=data.csv ROWS=5"
	@echo "  make load-robust FILE=data.csv ROWS=100"
	@echo "  make load-fixed FILE=data.csv ROWS=10"
	@echo ""
	@echo "社群檢測演算法:"
	@echo "  make load-leiden FILE=data.csv ROWS=50"
	@echo "  make load-louvain FILE=data.csv ROWS=50"
	@echo "  make load-hierarchical FILE=data.csv ROWS=50"
	@echo ""
	@echo "其他功能:"
	@echo "  make search      - 啟動圖譜搜尋工具"
	@echo "  make demo        - 執行水滸傳示範"
	@echo "  make cache-stats - 查看快取統計"
	@echo "  make cache-clean - 清理過期快取"
	@echo "  make cache-clear - 清空所有快取"
	@echo "  make cache-list  - 列出快取檔案"
	@echo ""
	@echo "參數說明:"
	@echo "  FILE=檔案路徑    - 要載入的CSV檔案"
	@echo "  MODE=模式        - standard/slow/ultra-slow/robust/fixed"
	@echo "  ROWS=行數        - 處理的行數（預設50）"
	@echo "  DELAY=延遲       - 處理間延遲毫秒（慢速:2000，超慢速:5000）"
	@echo "  RETRIES=重試次數 - 失敗重試次數（預設3）"
	@echo ""
	@echo "範例:"
	@echo "  make rebuild                    # 完整重建"
	@echo "  make load FILE=test_data.csv   # 載入測試資料"
	@echo "  make load-leiden FILE=data.csv ROWS=100  # 使用Leiden演算法載入"
	@echo "  make server                     # 啟動伺服器"

# 安裝依賴
install:
	@echo "安裝相依套件..."
	npm install
	@echo "相依套件安裝完成！"

# 清空所有資料
clean:
	@echo "清空所有資料..."
	node scripts/clear_all.js
	@echo "資料清空完成！"

# 完整重建
rebuild:
	@echo "執行完整重建流程..."
	node scripts/rebuild_all.js
	@echo "重建完成！"

# 清掉佔用 port 的程序
kill-port:
	@echo "清掉佔用 port 3000 的行程..."
	@if lsof -ti:3000 > /dev/null 2>&1; then \
		echo "找到佔用 port 3000 的行程，正在終止..."; \
		lsof -ti:3000 | xargs kill -9; \
		echo "行程已終止！"; \
	else \
		echo "port 3000 沒有被佔用"; \
	fi

# 啟動伺服器
server:
	@echo "啟動視覺化伺服器..."
	@echo "請在瀏覽器中開啟: http://localhost:3000"
	node server.js

# 基本資料載入
load:
	@if [ -z "$(FILE)" ]; then \
		echo "錯誤: 請指定 FILE 參數"; \
		echo "範例: make load FILE=data.csv"; \
		exit 1; \
	fi
	@echo "載入資料: $(FILE)"
	@echo "模式: $(or $(MODE),standard)"
	@echo "行數: $(or $(ROWS),50)"
	node scripts/load_data.js $(FILE) --mode $(or $(MODE),standard) --rows $(or $(ROWS),50)

# 慢速載入
load-slow:
	@if [ -z "$(FILE)" ]; then \
		echo "錯誤: 請指定 FILE 參數"; \
		echo "範例: make load-slow FILE=data.csv"; \
		exit 1; \
	fi
	@echo "慢速載入資料: $(FILE)"
	node scripts/load_data.js $(FILE) --mode slow --rows $(or $(ROWS),20) --delay $(or $(DELAY),2000)

# 超慢速載入
load-ultra:
	@if [ -z "$(FILE)" ]; then \
		echo "錯誤: 請指定 FILE 參數"; \
		echo "範例: make load-ultra FILE=data.csv"; \
		exit 1; \
	fi
	@echo "超慢速載入資料: $(FILE)"
	node scripts/load_data.js $(FILE) --mode ultra-slow --rows $(or $(ROWS),5) --delay $(or $(DELAY),5000)

# 穩健載入
load-robust:
	@if [ -z "$(FILE)" ]; then \
		echo "錯誤: 請指定 FILE 參數"; \
		echo "範例: make load-robust FILE=data.csv"; \
		exit 1; \
	fi
	@echo "穩健載入資料: $(FILE)"
	node scripts/load_data.js $(FILE) --mode robust --rows $(or $(ROWS),100) --retries $(or $(RETRIES),5)

# 修復載入
load-fixed:
	@if [ -z "$(FILE)" ]; then \
		echo "錯誤: 請指定 FILE 參數"; \
		echo "範例: make load-fixed FILE=data.csv"; \
		exit 1; \
	fi
	@echo "修復載入資料: $(FILE)"
	node scripts/load_data.js $(FILE) --mode fixed --rows $(or $(ROWS),10)

# 使用Leiden演算法載入（預設）
load-leiden:
	@if [ -z "$(FILE)" ]; then \
		echo "錯誤: 請指定 FILE 參數"; \
		echo "範例: make load-leiden FILE=data.csv"; \
		exit 1; \
	fi
	@echo "使用Leiden演算法載入資料: $(FILE)"
	node scripts/load_data.js $(FILE) --mode standard --rows $(or $(ROWS),50) --algorithm leiden

# 使用Louvain演算法載入
load-louvain:
	@if [ -z "$(FILE)" ]; then \
		echo "錯誤: 請指定 FILE 參數"; \
		echo "範例: make load-louvain FILE=data.csv"; \
		exit 1; \
	fi
	@echo "使用Louvain演算法載入資料: $(FILE)"
	node scripts/load_data.js $(FILE) --mode standard --rows $(or $(ROWS),50) --algorithm louvain

# 使用層次化Leiden演算法載入
load-hierarchical:
	@if [ -z "$(FILE)" ]; then \
		echo "錯誤: 請指定 FILE 參數"; \
		echo "範例: make load-hierarchical FILE=data.csv"; \
		exit 1; \
	fi
	@echo "使用層次化Leiden演算法載入資料: $(FILE)"
	node scripts/load_data.js $(FILE) --mode standard --rows $(or $(ROWS),50) --algorithm leiden --hierarchical

# 圖譜搜尋
search:
	@echo "啟動圖譜搜尋工具..."
	node search_graph.js

# 水滸傳示範
demo:
	@echo "執行水滸傳示範..."
	node water_margin_demo.js

# 快取管理
cache-stats:
	@echo "查看快取統計..."
	node scripts/manage_cache.js stats

cache-clean:
	@echo "清理過期快取..."
	node scripts/manage_cache.js clean

cache-clear:
	@echo "清空所有快取..."
	node scripts/manage_cache.js clear

cache-list:
	@echo "列出快取檔案..."
	node scripts/manage_cache.js list

# 測試
test:
	@echo "執行測試..."
	npm test

# 開發環境設定
dev-setup: install
	@echo "設定開發環境..."
	@if [ ! -f .env ]; then \
		echo "請建立 .env 檔案並設定 GEMINI_API_KEY"; \
		echo "範例: echo 'GEMINI_API_KEY=your_api_key_here' > .env"; \
	fi
	@echo "開發環境設定完成！"

# 快速開始（推薦給新使用者）
quick-start: install rebuild server
	@echo ""
	@echo "🎉 GraphRAG 已準備就緒！"
	@echo "請在瀏覽器中開啟: http://localhost:3000"
	@echo ""
	@echo "其他有用指令:"
	@echo "  make help        - 查看所有指令"
	@echo "  make search      - 圖譜搜尋"
	@echo "  make demo        - 水滸傳示範"

# 完整工作流程
workflow: clean rebuild server
	@echo "完整工作流程執行完成！"
	@echo "請在瀏覽器中開啟: http://localhost:3000"
