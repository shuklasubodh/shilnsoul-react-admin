import { useRef, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Alert, Box, LinearProgress, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { useNotify, useRefresh } from 'react-admin'

const API_URL = '/api'

export function BulkUploadButton({ mode }) {
  const inputRef = useRef(null)
  const notify = useNotify()
  const refresh = useRefresh()
  const [preview, setPreview] = useState(null)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const reset = () => {
    setPreview(null)
    setFileName('')
    setUploadError('')
    if (inputRef.current) inputRef.current.value = ''
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
      const response = await fetch(`${API_URL}/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          categories: preview.categories,
          products: mode === 'products' ? preview.products : [],
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Bulk upload failed.')
      notify(`${result.categories.created} categories created, ${result.categories.updated} updated${mode === 'products' ? `; ${result.products.created} products created, ${result.products.updated} updated` : ''}.`, { type: 'success' })
      reset()
      refresh()
    } catch (error) {
      setUploadError(error.message || 'Bulk upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const records = mode === 'products' ? preview?.products : preview?.categories
  const canUpload = preview && records.length > 0 && preview.errors.length === 0 && !uploading

  return <>
    <input ref={inputRef} hidden type="file" accept=".xlsx,.xls" onChange={selectFile} />
    <Button startIcon={<UploadFileIcon />} onClick={() => inputRef.current?.click()} disabled={parsing}>{parsing ? 'Reading…' : 'Bulk upload'}</Button>
    <Dialog open={Boolean(preview || uploadError)} onClose={uploading ? undefined : reset} fullWidth maxWidth="lg">
      <DialogTitle>Review {mode === 'products' ? 'product' : 'category'} upload</DialogTitle>
      <DialogContent>
        {uploading ? <LinearProgress sx={{ mb: 2 }} /> : null}
        {uploadError ? <Alert severity="error" sx={{ mb: 2 }}>{uploadError}</Alert> : null}
        {preview ? <>
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
