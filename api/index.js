import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcrypt'

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

const databaseError = (response, error) => {
  console.error('Database request failed:', error)
  if (error.code === '42P01' || error.code === '42703') {
    return json(response, 500, { error: 'The database schema does not match this resource configuration.' })
  }
  if (error.code === '23505') return json(response, 409, { error: 'A record with that unique value already exists.' })
  if (error.code === '23503') return json(response, 409, { error: 'This record is referenced by another record.' })
  if (error.code === '23502' || error.code === '22P02') return json(response, 400, { error: 'A required field is missing or invalid.' })
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
  const route = String(request.query.route || '').replace(/^\/+|\/+$/g, '')
  const [resourceName, id, ...extra] = route.split('/')
  const sql = neon(connectionString)

  try {
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
      return json(response, 200, rows[0])
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
      return json(response, 200, rows)
    }

    if (request.method === 'POST' && !id) {
      const body = request.body || {}
      const columns = resource.columns.filter((column) => availableColumns.includes(column) && body[column] !== undefined && body[column] !== '')
      if (!columns.length) return json(response, 400, { error: 'At least one valid field is required.' })
      const values = await prepareValues(resourceName, columns, body)
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ')
      const rows = await sql.query(
        `INSERT INTO "${resource.table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${placeholders}) RETURNING ${selectColumns}`,
        values,
      )
      return json(response, 201, { message: 'Record created successfully.', [resource.responseKey]: rows[0] })
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
      return json(response, 200, { message: 'Record updated successfully.', [resource.responseKey]: rows[0] })
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
