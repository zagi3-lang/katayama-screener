// pages/api/sector-scan.js
// 業種別銘柄コード取得のみ（スキャンはssignalに任せる）

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { apiKey, sectors } = req.body;
  if (!apiKey) return res.status(400).json({ error: "APIキーが必要です" });

  try {
    const headers = { "x-api-key": apiKey };

    // 銘柄マスター取得
    let allStocks = [];
    let paginationKey = null;

    do {
      const url = paginationKey
        ? `https://api.jquants.com/v2/equities/master?pagination_key=${paginationKey}`
        : `https://api.jquants.com/v2/equities/master`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return res.status(200).json({ ok: false, error: `マスター取得失敗 HTTP${r.status}` });
      const json = await r.json();
      const stocks = json.info ?? json.master ?? [];
      allStocks = allStocks.concat(stocks);
      paginationKey = json.pagination_key ?? null;
    } while (paginationKey);

    // 上場中のみ
    const listed = allStocks.filter(s => {
      const status = s.MarketCode ?? s.marketCode ?? "";
      return status !== "0000"; // 上場廃止除外
    });

    // 業種フィルタ
    const targetSectors = sectors || ["all"];
    const filtered = targetSectors.includes("all")
      ? listed
      : listed.filter(s => targetSectors.includes(String(s.Sector33Code ?? s.sector33Code ?? "")));

    // コードと銘柄名マップ
    const codeMap = {};
    filtered.forEach(s => {
      const code = String(s.Code ?? s.code ?? "").replace(/0$/, "").slice(0, 4);
      if (/^\d{4}$/.test(code)) {
        codeMap[code] = s.CompanyName ?? s.companyName ?? code;
      }
    });

    const codes = Object.keys(codeMap);

    return res.status(200).json({
      ok: true,
      codes,
      codeMap,
      total: codes.length,
      message: `${codes.length}銘柄を取得しました`,
    });

  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
}
