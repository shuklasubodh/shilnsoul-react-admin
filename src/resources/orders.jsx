/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import {
  Button, Create, Datagrid, DateField, Edit, EditButton, FunctionField, List, NumberField, NumberInput,
  ReferenceField, ReferenceInput, required, SearchInput, SelectInput, Show,
  SimpleForm, SimpleShowLayout, TextField, TextInput, TopToolbar, useGetMany, useNotify, useRecordContext, useRefresh,
} from 'react-admin'
import ArchiveIcon from '@mui/icons-material/Archive'
import DownloadIcon from '@mui/icons-material/Download'
import {
  Box, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField as MuiTextField, Typography,
} from '@mui/material'
import { API_URL, apiUrl } from '../apiUrl'
import { AuthenticatedBlobImage } from '../AuthenticatedBlobImage'
import { getAdminToken } from '../session'

const statuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].map((id) => ({ id, name: id }))
const customerApiUrl = (path) => `${API_URL.replace(/\/admin$/, '')}/${String(path).replace(/^\/+/, '')}`

const archiveRequest = async (path, options = {}) => {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json', ...options.headers },
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Order archive request failed.')
  return response
}

const OrderListActions = () => {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState(30)
  const [eligible, setEligible] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewRequests, setReviewRequests] = useState([])
  const notify = useNotify()
  const refresh = useRefresh()

  useEffect(() => {
    if (!open) return
    const timeout = setTimeout(() => {
      archiveRequest(`order-archive/eligible?retention_days=${days}`)
        .then((response) => response.json()).then((result) => setEligible(result.eligible_count))
        .catch((error) => notify(error.message, { type: 'error' }))
    }, 250)
    return () => clearTimeout(timeout)
  }, [days, notify, open])

  const archive = async () => {
    setBusy(true)
    try {
      const response = await archiveRequest('order-archive/archive', { method: 'POST', body: JSON.stringify({ retention_days: days }) })
      const result = await response.json()
      setEligible(0)
      refresh()
      notify(`${result.archived_count} order(s) archived.`, { type: 'success' })
    } catch (error) { notify(error.message, { type: 'error' }) }
    finally { setBusy(false) }
  }

  const download = async () => {
    setBusy(true)
    try {
      const response = await archiveRequest('order-archive/export')
      const blobUrl = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `order-archive-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(blobUrl)
    } catch (error) { notify(error.message, { type: 'error' }) }
    finally { setBusy(false) }
  }

  const loadReviews = async () => {
    setBusy(true)
    try {
      const response = await fetch(customerApiUrl('orders/action-requests/review'), { headers: { Authorization: `Bearer ${getAdminToken()}` } })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Review requests could not be loaded.')
      setReviewRequests(result)
      setReviewOpen(true)
    } catch (error) { notify(error.message, { type: 'error' }) }
    finally { setBusy(false) }
  }

  const decideReview = async (request, decision) => {
    const note = window.prompt(`${decision === 'APPROVED' ? 'Approval' : 'Rejection'} note (optional):`)
    if (note === null) return
    setBusy(true)
    try {
      const response = await fetch(customerApiUrl(`orders/action-requests/${request.id}/decision`), { method: 'POST', headers: { Authorization: `Bearer ${getAdminToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, note }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The decision could not be saved.')
      setReviewRequests((current) => current.filter((item) => item.id !== request.id))
      refresh()
      notify(`${request.action_type.toLowerCase()} request ${decision.toLowerCase()}.`, { type: 'success' })
    } catch (error) { notify(error.message, { type: 'error' }) }
    finally { setBusy(false) }
  }

  return <TopToolbar>
    <Button label="Cancellation & return reviews" onClick={loadReviews} disabled={busy} />
    <Button label="Order archive" onClick={() => setOpen(true)}><ArchiveIcon /></Button>
    <Dialog open={reviewOpen} onClose={() => !busy && setReviewOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>Cancellation and return reviews</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
        {!reviewRequests.length ? <Typography>No requests are awaiting review.</Typography> : reviewRequests.map((request) => <div key={request.id}>
          <Typography><strong>{request.action_type}</strong> · {request.order_number}{request.product_name ? ` · ${request.product_name}${request.color ? ` (${request.color})` : ''} × ${request.quantity}` : ''}</Typography>
          <Typography color="text.secondary">{request.reason || 'No reason supplied'}</Typography>
          <DialogActions><Button label="Reject" color="error" onClick={() => decideReview(request, 'REJECTED')} disabled={busy} /><Button label="Approve" onClick={() => decideReview(request, 'APPROVED')} disabled={busy} /></DialogActions>
        </div>)}
      </DialogContent>
      <DialogActions><Button label="Close" onClick={() => setReviewOpen(false)} disabled={busy} /></DialogActions>
    </Dialog>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="xs">
      <DialogTitle>Order archive</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '12px !important' }}>
        <MuiTextField label="Retention period (days)" type="number" value={days} inputProps={{ min: 1, max: 3650 }} onChange={(event) => setDays(Math.min(3650, Math.max(1, Number(event.target.value) || 1)))} />
        <Typography>{eligible == null ? 'Checking eligible orders...' : `${eligible} order(s) meet the archival criteria.`}</Typography>
      </DialogContent>
      <DialogActions>
        <Button label="Close" onClick={() => setOpen(false)} disabled={busy} />
        <Button label="Export CSV" onClick={download} disabled={busy}><DownloadIcon /></Button>
        <Button label="Archive eligible" onClick={archive} disabled={busy || !eligible}><ArchiveIcon /></Button>
      </DialogActions>
    </Dialog>
  </TopToolbar>
}

const OrderCustomer = (props) => {
  const record = useRecordContext()
  if (!record) return null
  if (record.user_id) {
    return <ReferenceField {...props} source="user_id" reference="users">
      <FunctionField render={(customer) => [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || customer?.email || customer?.id} />
    </ReferenceField>
  }
  return <Box>
    <Typography component="span" fontWeight={600}>Guest checkout</Typography>
    {record.shipping_name || record.contact_email || record.contact_phone
      ? <Typography component="span" variant="body2" color="text.secondary"> — {[record.shipping_name, record.contact_email, record.contact_phone].filter(Boolean).join(' · ')}</Typography>
      : null}
  </Box>
}

const OrderList = () => (
  <List actions={<OrderListActions />} filters={[<SearchInput key="search" source="q" alwaysOn />]} sort={{ field: 'created_at', order: 'DESC' }}>
    <Datagrid rowClick="show">
      <TextField source="id" /><TextField source="order_number" /><OrderCustomer label="Customer" />
      <TextField source="status" /><NumberField source="total_amount" options={{ style: 'currency', currency: 'USD' }} />
      <DateField source="customer_hidden_at" label="Hidden by customer" showTime emptyText="-" />
      <DateField source="archived_at" showTime emptyText="-" /><DateField source="created_at" showTime /><EditButton />
    </Datagrid>
  </List>
)

const OrderForm = () => (
  <SimpleForm>
    <TextInput source="order_number" />
    <ReferenceInput source="user_id" reference="users">
      <SelectInput optionText={(record) => `${record.first_name || ''} ${record.last_name || ''} (${record.email || record.id})`} validate={required()} />
    </ReferenceInput>
    <SelectInput source="status" choices={statuses} validate={required()} />
    <NumberInput source="total_amount" min={0} validate={required()} />
    <TextInput source="shipping_address" multiline rows={3} /><TextInput source="payment_status" />
  </SimpleForm>
)

const OrderEditForm = () => (
  <SimpleForm>
    <TextField source="order_number" />
    <OrderCustomer label="Customer" />
    <TextField source="payment_status" />
    <NumberField source="total_amount" options={{ style: 'currency', currency: 'USD' }} />
    <TextField source="shipping_address" />
    <SelectInput source="status" choices={statuses} validate={required()} />
  </SimpleForm>
)

const firstValue = (...values) => values.find((value) => value !== undefined && value !== null && value !== '')

const itemImageUrl = (item, product) => firstValue(
  item.image_url,
  item.product_image_url,
  item.image?.url,
  typeof item.image === 'string' ? item.image : undefined,
  item.product?.image_url,
  item.product?.images?.[0]?.url,
  item.product?.images?.[0],
  item.product?.image_urls?.[0],
  product?.image_url,
  product?.images?.[0]?.url,
  product?.images?.[0],
)

const itemName = (item, product) => firstValue(item.product_name, item.name, item.title, item.product?.name, product?.name, `Product ${item.product_id || ''}`)

const itemOptions = (item) => [
  firstValue(item.color, item.color_name, item.product_color?.color_name, item.product_color?.name),
  firstValue(item.size, item.size_name, item.product_size?.size_name, item.product_size?.name),
  firstValue(item.variant, item.variant_name),
].filter(Boolean).join(' · ')

const money = (value, currency = 'USD') => {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '—'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return amount.toFixed(2)
  }
}

const OrderItems = () => {
  const record = useRecordContext()
  const items = record?.items || record?.order_items || record?.line_items || record?.orderItems || []
  const currency = record?.currency || 'USD'
  const productIds = [...new Set(items.map((item) => item.product_id || item.product?.id).filter(Boolean))]
  const { data: products = [] } = useGetMany('products', { ids: productIds }, { enabled: productIds.length > 0 })
  const productsById = new Map(products.map((product) => [String(product.id), product]))

  return <Box sx={{ mt: 3 }}>
    <Typography variant="h6" component="h2" sx={{ mb: 1.5 }}>Order items</Typography>
    {!items.length ? <Typography color="text.secondary">No item details are available for this order.</Typography> :
      <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: 1100 }}>
        <Table aria-label="Order items">
          <TableHead>
            <TableRow>
              <TableCell>Image</TableCell>
              <TableCell>Product</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Unit price</TableCell>
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item, index) => {
              const product = productsById.get(String(item.product_id || item.product?.id))
              const quantity = Number(firstValue(item.quantity, item.qty, 1))
              const unitPrice = Number(firstValue(item.unit_price, item.price, item.product_price))
              const lineTotal = firstValue(item.total_price, item.line_total, item.subtotal, Number.isFinite(unitPrice) ? unitPrice * quantity : undefined)
              const imageUrl = itemImageUrl(item, product)
              const name = itemName(item, product)
              const options = itemOptions(item)

              return <TableRow key={item.id || item.order_item_id || `${item.product_id || name}-${index}`}>
                <TableCell sx={{ width: 96 }}>
                  {imageUrl ? <AuthenticatedBlobImage blobUrl={imageUrl} alt={name} className="order-item-image" /> :
                    <Box className="order-item-image order-item-image-placeholder">No image</Box>}
                </TableCell>
                <TableCell>
                  <Typography fontWeight={600}>{name}</Typography>
                  {options ? <Typography variant="body2" color="text.secondary">{options}</Typography> : null}
                  {item.sku || item.product?.sku || product?.sku ? <Typography variant="caption" color="text.secondary">SKU: {item.sku || item.product?.sku || product.sku}</Typography> : null}
                </TableCell>
                <TableCell align="right">{quantity}</TableCell>
                <TableCell align="right">{money(unitPrice, item.currency || currency)}</TableCell>
                <TableCell align="right">{money(lineTotal, item.currency || currency)}</TableCell>
              </TableRow>
            })}
          </TableBody>
        </Table>
      </TableContainer>}
  </Box>
}

const OrderShow = () => (
  <Show><SimpleShowLayout>
    <TextField source="id" /><TextField source="order_number" /><OrderCustomer label="Customer" />
    <TextField source="status" /><TextField source="payment_status" /><NumberField source="total_amount" />
    <TextField source="shipping_address" /><DateField source="created_at" showTime /><DateField source="updated_at" showTime />
    <OrderItems />
  </SimpleShowLayout></Show>
)

export const orderResource = {
  list: OrderList,
  create: () => <Create><OrderForm /></Create>,
  edit: () => <Edit mutationMode="pessimistic" transform={(data) => ({ status: data.status })}><OrderEditForm /></Edit>,
  show: OrderShow,
}
