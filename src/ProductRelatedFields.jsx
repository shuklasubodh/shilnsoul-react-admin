import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { useDataProvider, useNotify, useRecordContext } from 'react-admin'
import { Alert, Box, Button, Chip, IconButton, Paper, Stack, TextField, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'

const listParams = { pagination: { page: 1, perPage: 10000 }, sort: { field: 'id', order: 'ASC' }, filter: {} }
const belongsToProduct = (item, product) => String(item.product_id ?? '') === String(product.id)
const descriptionFields = [
  ['title', 'Title'],
  ['color_description', 'Color Description'],
  ['pattern_craft', 'Pattern / Craft'],
  ['catalogue_description', 'Catalogue Description'],
  ['festive_note', 'Festive Note'],
]
const emptyDescription = Object.fromEntries(descriptionFields.map(([field]) => [field, '']))
const colorDraft = (record = {}) => ({
  id: record.id,
  key: record.id ? `saved-${record.id}` : `new-${crypto.randomUUID()}`,
  color: String(record.color ?? ''),
  size: String(record.size ?? ''),
  quantity: Number(record.quantity ?? 0),
})

export const ProductRelatedFields = forwardRef(function ProductRelatedFields({ editableColors = false, stockQuantity }, ref) {
  const product = useRecordContext()
  const dataProvider = useDataProvider()
  const notify = useNotify()
  const [descriptionRecord, setDescriptionRecord] = useState(null)
  const [description, setDescription] = useState(emptyDescription)
  const [savedColors, setSavedColors] = useState([])
  const [colors, setColors] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingDescription, setSavingDescription] = useState(false)
  const [savingColors, setSavingColors] = useState(false)
  const [descriptionDirty, setDescriptionDirty] = useState(false)
  const [colorsDirty, setColorsDirty] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!product?.id) return undefined
    let active = true
    Promise.all([
      dataProvider.getList('product-descriptions', listParams),
      dataProvider.getList('product-colors', listParams),
    ]).then(([descriptionResult, colorResult]) => {
      if (!active) return
      const nextDescription = descriptionResult.data.find((item) => belongsToProduct(item, product)) || null
      const nextColors = colorResult.data.filter((item) => belongsToProduct(item, product))
      setDescriptionRecord(nextDescription)
      setDescription({ ...emptyDescription, ...(nextDescription || {}) })
      setSavedColors(nextColors)
      setColors(nextColors.map(colorDraft))
      setDescriptionDirty(false)
      setColorsDirty(false)
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Related product information could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  // The product id identifies the related records; dataProvider is stable in React Admin.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataProvider, product?.id])

  const saveDescription = async () => {
    if (!String(description.title || '').trim()) {
      setError('Description title is required.')
      return false
    }
    setSavingDescription(true)
    setError('')
    try {
      const data = { ...description, product_id: product.id }
      const result = descriptionRecord
        ? await dataProvider.update('product-descriptions', { id: descriptionRecord.id, data, previousData: descriptionRecord })
        : await dataProvider.create('product-descriptions', { data })
      setDescriptionRecord(result.data)
      setDescription({ ...emptyDescription, ...result.data })
      setDescriptionDirty(false)
      notify('Product description updated.', { type: 'success' })
      return true
    } catch (saveError) {
      setError(saveError.message || 'Product description could not be saved.')
      return false
    } finally {
      setSavingDescription(false)
    }
  }

  const saveColors = async () => {
    const normalized = colors.map((item) => ({ ...item, color: item.color.trim(), size: item.size.trim(), quantity: Number(item.quantity) }))
    if (normalized.some((item) => !item.color || !Number.isInteger(item.quantity) || item.quantity < 0)) {
      setError('Every color requires a name and a non-negative whole-number quantity.')
      return false
    }
    const names = normalized.map((item) => `${item.color.toLowerCase()}|${item.size.toLowerCase()}`)
    if (new Set(names).size !== names.length) {
      setError('Each color and size combination must be unique for this product.')
      return false
    }
    const productQuantity = Number(stockQuantity ?? product.stock_quantity)
    const totalColorQuantity = normalized.reduce((total, item) => total + item.quantity, 0)
    if (!Number.isFinite(productQuantity) || productQuantity < 0) {
      setError('Enter a valid product stock quantity before saving colors.')
      return false
    }
    if (totalColorQuantity > productQuantity) {
      setError(`Total color quantity (${totalColorQuantity}) cannot exceed product stock quantity (${productQuantity}).`)
      return false
    }
    setSavingColors(true)
    setError('')
    try {
      const retainedIds = new Set(normalized.filter((item) => item.id).map((item) => String(item.id)))
      await Promise.all(normalized.map((item) => {
        const data = { product_id: product.id, color: item.color, size: item.size, quantity: item.quantity }
        const previous = item.id ? savedColors.find((record) => String(record.id) === String(item.id)) : null
        return item.id
          ? dataProvider.update('product-colors', { id: item.id, data: { ...previous, ...data }, previousData: previous })
          : dataProvider.create('product-colors', { data })
      }))
      await Promise.all(savedColors.filter((record) => !retainedIds.has(String(record.id))).map((record) =>
        dataProvider.delete('product-colors', { id: record.id, previousData: record }),
      ))
      const result = await dataProvider.getList('product-colors', listParams)
      const refreshed = result.data.filter((item) => belongsToProduct(item, product))
      setSavedColors(refreshed)
      setColors(refreshed.map(colorDraft))
      setColorsDirty(false)
      notify('Product colors updated.', { type: 'success' })
      return true
    } catch (saveError) {
      setError(saveError.message || 'Product colors could not be saved.')
      return false
    } finally {
      setSavingColors(false)
    }
  }

  useImperativeHandle(ref, () => ({
    saveAll: async () => {
      if (descriptionDirty && !await saveDescription()) throw new Error('Product description could not be saved.')
      if (colorsDirty && !await saveColors()) throw new Error('Product colors could not be saved.')
    },
  }))

  if (!product?.id) return null

  if (!editableColors) {
    return (
      <Box sx={{ width: '100%', maxWidth: 900, my: 1 }}>
        <Typography variant="subtitle2">Product Description</Typography>
        <Typography sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>{description.catalogue_description || 'No description found.'}</Typography>
        <Typography variant="subtitle2">Product Colors</Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {colors.length ? colors.map((item) => <Chip key={item.key} label={`${item.color}${item.size ? ` / ${item.size}` : ''} (${item.quantity})`} />) : <Typography color="text.secondary">No colors found.</Typography>}
        </Stack>
      </Box>
    )
  }

  return (
    <Stack spacing={2.5} sx={{ width: '100%', maxWidth: 900, my: 2 }}>
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="h6" gutterBottom>Product Description</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Stored in the product_description table.</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {descriptionFields.map(([field, label]) => (
            <TextField
              key={field}
              label={label}
              value={description[field] ?? ''}
              onChange={(event) => { setDescription((current) => ({ ...current, [field]: event.target.value })); setDescriptionDirty(true) }}
              multiline={['catalogue_description', 'festive_note'].includes(field)}
              minRows={['catalogue_description', 'festive_note'].includes(field) ? 3 : undefined}
              fullWidth
            />
          ))}
        </Box>
        <Button variant="contained" onClick={saveDescription} disabled={loading || savingDescription} sx={{ mt: 2 }}>
          Update Description
        </Button>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="h6" gutterBottom>Product Colors</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>Stored as separate records in the product_color table.</Typography>
        <Stack spacing={1.5}>
          {colors.map((item, index) => (
            <Stack key={item.key} direction="row" spacing={1} alignItems="center">
              <TextField label="Color" value={item.color} onChange={(event) => { setColors((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, color: event.target.value } : row)); setColorsDirty(true) }} fullWidth />
              <TextField label="Size" value={item.size} onChange={(event) => { setColors((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, size: event.target.value } : row)); setColorsDirty(true) }} sx={{ width: 180 }} />
              <TextField label="Quantity" type="number" slotProps={{ htmlInput: { min: 0, step: 1 } }} value={item.quantity} onChange={(event) => { setColors((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row)); setColorsDirty(true) }} sx={{ width: 150 }} />
              <IconButton aria-label={`Remove ${item.color || 'color'}`} color="error" onClick={() => { setColors((current) => current.filter((_, rowIndex) => rowIndex !== index)); setColorsDirty(true) }}><DeleteIcon /></IconButton>
            </Stack>
          ))}
          {!colors.length ? <Typography color="text.secondary">No colors added.</Typography> : null}
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button startIcon={<AddIcon />} onClick={() => { setColors((current) => [...current, colorDraft()]); setColorsDirty(true) }}>Add Color</Button>
          <Button variant="contained" onClick={saveColors} disabled={loading || savingColors}>Update Colors</Button>
        </Stack>
      </Paper>
      {error ? <Alert severity="error">{error}</Alert> : null}
    </Stack>
  )
})
