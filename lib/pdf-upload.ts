import { createClient } from "@/lib/supabase-client"
import { extractTextFromPDF, createTextChunks } from "./pdf-text-extractor"

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
        status: "processing", // 処理中に変更
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

      // ファイルサイズチェック（10MB以上の場合は警告）
      if (file.size > 10 * 1024 * 1024) {
        console.warn("大きなファイルです。処理に時間がかかる場合があります。")
      }

      // テキスト抽出（現在はフォールバックモードのみ）
      const { pageTexts } = await extractTextFromPDF(urlData.publicUrl)

      console.log(`${pageTexts.length}ページからテキストを抽出しました`)

      // テキストをチャンクに分割
      const chunks = createTextChunks(pageTexts, file.name, docData.id, urlData.publicUrl)

      console.log(`${chunks.length}個のチャンクを作成しました`)

      // チャンクをデータベースに保存
      if (chunks.length > 0) {
        // バッチサイズを制限して保存（大量のチャンクを一度に保存しないように）
        const batchSize = 50
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize)

          // データベーススキーマに合わせてフィールドを調整
          const { error: chunksError } = await supabase.from("document_chunks").insert(
            batch.map((chunk) => ({
              document_id: chunk.metadata.documentId,
              content: chunk.content,
              page: chunk.metadata.page,
              filename: chunk.metadata.filename,
              source: chunk.metadata.url,
              metadata: {
                chunkIndex: chunk.metadata.chunkIndex,
                totalChunks: chunks.length,
                pageNumber: chunk.metadata.page,
              },
            })),
          )

          if (chunksError) {
            console.error("Chunks save error:", chunksError)
            throw new Error(`チャンクの保存に失敗しました: ${chunksError.message}`)
          }

          console.log(`バッチ ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} 保存完了`)
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

      // エラーでも処理を続行（フォールバックが動作するため）
      console.log("フォールバック処理により、PDFアップロードは完了しました")
    }

    return urlData.publicUrl
  } catch (error) {
    console.error("Upload process failed:", error)
    throw error
  }
}
