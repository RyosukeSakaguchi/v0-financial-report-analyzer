"use client"

import type React from "react"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Search, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Upload, FileText, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PDFViewer } from "@/components/pdf-viewer"
import { SearchResults } from "@/components/search-results"
import { RagSystem } from "@/components/rag-system"
import { PDFList } from "@/components/pdf-list"
import { searchDocument } from "@/lib/search"
import { createClient } from "@/lib/supabase-client"

interface Source {
  filename: string
  page: number
  text: string
  url?: string
}

export default function Home() {
  const [query, setQuery] = useState<string>("")
  const [results, setResults] = useState<any[]>([])
  const [isSearching, setIsSearching] = useState<boolean>(false)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [totalPages, setTotalPages] = useState<number>(100)
  const [zoom, setZoom] = useState<number>(1)
  const [activeTab, setActiveTab] = useState<string>("rag")
  const [selectedPdf, setSelectedPdf] = useState<string>("/sample-report.pdf")
  const [availablePdfs, setAvailablePdfs] = useState<Array<{ id: number; filename: string; url: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedSource, setSelectedSource] = useState<Source | null>(null)

  // 利用可能なPDFを取得
  useEffect(() => {
    const fetchAvailablePdfs = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from("documents")
          .select("id, filename, url")
          .eq("status", "completed")
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching PDFs:", error)
          // サンプルPDFを追加
          setAvailablePdfs([{ id: 0, filename: "サンプル財務報告書.pdf", url: "/sample-report.pdf" }])
          setError("PDFリストの取得に失敗しました。サンプルPDFを使用しています。")
        } else {
          const pdfs = data || []
          // サンプルPDFを先頭に追加
          const allPdfs = [{ id: 0, filename: "サンプル財務報告書.pdf", url: "/sample-report.pdf" }, ...pdfs]
          setAvailablePdfs(allPdfs)

          // 最初のPDFを選択（サンプルPDF）
          setSelectedPdf("/sample-report.pdf")
        }
      } catch (error) {
        console.error("Error:", error)
        setAvailablePdfs([{ id: 0, filename: "サンプル財務報告書.pdf", url: "/sample-report.pdf" }])
        setError("PDFリストの取得に失敗しました。サンプルPDFを使用しています。")
      }
    }

    fetchAvailablePdfs()
  }, [])

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)

    try {
      const searchResults = await searchDocument(query, selectedPdf)
      setResults(searchResults)

      if (searchResults.length > 0 && searchResults[0].page) {
        setCurrentPage(searchResults[0].page)
      }

      setActiveTab("search")
    } catch (error) {
      console.error("Search error:", error)
    } finally {
      setIsSearching(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  const handleZoom = (factor: number) => {
    const newZoom = Math.max(0.5, Math.min(2, zoom + factor))
    setZoom(newZoom)
  }

  // Ctrl+Enterで送信するハンドラ
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enterまたは⌘+Enterで送信
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      if (!isSearching && query.trim()) {
        handleSearch()
      }
    }
  }

  // ソースが選択されたときの処理
  const handleSourceSelect = (source: Source) => {
    setSelectedSource(source)
    if (source.url) {
      setSelectedPdf(source.url)
    }
    setCurrentPage(source.page)
  }

  return (
    <main className="container mx-auto py-6 px-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">年次レポートAI アシスタント</h1>
        <Link href="/upload">
          <Button className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            PDFをアップロード
          </Button>
        </Link>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-amber-600 mb-4 p-3 bg-amber-50 rounded border border-amber-200">
          <AlertCircle className="h-4 w-4" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow overflow-hidden h-[900px]">
            {/* PDF選択ドロップダウン */}
            <div className="p-2 border-b bg-gray-50">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                <select
                  value={selectedPdf}
                  onChange={(e) => setSelectedPdf(e.target.value)}
                  className="flex-1 p-2 text-sm border rounded"
                >
                  {availablePdfs.map((pdf) => (
                    <option key={pdf.id} value={pdf.url}>
                      {pdf.filename}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* PDFコントロール */}
            <div className="flex items-center justify-between p-2 border-b">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => handleZoom(-0.1)}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm">{Math.round(zoom * 100)}%</span>
                <Button variant="outline" size="icon" onClick={() => handleZoom(0.1)}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* 選択されたソースの表示 */}
            {selectedSource && (
              <div className="p-2 bg-blue-50 border-b border-blue-200">
                <p className="text-xs text-blue-700">
                  <span className="font-semibold">{selectedSource.filename}</span> のページ {selectedSource.page}{" "}
                  を表示しています
                </p>
              </div>
            )}

            <div className="h-[calc(100%-140px)]">
              <PDFViewer
                url={selectedPdf}
                currentPage={currentPage}
                zoom={zoom}
                onTotalPagesChange={setTotalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          </div>
        </div>

        <div className="md:col-span-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="border-b px-4">
              <TabsList className="mb-4">
                <TabsTrigger value="rag">AI アシスタント</TabsTrigger>
                <TabsTrigger value="search">キーワード検索</TabsTrigger>
                <TabsTrigger value="pdfs">PDFリスト</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="rag" className="space-y-4">
              <RagSystem onSourceSelect={handleSourceSelect} />
            </TabsContent>

            <TabsContent value="search" className="flex-1 p-4 overflow-auto">
              <div className="flex flex-col gap-4 mb-4">
                <div className="flex flex-col gap-2">
                  <Textarea
                    placeholder="質問を入力してください（例：2023年のgoogleの現金及び現金同等物）"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSearching}
                    className="min-h-[100px] resize-y"
                  />
                  <Button onClick={handleSearch} disabled={isSearching || !query.trim()} className="self-end">
                    {isSearching ? (
                      <span className="flex items-center">
                        <Search className="h-4 w-4 animate-spin mr-2" />
                        検索中...
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <Search className="h-4 w-4 mr-2" />
                        検索
                      </span>
                    )}
                  </Button>
                </div>
              </div>
              <SearchResults
                results={results}
                query={query}
                onResultClick={(page) => {
                  setCurrentPage(page)
                }}
              />
            </TabsContent>

            <TabsContent value="pdfs" className="p-4">
              <PDFList />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  )
}
