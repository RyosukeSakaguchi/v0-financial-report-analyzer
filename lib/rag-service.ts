import { createClient } from "@/lib/supabase-client"

// PDFから抽出されたテキストチャンクのインターフェース
interface DocumentChunk {
  id: string
  content: string
  metadata: {
    documentId: number
    filename: string
    page: number
    url: string
    section?: string
  }
}

// RAGの結果を表すインターフェース
interface RagResult {
  answer: string
  sources: {
    filename: string
    page: number
    text: string
    url: string
  }[]
  selectedDocuments: string[]
  debugInfo?: any
}

// アップロードされたPDFのメタデータを取得
async function getUploadedDocuments(selectedDocIds: number[]) {
  const supabase = createClient()

  const { data, error } = await supabase
    .from("documents")
    .select("id, filename, url, status, size, created_at")
    .in("id", selectedDocIds)
    .eq("status", "completed")

  if (error) {
    console.error("Error fetching documents:", error)
    return []
  }

  return data || []
}

// アップロードされたPDFからドキュメントチャンクを取得（実際のデータベースから）
async function getDocumentChunks(selectedDocIds: number[]) {
  const supabase = createClient()

  try {
    console.log("データベースからチャンクを取得中...")

    // 実際のdocument_chunksテーブルからデータを取得
    // chunk_indexカラムを使用せず、document_idとpageでソート
    const { data: chunks, error } = await supabase
      .from("document_chunks")
      .select("*")
      .in("document_id", selectedDocIds)
      .order("document_id, page") // chunk_indexを使わずにdocument_idとpageでソート

    if (error) {
      console.error("Database error:", error)
      throw new Error(`チャンクの取得に失敗しました: ${error.message}`)
    }

    if (!chunks || chunks.length === 0) {
      console.log("データベースにチャンクが見つかりません")
      return []
    }

    console.log(`データベースから${chunks.length}個のチャンクを取得しました`)

    // チャンクをDocumentChunk形式に変換
    const documentChunks: DocumentChunk[] = chunks.map((chunk) => ({
      id: chunk.id.toString(),
      content: chunk.content,
      metadata: {
        documentId: chunk.document_id,
        filename: chunk.filename || "Unknown",
        page: chunk.page || 1,
        url: chunk.source || "",
        section: `Page ${chunk.page}`,
      },
    }))

    // ページ分布を確認
    const pageDistribution = documentChunks.reduce(
      (acc, chunk) => {
        const page = chunk.metadata.page
        acc[page] = (acc[page] || 0) + 1
        return acc
      },
      {} as Record<number, number>,
    )

    console.log("チャンクのページ分布:", pageDistribution)
    console.log(
      "ページ範囲:",
      Math.min(...Object.keys(pageDistribution).map(Number)),
      "〜",
      Math.max(...Object.keys(pageDistribution).map(Number)),
    )

    return documentChunks
  } catch (error) {
    console.error("Error in getDocumentChunks:", error)
    return []
  }
}

// セマンティック検索（意味ベースの検索）
function findRelevantChunks(query: string, chunks: DocumentChunk[], limit = 5): DocumentChunk[] {
  console.log(`\n=== セマンティック検索 ===`)
  console.log(`検索クエリ: "${query}"`)
  console.log(`検索対象チャンク数: ${chunks.length}`)

  const queryLower = query.toLowerCase()
  const queryWords = queryLower.split(/\s+/).filter((word) => word.length > 2)

  const scoredChunks = chunks.map((chunk) => {
    let score = 0
    const contentLower = chunk.content.toLowerCase()

    // 1. 直接的なキーワードマッチング
    queryWords.forEach((word) => {
      const wordCount = (contentLower.match(new RegExp(word, "g")) || []).length
      score += wordCount * 5
    })

    // 2. 意味的関連性の判定
    if (queryLower.includes("収益") || queryLower.includes("revenue") || queryLower.includes("売上")) {
      if (
        contentLower.includes("revenue") ||
        contentLower.includes("sales") ||
        contentLower.includes("billion") ||
        contentLower.includes("income") ||
        contentLower.includes("earnings")
      ) {
        score += 15
      }
    }

    if (queryLower.includes("財務") || queryLower.includes("financial")) {
      if (
        contentLower.includes("financial") ||
        contentLower.includes("cash") ||
        contentLower.includes("profit") ||
        contentLower.includes("margin") ||
        contentLower.includes("balance")
      ) {
        score += 15
      }
    }

    if (queryLower.includes("成長") || queryLower.includes("growth")) {
      if (
        contentLower.includes("growth") ||
        contentLower.includes("increase") ||
        contentLower.includes("expansion") ||
        contentLower.includes("development")
      ) {
        score += 12
      }
    }

    // 3. 年度指定
    const years = ["2023", "2022", "2021", "2020"]
    years.forEach((year) => {
      if (queryLower.includes(year) && contentLower.includes(year)) {
        score += 20
      }
    })

    // 4. 企業名
    if (queryLower.includes("apple") && contentLower.includes("apple")) score += 15
    if (queryLower.includes("google") && contentLower.includes("google")) score += 15
    if (queryLower.includes("alphabet") && contentLower.includes("alphabet")) score += 15

    // 5. ページの多様性を促進
    score += (chunk.metadata.page % 5) * 0.1

    return { chunk, score }
  })

  const relevantChunks = scoredChunks
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk)

  console.log(`関連チャンク: ${relevantChunks.length}個`)
  relevantChunks.forEach((chunk, index) => {
    const score = scoredChunks.find((s) => s.chunk.id === chunk.id)?.score || 0
    console.log(`${index + 1}. ページ ${chunk.metadata.page} (スコア: ${score})`)
  })

  const selectedPages = relevantChunks.map((chunk) => chunk.metadata.page)
  console.log(`選択されたページ: ${selectedPages.join(", ")}`)

  return relevantChunks
}

// メインのRAG実行関数
export async function performRag(query: string, selectedDocIds: number[] = []): Promise<RagResult> {
  console.log(`\n🔍 実際のPDFからRAG実行: "${query}"`)

  try {
    if (selectedDocIds.length === 0) {
      return {
        answer: "検索対象のPDFが選択されていません。PDFを選択してから質問してください。",
        sources: [],
        selectedDocuments: [],
      }
    }

    // 実際のPDFチャンクを取得
    const allChunks = await getDocumentChunks(selectedDocIds)
    console.log(`取得したチャンク: ${allChunks.length}個`)

    if (allChunks.length === 0) {
      return {
        answer:
          "選択されたPDFからテキストチャンクが見つかりませんでした。PDFが正常に処理されているか確認してください。",
        sources: [],
        selectedDocuments: [],
      }
    }

    // セマンティック検索で関連チャンクを取得
    const relevantChunks = findRelevantChunks(query, allChunks, 5)

    if (relevantChunks.length === 0) {
      return {
        answer: `アップロードされたPDFから「${query}」に関連する情報が見つかりませんでした。\n\n利用可能なページ数: ${Math.max(...allChunks.map((c) => c.metadata.page))}ページ\n\n別のキーワードで検索してみてください。`,
        sources: [],
        selectedDocuments: [...new Set(allChunks.map((c) => c.metadata.filename))],
      }
    }

    // 自然な文章を生成
    const answer = generateNaturalLanguageAnswer(query, relevantChunks)

    // 出典情報
    const sources = relevantChunks.map((chunk) => ({
      filename: chunk.metadata.filename,
      page: chunk.metadata.page,
      text: chunk.content,
      url: chunk.metadata.url,
    }))

    return {
      answer,
      sources,
      selectedDocuments: [...new Set(relevantChunks.map((c) => c.metadata.filename))],
    }
  } catch (error) {
    console.error("RAG error:", error)
    throw new Error("回答の生成中にエラーが発生しました")
  }
}

// ドキュメント分類の結果を取得する関数
export async function getDocumentClassification(
  query: string,
  selectedDocIds: number[],
): Promise<{ documents: any[]; reasoning: string }> {
  const uploadedDocuments = await getUploadedDocuments(selectedDocIds)

  let reasoning = "実際のPDFチャンクからRAG分析:\n"
  reasoning += `- 質問: "${query}"\n`
  reasoning += `- 検索対象PDF数: ${uploadedDocuments.length}\n`
  reasoning += `- 処理方法: アップロードされたPDFから抽出された実際のテキストチャンクを使用\n`
  reasoning += uploadedDocuments.map((doc) => `- ${doc.filename}`).join("\n")

  return {
    documents: uploadedDocuments,
    reasoning: reasoning,
  }
}

// LLMのような自然な文章を生成する関数
function generateNaturalLanguageAnswer(query: string, relevantChunks: DocumentChunk[]): string {
  if (relevantChunks.length === 0) {
    return "申し訳ありませんが、アップロードされたPDFからご質問に関連する情報を見つけることができませんでした。より具体的な質問をお試しいただくか、関連する文書をアップロードしてください。"
  }

  const queryLower = query.toLowerCase()

  // 質問の種類を判定して適切な回答スタイルを選択
  let answer = ""

  if (queryLower.includes("いくら") || queryLower.includes("金額") || queryLower.includes("how much")) {
    answer = `ご質問の「${query}」について、アップロードされたPDFから以下の情報が見つかりました。\n\n`
  } else if (queryLower.includes("なぜ") || queryLower.includes("理由") || queryLower.includes("why")) {
    answer = `「${query}」の理由について、PDFには以下の説明があります。\n\n`
  } else if (queryLower.includes("どのように") || queryLower.includes("方法") || queryLower.includes("how")) {
    answer = `「${query}」について、PDFでは以下のように説明されています。\n\n`
  } else {
    answer = `「${query}」に関して、アップロードされたPDFから以下の情報を抽出しました。\n\n`
  }

  // 最も関連性の高いチャンクから情報を抽出
  relevantChunks.forEach((chunk, index) => {
    if (index === 0) {
      answer += `${chunk.metadata.filename}のページ${chunk.metadata.page}によると：\n${chunk.content}\n`
    } else {
      answer += `\n関連情報として、ページ${chunk.metadata.page}では：\n${chunk.content}\n`
    }
  })

  return answer
}
