import { useCallback, useEffect, useRef, useState } from 'react'
import { Title, useNotify } from 'react-admin'
import { upload as uploadBlob } from '@vercel/blob/client'
import { Alert, Box, Button, Checkbox, CircularProgress, Paper, TextField, Typography } from '@mui/material'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import DeleteForeverIcon from '@mui/icons-material/DeleteForever'
import SaveIcon from '@mui/icons-material/Save'
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

const safeFileName = (name) => String(name).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')

export function BannerMaintenance() {
  const notify = useNotify()
  const inputRef = useRef(null)
  const [banners, setBanners] = useState([])
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [form, setForm] = useState({ title: '', alt_text: '', link_url: '', sort_order: 0, is_active: true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try { setBanners(await apiFetch('banners')); setError('') }
    catch (loadError) { setError(loadError.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer) }, [load])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const chooseFile = (selectedFile) => {
    if (!selectedFile) return
    if (!selectedFile.type.startsWith('image/')) return notify('Select an image file.', { type: 'warning' })
    setFile(selectedFile)
    setPreviewUrl(URL.createObjectURL(selectedFile))
    if (!form.alt_text) setForm((current) => ({ ...current, alt_text: selectedFile.name.replace(/\.[^.]+$/, '') }))
  }

  const upload = async () => {
    if (!file) return notify('Choose a banner image first.', { type: 'warning' })
    setSaving(true)
    let blob
    try {
      const token = localStorage.getItem('admin_token')
      const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeFileName(file.name)}`
      blob = await uploadBlob(`banner/${uniqueName}`, file, {
        access: 'public',
        handleUploadUrl: '/api/blob-upload',
        clientPayload: JSON.stringify({ adminToken: token, uploadType: 'banner' }),
      })
      await apiFetch('banners', { method: 'POST', body: JSON.stringify({ ...form, blob_url: blob.url, blob_pathname: blob.pathname }) })
      notify('Banner uploaded and saved.', { type: 'success' })
      setFile(null)
      setPreviewUrl('')
      setForm({ title: '', alt_text: '', link_url: '', sort_order: banners.length, is_active: true })
      if (inputRef.current) inputRef.current.value = ''
      await load()
    } catch (uploadError) {
      setError(`${uploadError.message}${blob ? ' The Blob upload succeeded, but its database record was not saved.' : ''}`)
    } finally { setSaving(false) }
  }

  const updateBanner = async (banner) => {
    try {
      await apiFetch(`banners/${banner.id}`, { method: 'PUT', body: JSON.stringify(banner) })
      notify('Banner updated.', { type: 'success' })
      await load()
    } catch (saveError) { notify(saveError.message, { type: 'error' }) }
  }

  const removeBanner = async (banner) => {
    if (!window.confirm(`Delete this banner and its Blob image?\n\n${banner.blob_pathname}`)) return
    try {
      await apiFetch(`banners/${banner.id}`, { method: 'DELETE' })
      notify('Banner and Blob image deleted.', { type: 'success' })
      await load()
    } catch (deleteError) { notify(deleteError.message, { type: 'error' }) }
  }

  const changeBanner = (id, field, value) => setBanners((current) => current.map((banner) => banner.id === id ? { ...banner, [field]: value } : banner))

  return <Box sx={{ p: 3 }}><Title title="Banner Maintenance" />
    <Typography variant="h4" sx={{ mb: .5 }}>Banner maintenance</Typography>
    <Typography color="text.secondary" sx={{ mb: 2 }}>Upload public banner images. Files are restricted to the <strong>banner/</strong> Blob folder and stored as separate banner records.</Typography>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
    <Paper variant="outlined" sx={{ p: 2.5, mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Add banner</Typography>
      <input ref={inputRef} hidden type="file" accept="image/avif,image/gif,image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(300px, 1.2fr) minmax(280px, 1fr)' }, gap: 2 }}>
        <Box onClick={() => inputRef.current?.click()} sx={{ minHeight: 220, display: 'grid', placeItems: 'center', border: '2px dashed #b8c5cf', bgcolor: '#f7f9fb', cursor: 'pointer', overflow: 'hidden' }}>
          {previewUrl ? <img src={previewUrl} alt="Selected banner preview" style={{ width: '100%', height: 260, objectFit: 'contain' }} /> : <Box sx={{ textAlign: 'center' }}><AddPhotoAlternateIcon sx={{ fontSize: 48 }} /><Typography>Choose the banner image to preview</Typography></Box>}
        </Box>
        <Box sx={{ display: 'grid', gap: 1.5, alignContent: 'start' }}>
          <TextField label="Title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          <TextField required label="Image alt text" value={form.alt_text} onChange={(event) => setForm({ ...form, alt_text: event.target.value })} />
          <TextField label="Link URL (optional)" value={form.link_url} onChange={(event) => setForm({ ...form, link_url: event.target.value })} />
          <TextField type="number" label="Display order" value={form.sort_order} inputProps={{ min: 0 }} onChange={(event) => setForm({ ...form, sort_order: event.target.value })} />
          <Box><Checkbox checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />Active</Box>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={upload} disabled={!file || !form.alt_text.trim() || saving}>{saving ? 'Uploading…' : 'Upload and save banner'}</Button>
        </Box>
      </Box>
    </Paper>
    <Typography variant="h5" sx={{ mb: 1.5 }}>Saved banners ({banners.length})</Typography>
    {loading ? <CircularProgress /> : !banners.length ? <Alert severity="info">No banners have been saved yet.</Alert> : <Box sx={{ display: 'grid', gap: 2 }}>
      {banners.map((banner) => <Paper key={banner.id} variant="outlined" sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px 1fr' }, gap: 2 }}>
        <AuthenticatedBlobImage blobUrl={banner.blob_url} alt={banner.alt_text} style={{ width: '100%', height: 160, objectFit: 'contain', background: '#f4f6f8' }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5 }}>
          <TextField size="small" label="Title" value={banner.title} onChange={(event) => changeBanner(banner.id, 'title', event.target.value)} />
          <TextField size="small" label="Image alt text" value={banner.alt_text} onChange={(event) => changeBanner(banner.id, 'alt_text', event.target.value)} />
          <TextField size="small" label="Link URL" value={banner.link_url} onChange={(event) => changeBanner(banner.id, 'link_url', event.target.value)} />
          <TextField size="small" type="number" label="Display order" value={banner.sort_order} inputProps={{ min: 0 }} onChange={(event) => changeBanner(banner.id, 'sort_order', event.target.value)} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Checkbox checked={banner.is_active} onChange={(event) => changeBanner(banner.id, 'is_active', event.target.checked)} />Active<Typography variant="caption" color="text.secondary" noWrap>{banner.blob_pathname}</Typography></Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}><Button startIcon={<SaveIcon />} onClick={() => updateBanner(banner)}>Save</Button><Button color="error" startIcon={<DeleteForeverIcon />} onClick={() => removeBanner(banner)}>Delete</Button></Box>
        </Box>
      </Paper>)}
    </Box>}
  </Box>
}
