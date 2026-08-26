import { useMemo, useRef, useState } from 'react'
import { Title, useDataProvider, useNotify } from 'react-admin'
import {
  Alert, Box, Button, LinearProgress, Paper, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from '@mui/material'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ListAltIcon from '@mui/icons-material/ListAlt'
import { useNavigate } from 'react-router-dom'
import readXlsxFile from 'read-excel-file/browser'

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const codeHeaders = ['product code', 'product code/sku', 'product sku', 'sku', 'code']
const descriptionHeaders = ['description', 'descriptions', 'product description', 'product descriptions']
const systemFields = new Set(['id', 'product_id', 'uuid', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by', 'deleted_by', 'createdat', 'updatedat', 'deletedat'])

const fieldName = (header, index) => {
  const normalized = normalizeHeader(header)
  if (codeHeaders.some((alias) => normalized === alias || normalized.includes(alias))) return 'product_code'
  if (descriptionHeaders.some((alias) => normalized === alias || normalized.includes(alias))) return 'description'
  return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `field_${index + 1}`
}
const fieldLabel = (field) => String(field).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const visibleRecordFields = (records) => [...new Set(records.flatMap((record) => Object.keys(record || {})))]
  .filter((field) => !systemFields.has(field) && !['product', 'productCode', 'fields'].includes(field))

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
  const [busy, setBusy] = useState(false)
  const [showStored, setShowStored] = useState(false)

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
        <Paper sx={{ p: 3, maxWidth: 1100, mt: 3 }}>
          <Typography variant="h6" gutterBottom>Uploaded Product Descriptions ({storedDescriptions.length})</Typography>
          {storedDescriptions.length ? (
            <Table size="small">
              <TableHead><TableRow>{storedFields.map((field) => <TableCell key={field}>{fieldLabel(field)}</TableCell>)}<TableCell>Product</TableCell></TableRow></TableHead>
              <TableBody>{storedDescriptions.map((record) => (
                <TableRow key={record.id}>
                  {storedFields.map((field) => <TableCell key={field} sx={{ whiteSpace: 'pre-wrap', maxWidth: 650 }}>{String(record[field] ?? '')}</TableCell>)}
                  <TableCell>{record.product?.name || '—'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          ) : <Alert severity="info">No product descriptions have been uploaded yet.</Alert>}
        </Paper>
      ) : null}
    </Box>
  )
}
