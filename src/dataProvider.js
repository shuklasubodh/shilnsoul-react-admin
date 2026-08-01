import simpleRestProvider from 'ra-data-simple-rest'
import { fetchUtils } from 'react-admin'
export const API_URL = '/api'

const httpClient = (url, options = {}) =>
  {
    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    return fetchUtils.fetchJson(url, { ...options, headers })
  }

const restProvider = simpleRestProvider(API_URL, httpClient, 'X-Total-Count')
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
const prepareData = (_resource, data) => data

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
