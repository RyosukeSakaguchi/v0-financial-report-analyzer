import { createClient } from "@/lib/supabase-client"
import { extractTextFromPDF, createTextChunks } from "./pdf-text-extractor"
import { embed } from "ai"
import { openai } from "@ai-sdk/openai"

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

export async function uploadPdf(file: File): Promise<string> {
  try {
    const supabase = createClient()

    // Generate a unique filename
    const timestamp = Date.now()
    const filename = `${timestamp}-${file.name.replace(/\s+/g, "_")}`

    console.log("Uploading file:", filename)

    // Upload file to storage
    const { data, error } = await supabase.storage.from("pdfs").upload(filename, file, {
      cacheControl: "3600",
      upsert: false,
    })

    if (error) {
      console.error("Upload error details:", error)
      throw new Error(`PDFのアップロードに失敗しました: ${error.message}`)
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("pdfs").getPublicUrl(filename)

    console.log("File uploaded successfully. URL:", urlData.publicUrl)

    // Store metadata in database
    const { data: docData, error: dbError } = await supabase
      .from("documents")
      .insert({
        filename: file.name,
        path: filename,
        url: urlData.publicUrl,
        size: file.size,
        type: file.type,
        status: "processing",
      })
      .select()
      .single()

    if (dbError) {
      console.error("Database error details:", dbError)
      throw new Error(`PDFのメタデータ保存に失敗しました: ${dbError.message}`)
    }

    // PDFからテキストを抽出してチャンキング
    try {
      console.log("PDFからテキストを抽出中...")

      const { pageTexts } = await extractTextFromPDF(urlData.publicUrl)
      console.log(`${pageTexts.length}ページからテキストを抽出しました`)

      // テキストをチャンクに分割
      const chunks = createTextChunks(pageTexts, file.name, docData.id, urlData.publicUrl)
      console.log(`${chunks.length}個のチャンクを作成しました`)

      // OpenAI API keyがあるかチェック
      const hasApiKey = !!process.env.OPENAI_API_KEY
      console.log(`OpenAI API Key: ${hasApiKey ? "利用可能" : "未設定"}`)

      // チャンクをベクトル化してデータベースに保存
      if (chunks.length > 0) {
        const batchSize = 5 // 小さなバッチサイズでAPI制限を回避
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize)

          // 各チャンクをベクトル化（API keyがある場合のみ）
          const chunksWithEmbeddings = await Promise.all(
            batch.map(async (chunk) => {
              console.log(`チャンク ${chunk.id} を処理中...`)

              let embedding: number[] | null = null
              if (hasApiKey) {
                try {
                  const embeddingResult = await createEmbedding(chunk.content)
                  embedding = embeddingResult.length > 0 ? embeddingResult : null
                  if (embedding) {
                    console.log(`チャンク ${chunk.id}: embedding作成成功`)
                  } else {
                    console.log(`チャンク ${chunk.id}: embedding作成スキップ`)
                  }
                } catch (embeddingError) {
                  console.error(`チャンク ${chunk.id} のembedding作成に失敗:`, embeddingError)
                  embedding = null
                }
              } else {
                console.log(`チャンク ${chunk.id}: API keyがないためembeddingをスキップ`)
              }

              return {
                document_id: chunk.metadata.documentId,
                content: chunk.content,
                page: chunk.metadata.page,
                filename: chunk.metadata.filename,
                source: chunk.metadata.url,
                embedding: embedding,
                metadata: {
                  chunkIndex: chunk.metadata.chunkIndex,
                  totalChunks: chunks.length,
                  pageNumber: chunk.metadata.page,
                },
              }
            }),
          )

          const { error: chunksError } = await supabase.from("document_chunks").insert(chunksWithEmbeddings)

          if (chunksError) {
            console.error("Chunks save error:", chunksError)
            throw new Error(`チャンクの保存に失敗しました: ${chunksError.message}`)
          }

          console.log(`バッチ ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} 保存完了`)

          // API制限を避けるため少し待機（API keyがある場合のみ）
          if (hasApiKey && i + batchSize < chunks.length) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        }
      }

      // ドキュメントのステータスを完了に更新
      await supabase
        .from("documents")
        .update({
          status: "completed",
          total_chunks: chunks.length,
        })
        .eq("id", docData.id)

      console.log("PDF処理が完了しました")
    } catch (processingError) {
      console.error("PDF processing error:", processingError)

      // エラー時はステータスを失敗に更新
      await supabase
        .from("documents")
        .update({
          status: "failed",
          error_message: String(processingError),
        })
        .eq("id", docData.id)

      console.log("フォールバック処理により、PDFアップロードは完了しました")
    }

    return urlData.publicUrl
  } catch (error) {
    console.error("Upload process failed:", error)
    throw error
  }
}
