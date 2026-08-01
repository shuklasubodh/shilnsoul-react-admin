/* eslint-disable react-refresh/only-export-components */
import {
  Create, Datagrid, DateField, Edit, EditButton, List, NumberField, NumberInput,
  ReferenceField, ReferenceInput, required, SearchInput, SelectInput, Show,
  SimpleForm, SimpleShowLayout, TextField, TextInput,
} from 'react-admin'

const statuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((id) => ({ id, name: id }))

const OrderList = () => (
  <List filters={[<SearchInput key="search" source="q" alwaysOn />]} sort={{ field: 'created_at', order: 'DESC' }}>
    <Datagrid rowClick="show">
      <TextField source="id" /><TextField source="order_number" /><ReferenceField source="user_id" reference="users" />
      <TextField source="status" /><NumberField source="total_amount" options={{ style: 'currency', currency: 'USD' }} />
      <DateField source="created_at" showTime /><EditButton />
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
