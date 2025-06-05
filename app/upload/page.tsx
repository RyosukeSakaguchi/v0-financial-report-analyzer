"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Upload, File, Trash2, ArrowRight, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { uploadPdf } from "@/lib/pdf-upload"
import { toast } from "@/components/ui/use-toast"

export default function UploadPage() {
  const router = useRouter()
  const [files, setFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).filter((file) => file.type === "application/pdf")
      setFiles((prev) => [...prev, ...newFiles])
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpload = async () => {
    if (files.length === 0) return

    setIsUploading(true)
    setProgress(0)
    setError(null)
    setDebugInfo(null)

    try {
      // Upload each file and track progress
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setDebugInfo(`ファイル ${i + 1}/${files.length} をアップロード中: ${file.name}`)

        try {
          await uploadPdf(file)
          setProgress(Math.round(((i + 1) / files.length) * 100))
        } catch (fileError) {
          setDebugInfo(`ファイル ${file.name} のアップロードに失敗: ${fileError}`)
          throw fileError
        }
      }

      toast({
        title: "アップロード完了",
        description: `${files.length}個のPDFファイルがアップロードされました`,
      })

      // Redirect to home page after successful upload
      setTimeout(() => {
        router.push("/")
      }, 1500)
    } catch (error) {
      console.error("Upload error:", error)
      setError(`アップロード中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`)
      toast({
        title: "エラー",
        description: "アップロード中にエラーが発生しました",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-6">PDFアップロード</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>PDFファイルをアップロード</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <Label htmlFor="pdf">PDFファイル</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="pdf"
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={handleFileChange}
                  disabled={isUploading}
                  className="flex-1"
                />
                <Button variant="outline" size="icon" onClick={() => document.getElementById("pdf")?.click()}>
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                注: PDFの内容は自動的に処理され、検索可能なテキストに変換されます。
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push("/")} disabled={isUploading}>
            キャンセル
          </Button>
          <Button onClick={handleUpload} disabled={files.length === 0 || isUploading}>
            {isUploading ? `アップロード中... ${progress}%` : "アップロード"}
          </Button>
        </CardFooter>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>選択されたファイル ({files.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-gray-500">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeFile(index)} disabled={isUploading}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
          {isUploading && (
            <CardFooter>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
              </div>
            </CardFooter>
          )}
        </Card>
      )}

      {error && (
        <Card className="mt-4 border-red-300">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2 text-red-500">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div>
                <h3 className="font-semibold">エラーが発生しました</h3>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {debugInfo && (
        <Card className="mt-4 border-blue-300">
          <CardContent className="pt-6">
            <h3 className="font-semibold">処理状況</h3>
            <pre className="text-xs bg-gray-100 p-2 rounded mt-2 overflow-auto">{debugInfo}</pre>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 flex justify-end">
        <Button variant="outline" className="flex items-center gap-2" onClick={() => router.push("/")}>
          RAGシステムへ <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
