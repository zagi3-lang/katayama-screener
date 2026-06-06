// pages/api/sector-scan.js
// 選択された33業種に属する「対象コード」と「コード→銘柄名」マップを返す（J-Quants v2）
//   GET /v2/equities/master  → 全上場銘柄（CoName 社名 / S33 33業種コード / S33Nm 業種名）
// 返却: { ok, codes:[4桁], codeMap:{4桁:社名}, error?, rateLimited? }
//   sectors は S33（コード）/ S33Nm（名前）どちらの配列でも可。表記ゆれ（"海運"⇔"海運業"）も吸収。
//   sectors 未指定なら全業種（ETF等の「その他/9999」は常に除外）。

const V2 = "https://api.jquants.com/v2";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  const { apiKey, sectors } = req.body || {};
  if (!apiKey) return res.status(200).json({ ok: false, error: "apiKey required" });

  const wanted = (sectors || []).map(s => String(s)).filter(Boolean);
  const wantSet = new Set(wanted);
  const headers = { "x-api-key": apiKey };

  const matchSector = (s33, s33nm) => {
    if (wanted.length === 0) return true;                 // 未指定＝全業種
    if (wantSet.has(s33) || wantSet.has(s33nm)) return true; // コード/名 完全一致
    // 名前の表記ゆれ（"海運"⊂"海運業" 等）を双方向 includes で吸収
    return wanted.some(w => (s33nm && (s33nm.includes(w) || w.includes(s33nm))));
  };

  try {
    const codes = [];
    const codeMap = {};
    let pageKey = null;
    let pages = 0;

    do {
      const url = new URL(`${V2}/equities/master`);
      if (pageKey) url.searchParams.set("pagination_key", pageKey);

      const r = await fetch(url.toString(), { headers });
      if (r.status === 429) return res.status(200).json({ ok: false, rateLimited: true });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        return res.status(200).json({ ok: false, error: `HTTP ${r.status} ${t.slice(0, 200)}` });
      }

      const json = await r.json();
      const rows = json.data || [];
      for (const d of rows) {
        const s33   = String(d.S33   ?? "");
        const s33nm = String(d.S33Nm ?? "");
        if (s33 === "9999" || s33nm === "その他") continue;   // ETF等を除外
        if (!matchSector(s33, s33nm)) continue;
        const code = String(d.Code ?? "").slice(0, 4);        // 5桁→4桁
        const name = d.CoName ?? d.CompanyName ?? code;       // V2=CoName（念のためV1名も）
        if (!code) continue;
        codes.push(code);
        codeMap[code] = name;
      }
      pageKey = json.pagination_key || null;
      pages++;
    } while (pageKey && pages < 20);

    return res.status(200).json({ ok: true, codes, codeMap });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
