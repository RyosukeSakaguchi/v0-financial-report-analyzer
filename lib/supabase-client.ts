import { createClient as createSupabaseClient } from "@supabase/supabase-js"

// クライアントサイド用のシングルトンインスタンス
let clientSideInstance: ReturnType<typeof createSupabaseClient> | null = null

// クライアントサイド用の関数
export function createClient() {
  if (typeof window === "undefined") {
    // サーバーサイドの場合
    const supabaseUrl = process.env.SUPABASE_URL || ""
    const supabaseKey = process.env.SUPABASE_ANON_KEY || ""

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables on server side")
    }

    return createSupabaseClient(supabaseUrl, supabaseKey)
  }

  // クライアントサイドの場合はシングルトンパターンを使用
  if (clientSideInstance) return clientSideInstance

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables. Check your .env file.")
    throw new Error("Supabase configuration is missing. Please check your environment variables.")
  }

  clientSideInstance = createSupabaseClient(supabaseUrl, supabaseKey)
  return clientSideInstance
}
