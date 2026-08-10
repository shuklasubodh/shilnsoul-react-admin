import { useCallback, useEffect, useMemo, useState } from 'react'
import { Title, useNotify } from 'react-admin'
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, LinearProgress, Paper, Typography } from '@mui/material'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import ImageSearchIcon from '@mui/icons-material/ImageSearch'
import RefreshIcon from '@mui/icons-material/Refresh'
import { AuthenticatedBlobImage } from './AuthenticatedBlobImage'

const apiFetch = async (path, options = {}) => {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('admin_token')}`, ...options.headers },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || 'The request failed.')
  return body
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

const imageFingerprint = async (blob) => {
  const response = await fetch(`/api/blob-content?url=${encodeURIComponent(blob.url)}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('admin_token')}` },
  })
  if (!response.ok) throw new Error(`Could not read ${blob.pathname}`)
  const bitmap = await createImageBitmap(await response.blob())
  const aspect = bitmap.width / bitmap.height
  const canvas = document.createElement('canvas')
  canvas.width = 9
  canvas.height = 8
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(bitmap, 0, 0, 9, 8)
  bitmap.close?.()
  const pixels = context.getImageData(0, 0, 9, 8).data
  const gray = Array.from({ length: 72 }, (_, index) => {
    const offset = index * 4
    return pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114
  })
  let hash = ''
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) hash += gray[y * 9 + x] > gray[y * 9 + x + 1] ? '1' : '0'
  return { blob, hash, aspect }
}

const distance = (left, right) => [...left].reduce((total, bit, index) => total + (bit !== right[index] ? 1 : 0), 0)

const exactDuplicateGroups = (blobs) => {
  const groups = new Map()
  blobs.forEach((blob) => {
    if (!blob.etag) return
    const key = `${blob.size}:${blob.etag}`
    groups.set(key, [...(groups.get(key) || []), blob])
  })
  return [...groups.values()].filter((group) => group.length > 1)
}

const keeperFor = (group, mappingByUrl) => [...group].sort((left, right) => {
  const leftMapping = mappingByUrl.get(left.url)
  const rightMapping = mappingByUrl.get(right.url)
  return Number(Boolean(rightMapping?.is_primary)) - Number(Boolean(leftMapping?.is_primary))
    || Number(Boolean(rightMapping)) - Number(Boolean(leftMapping))
    || new Date(left.uploadedAt || 0) - new Date(right.uploadedAt || 0)
})[0]

const suggestedDuplicateUrls = (groups, mappingByUrl) => groups.flatMap((group) => {
  const keeper = keeperFor(group, mappingByUrl)
  return group.filter((blob) => blob.url !== keeper.url).map((blob) => blob.url)
})

export function ImageMaintenance() {
  const notify = useNotify()
  const [blobs, setBlobs] = useState([])
  const [mappings, setMappings] = useState([])
  const [selected, setSelected] = useState([])
  const [similarGroups, setSimilarGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [blobResult, mappingRows] = await Promise.all([apiFetch('blob-images'), apiFetch('product-images')])
      const blobRows = blobResult.blobs || []
      const imageMappings = mappingRows || []
      const mappingsByUrl = new Map(imageMappings.map((item) => [item.blob_url, item]))
      setBlobs(blobRows)
      setMappings(imageMappings)
      setSelected(suggestedDuplicateUrls(exactDuplicateGroups(blobRows), mappingsByUrl))
      setSimilarGroups([])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])

  const mappingByUrl = useMemo(() => new Map(mappings.map((item) => [item.blob_url, item])), [mappings])
  const exactGroups = useMemo(() => exactDuplicateGroups(blobs), [blobs])

  const selectSuggestions = (group) => {
    const keeper = keeperFor(group, mappingByUrl)
    setSelected((current) => [...new Set([...current, ...group.filter((blob) => blob.url !== keeper.url).map((blob) => blob.url)])])
  }

  const scan = async () => {
    setScanning(true)
    setProgress(0)
    try {
      let completed = 0
      let failed = 0
      const fingerprints = (await parallelMap(blobs, 4, async (blob) => {
        try { return await imageFingerprint(blob) } catch { failed += 1; return null } finally { completed += 1; setProgress(Math.round(completed / blobs.length * 100)) }
      })).filter(Boolean)
      const parents = fingerprints.map((_, index) => index)
      const find = (index) => parents[index] === index ? index : (parents[index] = find(parents[index]))
      const join = (a, b) => { const left = find(a); const right = find(b); if (left !== right) parents[right] = left }
      for (let a = 0; a < fingerprints.length; a += 1) for (let b = a + 1; b < fingerprints.length; b += 1) {
        if (Math.abs(fingerprints[a].aspect - fingerprints[b].aspect) <= 0.12 && distance(fingerprints[a].hash, fingerprints[b].hash) <= 6) join(a, b)
      }
      const groups = new Map()
      fingerprints.forEach((item, index) => groups.set(find(index), [...(groups.get(find(index)) || []), item.blob]))
      const foundGroups = [...groups.values()].filter((group) => group.length > 1)
      setSimilarGroups(foundGroups)
      setSelected((current) => [...new Set([...current, ...suggestedDuplicateUrls(foundGroups, mappingByUrl)])])
      notify(`Similarity scan complete${failed ? `; ${failed} images could not be read` : ''}.`, { type: failed ? 'warning' : 'success' })
    } finally {
      setScanning(false)
    }
  }

  const removeSelected = async () => {
    if (!selected.length || !window.confirm(`Permanently delete ${selected.length} selected Blob images? This cannot be undone.`)) return
    setDeleting(true)
    const failures = []
    await parallelMap(selected, 4, async (url) => {
      try { await apiFetch('blob-images', { method: 'DELETE', body: JSON.stringify({ blob_url: url }) }) } catch (deleteError) { failures.push(deleteError.message) }
    })
    notify(failures.length ? `${selected.length - failures.length} images deleted; ${failures.length} failed.` : `${selected.length} images deleted.`, { type: failures.length ? 'warning' : 'success' })
    setDeleting(false)
    await load()
  }

  const renderGroup = (group, label) => {
    const keeper = keeperFor(group, mappingByUrl)
    return <Paper key={`${label}-${group[0].url}`} variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1">{label} · {group.length} images</Typography>
        <Button size="small" onClick={() => selectSuggestions(group)}>Select suggested duplicates</Button>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 1.5 }}>
        {group.map((blob) => { const mapping = mappingByUrl.get(blob.url); return <Box key={blob.url} sx={{ border: '1px solid #dbe3ea', p: 1, minWidth: 0 }}>
          <AuthenticatedBlobImage blobUrl={blob.url} alt={blob.pathname} style={{ width: '100%', height: 130, objectFit: 'contain', background: '#f4f6f8' }} />
          <Box sx={{ display: 'flex', alignItems: 'center' }}><Checkbox checked={selected.includes(blob.url)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, blob.url])] : current.filter((url) => url !== blob.url))} />
            <Typography variant="caption" title={blob.pathname} noWrap>{blob.pathname}</Typography></Box>
          <Box sx={{ display: 'flex', gap: .5, flexWrap: 'wrap' }}>{blob.url === keeper.url ? <Chip size="small" color="success" label="Suggested keeper" /> : null}{mapping ? <Chip size="small" label={`${mapping.product_name || `Product ${mapping.product_id}`}${mapping.is_primary ? ' · primary' : ''}`} /> : <Chip size="small" variant="outlined" label="Unmapped" />}</Box>
        </Box> })}
      </Box>
    </Paper>
  }

  return <Box sx={{ p: 3 }}><Title title="Image Maintenance" />
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
      <Typography variant="h5" sx={{ mr: 'auto' }}>Duplicate image maintenance</Typography>
      <Button startIcon={<RefreshIcon />} onClick={load} disabled={loading || scanning || deleting}>Refresh</Button>
      <Button variant="outlined" startIcon={<ImageSearchIcon />} onClick={scan} disabled={loading || scanning || !blobs.length}>{scanning ? 'Scanning…' : 'Scan possible duplicates'}</Button>
      <Button color="error" variant="contained" startIcon={<DeleteForeverIcon />} onClick={removeSelected} disabled={!selected.length || deleting}>{deleting ? 'Deleting…' : `Delete selected (${selected.length})`}</Button>
    </Box>
    <Alert severity="info" sx={{ mb: 2 }}>Suggested keepers remain unchecked; all other duplicate candidates are preselected. Nothing is deleted until you review and confirm.</Alert>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
    {scanning ? <LinearProgress variant="determinate" value={progress} sx={{ mb: 2 }} /> : null}
    {loading ? <CircularProgress /> : <>
      <Typography variant="h6" sx={{ mb: 1 }}>Exact duplicates ({exactGroups.length} groups)</Typography>
      {!exactGroups.length ? <Alert severity="success" sx={{ mb: 3 }}>No exact duplicates were found by Blob content signature.</Alert> : exactGroups.map((group) => renderGroup(group, 'Exact duplicate'))}
      <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>Possible visual duplicates ({similarGroups.length} groups)</Typography>
      {!similarGroups.length ? <Alert severity="info">Run the visual scan to group similar-looking images, including files with different names or encoding.</Alert> : similarGroups.map((group) => renderGroup(group, 'Possible duplicate'))}
    </>}
  </Box>
}
