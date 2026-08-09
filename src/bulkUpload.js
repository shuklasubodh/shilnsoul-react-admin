import readXlsxFile from 'read-excel-file/browser'

const HEADER_ALIASES = {
  category: ['category'],
  name: ['name'],
  sku: ['product code', 'sku'],
  stock: ['total quantity', 'stock', 'stock quantity'],
  price: ['per piece price', 'price/per unit', 'price per unit', 'price'],
  description: ['description'],
  image: ['images', 'image', 'image url'],
  place: ['place'],
  supplier: ['supplier'],
  dimension: ['dimention (inch)', 'dimension (inch)', 'dimension'],
}

const normalizeHeader = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const slugify = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const valueFor = (row, field) => {
  const alias = HEADER_ALIASES[field].find((header) => Object.hasOwn(row, header) && String(row[header] ?? '').trim() !== '')
  return alias ? row[alias] : undefined
}

const numberValue = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const descriptionFor = (row) => {
  const supplied = String(valueFor(row, 'description') ?? '').trim()
  if (supplied) return supplied
  return [
    valueFor(row, 'place') ? `Origin: ${valueFor(row, 'place')}` : '',
    valueFor(row, 'supplier') ? `Supplier: ${valueFor(row, 'supplier')}` : '',
    valueFor(row, 'dimension') ? `Dimensions: ${valueFor(row, 'dimension')} inches` : '',
  ].filter(Boolean).join(' · ')
}

export function transformCatalogRows(sheetRows, fileName, sheetName) {
  const [headers = [], ...dataRows] = sheetRows
  const normalizedHeaders = headers.map(normalizeHeader)
  const rows = dataRows
    .filter((values) => values.some((value) => String(value ?? '').trim() !== ''))
    .map((values) => Object.fromEntries(normalizedHeaders.map((header, index) => [header, values[index] ?? ''])))
  const categoriesBySlug = new Map()
  const products = []
  const errors = []
  const warnings = []
  const seenSkus = new Set()
  const seenSlugs = new Set()

  rows.forEach((row, index) => {
    const sourceRow = index + 2
    const categoryName = String(valueFor(row, 'category') ?? '').trim()
    const name = String(valueFor(row, 'name') ?? '').trim()
    const sourceSku = String(valueFor(row, 'sku') ?? '').trim()
    const duplicateSku = sourceSku && seenSkus.has(sourceSku.toLowerCase())
    const sku = duplicateSku ? `${sourceSku}-${sourceRow}` : sourceSku
    const categorySlug = slugify(categoryName)
    const price = numberValue(valueFor(row, 'price'))
    const stock = numberValue(valueFor(row, 'stock'))
    const rowErrors = []

    if (!categoryName) rowErrors.push('Category is required')
    if (!name) rowErrors.push('Name is required')
    if (!sku) rowErrors.push('Product Code/SKU is required')
    if (duplicateSku) warnings.push({ row: sourceRow, message: `Duplicate SKU "${sourceSku}" changed to "${sku}"` })
    if (price == null || price < 0) rowErrors.push('A valid non-negative price is required')
    if (stock == null || stock < 0) rowErrors.push('A valid non-negative quantity is required')

    if (rowErrors.length) {
      errors.push({ row: sourceRow, messages: rowErrors })
      return
    }

    seenSkus.add(sourceSku.toLowerCase())
    if (!categoriesBySlug.has(categorySlug)) {
      categoriesBySlug.set(categorySlug, {
        name: categoryName,
        slug: categorySlug,
        description: `Products imported from ${fileName}`,
        is_active: true,
      })
    }
    const imageValue = String(valueFor(row, 'image') ?? '').trim()
    const baseSlug = slugify(name) || slugify(sku)
    const productSlug = seenSlugs.has(baseSlug) ? `${baseSlug}-${slugify(sku)}` : baseSlug
    seenSlugs.add(productSlug)
    products.push({
      name,
      slug: productSlug,
      sku,
      category_slug: categorySlug,
      description: descriptionFor(row),
      price,
      stock_quantity: Math.floor(stock),
      image_url: /^https?:\/\//i.test(imageValue) ? imageValue : '',
      image_reference: /^https?:\/\//i.test(imageValue) ? '' : imageValue,
      image_urls: /^https?:\/\//i.test(imageValue) ? [imageValue] : [],
      is_active: true,
      source_row: sourceRow,
    })
  })

  return {
    sheetName,
    sourceRows: rows.length,
    categories: [...categoriesBySlug.values()],
    products,
    errors,
    warnings,
  }
}

export async function parseCatalogWorkbook(file) {
  const [firstSheet] = await readXlsxFile(file)
  if (!firstSheet) throw new Error('The workbook does not contain any sheets.')
  return transformCatalogRows(firstSheet.data, file.name, firstSheet.sheet)
}
