import { useCallback, useEffect, useMemo, useState } from 'react'
import { Title, useNotify } from 'react-admin'
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, MenuItem, Paper,
  Select, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import RefreshIcon from '@mui/icons-material/Refresh'
import BuildIcon from '@mui/icons-material/Build'
import { AuthenticatedBlobImage } from './AuthenticatedBlobImage'

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
  const [savingMultiple, setSavingMultiple] = useState(false)
  const [deletingMultiple, setDeletingMultiple] = useState(false)
  const [selectedUrls, setSelectedUrls] = useState([])
  const [error, setError] = useState('')
  const [repairing, setRepairing] = useState(false)
  const [unmappedOnly, setUnmappedOnly] = useState(false)
  const [folderFilter, setFolderFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')

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
  const folders = useMemo(() => [...new Set(blobs.map((blob) => blob.pathname.split('/').slice(0, -1).join('/')).filter(Boolean))].sort(), [blobs])
  const visibleBlobs = useMemo(() => blobs.filter((blob) => {
    const mapping = mappedByUrl.get(blob.url)
    if (unmappedOnly && mapping) return false
    const folder = blob.pathname.split('/').slice(0, -1).join('/')
    return !folderFilter || folder === folderFilter
  }), [blobs, folderFilter, mappedByUrl, unmappedOnly])
  const detailProducts = useMemo(() => productFilter
    ? products.filter((product) => String(product.id) === productFilter)
    : products, [productFilter, products])
  const selectedUrlSet = useMemo(() => new Set(selectedUrls), [selectedUrls])
  const selectedVisibleCount = visibleBlobs.filter((blob) => selectedUrlSet.has(blob.url)).length
  const allVisibleSelected = visibleBlobs.length > 0 && selectedVisibleCount === visibleBlobs.length
  const updateDraft = (url, change) => setDrafts((current) => ({ ...current, [url]: { ...current[url], ...change } }))
  const toggleAllVisible = (checked) => setSelectedUrls((current) => {
    const visibleUrls = new Set(visibleBlobs.map((blob) => blob.url))
    return checked ? [...new Set([...current, ...visibleUrls])] : current.filter((url) => !visibleUrls.has(url))
  })
  const saveMapping = (blob, productId) => apiFetch('product-images', {
    method: 'POST',
    body: JSON.stringify({
      product_id: Number(productId), blob_url: blob.url, blob_pathname: blob.pathname,
      sort_order: 0, is_primary: Boolean(drafts[blob.url]?.is_primary),
    }),
  })

  const save = async (blob) => {
    const draft = drafts[blob.url]
    const productId = productFilter || draft?.product_id
    if (!productId) return notify('Select a product first.', { type: 'warning' })
    setSavingUrl(blob.url)
    try {
      await saveMapping(blob, productId)
      notify('Image mapped to product.', { type: 'success' })
      await load()
    } catch (saveError) {
      notify(saveError.message, { type: 'error' })
    } finally {
      setSavingUrl('')
    }
  }

  const saveSelected = async () => {
    const selectedBlobs = blobs.filter((blob) => selectedUrls.includes(blob.url))
    const missingProduct = selectedBlobs.some((blob) => !(productFilter || drafts[blob.url]?.product_id))
    if (!selectedBlobs.length) return notify('Select at least one image.', { type: 'warning' })
    if (missingProduct) return notify('Select a product for every selected image.', { type: 'warning' })
    setSavingMultiple(true)
    try {
      for (const blob of selectedBlobs) {
        await saveMapping(blob, productFilter || drafts[blob.url].product_id)
      }
      notify(`${selectedBlobs.length} images mapped to products.`, { type: 'success' })
      setSelectedUrls([])
      await load()
    } catch (saveError) {
      notify(saveError.message, { type: 'error' })
    } finally {
      setSavingMultiple(false)
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

  const deleteBrokenImage = async (blob) => {
    const confirmed = window.confirm(`Permanently delete this image from Vercel Blob and remove its database mapping?\n\n${blob.pathname}`)
    if (!confirmed) return
    setSavingUrl(blob.url)
    try {
      const result = await apiFetch('blob-images', {
        method: 'DELETE',
        body: JSON.stringify({ blob_url: blob.url }),
      })
      setSelectedUrls((current) => current.filter((url) => url !== blob.url))
      notify(`Broken image deleted${result.removed_mappings ? `; ${result.removed_mappings} database mapping removed` : ''}.`, { type: 'success' })
      await load()
    } catch (deleteError) {
      notify(deleteError.message, { type: 'error' })
    } finally {
      setSavingUrl('')
    }
  }

  const deleteSelected = async () => {
    const selectedBlobs = blobs.filter((blob) => selectedUrlSet.has(blob.url))
    if (!selectedBlobs.length) return notify('Select at least one Blob image.', { type: 'warning' })
    const mappedCount = selectedBlobs.filter((blob) => mappedByUrl.has(blob.url)).length
    const confirmed = window.confirm(
      `Permanently delete ${selectedBlobs.length} selected Blob image${selectedBlobs.length === 1 ? '' : 's'}?\n\n`
      + `${mappedCount} selected image${mappedCount === 1 ? ' is' : 's are'} mapped to products; those database mappings will also be removed. This action cannot be undone.`,
    )
    if (!confirmed) return

    setDeletingMultiple(true)
    const deletedUrls = []
    const failures = []
    for (const blob of selectedBlobs) {
      try {
        await apiFetch('blob-images', {
          method: 'DELETE',
          body: JSON.stringify({ blob_url: blob.url }),
        })
        deletedUrls.push(blob.url)
      } catch (deleteError) {
        failures.push(`${blob.pathname}: ${deleteError.message}`)
      }
    }

    setSelectedUrls((current) => current.filter((url) => !deletedUrls.includes(url)))
    if (deletedUrls.length) notify(`${deletedUrls.length} Blob image${deletedUrls.length === 1 ? '' : 's'} deleted.`, { type: 'success' })
    if (failures.length) notify(`${failures.length} image${failures.length === 1 ? '' : 's'} could not be deleted. ${failures[0]}`, { type: 'error' })
    await load()
    setDeletingMultiple(false)
  }

  const repairImages = async () => {
    if (!window.confirm('Reconcile Blob files, product image mappings, and product image URLs? No Blob files will be deleted.')) return
    setRepairing(true)
    try {
      const result = await apiFetch('image-repair', { method: 'POST' })
      notify(`Repair complete: ${result.repaired_mappings} mappings repaired, ${result.removed_stale_mappings} stale mappings removed, ${result.created_mappings} mappings created, ${result.updated_products} products updated, ${result.assigned_primaries} primary images assigned.`, { type: 'success' })
      await load()
    } catch (repairError) {
      notify(repairError.message, { type: 'error' })
    } finally {
      setRepairing(false)
    }
  }

  return <Box className="image-mapping-page">
    <Title title="Product image mapping" />
    <Box className="image-mapping-header">
      <Box><Typography variant="h4">Product image mapping</Typography><Typography color="text.secondary">Assign public Blob images under products/ to catalog products.</Typography></Box>
      <Box sx={{ display: 'flex', gap: 1 }}><Button startIcon={<BuildIcon />} onClick={repairImages} disabled={loading || repairing}>{repairing ? 'Repairing…' : 'Repair image references'}</Button><Button startIcon={<RefreshIcon />} onClick={load} disabled={loading || repairing}>Refresh</Button></Box>
    </Box>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography><strong>{blobs.length}</strong> Blob images · <strong>{mappings.length}</strong> mappings</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mt: 1.5 }}>
        <Select size="small" displayEmpty value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} sx={{ minWidth: 260 }} inputProps={{ 'aria-label': 'Filter by folder name' }}>
          <MenuItem value=""><em>All folders</em></MenuItem>
          {folders.map((folder) => <MenuItem key={folder} value={folder}>{folder}</MenuItem>)}
        </Select>
        <Select size="small" displayEmpty value={productFilter} onChange={(event) => setProductFilter(event.target.value)} sx={{ minWidth: 280 }} inputProps={{ 'aria-label': 'Filter by product' }}>
          <MenuItem value=""><em>All products</em></MenuItem>
          {products.map((product) => <MenuItem key={product.id} value={String(product.id)}>{product.name} ({product.sku})</MenuItem>)}
        </Select>
        <FormControlLabel control={<Checkbox checked={unmappedOnly} onChange={(event) => setUnmappedOnly(event.target.checked)} />} label="Show unmapped images only" />
        <Typography variant="body2" color="text.secondary">{visibleBlobs.length} shown</Typography>
        <Button variant="contained" onClick={saveSelected} disabled={savingMultiple || selectedUrls.length === 0}>
          {savingMultiple ? 'Saving…' : `Save selected (${selectedUrls.length})`}
        </Button>
        <Button color="error" variant="outlined" startIcon={<DeleteForeverIcon />} onClick={deleteSelected} disabled={deletingMultiple || savingMultiple || selectedUrls.length === 0}>
          {deletingMultiple ? 'Deleting…' : `Delete selected Blobs (${selectedUrls.length})`}
        </Button>
      </Box>
    </Paper>
    {!loading && unmappedOnly && visibleBlobs.length === 0 ? <Alert severity="info" sx={{ mb: 2 }} action={<Button onClick={() => setUnmappedOnly(false)}>Show all images</Button>}>
      All listed Blob images are currently mapped. Turn off the unmapped-only filter to display them.
    </Alert> : null}
    {loading ? <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 260 }}><CircularProgress /></Box> :
      <Paper variant="outlined" sx={{ overflow: 'auto' }}><Table stickyHeader size="small">
        <TableHead><TableRow><TableCell padding="checkbox"><Checkbox checked={allVisibleSelected} indeterminate={selectedVisibleCount > 0 && !allVisibleSelected} onChange={(event) => toggleAllVisible(event.target.checked)} inputProps={{ 'aria-label': 'Select all visible images' }} /></TableCell><TableCell>Preview</TableCell><TableCell>Blob pathname</TableCell><TableCell>Product</TableCell><TableCell>Primary</TableCell><TableCell>Actions</TableCell></TableRow></TableHead>
        <TableBody>{visibleBlobs.map((blob) => {
          const draft = drafts[blob.url] || {}
          const selectedProductId = productFilter || draft.product_id || ''
          const mapping = mappedByUrl.get(blob.url)
          const saving = savingUrl === blob.url
          return <TableRow key={blob.url}>
            <TableCell padding="checkbox"><Checkbox checked={selectedUrlSet.has(blob.url)} onChange={(event) => setSelectedUrls((current) => event.target.checked ? [...new Set([...current, blob.url])] : current.filter((url) => url !== blob.url))} inputProps={{ 'aria-label': `Select ${blob.pathname}` }} /></TableCell>
            <TableCell><AuthenticatedBlobImage className="blob-preview" blobUrl={blob.url} alt={blob.pathname} /></TableCell>
            <TableCell><Typography variant="body2">{blob.pathname}</Typography>{mapping ? <Typography variant="caption" color="success.main">Mapped to {mapping.product_name}</Typography> : <Typography variant="caption" color="warning.main">Unmapped</Typography>}</TableCell>
            <TableCell><Select size="small" displayEmpty value={selectedProductId} disabled={Boolean(productFilter)} onChange={(event) => updateDraft(blob.url, { product_id: event.target.value })} sx={{ minWidth: 260 }}>
              <MenuItem value=""><em>Select product</em></MenuItem>{detailProducts.map((product) => <MenuItem key={product.id} value={String(product.id)}>{product.name} ({product.sku})</MenuItem>)}
            </Select></TableCell>
            <TableCell><Checkbox checked={Boolean(draft.is_primary)} onChange={(event) => updateDraft(blob.url, { is_primary: event.target.checked })} /></TableCell>
            <TableCell><Button onClick={() => save(blob)} disabled={saving || !selectedProductId}>{saving ? 'Saving…' : 'Save'}</Button>{mapping ? <Button color="warning" startIcon={<DeleteIcon />} onClick={() => remove(blob)} disabled={saving}>Unmap</Button> : null}<Button color="error" startIcon={<DeleteForeverIcon />} onClick={() => deleteBrokenImage(blob)} disabled={saving}>Delete blob</Button></TableCell>
          </TableRow>
        })}</TableBody>
      </Table></Paper>}
  </Box>
}
