// This is a mock implementation of document search
// In a real application, this would be replaced with a proper search API

export async function searchDocument(query: string, documentUrl: string): Promise<any[]> {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Mock results based on the query
  if (query.includes("現金") && query.includes("2023")) {
    return [
      {
        page: 52,
        title: "連結貸借対照表",
        highlightedText: `
          <p>
            2023年12月31日時点での<span class="bg-yellow-200 px-1 rounded">現金及び現金同等物</span>は<span class="bg-yellow-200 px-1 rounded">$24,048百万</span>でした。
            また、<span class="bg-yellow-200 px-1 rounded">市場性のある有価証券</span>は<span class="bg-yellow-200 px-1 rounded">$86,868百万</span>でした。
            合計すると、<span class="bg-yellow-200 px-1 rounded">現金、現金同等物、および市場性のある有価証券</span>は<span class="bg-yellow-200 px-1 rounded">$110,916百万</span>となります。
          </p>
        `,
      },
      {
        page: 37,
        title: "財務状況",
        highlightedText: `
          <p>
            <span class="bg-yellow-200 px-1 rounded">2023年12月31日</span>時点で、当社は<span class="bg-yellow-200 px-1 rounded">$95.7十億</span>の<span class="bg-yellow-200 px-1 rounded">現金、現金同等物、および短期市場性有価証券</span>を保有していました。
            現金同等物および市場性のある有価証券は、定期預金、マネー・マーケット・ファンド、流動性の高い政府債、社債証券、モーゲージ担保証券、資産担保証券、および市場性のある株式証券で構成されています。
          </p>
        `,
      },
    ]
  }

  if (query.includes("Google Cloud") && query.includes("収益")) {
    return [
      {
        page: 36,
        title: "Google Cloud",
        highlightedText: `
          <p>
            <span class="bg-yellow-200 px-1 rounded">Google Cloud</span>の<span class="bg-yellow-200 px-1 rounded">収益</span>は2023年から2024年にかけて<span class="bg-yellow-200 px-1 rounded">$10.1十億</span>増加しました。
            この増加は主にGoogle Cloud Platformの成長によるもので、特にインフラストラクチャサービスが大きく貢献しています。
          </p>
        `,
      },
    ]
  }

  if (query.includes("総収益") || query.includes("収益")) {
    return [
      {
        page: 35,
        title: "財務結果",
        highlightedText: `
          <p>
            <span class="bg-yellow-200 px-1 rounded">収益</span>は<span class="bg-yellow-200 px-1 rounded">$350.0十億</span>で、前年比14%増加しました。
            この増加は主にGoogle Services収益の$32.4十億（12%）の増加とGoogle Cloud収益の$10.1十億（31%）の増加によるものです。
          </p>
        `,
      },
    ]
  }

  // Default empty results
  return []
}
