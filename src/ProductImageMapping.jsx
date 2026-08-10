import { useCallback, useEffect, useMemo, useState } from 'react'
import { Title, useNotify } from 'react-admin'
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, Paper,
  Select, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import RefreshIcon from '@mui/icons-material/Refresh'

const apiFetch = async (path, options = {}) => {
  const token = localStorage.getItem('admin_token')
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'The request failed.')
  return body
}

export function ProductImageMapping() {
  const notify = useNotify()
  const [products, setProducts] = useState([])
  const [blobs, setBlobs] = useState([])
  const [mappings, setMappings] = useState([])
  const [drafts, setDrafts] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingUrl, setSavingUrl] = useState('')
  const [error, setError] = useState('')
  const [unmappedOnly, setUnmappedOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ range: JSON.stringify([0, 9999]), sort: JSON.stringify(['name', 'ASC']), filter: '{}' })
      const [productRows, blobResult, mappingRows] = await Promise.all([
        apiFetch(`products?${query}`), apiFetch('blob-images'), apiFetch('product-images'),
      ])
      setProducts(productRows)
      setBlobs(blobResult.blobs || [])
      setMappings(mappingRows)
      setDrafts(Object.fromEntries((blobResult.blobs || []).map((blob) => {
        const mapping = mappingRows.find((item) => item.blob_url === blob.url)
        return [blob.url, {
          product_id: mapping ? String(mapping.product_id) : '',
          sort_order: mapping?.sort_order ?? 0,
          is_primary: mapping?.is_primary ?? false,
        }]
      })))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(load, 0)
    return () => window.clearTimeout(initialLoad)
  }, [load])

  const mappedByUrl = useMemo(() => new Map(mappings.map((mapping) => [mapping.blob_url, mapping])), [mappings])
  const visibleBlobs = unmappedOnly ? blobs.filter((blob) => !mappedByUrl.has(blob.url)) : blobs
  const updateDraft = (url, change) => setDrafts((current) => ({ ...current, [url]: { ...current[url], ...change } }))

  const save = async (blob) => {
    const draft = drafts[blob.url]
    if (!draft?.product_id) return notify('Select a product first.', { type: 'warning' })
    setSavingUrl(blob.url)
    try {
      await apiFetch('product-images', {
        method: 'POST',
        body: JSON.stringify({
          product_id: Number(draft.product_id), blob_url: blob.url, blob_pathname: blob.pathname,
          sort_order: Number(draft.sort_order) || 0, is_primary: Boolean(draft.is_primary),
        }),
      })
      notify('Image mapped to product.', { type: 'success' })
      await load()
    } catch (saveError) {
      notify(saveError.message, { type: 'error' })
    } finally {
      setSavingUrl('')
    }
  }

  const remove = async (blob) => {
    const mapping = mappedByUrl.get(blob.url)
    if (!mapping) return
    setSavingUrl(blob.url)
    try {
      await apiFetch(`product-images/${mapping.id}`, { method: 'DELETE' })
      notify('Image mapping removed. The Blob file was not deleted.', { type: 'success' })
      await load()
    } catch (removeError) {
      notify(removeError.message, { type: 'error' })
    } finally {
      setSavingUrl('')
    }
  }

  return <Box className="image-mapping-page">
    <Title title="Product image mapping" />
    <Box className="image-mapping-header">
      <Box><Typography variant="h4">Product image mapping</Typography><Typography color="text.secondary">Assign public Blob images under products/ to catalog products.</Typography></Box>
      <Button startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
    </Box>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography><strong>{blobs.length}</strong> Blob images · <strong>{mappings.length}</strong> mappings</Typography>
      <FormControlLabel control={<Checkbox checked={unmappedOnly} onChange={(event) => setUnmappedOnly(event.target.checked)} />} label="Show unmapped images only" />
    </Paper>
    {loading ? <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 260 }}><CircularProgress /></Box> :
      <Paper variant="outlined" sx={{ overflow: 'auto' }}><Table stickyHeader size="small">
        <TableHead><TableRow><TableCell>Preview</TableCell><TableCell>Blob pathname</TableCell><TableCell>Product</TableCell><TableCell>Order</TableCell><TableCell>Primary</TableCell><TableCell>Actions</TableCell></TableRow></TableHead>
        <TableBody>{visibleBlobs.map((blob) => {
          const draft = drafts[blob.url] || {}
          const mapping = mappedByUrl.get(blob.url)
          const saving = savingUrl === blob.url
          return <TableRow key={blob.url}>
            <TableCell><a href={blob.url} target="_blank" rel="noreferrer"><img className="blob-preview" src={blob.url} alt={blob.pathname} /></a></TableCell>
            <TableCell><Typography variant="body2">{blob.pathname}</Typography>{mapping ? <Typography variant="caption" color="success.main">Mapped to {mapping.product_name}</Typography> : <Typography variant="caption" color="warning.main">Unmapped</Typography>}</TableCell>
            <TableCell><Select size="small" displayEmpty value={draft.product_id || ''} onChange={(event) => updateDraft(blob.url, { product_id: event.target.value })} sx={{ minWidth: 260 }}>
              <MenuItem value=""><em>Select product</em></MenuItem>{products.map((product) => <MenuItem key={product.id} value={String(product.id)}>{product.name} ({product.sku})</MenuItem>)}
            </Select></TableCell>
            <TableCell><TextField size="small" type="number" value={draft.sort_order ?? 0} onChange={(event) => updateDraft(blob.url, { sort_order: event.target.value })} slotProps={{ htmlInput: { min: 0 } }} sx={{ width: 80 }} /></TableCell>
            <TableCell><Checkbox checked={Boolean(draft.is_primary)} onChange={(event) => updateDraft(blob.url, { is_primary: event.target.checked })} /></TableCell>
            <TableCell><Button onClick={() => save(blob)} disabled={saving || !draft.product_id}>{saving ? 'Saving…' : 'Save'}</Button>{mapping ? <Button color="error" startIcon={<DeleteIcon />} onClick={() => remove(blob)} disabled={saving}>Unmap</Button> : null}</TableCell>
          </TableRow>
        })}</TableBody>
      </Table></Paper>}
  </Box>
}
