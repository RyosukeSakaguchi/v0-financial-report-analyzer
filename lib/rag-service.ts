import { createClient } from "@/lib/supabase-client"
import { generateText, embed } from "ai"
import { openai } from "@ai-sdk/openai"

// PDFから抽出されたテキストチャンクのインターフェース
interface DocumentChunk {
  id: string
  content: string
  embedding?: number[]
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

// AI SDKを使用してテキストをベクトル化
async function createEmbedding(text: string): Promise<number[]> {
  try {
    // API キーの確認
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      console.warn("OpenAI API key not found, skipping embedding creation")
      return []
    }

    console.log("AI SDKでembeddingを作成中...")

    // OpenAI providerにAPI keyを明示的に渡す
    const openaiProvider = openai({
      apiKey: apiKey,
    })

    const { embedding } = await embed({
      model: openaiProvider.embedding("text-embedding-3-small"),
      value: text,
    })

    console.log(`Embedding作成成功: ${embedding.length}次元`)
    return embedding
  } catch (error) {
    console.error("Embedding creation error:", error)
    console.log("Embeddingの作成をスキップします")
    return []
  }
}

// コサイン類似度を計算
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("ベクトルの次元が一致しません")
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
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

// アップロードされたPDFからドキュメントチャンクを取得（ベクトル付き）
async function getDocumentChunks(selectedDocIds: number[]): Promise<DocumentChunk[]> {
  const supabase = createClient()

  try {
    console.log("データベースからチャンクを取得中...")

    const { data: chunks, error } = await supabase
      .from("document_chunks")
      .select("*")
      .in("document_id", selectedDocIds)
      .order("document_id, page")

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
    const documentChunks: DocumentChunk[] = await Promise.all(
      chunks.map(async (chunk) => {
        let embedding: number[] | undefined

        // 既存のembeddingがあるかチェック
        if (chunk.embedding && Array.isArray(chunk.embedding)) {
          embedding = chunk.embedding
          console.log(`チャンク ${chunk.id}: 既存のembeddingを使用`)
        } else {
          // embeddingがない場合は新しく作成（API keyがある場合のみ）
          if (process.env.OPENAI_API_KEY) {
            try {
              console.log(`チャンク ${chunk.id} のembeddingを作成中...`)
              const embeddingResult = await createEmbedding(chunk.content)
              if (embeddingResult.length > 0) {
                embedding = embeddingResult
                // データベースにembeddingを保存
                await supabase.from("document_chunks").update({ embedding }).eq("id", chunk.id)
                console.log(`チャンク ${chunk.id}: embeddingを作成・保存しました`)
              }
            } catch (embeddingError) {
              console.error(`チャンク ${chunk.id} のembedding作成に失敗:`, embeddingError)
              embedding = undefined
            }
          } else {
            console.log(`チャンク ${chunk.id}: OpenAI API keyがないためembeddingをスキップ`)
          }
        }

        return {
          id: chunk.id.toString(),
          content: chunk.content,
          embedding,
          metadata: {
            documentId: chunk.document_id,
            filename: chunk.filename || "Unknown",
            page: chunk.page || 1,
            url: chunk.source || "",
            section: `Page ${chunk.page}`,
          },
        }
      }),
    )

    const chunksWithEmbedding = documentChunks.filter((chunk) => chunk.embedding)
    console.log(`${chunksWithEmbedding.length}個のチャンクにembeddingが設定されました`)

    // embeddingがないチャンクも含める（キーワード検索用）
    return documentChunks
  } catch (error) {
    console.error("Error in getDocumentChunks:", error)
    return []
  }
}

// ベクトル検索で関連チャンクを取得
async function findRelevantChunksByVector(query: string, chunks: DocumentChunk[], limit = 5): Promise<DocumentChunk[]> {
  console.log(`\n=== ベクトル検索 ===`)
  console.log(`検索クエリ: "${query}"`)
  console.log(`検索対象チャンク数: ${chunks.length}`)

  // embeddingがあるチャンクをフィルタ
  const chunksWithEmbedding = chunks.filter((chunk) => chunk.embedding)
  console.log(`embedding付きチャンク数: ${chunksWithEmbedding.length}`)

  if (chunksWithEmbedding.length === 0 || !process.env.OPENAI_API_KEY) {
    console.log("ベクトル検索が利用できません。キーワード検索にフォールバック")
    return findRelevantChunksByKeyword(query, chunks, limit)
  }

  try {
    // 質問をベクトル化
    console.log("質問をベクトル化中...")
    const queryEmbedding = await createEmbedding(query)

    if (queryEmbedding.length === 0) {
      console.log("質問のベクトル化に失敗。キーワード検索にフォールバック")
      return findRelevantChunksByKeyword(query, chunks, limit)
    }

    console.log(`質問のベクトル次元: ${queryEmbedding.length}`)

    // 各チャンクとの類似度を計算
    const scoredChunks = chunksWithEmbedding
      .map((chunk) => {
        const similarity = cosineSimilarity(queryEmbedding, chunk.embedding!)
        return { chunk, similarity }
      })
      .sort((a, b) => b.similarity - a.similarity) // 類似度の高い順にソート
      .slice(0, limit)

    console.log("ベクトル検索結果:")
    scoredChunks.forEach((item, index) => {
      console.log(`${index + 1}. ページ ${item.chunk.metadata.page} (類似度: ${item.similarity.toFixed(4)})`)
    })

    return scoredChunks.map((item) => item.chunk)
  } catch (error) {
    console.error("ベクトル検索エラー:", error)
    // フォールバック: キーワード検索
    console.log("フォールバック: キーワード検索を実行")
    return findRelevantChunksByKeyword(query, chunks, limit)
  }
}

// 改善されたキーワード検索
function findRelevantChunksByKeyword(query: string, chunks: DocumentChunk[], limit = 5): DocumentChunk[] {
  console.log("=== 改善されたキーワード検索 ===")
  console.log(`検索クエリ: "${query}"`)

  const queryLower = query.toLowerCase()

  // より柔軟なキーワード抽出
  const queryWords = queryLower
    .replace(/[^\w\s]/g, " ") // 記号を空白に置換
    .split(/\s+/)
    .filter((word) => word.length > 1) // 1文字以上の単語を対象
    .map((word) => word.trim())
    .filter((word) => word.length > 0)

  console.log(`抽出されたキーワード: [${queryWords.join(", ")}]`)

  // 財務関連の同義語辞書
  const synonyms: { [key: string]: string[] } = {
    balance: ["balance", "sheet", "statement", "financial", "position", "assets", "liabilities", "equity"],
    sheet: ["balance", "sheet", "statement", "financial", "position"],
    revenue: ["revenue", "sales", "income", "earnings", "turnover", "receipts"],
    profit: ["profit", "income", "earnings", "net", "operating"],
    cash: ["cash", "money", "liquid", "currency", "equivalents"],
    assets: ["assets", "property", "investments", "holdings", "resources"],
    liabilities: ["liabilities", "debt", "obligations", "payable"],
    equity: ["equity", "shareholders", "stockholders", "capital"],
    google: ["google", "alphabet", "goog", "googl"],
    apple: ["apple", "aapl", "iphone", "mac", "ipad"],
    情報: ["information", "data", "details", "info"],
    取得: ["get", "obtain", "retrieve", "extract", "find"],
    財務: ["financial", "finance", "fiscal", "monetary"],
    貸借対照表: ["balance", "sheet", "statement", "position"],
    損益計算書: ["income", "statement", "profit", "loss", "earnings"],
    現金: ["cash", "money", "liquid", "currency"],
  }

  // 拡張キーワードリストを作成
  const expandedKeywords = new Set<string>()
  queryWords.forEach((word) => {
    expandedKeywords.add(word)
    // 同義語を追加
    Object.entries(synonyms).forEach(([key, values]) => {
      if (word.includes(key) || key.includes(word)) {
        values.forEach((synonym) => expandedKeywords.add(synonym))
      }
    })
  })

  const allKeywords = Array.from(expandedKeywords)
  console.log(`拡張キーワード: [${allKeywords.join(", ")}]`)

  const scoredChunks = chunks.map((chunk) => {
    let score = 0
    const contentLower = chunk.content.toLowerCase()
    const filename = chunk.metadata.filename.toLowerCase()

    // 1. 完全一致ボーナス（高スコア）
    queryWords.forEach((word) => {
      if (word.length > 2) {
        const exactMatches = (contentLower.match(new RegExp(`\\b${word}\\b`, "g")) || []).length
        score += exactMatches * 20

        // ファイル名での一致もボーナス
        if (filename.includes(word)) {
          score += 15
        }
      }
    })

    // 2. 拡張キーワードでの一致
    allKeywords.forEach((keyword) => {
      if (keyword.length > 2) {
        const matches = (contentLower.match(new RegExp(`\\b${keyword}\\b`, "g")) || []).length
        score += matches * 10
      }
    })

    // 3. 部分一致
    queryWords.forEach((word) => {
      if (word.length > 3 && contentLower.includes(word)) {
        score += 5
      }
    })

    // 4. 特定の財務用語に対する特別なスコアリング
    if (queryLower.includes("balance") || queryLower.includes("sheet") || queryLower.includes("貸借対照表")) {
      const financialTerms = [
        "assets",
        "liabilities",
        "equity",
        "balance",
        "sheet",
        "financial",
        "position",
        "statement",
      ]
      financialTerms.forEach((term) => {
        if (contentLower.includes(term)) {
          score += 25
        }
      })
    }

    // 5. 数値データがある場合のボーナス（財務データの可能性）
    const hasNumbers = /\$[\d,]+|\d+\.\d+|\d+%|\d+\s*(million|billion|thousand)/i.test(chunk.content)
    if (hasNumbers) {
      score += 10
    }

    // 6. ページ番号による重み付け（前半のページを重視）
    if (chunk.metadata.page <= 10) {
      score += 5
    }

    return { chunk, score, details: { exactMatches: score } }
  })

  const results = scoredChunks
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  console.log("キーワード検索結果:")
  results.forEach((item, index) => {
    console.log(`${index + 1}. ページ ${item.chunk.metadata.page} (スコア: ${item.score})`)
    console.log(`   内容プレビュー: ${item.chunk.content.substring(0, 100)}...`)
  })

  // スコアが低すぎる場合は、より寛容な検索を実行
  if (results.length === 0 || results[0].score < 10) {
    console.log("スコアが低いため、より寛容な検索を実行")
    return findRelevantChunksByLooseSearch(query, chunks, limit)
  }

  return results.map((item) => item.chunk)
}

// より寛容な検索（フォールバック）
function findRelevantChunksByLooseSearch(query: string, chunks: DocumentChunk[], limit = 5): DocumentChunk[] {
  console.log("=== 寛容な検索モード ===")

  const queryLower = query.toLowerCase()

  // 任意の単語が含まれているチャンクを探す
  const scoredChunks = chunks.map((chunk) => {
    let score = 0
    const contentLower = chunk.content.toLowerCase()

    // 単純な文字列包含チェック
    const words = queryLower.split(/\s+/).filter((w) => w.length > 2)
    words.forEach((word) => {
      if (contentLower.includes(word)) {
        score += 1
      }
    })

    // 財務関連のキーワードがある場合はボーナス
    const financialKeywords = [
      "revenue",
      "income",
      "cash",
      "assets",
      "financial",
      "statement",
      "balance",
      "profit",
      "billion",
      "million",
    ]
    financialKeywords.forEach((keyword) => {
      if (contentLower.includes(keyword)) {
        score += 3
      }
    })

    return { chunk, score }
  })

  const results = scoredChunks
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  console.log(`寛容な検索で${results.length}個の結果を発見`)

  // それでも結果がない場合は、最初の数ページを返す
  if (results.length === 0) {
    console.log("検索結果なし。最初の5ページを返します")
    return chunks.slice(0, 5)
  }

  return results.map((item) => item.chunk)
}

// GPTを使用して自然な回答を生成
async function generateAnswerWithGPT(query: string, relevantChunks: DocumentChunk[]): Promise<string> {
  if (relevantChunks.length === 0) {
    return "申し訳ありませんが、アップロードされたPDFからご質問に関連する情報を見つけることができませんでした。より具体的な質問をお試しいただくか、関連する文書をアップロードしてください。"
  }

  // OpenAI API keyがない場合はシンプルな回答生成
  if (!process.env.OPENAI_API_KEY) {
    console.log("OpenAI API keyがないため、シンプルな回答生成を使用")
    return generateSimpleAnswer(query, relevantChunks)
  }

  try {
    // コンテキストを作成
    const context = relevantChunks
      .map((chunk, index) => {
        return `【出典${index + 1}: ${chunk.metadata.filename} ページ${chunk.metadata.page}】\n${chunk.content}`
      })
      .join("\n\n")

    console.log("GPTで回答を生成中...")

    // OpenAI providerにAPI keyを明示的に渡す
    const openaiProvider = openai({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const { text } = await generateText({
      model: openaiProvider("gpt-4o"),
      system: `あなたは年次報告書の専門アナリストです。提供されたPDF文書の内容のみを使用して、質問に正確かつ詳細に答えてください。

重要な指示：
1. 提供された文書の内容のみを使用してください
2. 文書に記載されていない情報は推測しないでください
3. 数値や具体的な情報は正確に引用してください
4. 回答には出典（ページ番号）を明記してください
5. 文書から答えられない場合は、その旨を明確に述べてください`,
      prompt: `以下の文書内容を参考に、質問に答えてください。

【質問】
${query}

【参考文書】
${context}

【回答】`,
      temperature: 0.1,
    })

    return text
  } catch (error) {
    console.error("GPT回答生成エラー:", error)
    // フォールバック: シンプルな回答生成
    return generateSimpleAnswer(query, relevantChunks)
  }
}

// フォールバック用のシンプルな回答生成
function generateSimpleAnswer(query: string, relevantChunks: DocumentChunk[]): string {
  let answer = `「${query}」に関して、アップロードされたPDFから以下の情報を抽出しました。\n\n`

  relevantChunks.forEach((chunk, index) => {
    if (index === 0) {
      answer += `${chunk.metadata.filename}のページ${chunk.metadata.page}によると：\n${chunk.content}\n`
    } else {
      answer += `\n関連情報として、ページ${chunk.metadata.page}では：\n${chunk.content}\n`
    }
  })

  return answer
}

// メインのRAG実行関数
export async function performRag(query: string, selectedDocIds: number[] = []): Promise<RagResult> {
  console.log(`\n🔍 RAG実行: "${query}"`)

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

    // ベクトル検索で関連チャンクを取得（フォールバック付き）
    const relevantChunks = await findRelevantChunksByVector(query, allChunks, 5)

    if (relevantChunks.length === 0) {
      return {
        answer: `アップロードされたPDFから「${query}」に関連する情報が見つかりませんでした。\n\n利用可能なページ数: ${Math.max(...allChunks.map((c) => c.metadata.page))}ページ\n\n別のキーワードで検索してみてください。`,
        sources: [],
        selectedDocuments: [...new Set(allChunks.map((c) => c.metadata.filename))],
      }
    }

    // GPTで自然な回答を生成（フォールバック付き）
    const answer = await generateAnswerWithGPT(query, relevantChunks)

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

  const hasApiKey = !!process.env.OPENAI_API_KEY
  let reasoning = `RAG分析 (${hasApiKey ? "ベクトル検索" : "改善されたキーワード検索"}):\n`
  reasoning += `- 質問: "${query}"\n`
  reasoning += `- 検索対象PDF数: ${uploadedDocuments.length}\n`
  reasoning += `- 処理方法: ${hasApiKey ? "OpenAI Embeddingでベクトル化 → コサイン類似度で検索 → GPT-4oで回答生成" : "同義語辞書 + 財務用語認識 + 柔軟なマッチング → シンプルな回答生成"}\n`
  reasoning += uploadedDocuments.map((doc) => `- ${doc.filename}`).join("\n")

  return {
    documents: uploadedDocuments,
    reasoning: reasoning,
  }
}
