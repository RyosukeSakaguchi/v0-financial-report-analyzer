"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Send, Loader2, FileText, AlertCircle, ArrowUpRight, Brain, Search, Filter, Upload } from "lucide-react"
import { createClient } from "@/lib/supabase-client"
import { toast } from "@/components/ui/use-toast"
import { performRag, getDocumentClassification } from "@/lib/rag-service"
import Link from "next/link"

interface Document {
  id: number
  filename: string
  url: string
  status: string
  size: number
  created_at: string
}

interface Source {
  filename: string
  page: number
  text: string
  url?: string
}

interface RagResponse {
  answer: string
  sources: Source[]
  selectedDocuments: string[]
}

interface RagSystemProps {
  onSourceSelect?: (source: Source) => void
}

export function RagSystem({ onSourceSelect }: RagSystemProps) {
  const [query, setQuery] = useState<string>("")
  const [response, setResponse] = useState<RagResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(true)
  const [processingStep, setProcessingStep] = useState<string>("")
  const [classificationResult, setClassificationResult] = useState<string>("")

  useEffect(() => {
    const fetchDocuments = async () => {
      setIsLoadingDocs(true)
      try {
        const supabase = createClient()

        // 実際のSupabaseからドキュメントを取得
        const { data, error } = await supabase
          .from("documents")
          .select("id, filename, url, status, size, created_at")
          .eq("status", "completed")
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Supabase error:", error)
          setDocuments([])
          setError("PDFリストの取得に失敗しました。")
        } else {
          setDocuments(data || [])
          // デフォルトですべてのドキュメントを選択
          setSelectedDocIds(data?.map((doc) => doc.id) || [])
        }
      } catch (error) {
        console.error("Error fetching documents:", error)
        setDocuments([])
        setError("PDFリストの取得に失敗しました。")
      } finally {
        setIsLoadingDocs(false)
      }
    }

    fetchDocuments()
  }, [])

  const toggleDocumentSelection = (id: number) => {
    setSelectedDocIds((prev) => (prev.includes(id) ? prev.filter((docId) => docId !== id) : [...prev, id]))
  }

  const handleRagQuery = async () => {
    if (!query.trim()) return

    if (selectedDocIds.length === 0) {
      toast({
        title: "エラー",
        description: "検索対象のPDFを選択してください",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    setResponse(null)
    setClassificationResult("")
    setProcessingStep("選択されたPDFを分析中...")

    try {
      // ステップ1: ドキュメント分類
      await new Promise((resolve) => setTimeout(resolve, 800))
      setProcessingStep("質問に関連するPDFを特定中...")

      const classification = await getDocumentClassification(query, selectedDocIds)
      setClassificationResult(classification.reasoning)

      // ステップ2: 情報検索
      await new Promise((resolve) => setTimeout(resolve, 800))
      setProcessingStep("選択されたPDFから関連情報を検索中...")

      // ステップ3: 回答生成
      await new Promise((resolve) => setTimeout(resolve, 800))
      setProcessingStep("アップロードされたPDFの内容から回答を生成中...")

      // 実際のRAG実行
      const ragResult = await performRag(query, selectedDocIds)

      setResponse(ragResult)

      // 最初のソースを自動的に選択して表示
      if (ragResult.sources.length > 0 && onSourceSelect) {
        onSourceSelect(ragResult.sources[0])
      }

      toast({
        title: "回答生成完了",
        description: `${ragResult.selectedDocuments.length}個のPDFから${ragResult.sources.length}個の出典を使用`,
      })
    } catch (error) {
      console.error("RAG error:", error)
      toast({
        title: "エラー",
        description: "回答の生成中にエラーが発生しました",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
      setProcessingStep("")
    }
  }

  // Ctrl+Enterで送信するハンドラ
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enterまたは⌘+Enterで送信
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      if (!isLoading && query.trim() && selectedDocIds.length > 0) {
        handleRagQuery()
      }
    }
  }

  const handleSourceClick = (source: Source) => {
    if (onSourceSelect) {
      onSourceSelect(source)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4">検索対象のPDF</h2>
          {error && (
            <div className="flex items-center gap-2 text-amber-600 mb-4 p-2 bg-amber-50 rounded">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          {isLoadingDocs ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
              <span className="ml-2 text-sm text-gray-500">PDFリストを読み込み中...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center p-6">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-3">アップロードされたPDFがありません</p>
              <p className="text-xs text-gray-400 mb-4">
                RAGシステムを使用するには、まずPDFをアップロードしてください。
              </p>
              <Link href="/upload">
                <Button className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  PDFをアップロード
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  {selectedDocIds.length} / {documents.length} 個のPDFが選択されています
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedDocIds(documents.map((doc) => doc.id))}>
                    すべて選択
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelectedDocIds([])}>
                    選択解除
                  </Button>
                </div>
              </div>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center p-3 rounded cursor-pointer transition-colors ${
                    selectedDocIds.includes(doc.id) ? "bg-blue-50 border border-blue-200" : "border hover:bg-gray-50"
                  }`}
                  onClick={() => toggleDocumentSelection(doc.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedDocIds.includes(doc.id)}
                    onChange={() => toggleDocumentSelection(doc.id)}
                    className="mr-3"
                  />
                  <FileText className="h-4 w-4 text-blue-500 mr-3" />
                  <div className="flex-1">
                    <span className="text-sm font-medium">{doc.filename}</span>
                    <div className="text-xs text-gray-500">
                      {(doc.size / 1024 / 1024).toFixed(2)} MB • {new Date(doc.created_at).toLocaleDateString("ja-JP")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold">アップロードPDF専用RAGシステム</h2>
          </div>
          <p className="text-sm text-gray-500">
            選択されたPDFのみから情報を検索し、質問に回答します。外部データは使用しません。
          </p>
          {selectedDocIds.length > 0 && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <h4 className="text-sm font-semibold text-blue-800 mb-2">現在選択中のPDF ({selectedDocIds.length}個):</h4>
              <ul className="text-xs text-blue-700 space-y-1">
                {documents
                  .filter((doc) => selectedDocIds.includes(doc.id))
                  .map((doc) => (
                    <li key={doc.id}>• {doc.filename}</li>
                  ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Textarea
              placeholder="アップロードされたPDFについて質問してください（例：この文書の主要なポイントは何ですか？）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || selectedDocIds.length === 0}
              className="min-h-[100px] resize-y"
            />
            <Button
              onClick={handleRagQuery}
              disabled={isLoading || !query.trim() || selectedDocIds.length === 0}
              className="self-end"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {isLoading ? "分析中..." : "質問する"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              <h3 className="text-md font-semibold">アップロードPDF専用RAG処理中...</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-blue-600">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></div>
                <span className="text-sm">{processingStep}</span>
              </div>
              {classificationResult && (
                <div className="bg-blue-50 p-3 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Filter className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-semibold text-blue-800">PDF分析結果:</span>
                  </div>
                  <pre className="text-xs text-blue-700 whitespace-pre-wrap">{classificationResult}</pre>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {response && !isLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="h-4 w-4 text-green-500" />
              <h3 className="text-md font-semibold">アップロードPDFからの回答:</h3>
            </div>

            {response.selectedDocuments.length > 0 && (
              <div className="mb-3 p-2 bg-green-50 rounded border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <Search className="h-3 w-3 text-green-600" />
                  <span className="text-xs font-semibold text-green-800">使用されたPDF:</span>
                </div>
                <div className="text-xs text-green-700">{response.selectedDocuments.join("、")}</div>
              </div>
            )}

            <div className="bg-green-50 p-4 rounded-lg mb-4">
              <p className="whitespace-pre-wrap text-gray-800">{response.answer}</p>
            </div>

            {response.sources.length > 0 && (
              <>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  出典 ({response.sources.length}件):
                </h4>
                <div className="space-y-2">
                  {response.sources.map((source, index) => (
                    <div
                      key={index}
                      className="text-xs p-3 bg-gray-50 rounded border hover:bg-gray-100 cursor-pointer transition-colors"
                    >
                      <div className="flex justify-between mb-1">
                        <span className="font-medium text-blue-700">{source.filename}</span>
                        <div className="flex items-center">
                          <button
                            className="text-gray-500 hover:text-blue-600 mr-2 underline"
                            onClick={() => onSourceSelect && onSourceSelect(source)}
                          >
                            ページ {source.page}
                          </button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-blue-500"
                            onClick={() => onSourceSelect && onSourceSelect(source)}
                          >
                            <ArrowUpRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-gray-700 whitespace-pre-line">{source.text}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
