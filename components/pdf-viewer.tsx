"use client"

import { useState, useEffect, useRef } from "react"
import { AlertCircle, RefreshCw, ExternalLink, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PDFViewerProps {
  url: string
  currentPage: number
  zoom: number
  onTotalPagesChange: (pages: number) => void
  onPageChange: (page: number) => void
}

export function PDFViewer({ url, currentPage, zoom, onTotalPagesChange, onPageChange }: PDFViewerProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actualUrl, setActualUrl] = useState<string>(url)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [retryCount, setRetryCount] = useState<number>(0)

  // ファイルの存在確認
  const checkFileExists = async (fileUrl: string): Promise<boolean> => {
    try {
      const response = await fetch(fileUrl, { method: "HEAD" })
      return response.ok
    } catch {
      return false
    }
  }

  useEffect(() => {
    const initializePDF = async () => {
      setIsLoading(true)
      setError(null)

      // ファイルの存在確認
      const exists = await checkFileExists(url)

      if (!exists) {
        console.warn(`PDF file not found: ${url}, using sample PDF`)
        setActualUrl("/sample-report.pdf")
      } else {
        setActualUrl(url)
      }

      // デフォルトのページ数を設定
      onTotalPagesChange(100)

      // 3秒後にローディングを終了
      const timer = setTimeout(() => {
        setIsLoading(false)
      }, 3000)

      return () => clearTimeout(timer)
    }

    initializePDF()
  }, [url, retryCount, onTotalPagesChange])

  useEffect(() => {
    // ページが変更されたときにiframeのURLを更新
    if (iframeRef.current && !isLoading && actualUrl) {
      // PDFビューアは1ベースなので、currentPageをそのまま使用
      const newUrl = `${actualUrl}#page=${currentPage}&zoom=${Math.round(zoom * 100)}`
      iframeRef.current.src = newUrl
    }
  }, [currentPage, zoom, actualUrl, isLoading])

  const handleLoad = () => {
    setIsLoading(false)
    setError(null)
  }

  const handleError = () => {
    setIsLoading(false)
    setError("PDFの読み込みに失敗しました")
  }

  const handleRetry = () => {
    setIsLoading(true)
    setError(null)
    setRetryCount((prev) => prev + 1)
  }

  const handleOpenInNewTab = () => {
    window.open(actualUrl, "_blank")
  }

  const handleUseSample = () => {
    setActualUrl("/sample-report.pdf")
    setError(null)
    setIsLoading(true)
    setTimeout(() => setIsLoading(false), 2000)
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-100 p-8">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-red-700 mb-2">PDFの読み込みエラー</h3>
        <p className="text-sm text-gray-600 text-center mb-4">
          PDFファイルの読み込みに失敗しました。
          <br />
          ファイルが存在しないか、アクセスできない可能性があります。
        </p>
        <div className="flex flex-wrap gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={handleRetry}>
            <RefreshCw className="h-4 w-4 mr-1" />
            再読み込み
          </Button>
          <Button variant="outline" size="sm" onClick={handleUseSample}>
            <FileText className="h-4 w-4 mr-1" />
            サンプルPDFを使用
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenInNewTab}>
            <ExternalLink className="h-4 w-4 mr-1" />
            新しいタブで開く
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-90 z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">PDFを読み込み中...</p>
            {actualUrl !== url && <p className="text-xs text-amber-600 mt-1">サンプルPDFを使用しています</p>}
          </div>
        </div>
      )}

      <div className="flex-1">
        <iframe
          ref={iframeRef}
          src={`${actualUrl}#page=${currentPage}&zoom=${Math.round(zoom * 100)}`}
          className="w-full h-full border-0"
          onLoad={handleLoad}
          onError={handleError}
          title="PDF Viewer"
          style={{ minHeight: "700px" }}
        />
      </div>

      {actualUrl !== url && !isLoading && (
        <div className="p-2 bg-amber-50 border-t border-amber-200">
          <p className="text-xs text-amber-700 text-center">
            元のファイルが見つからないため、サンプルPDFを表示しています
          </p>
        </div>
      )}
    </div>
  )
}
