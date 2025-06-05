interface SimpleIframeViewerProps {
  url: string
}

export function SimpleIframeViewer({ url }: SimpleIframeViewerProps) {
  return (
    <div className="w-full h-full">
      <iframe src={url} className="w-full h-full border-0" title="PDF Viewer" />
    </div>
  )
}
