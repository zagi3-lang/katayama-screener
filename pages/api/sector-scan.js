// pages/api/sector-scan.js
// 業種別の銘柄コード取得のみ（実スキャンは ssignal 側でバッチ処理）
// J-Quants v2 仕様に対応（2026-06 公式スペック確認済み）
//   - エンドポイント : GET https://api.jquants.com/v2/equities/master
//   - 認証          : x-api-key ヘッダ
//   - レスポンス     : { "data": [...], "pagination_key": "..." }
//   - カラム名(省略形): Code(5桁) / CoName / S33(33業種) / S33Nm / Mkt(市場)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { apiKey, sectors } = req.body || {};
  if (!apiKey) return res.status(400).json({ ok: false, error: "APIキーが必要です" });

  try {
    const headers = { "x-api-key": apiKey };

    // 上場銘柄マスター取得（data 配列 + pagination_key をたどる）
    let all = [];
    let pageKey = null;

    do {
      const url = pageKey
        ? `https://api.jquants.com/v2/equities/master?pagination_key=${encodeURIComponent(pageKey)}`
        : `https://api.jquants.com/v2/equities/master`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        return res.status(200).json({
          ok: false,
          error: `マスター取得失敗 HTTP${r.status} ${body.slice(0, 120)}`,
        });
      }
      const json = await r.json();
      const rows = Array.isArray(json.data) ? json.data : []; // ← V2は data 配列
      all = all.concat(rows);
      pageKey = json.pagination_key ?? null;
    } while (pageKey);

    if (all.length === 0) {
      return res.status(200).json({ ok: false, error: "マスターが空でした（data配列が0件）" });
    }

    // 業種フィルタ（V2の33業種コードは S33）
    const targets = sectors && sectors.length ? sectors : ["all"];
    const useAll = targets.includes("all");
    const targetSet = new Set(targets.map(String));

    const codeMap = {};
    for (const s of all) {
      const s33 = String(s.S33 ?? "");
      if (!useAll && !targetSet.has(s33)) continue;

      // V2のCodeは5桁（例 "86970"）。表示用の4桁は先頭4文字。
      // 英数字コード（例 "285A0" → "285A"）も拾えるよう英大文字も許可。
      const code = String(s.Code ?? "").slice(0, 4);
      if (!/^[0-9A-Z]{4}$/.test(code)) continue;

      codeMap[code] = s.CoName ?? "";
    }

    const codes = Object.keys(codeMap);
    return res.status(200).json({
      ok: true,
      count: codes.length, // ← 取得できたコード数（動作確認用）
      codes,
      codeMap,
    });
  } catch (e) {
    const msg =
      e?.name === "TimeoutError"
        ? "マスター取得タイムアウト（8秒）"
        : e?.message || "不明なエラー";
    return res.status(200).json({ ok: false, error: msg });
  }
}
