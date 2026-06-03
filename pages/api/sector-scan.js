// pages/api/sector-scan.js — デバッグ版
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { apiKey, sectors } = req.body;
  if (!apiKey) return res.status(400).json({ error: "APIキーが必要です" });

  try {
    const headers = { "x-api-key": apiKey };

    // 銘柄マスター取得（デバッグ：生レスポンスのキーを確認）
    const r = await fetch("https://api.jquants.com/v2/equities/master", {
      headers, signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) {
      return res.status(200).json({ ok: false, error: `HTTP ${r.status}`, status: r.status });
    }
    const json = await r.json();

    // レスポンスのキーを確認
    const keys = Object.keys(json);
    const firstKey = keys[0];
    const rawStocks = json[firstKey];
    const count = Array.isArray(rawStocks) ? rawStocks.length : 0;
    const sample = Array.isArray(rawStocks) && rawStocks.length > 0 ? rawStocks[0] : null;

    // すべてのキーを試してコードを抽出
    let allStocks = [];
    for (const key of keys) {
      if (Array.isArray(json[key]) && json[key].length > 0) {
        allStocks = json[key];
        break;
      }
    }

    // コード抽出（5桁コードの最初4桁を使用）
    const codeMap = {};
    allStocks.forEach(s => {
      // v2のフィールド名候補を全部試す
      const rawCode = s.Code ?? s.code ?? s.SecurityCode ?? s.securityCode ?? "";
      const code = String(rawCode).slice(0, 4);
      if (/^\d{4}$/.test(code)) {
        const name = s.CompanyName ?? s.companyName ?? s.Name ?? s.name ?? code;
        codeMap[code] = name;
      }
    });

    // 業種フィルタ
    const targetSectors = sectors || ["all"];
    let filteredMap = codeMap;

    if (!targetSectors.includes("all")) {
      const sectorFiltered = allStocks.filter(s => {
        const sc = String(s.Sector33Code ?? s.sector33Code ?? s.SectorCode ?? "");
        return targetSectors.includes(sc);
      });
      filteredMap = {};
      sectorFiltered.forEach(s => {
        const rawCode = s.Code ?? s.code ?? s.SecurityCode ?? "";
        const code = String(rawCode).slice(0, 4);
        if (/^\d{4}$/.test(code)) {
          filteredMap[code] = s.CompanyName ?? s.companyName ?? code;
        }
      });
    }

    const codes = Object.keys(filteredMap);

    return res.status(200).json({
      ok: true,
      codes,
      codeMap: filteredMap,
      total: codes.length,
      message: `${codes.length}銘柄を取得しました`,
      // デバッグ情報
      debug: {
        responseKeys: keys,
        firstKey,
        totalInResponse: count,
        sampleFields: sample ? Object.keys(sample) : [],
        sampleData: sample,
        paginationKey: json.pagination_key ?? null,
      }
    });

  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
