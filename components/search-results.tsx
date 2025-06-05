"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

interface SearchResultsProps {
  results: any[]
  query: string
  onResultClick: (page: number) => void
}

export function SearchResults({ results, query, onResultClick }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="p-4">
        <p className="text-center text-gray-500">検索結果がありません。別のキーワードで試してください。</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">「{query}」の検索結果</h2>

      {results.map((result, index) => (
        <Card key={index} className="overflow-hidden">
          <CardContent className="p-0">
            <div className="p-4">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-medium">{result.title || `ページ ${result.page}`}</h3>
                <Button variant="ghost" size="sm" className="text-blue-600" onClick={() => onResultClick(result.page)}>
                  ページへ移動 <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>

              <div className="text-sm">
                <div dangerouslySetInnerHTML={{ __html: result.highlightedText }} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
