import simpleRestProvider from 'ra-data-simple-rest'
import { fetchUtils } from 'react-admin'
const DEFAULT_API_URL = import.meta.env.DEV
  ? 'http://localhost:3000/api'
  : 'https://shilnsoul-react-admin.vercel.app/api'

export const API_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, '')

const httpClient = (url, options = {}) =>
  fetchUtils.fetchJson(url, {
    ...options,
    headers: new Headers({ Accept: 'application/json', ...(options.headers || {}) }),
  })

const restProvider = simpleRestProvider(API_URL, httpClient)
const singular = { users: 'user', products: 'product', categories: 'category', orders: 'order' }
const unwrapRecord = (resource, response) => response?.data?.[singular[resource]] || response?.data
const normalizeRecord = (resource, record) => resource === 'users' && record
  ? { ...record, is_active: ['y', '1', 'true'].includes(String(record.is_active).toLowerCase()) }
  : record
const normalizeResponse = (resource, response) => ({
  ...response,
  data: Array.isArray(response.data)
    ? response.data.map((record) => normalizeRecord(resource, record))
    : normalizeRecord(resource, response.data),
})
const prepareData = (resource, data) => resource === 'users'
  ? { ...data, is_active: data.is_active ? 'Y' : 'N' }
  : data

export const dataProvider = {
  ...restProvider,
  getList: (resource, params) => restProvider.getList(resource, params).then((response) => normalizeResponse(resource, response)),
  getOne: (resource, params) => restProvider.getOne(resource, params).then((response) => normalizeResponse(resource, response)),
  getMany: (resource, params) => restProvider.getMany(resource, params).then((response) => normalizeResponse(resource, response)),
  getManyReference: (resource, params) => restProvider.getManyReference(resource, params).then((response) => normalizeResponse(resource, response)),
  create: (resource, params) => restProvider.create(resource, { ...params, data: prepareData(resource, params.data) }).then((response) => ({
    ...response,
    data: normalizeRecord(resource, unwrapRecord(resource, response)),
  })),
  update: (resource, params) => restProvider.update(resource, { ...params, data: prepareData(resource, params.data) }).then((response) => ({
    ...response,
    data: normalizeRecord(resource, unwrapRecord(resource, response)),
  })),
  delete: (resource, params) => restProvider.delete(resource, params).then((response) => ({
    ...response,
    data: response.data?.id ? response.data : { ...params.previousData, id: params.id },
  })),
}
