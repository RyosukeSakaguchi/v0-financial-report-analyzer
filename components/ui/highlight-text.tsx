interface HighlightTextProps {
  text: string
  highlight: string[]
}

export function HighlightText({ text, highlight }: HighlightTextProps) {
  if (!highlight.length) return <>{text}</>

  // Create a regex pattern from all highlight terms
  const pattern = new RegExp(`(${highlight.join("|")})`, "gi")

  // Split the text by the pattern
  const parts = text.split(pattern)

  return (
    <>
      {parts.map((part, i) => {
        // Check if this part matches any highlight term
        const isHighlight = highlight.some((term) => part.toLowerCase() === term.toLowerCase())

        return isHighlight ? (
          <span key={i} className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </>
  )
}
