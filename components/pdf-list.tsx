"use client"

import { useEffect, useState } from "react"
import { File, Trash2, RefreshCw, CheckCircle, AlertCircle, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase-client"
import { toast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Document {
  id: number
  filename: string
  path: string
  url: string
  size: number
  type: string
  status: "pending" | "processing" | "completed" | "failed"
  created_at: string
}

export function PDFList() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchDocuments = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()

      const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false })

      if (error) {
        console.error("Supabase error:", error)
        setDocuments([])
        setError("Supabaseからの取得に失敗しました。")
      } else {
        setDocuments(data || [])
      }
    } catch (error) {
      console.error("Error fetching documents:", error)
      setDocuments([])
      setError("ドキュメントの取得に失敗しました。")
    } finally {
      setIsLoading(false)
    }
  }

  const confirmDelete = (document: Document) => {
    setDocumentToDelete(document)
    setDeleteConfirmOpen(true)
  }

  const deleteDocument = async () => {
    if (!documentToDelete) return

    setIsDeleting(true)
    try {
      const supabase = createClient()
      const { id, path } = documentToDelete

      // ストレージから削除
      if (path) {
        const { error: storageError } = await supabase.storage.from("pdfs").remove([path])
        if (storageError) {
          console.error("Storage deletion error:", storageError)
          throw new Error(`ストレージからの削除に失敗しました: ${storageError.message}`)
        }
      }

      // データベースから削除
      const { error: dbError } = await supabase.from("documents").delete().eq("id", id)

      if (dbError) {
        console.error("Database deletion error:", dbError)
        throw new Error(`データベースからの削除に失敗しました: ${dbError.message}`)
      }

      // ドキュメントチャンクも削除
      const { error: chunksError } = await supabase.from("document_chunks").delete().eq("document_id", id)
      if (chunksError) {
        console.error("Chunks deletion error:", chunksError)
        // チャンクの削除に失敗してもメインの削除は成功とみなす
      }

      // ローカル状態を更新
      setDocuments((prev) => prev.filter((doc) => doc.id !== id))

      toast({
        title: "削除完了",
        description: `${documentToDelete.filename} が削除されました`,
      })
    } catch (error) {
      console.error("Error deleting document:", error)
      toast({
        title: "エラー",
        description: `ドキュメントの削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setDeleteConfirmOpen(false)
      setDocumentToDelete(null)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "processing":
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "完了"
      case "processing":
        return "処理中"
      case "failed":
        return "失敗"
      default:
        return "保留中"
    }
  }

  useEffect(() => {
    fetchDocuments()
  }, [])

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>アップロード済みPDF</CardTitle>
          <Button variant="outline" size="sm" onClick={fetchDocuments} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            更新
          </Button>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="flex items-center gap-2 text-amber-600 mb-4 p-2 bg-amber-50 rounded">
              <AlertCircle className="h-4 w-4" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          {isLoading ? (
            <div className="flex justify-center p-4">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-500" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-4 text-gray-500">PDFがアップロードされていません</div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex items-center gap-2">
                    <File className="h-4 w-4 text-blue-500" />
                    <div>
                      <span className="text-sm font-medium">{doc.filename}</span>
                      <div className="text-xs text-gray-500">
                        {(doc.size / 1024 / 1024).toFixed(2)} MB •{" "}
                        {new Date(doc.created_at).toLocaleDateString("ja-JP")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-xs">
                      {getStatusIcon(doc.status)}
                      <span>{getStatusText(doc.status)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => confirmDelete(doc)}
                      disabled={doc.status === "processing"}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>PDFを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              {documentToDelete?.filename} を削除します。この操作は元に戻せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={deleteDocument} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
