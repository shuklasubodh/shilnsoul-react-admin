/* eslint-disable react-refresh/only-export-components */
import { BooleanField, BooleanInput, Create, Datagrid, DateField, Edit, EditButton, EmailField, List, NumberField, NumberInput, PasswordInput, required, SearchInput, SelectInput, Show, SimpleForm, SimpleShowLayout, TextField, TextInput } from 'react-admin'
import CountryCodeInput from '../CountryCodeInput'
import { validateUniquePhone } from '../userValidation'

const roles = [{ id: 'ADMIN', name: 'Admin' }, { id: 'CUSTOMER', name: 'Customer' }]
const channels = [{ id: 'EMAIL', name: 'Email' }, { id: 'SMS', name: 'SMS' }, { id: 'WHATSAPP', name: 'WhatsApp' }]
const UserList = () => <List filters={[<SearchInput key="search" source="q" alwaysOn />]}><Datagrid rowClick="show">
  <TextField source="id" /><TextField source="first_name" /><TextField source="last_name" /><EmailField source="email" />
  <TextField source="country_code" label="Country code" /><TextField source="phone" label="SMS phone" /><TextField source="whatsapp_number" label="WhatsApp" /><TextField source="preferred_notification_channel" label="Preferred channel" /><NumberField source="return_window_days" label="Return days" /><TextField source="role" /><BooleanField source="is_active" /><DateField source="created_at" showTime /><EditButton />
</Datagrid></List>
const UserForm = ({ creating = false }) => <SimpleForm autoComplete={creating ? 'off' : undefined}>
  <TextInput source="first_name" validate={required()} /><TextInput source="last_name" validate={required()} />
  <TextInput source="email" type="email" autoComplete={creating ? 'off' : 'email'} validate={required()} /><CountryCodeInput />
  <TextInput source="phone" label="Mobile number (local or E.164)" helperText="Example: 90032305; the selected calling code is added automatically." validate={creating ? [required(), validateUniquePhone] : required()} />
  <TextInput source="whatsapp_number" label="WhatsApp number (local or E.164)" helperText="May be the same as the SMS number." validate={required()} />
  <PasswordInput source="password_hash" label={creating ? 'Password' : 'New password (optional)'} autoComplete="new-password" validate={creating ? required() : undefined} />
  <SelectInput source="preferred_notification_channel" choices={channels} defaultValue="EMAIL" validate={required()} />
  <NumberInput source="return_window_days" label="Return window (days)" min={0} max={365} defaultValue={2} validate={required()} />
  <SelectInput source="role" choices={roles} validate={required()} /><BooleanInput source="is_active" defaultValue />
</SimpleForm>
const UserShow = () => <Show><SimpleShowLayout>
  <TextField source="id" /><TextField source="first_name" /><TextField source="last_name" /><EmailField source="email" />
  <TextField source="country_code" label="Country code" /><TextField source="phone" label="SMS phone" /><TextField source="whatsapp_number" label="WhatsApp" /><TextField source="role" /><BooleanField source="is_active" />
  <TextField source="preferred_notification_channel" label="Preferred channel" /><NumberField source="return_window_days" label="Return window (days)" />
  <DateField source="email_verified_at" showTime emptyText="Not verified" /><DateField source="phone_verified_at" showTime emptyText="Not verified" /><DateField source="whatsapp_verified_at" showTime emptyText="Not verified" />
  <DateField source="created_at" showTime /><DateField source="updated_at" showTime />
</SimpleShowLayout></Show>

export const userResource = {
  list: UserList,
  create: () => <Create><UserForm creating /></Create>,
  edit: () => <Edit mutationMode="pessimistic"><UserForm /></Edit>,
  show: UserShow,
}
