import { OpenAIEmbeddings } from "@langchain/openai"
import { MemoryVectorStore } from "langchain/vectorstores/memory"
import { ChatOpenAI } from "@langchain/openai"
import { PromptTemplate } from "@langchain/core/prompts"
import { createClient } from "@/lib/supabase-client"

// PDFのテキストとメタデータを保持するインターフェース
interface DocumentChunk {
  id: string
  text: string
  metadata: {
    source: string
    filename: string
    page: number
  }
}

// RAGの結果を表すインターフェース
interface RagResult {
  answer: string
  sources: {
    filename: string
    page: number
    text: string
  }[]
}

// 複数のPDFからRAGを実行する関数
export async function performRagOnMultiplePdfs(query: string, documentIds: number[]): Promise<RagResult> {
  const supabase = createClient()

  try {
    // 選択されたドキュメントのチャンクを取得
    const { data: chunks, error } = await supabase.from("document_chunks").select("*").in("document_id", documentIds)

    if (error) throw error

    if (!chunks || chunks.length === 0) {
      return {
        answer: "選択されたドキュメントからは情報が見つかりませんでした。",
        sources: [],
      }
    }

    // チャンクをLangChainのドキュメント形式に変換
    const documents: DocumentChunk[] = chunks.map((chunk) => ({
      id: chunk.id,
      text: chunk.content,
      metadata: {
        source: chunk.source,
        filename: chunk.filename,
        page: chunk.page,
      },
    }))

    // エンベディングを作成
    const embeddings = new OpenAIEmbeddings()

    // ベクトルストアを作成
    const vectorStore = await MemoryVectorStore.fromTexts(
      documents.map((doc) => doc.text),
      documents.map((doc) => doc.metadata),
      embeddings,
    )

    // クエリに関連するドキュメントを検索
    const relevantDocs = await vectorStore.similaritySearch(query, 5)

    if (relevantDocs.length === 0) {
      return {
        answer: "質問に関連する情報が見つかりませんでした。",
        sources: [],
      }
    }

    // コンテキストを作成
    const context = relevantDocs.map((doc) => doc.pageContent).join("\n\n")

    // プロンプトテンプレートを作成
    const promptTemplate = PromptTemplate.fromTemplate(`
      あなたは年次報告書の内容に基づいて質問に答えるAIアシスタントです。
      以下の情報のみを使用して質問に答えてください。
      情報に基づいて答えられない場合は、「この情報からは答えられません」と回答してください。
      
      コンテキスト:
      {context}
      
      質問: {query}
      
      回答:
    `)

    // プロンプトを生成
    const prompt = await promptTemplate.format({
      context,
      query,
    })

    // LLMを使って回答を生成
    const llm = new ChatOpenAI({
      modelName: "gpt-4o",
      temperature: 0,
    })

    const response = await llm.invoke(prompt)

    // 結果を返す
    return {
      answer: response.content.toString(),
      sources: relevantDocs.map((doc) => ({
        filename: doc.metadata.filename,
        page: doc.metadata.page,
        text: doc.pageContent,
      })),
    }
  } catch (error) {
    console.error("RAG error:", error)
    throw new Error("RAGの処理中にエラーが発生しました")
  }
}
