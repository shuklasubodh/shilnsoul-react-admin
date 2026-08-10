import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { createHash, timingSafeEqual } from 'node:crypto'
import { handleUpload } from '@vercel/blob/client'
import { del as deleteBlob, list as listBlobs } from '@vercel/blob'

const BCRYPT_ROUNDS = 12
const bcryptHashPattern = /^\$2[aby]\$\d{2}\$.{53}$/

const resources = {
  users: {
    table: 'users',
    columns: ['first_name', 'last_name', 'email', 'password_hash', 'phone', 'role', 'is_active'],
    publicColumns: ['id', 'first_name', 'last_name', 'email', 'phone', 'role', 'is_active', 'created_at', 'updated_at'],
    searchColumns: ['first_name', 'last_name', 'email', 'phone', 'role'],
    responseKey: 'user',
  },
  products: {
    table: 'products',
    columns: ['name', 'slug', 'sku', 'category_id', 'description', 'price', 'stock_quantity', 'image_url', 'is_active'],
    publicColumns: ['id', 'name', 'slug', 'sku', 'category_id', 'description', 'price', 'stock_quantity', 'image_url', 'is_active', 'created_at', 'updated_at'],
    searchColumns: ['name', 'slug', 'sku', 'description'],
    responseKey: 'product',
  },
  categories: {
    table: 'categories',
    columns: ['name', 'slug', 'description', 'is_active'],
    publicColumns: ['id', 'name', 'slug', 'description', 'is_active', 'created_at', 'updated_at'],
    searchColumns: ['name', 'slug', 'description'],
    responseKey: 'category',
  },
  orders: {
    table: 'orders',
    columns: ['order_number', 'user_id', 'status', 'total_amount', 'shipping_address', 'payment_status'],
    publicColumns: ['id', 'order_number', 'user_id', 'status', 'total_amount', 'shipping_address', 'payment_status', 'created_at', 'updated_at'],
    searchColumns: ['order_number', 'status', 'shipping_address', 'payment_status'],
    responseKey: 'order',
  },
}

const json = (response, status, body) => response.status(status).json(body)
const positiveId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0

const matchesLegacyPassword = (password, storedValue) => {
  const supplied = Buffer.from(String(password))
  const stored = Buffer.from(String(storedValue))
  return supplied.length === stored.length && timingSafeEqual(supplied, stored)
}

const prepareValues = async (resourceName, columns, body) => Promise.all(
  columns.map(async (column) => {
    const value = body[column]
    if (resourceName !== 'users' || column !== 'password_hash' || bcryptHashPattern.test(String(value))) return value
    return bcrypt.hash(String(value), BCRYPT_ROUNDS)
  }),
)

const parseJson = (value, fallback) => {
  if (!value) return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

const productImages = (value) => {
  if (!value) return []
  if (Array.isArray(value)) return value.filter((url) => /^https?:\/\//i.test(String(url)))
  const parsed = parseJson(value, null)
  return Array.isArray(parsed) ? parsed.filter((url) => /^https?:\/\//i.test(String(url))) : (/^https?:\/\//i.test(String(value)) ? [String(value)] : [])
}

const publicRecord = (resourceName, record) => {
  if (resourceName !== 'products' || !record) return record
  const images = productImages(record.image_url)
  return { ...record, image_url: images[0] || '', images }
}

const validBlobUrl = (value) => {
  try {
    const url = new URL(String(value))
    return url.protocol === 'https:' && url.hostname.endsWith('.blob.vercel-storage.com')
  } catch { return false }
}

const ensureProductImagesTable = async (sql) => {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS product_images (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      blob_url TEXT NOT NULL,
      blob_pathname TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (product_id, blob_url)
    )
  `)
  await sql.query('CREATE INDEX IF NOT EXISTS product_images_product_id_idx ON product_images(product_id, sort_order, id)')
  await sql.query('CREATE UNIQUE INDEX IF NOT EXISTS product_images_one_primary_idx ON product_images(product_id) WHERE is_primary')
}

const databaseError = (response, error) => {
  console.error('Database request failed:', error)
  if (error.code === '42P01' || error.code === '42703') {
    return json(response, 500, { error: 'The database schema does not match this resource configuration.' })
  }
  if (error.code === '23505') return json(response, 409, { error: 'A record with that unique value already exists.' })
  if (error.code === '23503') return json(response, 409, { error: 'This record is referenced by another record.' })
  if (error.code === '23502' || error.code === '23514' || error.code === '22P02') return json(response, 400, { error: 'A required field is missing or invalid.' })
  return json(response, 500, { error: 'Database request failed.' })
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,Authorization')
  response.setHeader('Access-Control-Expose-Headers', 'X-Total-Count')
  if (request.method === 'OPTIONS') return response.status(204).end()

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!connectionString) return json(response, 500, { error: 'DATABASE_URL is not configured for this deployment.' })
  const authSecret = process.env.ADMIN_JWT_SECRET || createHash('sha256')
    .update(`shilpnsoul-admin:${connectionString}`)
    .digest('hex')
  const route = String(request.query.route || '').replace(/^\/+|\/+$/g, '')
  const [resourceName, id, ...extra] = route.split('/')
  const sql = neon(connectionString)

  try {
    if (resourceName === 'blob-upload' && !id && !extra.length && request.method === 'POST') {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.error('[blob-upload] BLOB_READ_WRITE_TOKEN is not configured')
        return json(response, 503, { error: 'Image storage is not configured. Connect a Vercel Blob store to this project.' })
      }
      try {
        const result = await handleUpload({
          request,
          body: request.body,
          onBeforeGenerateToken: async (_pathname, clientPayload) => {
            const { adminToken } = parseJson(clientPayload, {})
            const session = jwt.verify(adminToken || '', authSecret, { issuer: 'shilpnsoul-admin' })
            if (session.role !== 'ADMIN') throw new Error('Administrator access is required.')
            return {
              allowedContentTypes: ['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'],
              addRandomSuffix: true,
            }
          },
          onUploadCompleted: async () => {},
        })
        return json(response, 200, result)
      } catch (error) {
        console.error('[blob-upload] Failed to issue or complete an upload token:', error)
        return json(response, 400, { error: error.message || 'Image upload authorization failed.' })
      }
    }

    if (resourceName === 'auth' && id === 'login' && !extra.length && request.method === 'POST') {
      const { email, password } = request.body || {}
      if (!email || !password) return json(response, 400, { error: 'Email and password are required.' })
      const rows = await sql.query(
        'SELECT id, first_name, last_name, email, password_hash, role, is_active FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [String(email).trim()],
      )
      const user = rows[0]
      const active = user && ['true', '1', 'y'].includes(String(user.is_active).toLowerCase())
      const admin = user && String(user.role).toUpperCase() === 'ADMIN'
      let passwordMatches = false
      if (user?.password_hash) {
        passwordMatches = bcryptHashPattern.test(user.password_hash)
          ? await bcrypt.compare(String(password), user.password_hash)
          : matchesLegacyPassword(password, user.password_hash)
      }
      if (!user || !active || !admin || !passwordMatches) {
        return json(response, 401, { error: 'Invalid credentials or administrator access is not permitted.' })
      }
      if (!bcryptHashPattern.test(user.password_hash)) {
        const migratedHash = await bcrypt.hash(String(password), BCRYPT_ROUNDS)
        await sql.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [migratedHash, user.id])
      }
      const identity = { id: String(user.id), fullName: `${user.first_name} ${user.last_name}`.trim(), email: user.email, role: 'ADMIN' }
      const token = jwt.sign(identity, authSecret, { expiresIn: '8h', issuer: 'shilpnsoul-admin' })
      return json(response, 200, { token, user: identity })
    }

    const authorization = request.headers.authorization || ''
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
    try {
      const session = jwt.verify(token, authSecret, { issuer: 'shilpnsoul-admin' })
      if (session.role !== 'ADMIN') return json(response, 403, { error: 'Administrator access is required.' })
    } catch {
      return json(response, 401, { error: 'Authentication is required.' })
    }

    if (resourceName === 'blob-images' && !id && !extra.length) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) return json(response, 503, { error: 'Connect a Vercel Blob store to manage product images.' })
      if (request.method === 'GET') {
        const result = await listBlobs({ prefix: 'products/', limit: 1000, cursor: request.query.cursor || undefined })
        return json(response, 200, result)
      }
      if (request.method === 'DELETE') {
        const blobUrl = request.body?.blob_url
        if (!validBlobUrl(blobUrl)) return json(response, 400, { error: 'A valid Vercel Blob URL is required.' })
        await deleteBlob(String(blobUrl))
        await ensureProductImagesTable(sql)
        const removedMappings = await sql.query('DELETE FROM product_images WHERE blob_url = $1 RETURNING id', [String(blobUrl)])
        return json(response, 200, { deleted: true, removed_mappings: removedMappings.length })
      }
      return json(response, 405, { error: 'Method not allowed.' })
    }

    if (resourceName === 'product-images' && !extra.length) {
      await ensureProductImagesTable(sql)
      if (request.method === 'GET' && !id) {
        const rows = await sql.query(`
          SELECT pi.*, p.name AS product_name, p.sku AS product_sku
          FROM product_images pi
          JOIN products p ON p.id = pi.product_id
          ORDER BY p.name, pi.sort_order, pi.id
        `)
        return json(response, 200, rows)
      }
      if (request.method === 'POST' && !id) {
        const { product_id: productId, blob_url: blobUrl, blob_pathname: blobPathname = '', sort_order: sortOrder = 0, is_primary: isPrimary = false } = request.body || {}
        if (!positiveId(productId) || !validBlobUrl(blobUrl)) return json(response, 400, { error: 'A valid product and public Vercel Blob URL are required.' })
        const products = await sql.query('SELECT id FROM products WHERE id = $1', [productId])
        if (!products.length) return json(response, 404, { error: 'Product not found.' })
        if (isPrimary) await sql.query('UPDATE product_images SET is_primary = FALSE, updated_at = NOW() WHERE product_id = $1', [productId])
        const rows = await sql.query(`
          INSERT INTO product_images (product_id, blob_url, blob_pathname, sort_order, is_primary)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (product_id, blob_url) DO UPDATE SET
            blob_pathname = EXCLUDED.blob_pathname,
            sort_order = EXCLUDED.sort_order,
            is_primary = EXCLUDED.is_primary,
            updated_at = NOW()
          RETURNING *
        `, [productId, String(blobUrl), String(blobPathname), Math.max(0, Math.floor(Number(sortOrder) || 0)), Boolean(isPrimary)])
        return json(response, 200, rows[0])
      }
      if (request.method === 'DELETE' && id && positiveId(id)) {
        const rows = await sql.query('DELETE FROM product_images WHERE id = $1 RETURNING id', [id])
        return rows.length ? json(response, 200, rows[0]) : json(response, 404, { error: 'Image mapping not found.' })
      }
      return json(response, 405, { error: 'Method not allowed.' })
    }

    if (resourceName === 'bulk-import' && !id && !extra.length && request.method === 'POST') {
      const categories = Array.isArray(request.body?.categories) ? request.body.categories : []
      const products = Array.isArray(request.body?.products) ? request.body.products : []
      if (!categories.length && !products.length) return json(response, 400, { error: 'At least one category or product is required.' })
      if (categories.length > 500 || products.length > 2000) return json(response, 400, { error: 'A single upload is limited to 500 categories and 2,000 products.' })

      const invalidCategory = categories.find((item) => !item?.name || !item?.slug)
      const invalidProduct = products.find((item) => !item?.name || !item?.slug || !item?.sku || !item?.category_slug || Number(item.price) < 0 || Number(item.stock_quantity) < 0)
      if (invalidCategory || invalidProduct) return json(response, 400, { error: 'The upload contains missing or invalid required fields.' })

      const categoryIds = new Map()
      const categoryResult = { created: 0, updated: 0 }
      const productResult = { created: 0, updated: 0 }

      for (const category of categories) {
        const existing = await sql.query('SELECT id FROM categories WHERE LOWER(slug) = LOWER($1) OR LOWER(name) = LOWER($2) LIMIT 1', [String(category.slug).trim(), String(category.name).trim()])
        if (existing.length) {
          await sql.query(
            'UPDATE categories SET name = $1, slug = $2, description = $3, is_active = $4, updated_at = NOW() WHERE id = $5',
            [String(category.name).trim(), String(category.slug).trim(), String(category.description || ''), category.is_active !== false, existing[0].id],
          )
          categoryIds.set(String(category.slug).toLowerCase(), existing[0].id)
          categoryResult.updated += 1
        } else {
          const created = await sql.query(
            'INSERT INTO categories (name, slug, description, is_active) VALUES ($1, $2, $3, $4) RETURNING id',
            [String(category.name).trim(), String(category.slug).trim(), String(category.description || ''), category.is_active !== false],
          )
          categoryIds.set(String(category.slug).toLowerCase(), created[0].id)
          categoryResult.created += 1
        }
      }

      for (const product of products) {
        const categoryKey = String(product.category_slug).toLowerCase()
        let categoryId = categoryIds.get(categoryKey)
        if (!categoryId) {
          const category = await sql.query('SELECT id FROM categories WHERE LOWER(slug) = LOWER($1) LIMIT 1', [categoryKey])
          categoryId = category[0]?.id
        }
        if (!categoryId) return json(response, 400, { error: `No category was found for product SKU ${product.sku}.` })

        const values = [
          String(product.name).trim(), String(product.slug).trim(), String(product.sku).trim(), categoryId,
          String(product.description || ''), Number(product.price), Math.floor(Number(product.stock_quantity)),
          JSON.stringify(productImages(product.image_urls?.length ? product.image_urls : product.image_url)), product.is_active !== false,
        ]
        const existing = await sql.query('SELECT id FROM products WHERE LOWER(sku) = LOWER($1) LIMIT 1', [String(product.sku).trim()])
        if (existing.length) {
          await sql.query(
            'UPDATE products SET name = $1, slug = $2, sku = $3, category_id = $4, description = $5, price = $6, stock_quantity = $7, image_url = $8, is_active = $9, updated_at = NOW() WHERE id = $10',
            [...values, existing[0].id],
          )
          productResult.updated += 1
        } else {
          await sql.query(
            'INSERT INTO products (name, slug, sku, category_id, description, price, stock_quantity, image_url, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
            values,
          )
          productResult.created += 1
        }
      }

      return json(response, 200, { message: 'Bulk import completed.', categories: categoryResult, products: productResult })
    }

    const resource = resources[resourceName]
    if (!resource || extra.length || (id && !positiveId(id))) return json(response, 404, { error: 'API route not found.' })

    const schemaColumns = await sql.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
      [resource.table],
    )
    if (!schemaColumns.length) return json(response, 404, { error: `Database table "${resource.table}" does not exist.` })
    const availableColumns = schemaColumns.map(({ column_name }) => column_name)
    const readableColumns = availableColumns.filter((column) => column !== 'password_hash')
    const selectColumns = readableColumns.map((column) => `"${column}"`).join(', ')

    if (request.method === 'GET' && id) {
      const rows = await sql.query(`SELECT ${selectColumns} FROM "${resource.table}" WHERE id = $1`, [id])
      if (!rows.length) return json(response, 404, { error: 'Record not found.' })
      return json(response, 200, publicRecord(resourceName, rows[0]))
    }

    if (request.method === 'GET') {
      const filter = parseJson(request.query.filter, {})
      const sort = parseJson(request.query.sort, [request.query._sort || 'id', request.query._order || 'ASC'])
      const range = parseJson(request.query.range, [request.query._start || 0, (request.query._end || 10) - 1])
      const start = Math.max(0, Number(range[0]) || 0)
      const end = Math.max(start, Number(range[1]) || start + 9)
      const sortField = readableColumns.includes(sort[0]) ? sort[0] : (readableColumns.includes('id') ? 'id' : readableColumns[0])
      const sortOrder = String(sort[1]).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
      const clauses = []
      const values = []
      const q = filter.q ?? request.query._q

      if (q) {
        const searchableColumns = resource.searchColumns.filter((column) => readableColumns.includes(column))
        if (searchableColumns.length) {
          values.push(`%${q}%`)
          clauses.push(`(${searchableColumns.map((column) => `CAST("${column}" AS TEXT) ILIKE $${values.length}`).join(' OR ')})`)
        }
      }
      for (const [key, value] of Object.entries(filter)) {
        if (key === 'q' || !readableColumns.includes(key) || value === '' || value == null) continue
        if (Array.isArray(value)) {
          values.push(value)
          clauses.push(`"${key}" = ANY($${values.length})`)
        } else {
          values.push(value)
          clauses.push(`"${key}" = $${values.length}`)
        }
      }

      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
      const [{ count }] = await sql.query(`SELECT COUNT(*)::int AS count FROM "${resource.table}"${where}`, values)
      const listValues = [...values, end - start + 1, start]
      const rows = await sql.query(
        `SELECT ${selectColumns} FROM "${resource.table}"${where} ORDER BY "${sortField}" ${sortOrder} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        listValues,
      )
      response.setHeader('X-Total-Count', String(count))
      return json(response, 200, rows.map((record) => publicRecord(resourceName, record)))
    }

    if (request.method === 'POST' && !id) {
      const body = request.body || {}
      if (resourceName === 'users') {
        const requiredFields = ['first_name', 'last_name', 'email', 'password_hash', 'phone', 'role', 'is_active']
        const missingFields = requiredFields.filter((field) => body[field] === undefined || body[field] === '')
        if (missingFields.length) return json(response, 400, { error: `Missing required fields: ${missingFields.join(', ')}.` })
      }
      const columns = resource.columns.filter((column) => availableColumns.includes(column) && body[column] !== undefined && body[column] !== '')
      if (!columns.length) return json(response, 400, { error: 'At least one valid field is required.' })
      const values = await prepareValues(resourceName, columns, body)
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
      const rows = await sql.query(
        `INSERT INTO "${resource.table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${placeholders}) RETURNING ${selectColumns}`,
        values,
      )
      return json(response, 201, { message: 'Record created successfully.', [resource.responseKey]: publicRecord(resourceName, rows[0]) })
    }

    if (request.method === 'PUT' && id) {
      const body = request.body || {}
      const columns = resource.columns.filter((column) => availableColumns.includes(column) && body[column] !== undefined && body[column] !== '')
      if (!columns.length) return json(response, 400, { error: 'At least one valid field is required.' })
      const values = await prepareValues(resourceName, columns, body)
      values.push(id)
      const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`)
      if (availableColumns.includes('updated_at')) assignments.push('"updated_at" = NOW()')
      const rows = await sql.query(
        `UPDATE "${resource.table}" SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING ${selectColumns}`,
        values,
      )
      if (!rows.length) return json(response, 404, { error: 'Record not found.' })
      return json(response, 200, { message: 'Record updated successfully.', [resource.responseKey]: publicRecord(resourceName, rows[0]) })
    }

    if (request.method === 'DELETE' && id) {
      const rows = await sql.query(`DELETE FROM "${resource.table}" WHERE id = $1 RETURNING id`, [id])
      if (!rows.length) return json(response, 404, { error: 'Record not found.' })
      return json(response, 200, { message: 'Record deleted successfully.', id: rows[0].id })
    }

    response.setHeader('Allow', 'GET,POST,PUT,DELETE,OPTIONS')
    return json(response, 405, { error: 'Method not allowed.' })
  } catch (error) {
    return databaseError(response, error)
  }
}
