import simpleRestProvider from 'ra-data-simple-rest'
import { fetchUtils, HttpError } from 'react-admin'
import { API_URL } from './apiUrl'
import { getAdminToken } from './session'

const httpClient = (url, options = {}) =>
  {
    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    const token = getAdminToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetchUtils.fetchJson(url, { ...options, headers }).catch((error) => {
      const isCategoryDeleteConflict = options.method === 'DELETE'
        && /\/categories\/[^/]+$/.test(new URL(url, window.location.origin).pathname)
        && error.status === 409
      const message = isCategoryDeleteConflict
        ? 'This category cannot be deleted because one or more products are using it. Reassign or delete those products first.'
        : error.body?.error || error.message || 'Server communication error'
      throw new HttpError(message, error.status, error.body)
    })
  }

const restProvider = simpleRestProvider(API_URL, httpClient, 'X-Total-Count')
const publicRestProvider = simpleRestProvider('/api', httpClient, 'X-Total-Count')
const providerFor = (resource) => resource === 'product-colors' ? publicRestProvider : restProvider
const singular = { users: 'user', products: 'product', categories: 'category', orders: 'order', 'product-descriptions': 'product_description' }
const unwrapRecord = (resource, response) => response?.data?.[singular[resource]]
  || response?.data
const normalizeRecord = (resource, record) => resource === 'users' && record
  ? { ...record, is_active: ['y', '1', 'true'].includes(String(record.is_active).toLowerCase()) }
  : record
const normalizeResponse = (resource, response) => ({
  ...response,
  data: Array.isArray(response.data)
    ? response.data.map((record) => normalizeRecord(resource, record))
    : normalizeRecord(resource, response.data),
})
const prepareData = (_resource, data) => data

export const dataProvider = {
  ...restProvider,
  getList: (resource, params) => providerFor(resource).getList(resource, params).then((response) => normalizeResponse(resource, response)),
  getOne: (resource, params) => providerFor(resource).getOne(resource, params).then((response) => normalizeResponse(resource, response)),
  getMany: (resource, params) => providerFor(resource).getMany(resource, params).then((response) => normalizeResponse(resource, response)),
  getManyReference: (resource, params) => providerFor(resource).getManyReference(resource, params).then((response) => normalizeResponse(resource, response)),
  create: (resource, params) => providerFor(resource).create(resource, { ...params, data: prepareData(resource, params.data) }).then((response) => ({
    ...response,
    data: normalizeRecord(resource, unwrapRecord(resource, response)),
  })),
  update: (resource, params) => providerFor(resource).update(resource, { ...params, data: prepareData(resource, params.data) }).then((response) => ({
    ...response,
    data: normalizeRecord(resource, unwrapRecord(resource, response)),
  })),
  delete: (resource, params) => providerFor(resource).delete(resource, params).then((response) => ({
    ...response,
    data: response.data?.id ? response.data : { ...params.previousData, id: params.id },
  })),
}
