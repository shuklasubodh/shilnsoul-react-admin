import { useEffect, useState } from 'react'

export function AuthenticatedBlobImage({ blobUrl, alt, className, style }) {
  const [result, setResult] = useState({ blobUrl: '', source: '', failed: false })

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    fetch(`/api/blob-content?url=${encodeURIComponent(blobUrl)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) throw new Error('Image could not be loaded')
      return response.blob()
    }).then((image) => {
      objectUrl = URL.createObjectURL(image)
      setResult({ blobUrl, source: objectUrl, failed: false })
    }).catch((error) => {
      if (error.name !== 'AbortError') setResult({ blobUrl, source: '', failed: true })
    })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [blobUrl])

  if (result.blobUrl === blobUrl && result.failed) return <span className={className} style={style}>Preview unavailable</span>
  if (result.blobUrl !== blobUrl || !result.source) return <span className={className} style={style}>Loading…</span>
  return <img className={className} style={style} src={result.source} alt={alt} />
}
