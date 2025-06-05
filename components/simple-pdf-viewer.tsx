"use client"

import { useState, useRef } from "react"
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SimplePDFViewerProps {
  url: string
  currentPage: number
  zoom: number
  onTotalPagesChange: (pages: number) => void
  onPageChange: (page: number) => void
}

export function SimplePDFViewer({ url, currentPage, zoom, onTotalPagesChange, onPageChange }: SimplePDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const handleLoad = () => {
    setIsLoading(false)
    // PDFの総ページ数を取得するのは困難なので、デフォルト値を設定
    onTotalPagesChange(100) // 実際のページ数は不明
  }

  const handlePageChange = (newPage: number) => {
    onPageChange(newPage)
    // PDFビューアでページを変更（1ベースのページ番号を使用）
    if (iframeRef.current) {
      iframeRef.current.src = `${url}#page=${newPage}&zoom=${Math.round(zoom * 100)}`
    }
  }

  const handleZoom = (factor: number) => {
    const newZoom = Math.max(0.5, Math.min(2, zoom + factor))
    if (iframeRef.current) {
      iframeRef.current.src = `${url}#page=${currentPage}&zoom=${Math.round(newZoom * 100)}`
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* コントロールバー */}
      <div className="flex items-center justify-between p-2 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => handlePageChange(Math.max(1, currentPage - 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">ページ {currentPage}</span>
          <Button variant="outline" size="icon" onClick={() => handlePageChange(currentPage + 1)}>
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

      {/* PDF表示エリア */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600">PDFを読み込み中...</p>
            </div>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={`${url}#page=${currentPage}&zoom=${Math.round(zoom * 100)}`}
          className="w-full h-full border-0"
          onLoad={handleLoad}
          title="PDF Viewer"
        />
      </div>
    </div>
  )
}
