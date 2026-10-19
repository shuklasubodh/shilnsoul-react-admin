import { useRef, useState } from 'react'
import { upload as uploadBlob } from '@vercel/blob/client'
import { useNavigate } from 'react-router-dom'
import { useNotify } from 'react-admin'
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  LinearProgress, List, ListItem, ListItemText, Typography,
} from '@mui/material'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary'
import { API_URL } from './apiUrl'
import { optimizeImageForUpload } from './imageUpload'

const imageExtensions = /\.(avif|bmp|gif|jfif|jpe?g|png|tiff?|webp)$/i
const isImage = (file) => file.type.startsWith('image/') || imageExtensions.test(file.name)
const safeFileName = (name) => String(name).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')

const hashedPath = async (file) => {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const hash = [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `products/unmapped/${hash}-${safeFileName(file.name)}`
}

const parallelMap = async (items, limit, task) => {
  const output = new Array(items.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++
      output[index] = await task(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return output
}

export function ProductImageUploadButton() {
  const fileRef = useRef(null)
  const folderRef = useRef(null)
  const notify = useNotify()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [error, setError] = useState('')

  const reset = () => {
    setOpen(false)
    setFiles([])
    setCompleted(0)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
    if (folderRef.current) folderRef.current.value = ''
  }

  const addFiles = (selected) => {
    const images = [...selected].filter(isImage)
    setFiles((current) => {
      const unique = new Map(current.map((file) => [`${file.name}|${file.size}|${file.lastModified}`, file]))
      images.forEach((file) => unique.set(`${file.name}|${file.size}|${file.lastModified}`, file))
      return [...unique.values()]
    })
    setError(images.length ? '' : 'No supported image files were selected.')
  }

  const upload = async () => {
    if (!files.length) return
    setUploading(true)
    setCompleted(0)
    setError('')
    try {
      const token = localStorage.getItem('admin_token')
      const blobResponse = await fetch(`${API_URL}/blob-images`, { headers: { Authorization: `Bearer ${token}` } })
      const blobResult = await blobResponse.json().catch(() => ({}))
      if (!blobResponse.ok) throw new Error(blobResult.error || 'Could not check the existing image library.')
      const existingPaths = new Set((blobResult.blobs || []).map((blob) => blob.pathname))
      let uploaded = 0
      let reused = 0
      const failures = []

      await parallelMap(files, 3, async (file) => {
        try {
          const optimized = await optimizeImageForUpload(file)
          const pathname = await hashedPath(optimized.file)
          if (existingPaths.has(pathname)) {
            reused += 1
            return
          }
          const blob = await uploadBlob(pathname, optimized.file, {
            access: 'public',
            contentType: 'image/webp',
            handleUploadUrl: `${API_URL}/blob-upload`,
            clientPayload: JSON.stringify({ adminToken: token }),
          })
          existingPaths.add(blob.pathname)
          uploaded += 1
        } catch (uploadError) {
          failures.push(`${file.name}: ${uploadError.message}`)
        } finally {
          setCompleted((count) => count + 1)
        }
      })

      if (!uploaded && !reused) throw new Error(failures[0] || 'No images were uploaded.')
      notify(`${uploaded} image${uploaded === 1 ? '' : 's'} uploaded${reused ? `; ${reused} already existed` : ''}${failures.length ? `; ${failures.length} failed` : ''}.`, { type: failures.length ? 'warning' : 'success' })
      reset()
      navigate('/product-images?unmapped=true')
    } catch (uploadError) {
      setError(uploadError.message || 'The images could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  return <>
    <Button startIcon={<AddPhotoAlternateIcon />} onClick={() => setOpen(true)}>Upload images</Button>
    <input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={(event) => addFiles(event.target.files)} />
    <input ref={folderRef} hidden type="file" accept="image/*" multiple webkitdirectory="" directory="" onChange={(event) => addFiles(event.target.files)} />
    <Dialog open={open} onClose={uploading ? undefined : reset} fullWidth maxWidth="sm">
      <DialogTitle>Upload product images</DialogTitle>
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2 }}>
          No product workbook is required. Images are optimized as WebP, uploaded as unmapped, and can be assigned to products next.
        </Alert>
        {uploading ? <Box sx={{ mb: 2 }}><LinearProgress variant="determinate" value={files.length ? completed / files.length * 100 : 0} /><Typography variant="caption">Processing {completed} of {files.length}</Typography></Box> : null}
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Button variant="outlined" startIcon={<PhotoLibraryIcon />} onClick={() => fileRef.current?.click()} disabled={uploading}>Select images</Button>
          <Button variant="outlined" startIcon={<FolderOpenIcon />} onClick={() => folderRef.current?.click()} disabled={uploading}>Select folder</Button>
        </Box>
        {files.length ? <>
          <Typography variant="subtitle2">{files.length} image{files.length === 1 ? '' : 's'} ready</Typography>
          <List dense sx={{ maxHeight: 240, overflow: 'auto' }}>
            {files.slice(0, 100).map((file) => <ListItem key={`${file.name}|${file.size}|${file.lastModified}`} disableGutters><ListItemText primary={file.webkitRelativePath || file.name} secondary={`${(file.size / 1024 / 1024).toFixed(2)} MB`} /></ListItem>)}
          </List>
          {files.length > 100 ? <Typography variant="caption">Showing the first 100 files.</Typography> : null}
        </> : <Typography color="text.secondary">Choose one or more images, or select a folder containing images.</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={reset} disabled={uploading}>Cancel</Button>
        <Button variant="contained" onClick={upload} disabled={!files.length || uploading}>{uploading ? 'Uploading…' : `Upload ${files.length || ''} image${files.length === 1 ? '' : 's'}`}</Button>
      </DialogActions>
    </Dialog>
  </>
}
