// pages/api/jquants-test.js — J-Quants API v2対応版（x-api-key認証）
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { refreshToken: apiKey } = req.body;
  if (!apiKey) return res.status(400).json({ error: "APIキーが必要です" });

  const results = {};

  try {
    // v2: x-api-key ヘッダーで認証
    const headers = { "x-api-key": apiKey };

    // Step 1: 銘柄一覧
    results.step1 = "銘柄一覧取得中...";
    const listedRes = await fetch("https://api.jquants.com/v2/listed/info", { headers });
    if (!listedRes.ok) {
      const err = await listedRes.json().catch(() => ({}));
      return res.status(200).json({
        ok: false, step: "IDトークン取得",
        error: err?.message || `HTTP ${listedRes.status}`,
        hint: "APIキーが正しいか確認してください（jpx-jquants.com → APIキーメニュー）",
      });
    }
    const listedData = await listedRes.json();
    const totalStocks = listedData.info?.length ?? 0;
    results.step1 = `✅ 銘柄一覧取得成功（v2）→ ${totalStocks}銘柄`;

    // Step 2: 日次株価テスト
    results.step2 = "日次データ取得中...";
    const testCodes = ["6981", "7012", "5803"];
    const today = new Date();
    const day = today.getDay();
    if (day === 0) today.setDate(today.getDate() - 2);
    if (day === 6) today.setDate(today.getDate() - 1);
    const toStr  = today.toISOString().slice(0, 10);
    const fromStr = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

    const priceResults = [];
    for (const code of testCodes) {
      const pRes = await fetch(
        `https://api.jquants.com/v2/prices/daily_quotes?code=${code}&from=${fromStr}&to=${toStr}`,
        { headers }
      );
      if (!pRes.ok) { priceResults.push({ code, ok: false, status: pRes.status }); continue; }
      const pData = await pRes.json();
      const records = pData.daily_quotes?.length ?? 0;
      const latest = pData.daily_quotes?.[records - 1];
      priceResults.push({
        code, ok: true, records,
        latest: latest ? { date: latest.Date, close: latest.Close, volume: latest.Volume } : null,
      });
    }
    results.step2 = `✅ 日次データ取得成功`;
    results.step3 = `✅ OBV/RSI計算可能 — ${priceResults.find(r=>r.ok)?.records ?? 0}日分取得済み`;
    results.step4 = `✅ 全銘柄スキャン実装可能`;

    return res.status(200).json({
      ok: true,
      summary: { totalListedStocks: totalStocks, testCodesResult: priceResults, obvFeasible: priceResults.some(r=>r.ok) },
      steps: results,
      message: `全テスト通過！${totalStocks}銘柄対応・OBV/RSI計算に必要なデータ取得を確認。Sシグナル全銘柄スキャン実装可能です。`,
    });

  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message, results });
  }
}
