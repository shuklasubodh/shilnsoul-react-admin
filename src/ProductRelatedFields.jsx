import { useEffect, useMemo, useState } from 'react'
import { useDataProvider, useNotify, useRecordContext } from 'react-admin'
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material'

const listParams = { pagination: { page: 1, perPage: 10000 }, sort: { field: 'id', order: 'ASC' }, filter: {} }
const belongsToProduct = (item, product) => String(item.product_id ?? '') === String(product.id)
  || String(item.product_code ?? item.sku ?? '').trim().toLowerCase() === String(product.sku ?? '').trim().toLowerCase()
const colorValue = (record) => String(record.color ?? record.color_name ?? record.name ?? '').trim()
const colorField = (record) => Object.hasOwn(record || {}, 'color_name') ? 'color_name' : Object.hasOwn(record || {}, 'name') ? 'name' : 'color'

export function ProductRelatedFields({ editableColors = false }) {
  const product = useRecordContext()
  const dataProvider = useDataProvider()
  const notify = useNotify()
  const [descriptions, setDescriptions] = useState([])
  const [colorRecords, setColorRecords] = useState([])
  const [colorsText, setColorsText] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!product?.id) return undefined
    let active = true
    Promise.all([
      dataProvider.getList('product-descriptions', listParams),
      dataProvider.getList('product-colors', listParams),
    ]).then(([descriptionResult, colorResult]) => {
      if (!active) return
      const nextDescriptions = descriptionResult.data.filter((item) => belongsToProduct(item, product))
      const nextColors = colorResult.data.filter((item) => belongsToProduct(item, product))
      setDescriptions(nextDescriptions)
      setColorRecords(nextColors)
      setColorsText(nextColors.map(colorValue).filter(Boolean).join(', '))
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Related product information could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [dataProvider, product])

  const colors = useMemo(() => colorRecords.map(colorValue).filter(Boolean), [colorRecords])

  const saveColors = async () => {
    const nextColors = [...new Set(colorsText.split(/[,;\n]+/).map((value) => value.trim()).filter(Boolean))]
    setSaving(true)
    setError('')
    try {
      const common = { product_id: product.id, product_code: product.sku }
      await Promise.all(nextColors.map((value, index) => {
        const existing = colorRecords[index]
        if (existing) {
          const field = colorField(existing)
          return dataProvider.update('product-colors', {
            id: existing.id, data: { ...existing, ...common, [field]: value }, previousData: existing,
          })
        }
        return dataProvider.create('product-colors', { data: { ...common, color: value, quantity: 0 } })
      }))
      await Promise.all(colorRecords.slice(nextColors.length).map((record) =>
        dataProvider.delete('product-colors', { id: record.id, previousData: record }),
      ))
      const result = await dataProvider.getList('product-colors', listParams)
      const refreshed = result.data.filter((item) => belongsToProduct(item, product))
      setColorRecords(refreshed)
      setColorsText(refreshed.map(colorValue).filter(Boolean).join(', '))
      notify('Product colors updated.', { type: 'success' })
    } catch (saveError) {
      setError(saveError.message || 'Product colors could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (!product?.id) return null

  return (
    <Box sx={{ width: '100%', maxWidth: 720, my: 1 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Product Description</Typography>
      {descriptions.length
        ? descriptions.map((record) => <Typography key={record.id} sx={{ whiteSpace: 'pre-wrap', mb: 1 }}>{record.description}</Typography>)
        : <Typography color="text.secondary">{loading ? 'Loading description…' : 'No description record found.'}</Typography>}
      <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>Product Colors</Typography>
      {editableColors ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'flex-start' }}>
          <TextField
            label="Colors (comma separated)"
            value={colorsText}
            onChange={(event) => setColorsText(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <Button variant="outlined" onClick={saveColors} disabled={loading || saving}>Save colors</Button>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {colors.length ? colors.map((color) => <Chip key={color} label={color} />) : <Typography color="text.secondary">No colors found.</Typography>}
        </Stack>
      )}
      {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}
    </Box>
  )
}
