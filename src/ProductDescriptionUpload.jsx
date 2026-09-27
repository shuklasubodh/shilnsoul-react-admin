import { useEffect, useMemo, useRef, useState } from 'react'
import { Title, useDataProvider, useNotify } from 'react-admin'
import {
  Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, LinearProgress, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ListAltIcon from '@mui/icons-material/ListAlt'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import SearchIcon from '@mui/icons-material/Search'
import { useNavigate } from 'react-router-dom'
import readXlsxFile from 'read-excel-file/browser'

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const codeHeaders = ['product code', 'product code/sku', 'product sku', 'sku', 'code']
const descriptionHeaders = ['description', 'descriptions', 'product description', 'product descriptions']
const readOnlyFields = new Set(['id', 'uuid', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by', 'deleted_by', 'createdat', 'updatedat', 'deletedat'])
const defaultDescriptionFields = ['product_id', 'title', 'dimensions', 'color_description', 'pattern_craft', 'catalogue_description', 'festive_note']

const fieldName = (header, index) => {
  const normalized = normalizeHeader(header)
  if (codeHeaders.some((alias) => normalized === alias || normalized.includes(alias))) return 'product_code'
  if (descriptionHeaders.some((alias) => normalized === alias || normalized.includes(alias))) return 'description'
  return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `field_${index + 1}`
}
const fieldLabel = (field) => String(field).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const visibleRecordFields = (records) => [...new Set(records.flatMap((record) => Object.keys(record || {})))]
  .filter((field) => !['product', 'productCode', 'fields'].includes(field))

const headerIndex = (headers, aliases) => headers.findIndex((header) =>
  aliases.some((alias) => header === alias || header.includes(alias)),
)

const gridHeader = (grid) => {
  for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    const normalized = grid[rowIndex].map(normalizeHeader)
    const codeIndex = headerIndex(normalized, codeHeaders)
    const descriptionIndex = headerIndex(normalized, descriptionHeaders)
    if (codeIndex >= 0 && descriptionIndex >= 0) return { rowIndex, codeIndex, descriptionIndex }
  }
  return null
}

const rowsFromGrid = (grid) => {
  const header = gridHeader(grid)
  if (!header) return []
  const fieldNames = grid[header.rowIndex].map(fieldName)
  return grid.slice(header.rowIndex + 1).map((row) => {
    const fields = Object.fromEntries(fieldNames.map((field, index) => [field, row[index] ?? '']))
    return { productCode: String(fields.product_code ?? '').trim(), description: String(fields.description ?? '').trim(), fields }
  }).filter((row) => row.productCode && row.description)
}

const parseXlsx = async (file) => {
  const [sheet] = await readXlsxFile(file)
  if (!sheet) throw new Error('The workbook does not contain a worksheet.')
  const rows = rowsFromGrid(sheet.data)
  const header = gridHeader(sheet.data)
  const text = header
    ? sheet.data.slice(header.rowIndex + 1).map((row) => String(row[header.descriptionIndex] ?? '').trim()).filter(Boolean).join('\n')
    : sheet.data.flat().map((value) => String(value ?? '').trim()).filter(Boolean).join('\n')
  return { rows, text }
}

const parseDocx = async (file) => {
  const mammoth = await import('mammoth')
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  const document = new DOMParser().parseFromString(result.value, 'text/html')
  const tableRows = [...document.querySelectorAll('table tr')].map((row) =>
    [...row.querySelectorAll('th, td')].map((cell) => cell.textContent.trim()),
  )
  return { rows: rowsFromGrid(tableRows), text: document.body.textContent.trim() }
}

export function ProductDescriptionUpload() {
  const navigate = useNavigate()
  const dataProvider = useDataProvider()
  const notify = useNotify()
  const inputRef = useRef(null)
  const [productCode, setProductCode] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [singleDescription, setSingleDescription] = useState('')
  const [products, setProducts] = useState([])
  const [descriptionRecords, setDescriptionRecords] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [showStored, setShowStored] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [formValues, setFormValues] = useState({})
  const [deleteRecord, setDeleteRecord] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const productByCode = useMemo(() => new Map(products.map((product) => [String(product.sku).trim().toLowerCase(), product])), [products])
  const effectiveRows = useMemo(() => rows.length
    ? rows
    : productCode.trim() && singleDescription
      ? [{ productCode: productCode.trim(), description: singleDescription, fields: { product_code: productCode.trim(), description: singleDescription } }]
      : [], [productCode, rows, singleDescription])
  const previewRows = useMemo(() => effectiveRows.map((row) => ({
    ...row,
    product: productByCode.get(row.productCode.toLowerCase()),
  })), [effectiveRows, productByCode])
  const storedDescriptions = useMemo(() => descriptionRecords.map((record) => {
    const product = products.find((item) => String(item.id) === String(record.product_id))
      || productByCode.get(String(record.product_code ?? record.sku ?? '').trim().toLowerCase())
    return {
      ...record,
      product,
      productCode: record.product_code ?? record.sku ?? product?.sku ?? '',
    }
  }), [descriptionRecords, productByCode, products])
  const previewFields = useMemo(() => visibleRecordFields(effectiveRows.map((row) => row.fields)), [effectiveRows])
  const storedFields = useMemo(() => visibleRecordFields(descriptionRecords), [descriptionRecords])
  const editableFields = useMemo(() => {
    const fields = storedFields.filter((field) => !readOnlyFields.has(field))
    return fields.length ? fields : defaultDescriptionFields
  }, [storedFields])
  const filteredDescriptions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return storedDescriptions
    return storedDescriptions.filter((record) => [
      ...storedFields.map((field) => record[field]),
      record.product?.name,
      record.product?.sku,
    ].some((value) => String(value ?? '').toLowerCase().includes(query)))
  }, [searchTerm, storedDescriptions, storedFields])

  const loadProducts = async () => {
    const productResult = await dataProvider.getList('products', {
      pagination: { page: 1, perPage: 10000 }, sort: { field: 'name', order: 'ASC' }, filter: {},
    })
    setProducts(productResult.data)
    return productResult.data
  }

  const loadDescriptionRecords = async () => {
    const result = await dataProvider.getList('product-descriptions', {
      pagination: { page: 1, perPage: 10000 }, sort: { field: 'id', order: 'DESC' }, filter: {},
    })
    setDescriptionRecords(result.data)
    return result.data
  }

  useEffect(() => {
    let active = true
    Promise.all([
      dataProvider.getList('products', { pagination: { page: 1, perPage: 10000 }, sort: { field: 'name', order: 'ASC' }, filter: {} }),
      dataProvider.getList('product-descriptions', { pagination: { page: 1, perPage: 10000 }, sort: { field: 'id', order: 'DESC' }, filter: {} }),
    ]).then(([productResult, descriptionResult]) => {
      if (!active) return
      setProducts(productResult.data)
      setDescriptionRecords(descriptionResult.data)
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Uploaded descriptions could not be loaded.')
    }).finally(() => {
      if (active) setBusy(false)
    })
    return () => { active = false }
  }, [dataProvider])

  const viewStoredDescriptions = async () => {
    if (showStored) {
      setShowStored(false)
      return
    }
    setBusy(true)
    setError('')
    try {
      await Promise.all([loadProducts(), loadDescriptionRecords()])
      setShowStored(true)
    } catch (loadError) {
      setError(loadError.message || 'Uploaded descriptions could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  const openEditor = (record = null) => {
    setEditingRecord(record)
    setFormValues(Object.fromEntries(editableFields.map((field) => [field, record?.[field] ?? ''])))
    setEditorOpen(true)
  }

  const saveRecord = async () => {
    setBusy(true)
    setError('')
    try {
      const data = Object.fromEntries(editableFields.map((field) => [field, formValues[field] ?? '']))
      if (editingRecord) {
        await dataProvider.update('product-descriptions', { id: editingRecord.id, data: { ...editingRecord, ...data }, previousData: editingRecord })
        notify('Product description updated.', { type: 'success' })
      } else {
        await dataProvider.create('product-descriptions', { data })
        notify('Product description added.', { type: 'success' })
      }
      await loadDescriptionRecords()
      setEditorOpen(false)
    } catch (saveError) {
      setError(saveError.message || 'The product description could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteRecord) return
    setBusy(true)
    setError('')
    try {
      await dataProvider.delete('product-descriptions', { id: deleteRecord.id, previousData: deleteRecord })
      notify('Product description deleted.', { type: 'success' })
      await loadDescriptionRecords()
      setDeleteRecord(null)
    } catch (deleteError) {
      setError(deleteError.message || 'The product description could not be deleted.')
    } finally {
      setBusy(false)
    }
  }

  const selectFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    setRows([])
    setSingleDescription('')
    try {
      const parsed = /\.xlsx$/i.test(file.name) ? await parseXlsx(file) : await parseDocx(file)
      if (!parsed.rows.length && !parsed.text) throw new Error('No description text was found in the selected document.')
      await loadProducts()
      setRows(parsed.rows)
      setSingleDescription(parsed.rows.length ? '' : parsed.text)
      setFileName(file.name)
    } catch (parseError) {
      setError(parseError.message || 'The document could not be read.')
      setFileName('')
    } finally {
      setBusy(false)
    }
  }

  const upload = async () => {
    const matched = previewRows.filter((row) => row.product)
    if (!matched.length) return
    setBusy(true)
    setError('')
    try {
      const existingRecords = await loadDescriptionRecords()
      await Promise.all(matched.map(({ product, description, fields }) => {
        const existing = existingRecords.find((record) => String(record.product_id) === String(product.id))
        const data = {
          ...(existing || {}), ...fields, product_id: product.id,
          title: fields.title || fields.name_of_product || product.name,
          color_description: fields.color_description || fields.color,
          catalogue_description: fields.catalogue_description || description,
        }
        return existing
          ? dataProvider.update('product-descriptions', { id: existing.id, data, previousData: existing })
          : dataProvider.create('product-descriptions', { data })
      }))
      notify(`${matched.length} product description${matched.length === 1 ? '' : 's'} updated.`, { type: 'success' })
      await Promise.all([loadProducts(), loadDescriptionRecords()])
      setShowStored(true)
    } catch (uploadError) {
      setError(uploadError.message || 'Descriptions could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  const unmatchedCount = previewRows.filter((row) => !row.product).length

  return (
    <Box sx={{ p: 3 }}>
      <Title title="Upload Product Descriptions" />
      <Paper sx={{ p: 3, maxWidth: 1100 }}>
        <Typography variant="h5" gutterBottom>Upload Product Descriptions</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Upload an XLSX or DOCX table containing Product Code/SKU and Description columns. For one description document, enter the product code first.
        </Typography>
        <TextField
          label="Product Code / SKU (for a single document)"
          value={productCode}
          onChange={(event) => setProductCode(event.target.value)}
          sx={{ width: { xs: '100%', sm: 430 }, mr: 2, mb: 2 }}
        />
        <input ref={inputRef} hidden type="file" accept=".docx,.xlsx" onChange={selectFile} />
        <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose DOCX or XLSX
        </Button>
        <Button startIcon={<ListAltIcon />} onClick={viewStoredDescriptions} disabled={busy} sx={{ ml: 1 }}>
          {showStored ? 'Hide uploaded records' : 'View uploaded records'}
        </Button>
        {busy ? <LinearProgress sx={{ my: 2 }} /> : null}
        {error ? <Alert severity="error" sx={{ my: 2 }}>{error}</Alert> : null}
        {fileName ? <Typography sx={{ my: 2 }}>File: {fileName}</Typography> : null}
        {fileName && singleDescription && !productCode.trim() ? (
          <Alert severity="info" sx={{ my: 2 }}>Document loaded. Enter its Product Code/SKU above to preview and update the description.</Alert>
        ) : null}
        {previewRows.length ? (
          <>
            {unmatchedCount ? <Alert severity="warning" sx={{ mb: 2 }}>{unmatchedCount} product code(s) were not found and will be skipped.</Alert> : null}
            <Table size="small">
              <TableHead><TableRow>{previewFields.map((field) => <TableCell key={field}>{fieldLabel(field)}</TableCell>)}<TableCell>Product</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
              <TableBody>{previewRows.map((row, index) => (
                <TableRow key={`${row.productCode}-${index}`}>
                  {previewFields.map((field) => <TableCell key={field} sx={{ whiteSpace: 'pre-wrap', maxWidth: 520 }}>{String(row.fields?.[field] ?? '')}</TableCell>)}
                  <TableCell>{row.product?.name || '—'}</TableCell>
                  <TableCell>{row.product ? 'Ready' : 'Not found'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </>
        ) : null}
        <Box sx={{ display: 'flex', gap: 1, mt: 3 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/products')} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={upload} disabled={busy || !previewRows.some((row) => row.product)}>Update descriptions</Button>
        </Box>
      </Paper>
      {showStored ? (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
            <Typography variant="h6">Uploaded Product Descriptions ({filteredDescriptions.length}{searchTerm ? ` of ${storedDescriptions.length}` : ''})</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => openEditor()} disabled={busy}>Add record</Button>
          </Box>
          <TextField
            label="Search products"
            placeholder="Search by product name, SKU, or any field"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            slotProps={{ input: { startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} /> } }}
            sx={{ width: { xs: '100%', sm: 460 }, mb: 2 }}
          />
          {storedDescriptions.length ? (
            <TableContainer sx={{ overflowX: 'auto' }}><Table size="small">
              <TableHead><TableRow>{storedFields.map((field) => <TableCell key={field}>{fieldLabel(field)}</TableCell>)}<TableCell>Product</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
              <TableBody>{filteredDescriptions.map((record) => (
                <TableRow key={record.id}>
                  {storedFields.map((field) => <TableCell key={field} sx={{ whiteSpace: 'pre-wrap', minWidth: 120, maxWidth: 420 }}>{String(record[field] ?? '')}</TableCell>)}
                  <TableCell>{record.product?.name || '—'}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Edit record"><IconButton aria-label={`Edit ${record.title || record.id}`} onClick={() => openEditor(record)}><EditIcon /></IconButton></Tooltip>
                    <Tooltip title="Delete record"><IconButton color="error" aria-label={`Delete ${record.title || record.id}`} onClick={() => setDeleteRecord(record)}><DeleteIcon /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}</TableBody>
            </Table></TableContainer>
          ) : <Alert severity="info">No product descriptions have been uploaded yet.</Alert>}
          {storedDescriptions.length && !filteredDescriptions.length ? <Alert severity="info">No products match “{searchTerm}”.</Alert> : null}
        </Paper>
      ) : null}
      <Dialog open={editorOpen} onClose={() => !busy && setEditorOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingRecord ? 'Edit product description' : 'Add product description'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: '16px !important' }}>
          {editingRecord && storedFields.filter((field) => readOnlyFields.has(field)).map((field) => (
            <TextField key={field} label={fieldLabel(field)} value={editingRecord[field] ?? ''} disabled />
          ))}
          {editableFields.map((field) => field === 'product_id' ? (
            <Autocomplete
              key={field}
              options={products}
              value={products.find((product) => String(product.id) === String(formValues.product_id)) || null}
              onChange={(_event, product) => setFormValues((values) => ({ ...values, product_id: product?.id ?? '' }))}
              getOptionLabel={(product) => `${product.name || 'Unnamed product'}${product.sku ? ` (${product.sku})` : ''}`}
              isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
              renderInput={(params) => <TextField {...params} label="Search product" placeholder="Type a name or SKU" />}
            />
          ) : (
            <TextField
              key={field}
              label={fieldLabel(field)}
              value={formValues[field] ?? ''}
              onChange={(event) => setFormValues((values) => ({ ...values, [field]: event.target.value }))}
              multiline={/description|note/i.test(field)}
              minRows={/description|note/i.test(field) ? 3 : undefined}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditorOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={saveRecord} disabled={busy}>{editingRecord ? 'Save changes' : 'Add record'}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={Boolean(deleteRecord)} onClose={() => !busy && setDeleteRecord(null)}>
        <DialogTitle>Delete product description?</DialogTitle>
        <DialogContent><Typography>This permanently deletes “{deleteRecord?.title || `record ${deleteRecord?.id}`}”.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteRecord(null)} disabled={busy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={confirmDelete} disabled={busy}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
