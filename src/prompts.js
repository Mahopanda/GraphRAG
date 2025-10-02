const PROMPTS = {};

// --- Delimiters and Default Values ---
PROMPTS.DEFAULT_TUPLE_DELIMITER = "<|>";
PROMPTS.DEFAULT_RECORD_DELIMITER = "##";
PROMPTS.DEFAULT_COMPLETION_DELIMITER = "<|COMPLETE|>";
PROMPTS.DEFAULT_LANGUAGE = "English";

PROMPTS.GENERAL_GRAPH_EXTRACTION_PROMPT = `
-目標-
給定一份與本任務可能相關的文字文件，以及一份實體類型清單，請自該文字中找出所有屬於這些類型的實體，並找出上述實體之間的所有關係。請僅根據明確存在的資訊進行辨識，不要推測或臆造內容。

-步驟-
1. 辨識所有實體。對於每個被辨識出的實體，請擷取以下資訊：
- entity_name：實體名稱，使用「Text」相同語言；若為英文請將名稱字首大寫。
- entity_type：以下類型之一：[{entity_types}]
- entity_description：以「Text」相同語言，完整描述該實體的屬性與行為。
請將每個實體格式化為 ("entity"${PROMPTS.DEFAULT_TUPLE_DELIMITER}<entity_name>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<entity_type>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<entity_description>)

2. 針對步驟 1 所辨識之實體，找出所有彼此「明確相關」的 (source_entity, target_entity) 配對。
對於每一組相關的實體配對，請擷取以下資訊：
- source_entity：來源實體名稱，需為步驟 1 中的名稱
- target_entity：目標實體名稱，需為步驟 1 中的名稱
- relationship_description：以「Text」相同語言，說明為何判定來源與目標實體彼此相關
- relationship_strength：一個 0.0-1.0 的數字分數，代表兩者關係的強度（1.0=直接相關/強關聯，0.5=間接相關/中等關聯，0.0=微弱相關）
請將每個關係格式化為 ("relationship"${PROMPTS.DEFAULT_TUPLE_DELIMITER}<source_entity>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<target_entity>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<relationship_description>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<relationship_strength>)

3. 請以單一清單回傳步驟 1 與 2 中所有的實體與關係。清單項目之間請使用 **${PROMPTS.DEFAULT_RECORD_DELIMITER}** 作為分隔符號。

4. 完成時請輸出 ${PROMPTS.DEFAULT_COMPLETION_DELIMITER}

-真實資料-
######################
Entity_types: {entity_types}
Text: {input_text}
######################
Output:`;

PROMPTS.GENERAL_CONTINUE_PROMPT =
  "上一次抽取遺漏了許多實體。請依相同格式在下方補充新增：\n";
PROMPTS.GENERAL_LOOP_PROMPT =
  "看來仍有可能遺漏部分實體。若仍需新增請回答 Y，若無則回答 N。請僅以單一字母 Y 或 N 作答。\n";

PROMPTS.SUMMARIZE_DESCRIPTIONS_PROMPT = `
你是一位協助產生綜合摘要的助理。以下提供指向同一個實體的一個或多個名稱，以及多則相關描述。
請將所有描述彙整為一段完整的單一描述，務必涵蓋所有提供的重點。
如描述間出現矛盾，請加以整合並產生一致且可讀的摘要。
請以第三人稱撰寫，並包含實體名稱以保留完整脈絡。
輸出語言請使用 {language}。

#######
-資料-
Entities: {entity_name}
Description List: {description_list}
#######
`;

PROMPTS.ENTITY_RESOLUTION_PROMPT = `
-目標-
給定兩個實體描述，請判斷它們是否指向同一個真實世界的對象。

-步驟-
1. 仔細比較實體 A 和實體 B 的名稱、類型和描述。
2. 根據文本內容，評估它們是同一個實體的可能性。
3. 以 JSON 格式輸出你的判斷結果，包含以下欄位：
   - "match": 布林值 (true 或 false)，表示是否為同一個實體。
   - "confidence": 0.0 到 1.0 的浮點數，表示你對判斷的信心程度。
   - "justification": 一句話解釋你判斷的理由。

-真實資料-
######################
Entity A Name: {entity_a_name}
Entity A Description: {entity_a_description}
---
Entity B Name: {entity_b_name}
Entity B Description: {entity_b_description}
######################
Output:
`;

PROMPTS.COMMUNITY_REPORT_PROMPT = `
你是一位協助人類分析師進行一般資訊探索的 AI 助理。

# 目標
在提供屬於某個社群的實體清單及其關係後，請撰寫一份完整的社群報告。此報告將提供決策者參考，說明社群的相關資訊及其可能影響。

# 報告結構
報告應包含以下章節：
- TITLE：能代表社群關鍵實體的社群名稱，標題需精簡但具體。
- SUMMARY：社群整體結構的重點摘要，說明各實體間如何互相關聯。
- IMPACT SEVERITY RATING：0-10 的浮點分數，代表社群內實體所可能造成的影響嚴重度（0=無影響/低風險，5=中等影響/中等風險，10=重大影響/高風險）。
- RATING EXPLANATION：一句話說明影響嚴重度評分的理由。
- DETAILED FINDINGS：列出 5-10 項與社群相關的關鍵洞見。

請以良好格式的 JSON 字串回傳（內容語言與「Text」一致），格式如下：
    {
        "title": "<report_title>",
        "summary": "<executive_summary>",
        "rating": <impact_severity_rating>,
        "rating_explanation": "<rating_explanation>",
        "findings": [
            {
                "summary":"<insight_1_summary>",
                "explanation": "<insight_1_explanation>，此解釋必須引用報告中的具體實體或關係來支持其論點"
            }
        ]
    }

# 真實資料
請僅使用下方文字作答，不要杜撰內容。

Text:

-Entities-
{entity_df}

-Relationships-
{relation_df}

Output:`;

PROMPTS.BASIC_ENTITY_EXTRACTION = `---目標---
給定一份與本任務可能相關的文字文件，以及一份實體類型清單，請自該文字中找出所有屬於這些類型的實體，並找出上述實體之間的所有關係。
輸出語言請使用 {language}。

---步驟---
1. 辨識所有實體。對於每個被辨識出的實體，請擷取以下資訊：
- entity_name：實體名稱，請與輸入文字使用相同語言；若為英文請將名稱字首大寫。
- entity_type：以下類型之一：[{entity_types}]
- entity_description：請僅根據輸入文字中「明確存在」的資訊，完整描述該實體的屬性與行為。請勿推測或臆造未明示的內容。
請將每個實體格式化為 ("entity"${PROMPTS.DEFAULT_TUPLE_DELIMITER}<entity_name>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<entity_type>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<entity_description>)

2. 針對步驟 1 所辨識之實體，找出所有彼此「明確相關」的 (source_entity, target_entity) 配對。
對於每一組相關的實體配對，請擷取以下資訊：
- source_entity：來源實體名稱，需為步驟 1 中的名稱
- target_entity：目標實體名稱，需為步驟 1 中的名稱
- relationship_description：說明為何判定來源與目標實體彼此相關
- relationship_strength：一個數字分數，代表兩者關係的強度
- relationship_keywords：一個或多個高層級關鍵詞，概括該關係的本質
請將每個關係格式化為 ("relationship"${PROMPTS.DEFAULT_TUPLE_DELIMITER}<source_entity>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<target_entity>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<relationship_description>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<relationship_keywords>${PROMPTS.DEFAULT_TUPLE_DELIMITER}<relationship_strength>)

3. 請以 {language} 回傳包含所有實體與關係的單一清單。清單項目之間請使用 **${PROMPTS.DEFAULT_RECORD_DELIMITER}** 作為分隔符號。

4. 完成時請輸出 ${PROMPTS.DEFAULT_COMPLETION_DELIMITER}

---真實資料---
Entity_types: [{entity_types}]
Text:
{input_text}
---輸出---
`;

PROMPTS.BASIC_ENTITY_CONTINUE_EXTRACTION = `
先前的抽取遺漏了許多實體與關係。請僅從前述文字中找出「尚未被抽取」的實體與關係。

---提醒步驟---
（步驟與初次抽取相同）

---輸出---
請依相同格式在下方補充新增實體與關係，且不要重複列出已經抽取過的項目：
`.trim();

PROMPTS.BASIC_ENTITY_IF_LOOP_EXTRACTION = `
---目標---'
看起來仍可能遺漏部分實體。

---輸出---
若仍需新增實體，請只回答 \`Y\`；若不需要，請只回答 \`N\`。
`.trim();

module.exports = { PROMPTS };
