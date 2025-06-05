import { createClient } from "@/lib/supabase-client"

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
    const { error: dbError } = await supabase.from("documents").insert({
      filename: file.name,
      path: filename,
      url: urlData.publicUrl,
      size: file.size,
      type: file.type,
      status: "pending", // Will be processed by a background job
    })

    if (dbError) {
      console.error("Database error details:", dbError)
      throw new Error(`PDFのメタデータ保存に失敗しました: ${dbError.message}`)
    }

    // In a real app, this would trigger a serverless function
    // For now, we'll just update the status directly
    await supabase.from("documents").update({ status: "completed" }).eq("path", filename)

    return urlData.publicUrl
  } catch (error) {
    console.error("Upload process failed:", error)
    throw error
  }
}
