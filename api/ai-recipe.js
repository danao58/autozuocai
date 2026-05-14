const { methodNotAllowed, parseBody, sendJson } = require("./_lib/http");

const DIFFICULTIES = ["简单", "中等", "复杂"];
const DEFAULT_UNITS = ["个", "克", "斤", "把", "颗", "片", "瓣", "勺", "碗", "份", "毫升"];
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

function normalizeUnits(value) {
  const units = Array.isArray(value)
    ? value.map((item) => item?.toString().trim()).filter(Boolean)
    : [];
  return units.length ? units : DEFAULT_UNITS;
}

function buildPrompt(input, units) {
  return `
你是菜谱结构化助手。请把用户给的文字、菜谱说明或视频/图文链接整理成合法 JSON。

必须只输出 JSON，不要 Markdown，不要代码块，不要解释。
JSON 顶层格式必须是：
{
  "recipes": [
    {
      "name": "菜名",
      "desc": "一句话描述",
      "difficulty": "简单",
      "tags": ["家常菜"],
      "imageUrl": "",
      "steps": [
        {
          "content": "步骤描述",
          "timeMinutes": 0,
          "consumes": [
            { "name": "食材名称", "count": 1, "unit": "个" }
          ]
        }
      ],
      "source": {
        "type": "text",
        "url": "",
        "note": "来源说明"
      }
    }
  ]
}

规则：
- difficulty 只能从 ${DIFFICULTIES.join("、")} 中选择。
- unit 只能优先从 ${units.join("、")} 中选择。
- count 必须是数字，不能写中文数字。
- 每个步骤的 timeMinutes 是分钟数，不需要计时填 0。
- consumes 只填写该步骤新增或实际要消耗的食材。
- 食材名称去掉多余空格。
- 如果输入是链接但无法确认页面/视频内容，只能基于链接文字和用户输入推断，并在 source.note 中说明“链接内容无法直接读取，按已提供信息整理”。
- source.type 输入像 URL 时填 "url"，否则填 "text"；source.url 是原链接，没有链接则为空字符串。

用户输入：
${input}
`.trim();
}

function readGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").join("").trim();
}

function extractJson(text) {
  const cleaned = String(text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI 没有返回 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeRecipePayload(payload, units) {
  const recipes = Array.isArray(payload) ? payload : Array.isArray(payload?.recipes) ? payload.recipes : [];
  if (!recipes.length) throw new Error("AI 没有解析出菜谱");
  return {
    instructions: {
      usage: "请把文字菜谱或视频内容解析成 recipes 数组。只输出合法 JSON，不要输出 Markdown。",
      difficultyOptions: DIFFICULTIES,
      unitOptions: units,
      timeField: "每个步骤用 timeMinutes 填写分钟数；不需要计时填 0。",
      ingredientRule: "consumes 里的 name 要写食材名称，count 写数字，unit 必须优先从 unitOptions 中选择；系统没有的食材会自动新增，库存默认为 0。"
    },
    recipes
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      sendJson(res, 500, { error: "GEMINI_API_KEY is not configured" });
      return;
    }

    const body = parseBody(req);
    const input = String(body.input || "").trim();
    const units = normalizeUnits(body.units);
    if (!input) {
      sendJson(res, 400, { error: "请输入菜谱文字或链接" });
      return;
    }
    if (input.length > 12000) {
      sendJson(res, 400, { error: "输入内容太长，请先精简到 12000 字以内" });
      return;
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildPrompt(input, units) }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || "AI 解析失败";
      sendJson(res, response.status, { error: message });
      return;
    }

    const parsed = extractJson(readGeminiText(data));
    sendJson(res, 200, normalizeRecipePayload(parsed, units));
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "AI 解析失败" });
  }
};
