import { PDFLoader } from "langchain/document_loaders/fs/pdf"
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { OpenAIEmbeddings } from "@langchain/openai"
import { createClient } from "@/lib/supabase-client"

// このファイルはサーバーレス関数として実行される想定です

export async function processPdfInBackground(pdfUrl: string, documentId: number, filename: string) {
  const supabase = createClient()

  try {
    // PDFをロード
    const loader = new PDFLoader(pdfUrl)
    const rawDocs = await loader.load()

    // テキストをチャンクに分割（日本語に最適化）
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ["。", "、", "\n", " "],
      keepSeparator: true,
    })

    const docs = await textSplitter.splitDocuments(rawDocs)

    // エンベディングを作成
    const embeddings = new OpenAIEmbeddings()

    // 各チャンクをデータベースに保存
    for (const doc of docs) {
      const embedding = await embeddings.embedQuery(doc.pageContent)

      // チャンクをデータベースに保存
      const { error } = await supabase.from("document_chunks").insert({
        document_id: documentId,
        content: doc.pageContent,
        embedding: embedding,
        metadata: doc.metadata,
        filename: filename,
        page: doc.metadata.page || 1,
        source: pdfUrl,
      })

      if (error) {
        console.error("Error saving chunk:", error)
      }
    }

    // ドキュメントのステータスを更新
    await supabase.from("documents").update({ status: "completed", total_chunks: docs.length }).eq("id", documentId)
  } catch (error) {
    console.error("PDF processing error:", error)

    // エラー時はステータスを更新
    await supabase
      .from("documents")
      .update({ status: "failed", error_message: String(error) })
      .eq("id", documentId)
  }
}
