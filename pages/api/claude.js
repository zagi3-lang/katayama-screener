// pages/api/claude.js
// ★ APIキーはここでのみ使用 - クライアントには絶対に渡さない

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "APIキーが設定されていません" });
  }

  try {
    const { system, userMsg } = req.body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        system,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        error: err?.error?.message || "Anthropic APIエラー",
      });
    }

    // Agentic loop: web_search tool_use に自動対応
    let data = await response.json();
    let messages = [{ role: "user", content: userMsg }];
    let round = 0;

    while (data.stop_reason === "tool_use" && round < 8) {
      round++;
      const toolUseBlocks = data.content.filter((b) => b.type === "tool_use");

      messages.push({ role: "assistant", content: data.content });
      const toolResults = toolUseBlocks.map((b) => ({
        type: "tool_result",
        tool_use_id: b.id,
        content: [],
      }));
      messages.push({ role: "user", content: toolResults });

      const nextRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 4000,
          system,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages,
        }),
      });

      if (!nextRes.ok) break;
      data = await nextRes.json();
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
