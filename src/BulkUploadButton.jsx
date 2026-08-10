import { useRef, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Alert, Box, LinearProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import { useNotify, useRefresh } from 'react-admin'
import { upload as uploadBlob } from '@vercel/blob/client'

const API_URL = '/api'

export function BulkUploadButton({ mode }) {
  const inputRef = useRef(null)
  const folderRef = useRef(null)
  const notify = useNotify()
  const refresh = useRefresh()
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [imageFiles, setImageFiles] = useState([])
  const [uploadProgress, setUploadProgress] = useState('')

  const reset = () => {
    setPreview(null)
    setFileName('')
    setUploadError('')
    setImageFiles([])
    setUploadProgress('')
    if (inputRef.current) inputRef.current.value = ''
    if (folderRef.current) folderRef.current.value = ''
  }

  const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^file:\/\//i, '').replace(/\/+$/, '').toLowerCase()
  const imageExtensions = /\.(avif|gif|jpe?g|png|webp)$/i
  const filesForReference = (reference) => {
    const wanted = normalizePath(reference)
    if (!wanted) return []
    const wantedParts = wanted.split('/').filter(Boolean)
    const wantedName = wantedParts.at(-1)
    const referenceIsFile = imageExtensions.test(wantedName)
    return imageFiles.filter((file) => {
      const relative = normalizePath(file.webkitRelativePath || file.name)
      const parts = relative.split('/').filter(Boolean)
      if (referenceIsFile) return parts.at(-1) === wantedName
      return parts.slice(0, -1).includes(wantedName)
        || relative.includes(`/${wantedParts.slice(-2).join('/')}/`)
    })
  }

  const safeFileName = (name) => String(name).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  const blobPathFor = async (product, file) => {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    const hash = [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('')
    return `products/${product.slug}/${hash}-${safeFileName(file.name)}`
  }
  const legacyBlobFor = (existingBlobs, product, file) => {
    const folder = `products/${product.slug}/`
    const safeName = safeFileName(file.name)
    const extensionIndex = safeName.lastIndexOf('.')
    const stem = extensionIndex > 0 ? safeName.slice(0, extensionIndex) : safeName
    const extension = extensionIndex > 0 ? safeName.slice(extensionIndex) : ''
    return existingBlobs.find((blob) => {
      if (!blob.pathname.startsWith(folder) || Number(blob.size) !== file.size) return false
      const blobName = blob.pathname.slice(folder.length).toLowerCase()
      return blobName === safeName || (blobName.startsWith(`${stem}-`) && blobName.endsWith(extension))
    })
  }

  const selectFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setParsing(true)
    setUploadError('')
    try {
      const { parseCatalogWorkbook } = await import('./bulkUpload')
      setPreview(await parseCatalogWorkbook(file))
      setFileName(file.name)
    } catch (error) {
      setUploadError(error.message || 'The workbook could not be read.')
    } finally {
      setParsing(false)
    }
  }

  const upload = async () => {
    setUploading(true)
    setUploadError('')
    try {
      const token = localStorage.getItem('admin_token')
      const productsWithLocalImages = mode === 'products' ? preview.products.filter((product) => product.image_reference) : []
      const unmatched = productsWithLocalImages.filter((product) => !filesForReference(product.image_reference).length)
      const imageFailures = []
      let existingBlobs = []
      if (mode === 'products' && imageFiles.length) {
        try {
          const blobResponse = await fetch(`${API_URL}/blob-images`, { headers: { Authorization: `Bearer ${token}` } })
          if (blobResponse.ok) existingBlobs = (await blobResponse.json()).blobs || []
        } catch {
          // Blob listing is an optimization; individual uploads still report failures below.
        }
      }
      const blobsByPath = new Map(existingBlobs.map((blob) => [blob.pathname, blob]))
      let reusedImages = 0
      let uploadedImages = 0
      const products = []
      if (mode === 'products') {
        for (let productIndex = 0; productIndex < preview.products.length; productIndex += 1) {
          const product = preview.products[productIndex]
          const matchedFiles = filesForReference(product.image_reference)
          const imageBlobs = []
          for (let fileIndex = 0; fileIndex < matchedFiles.length; fileIndex += 1) {
            const file = matchedFiles[fileIndex]
            setUploadProgress(`Checking image ${fileIndex + 1} of ${matchedFiles.length} for ${product.name} (${productIndex + 1}/${preview.products.length})`)
            try {
              const pathname = await blobPathFor(product, file)
              const existingBlob = blobsByPath.get(pathname) || legacyBlobFor(existingBlobs, product, file)
              if (existingBlob) {
                imageBlobs.push({ url: existingBlob.url, pathname: existingBlob.pathname })
                reusedImages += 1
                continue
              }
              setUploadProgress(`Uploading new image ${fileIndex + 1} of ${matchedFiles.length} for ${product.name} (${productIndex + 1}/${preview.products.length})`)
              const blob = await uploadBlob(pathname, file, {
                access: 'public',
                handleUploadUrl: `${API_URL}/blob-upload`,
                clientPayload: JSON.stringify({ adminToken: token }),
              })
              imageBlobs.push({ url: blob.url, pathname: blob.pathname })
              blobsByPath.set(blob.pathname, blob)
              existingBlobs.push({ ...blob, size: file.size })
              uploadedImages += 1
            } catch (error) {
              imageFailures.push({ product: product.name, file: file.name, message: error.message })
            }
          }
          const imageUrls = imageBlobs.length ? imageBlobs.map((blob) => blob.url) : product.image_urls
          products.push({ ...product, image_url: imageUrls[0] || '', image_urls: imageUrls, image_blobs: imageBlobs })
        }
      }
      const response = await fetch(`${API_URL}/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          categories: preview.categories,
          products,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Bulk upload failed.')
      notify(`${result.categories.created} categories created, ${result.categories.updated} updated${mode === 'products' ? `; ${result.products.created} products created, ${result.products.updated} updated; ${uploadedImages} new images uploaded; ${reusedImages} existing images reused${unmatched.length ? `; images missing for ${unmatched.length} products` : ''}${imageFailures.length ? `; ${imageFailures.length} image uploads failed` : ''}` : ''}.`, { type: imageFailures.length ? 'warning' : 'success' })
      reset()
      refresh()
    } catch (error) {
      setUploadError(error.message || 'Bulk upload failed.')
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  const records = mode === 'products' ? preview?.products : preview?.categories
  const unmatchedImageProducts = mode === 'products' && preview && imageFiles.length
    ? preview.products.filter((product) => product.image_reference && !filesForReference(product.image_reference).length)
    : []
  const canUpload = preview && records.length > 0 && preview.errors.length === 0 && !uploading

  return <>
    <input ref={inputRef} hidden type="file" accept=".xlsx,.xls" onChange={selectFile} />
    <input ref={folderRef} hidden type="file" accept="image/*" multiple webkitdirectory="" directory="" onChange={(event) => setImageFiles([...event.target.files].filter((file) => file.type.startsWith('image/') || imageExtensions.test(file.name)))} />
    <Button startIcon={<UploadFileIcon />} onClick={() => inputRef.current?.click()} disabled={parsing}>{parsing ? 'Reading…' : 'Bulk upload'}</Button>
    <Dialog open={Boolean(preview || uploadError)} onClose={uploading ? undefined : reset} fullWidth maxWidth="lg">
      <DialogTitle>Review {mode === 'products' ? 'product' : 'category'} upload</DialogTitle>
      <DialogContent>
        {uploading ? <LinearProgress sx={{ mb: 2 }} /> : null}
        {uploadProgress ? <Typography variant="body2" sx={{ mb: 2 }}>{uploadProgress}</Typography> : null}
        {uploadError ? <Alert severity="error" sx={{ mb: 2 }}>{uploadError}</Alert> : null}
        {preview ? <>
          {mode === 'products' && preview.products.some((product) => product.image_reference) ? <Alert severity={imageFiles.length ? 'success' : 'info'} sx={{ mb: 2 }}
            action={<Button startIcon={<FolderOpenIcon />} onClick={() => folderRef.current?.click()} disabled={uploading}>Select image folder</Button>}
          >{imageFiles.length ? `${imageFiles.length} image files selected. Folder references will be matched during upload.` : 'The workbook contains local image paths. Select their common parent folder to upload all product images.'}</Alert> : null}
          {unmatchedImageProducts.length ? <Alert severity="warning" sx={{ mb: 2 }}>
            No images matched {unmatchedImageProducts.length} products. Those products will still be uploaded without images.
          </Alert> : null}
          <Typography variant="body2" sx={{ mb: 2 }}>{fileName} · Sheet “{preview.sheetName}” · {preview.sourceRows} source rows · {records.length} valid {mode}</Typography>
          {preview.errors.length ? <Alert severity="error" sx={{ mb: 2 }}>{preview.errors.length} rows need correction before upload: {preview.errors.slice(0, 8).map((item) => `Row ${item.row}: ${item.messages.join(', ')}`).join(' | ')}</Alert> : null}
          {preview.warnings.length ? <Alert severity="warning" sx={{ mb: 2 }}>{preview.warnings.map((item) => `Row ${item.row}: ${item.message}`).join(' | ')}</Alert> : null}
          <Box sx={{ maxHeight: 440, overflow: 'auto' }}>
            <Table size="small" stickyHeader><TableHead><TableRow>
              <TableCell>Name</TableCell><TableCell>{mode === 'products' ? 'SKU' : 'Slug'}</TableCell>{mode === 'products' ? <><TableCell>Category</TableCell><TableCell align="right">Price</TableCell><TableCell align="right">Stock</TableCell></> : null}
            </TableRow></TableHead><TableBody>{records.slice(0, 100).map((record) => <TableRow key={mode === 'products' ? record.sku : record.slug}>
              <TableCell>{record.name}</TableCell><TableCell>{mode === 'products' ? record.sku : record.slug}</TableCell>{mode === 'products' ? <><TableCell>{record.category_slug}</TableCell><TableCell align="right">{record.price.toFixed(2)}</TableCell><TableCell align="right">{record.stock_quantity}</TableCell></> : null}
            </TableRow>)}</TableBody></Table>
          </Box>
          {records.length > 100 ? <Typography variant="caption">Showing the first 100 records.</Typography> : null}
        </> : null}
      </DialogContent>
      <DialogActions><Button onClick={reset} disabled={uploading}>Cancel</Button><Button variant="contained" onClick={upload} disabled={!canUpload}>Upload {records?.length || 0} {mode}</Button></DialogActions>
    </Dialog>
  </>
}
