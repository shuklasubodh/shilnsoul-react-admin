/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import {
  Button, Create, Datagrid, DateField, Edit, EditButton, List, NumberField, NumberInput,
  ReferenceField, ReferenceInput, required, SearchInput, SelectInput, Show,
  SimpleForm, SimpleShowLayout, TextField, TextInput, TopToolbar, useNotify, useRefresh,
} from 'react-admin'
import ArchiveIcon from '@mui/icons-material/Archive'
import DownloadIcon from '@mui/icons-material/Download'
import { Dialog, DialogActions, DialogContent, DialogTitle, TextField as MuiTextField, Typography } from '@mui/material'
import { apiUrl } from '../apiUrl'
import { getAdminToken } from '../session'

const statuses = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'].map((id) => ({ id, name: id }))

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

  return <TopToolbar>
    <Button label="Order archive" onClick={() => setOpen(true)}><ArchiveIcon /></Button>
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

const OrderList = () => (
  <List actions={<OrderListActions />} filters={[<SearchInput key="search" source="q" alwaysOn />]} sort={{ field: 'created_at', order: 'DESC' }}>
    <Datagrid rowClick="show">
      <TextField source="id" /><TextField source="order_number" /><ReferenceField source="user_id" reference="users" />
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

const OrderShow = () => (
  <Show><SimpleShowLayout>
    <TextField source="id" /><TextField source="order_number" /><ReferenceField source="user_id" reference="users" />
    <TextField source="status" /><TextField source="payment_status" /><NumberField source="total_amount" />
    <TextField source="shipping_address" /><DateField source="created_at" showTime /><DateField source="updated_at" showTime />
  </SimpleShowLayout></Show>
)

export const orderResource = {
  list: OrderList,
  create: () => <Create><OrderForm /></Create>,
  edit: () => <Edit mutationMode="pessimistic"><OrderForm /></Edit>,
  show: OrderShow,
}
