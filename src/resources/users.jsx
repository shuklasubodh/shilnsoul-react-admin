/* eslint-disable react-refresh/only-export-components */
import { BooleanField, BooleanInput, Create, Datagrid, DateField, Edit, EditButton, EmailField, List, PasswordInput, required, SearchInput, SelectInput, Show, SimpleForm, SimpleShowLayout, TextField, TextInput } from 'react-admin'

const roles = [{ id: 'ADMIN', name: 'Admin' }, { id: 'CUSTOMER', name: 'Customer' }]
const UserList = () => <List filters={[<SearchInput key="search" source="q" alwaysOn />]}><Datagrid rowClick="show">
  <TextField source="id" /><TextField source="first_name" /><TextField source="last_name" /><EmailField source="email" />
  <TextField source="phone" /><TextField source="role" /><BooleanField source="is_active" /><DateField source="created_at" showTime /><EditButton />
</Datagrid></List>
const UserForm = ({ creating = false }) => <SimpleForm>
  <TextInput source="first_name" validate={required()} /><TextInput source="last_name" validate={required()} />
  <TextInput source="email" type="email" validate={required()} /><TextInput source="phone" validate={required()} />
  <PasswordInput source="password_hash" label={creating ? 'Password' : 'New password (optional)'} validate={creating ? required() : undefined} />
  <SelectInput source="role" choices={roles} validate={required()} /><BooleanInput source="is_active" defaultValue />
</SimpleForm>
const UserShow = () => <Show><SimpleShowLayout>
  <TextField source="id" /><TextField source="first_name" /><TextField source="last_name" /><EmailField source="email" />
  <TextField source="phone" /><TextField source="role" /><BooleanField source="is_active" />
  <DateField source="created_at" showTime /><DateField source="updated_at" showTime />
</SimpleShowLayout></Show>

export const userResource = {
  list: UserList,
  create: () => <Create><UserForm creating /></Create>,
  edit: () => <Edit mutationMode="pessimistic"><UserForm /></Edit>,
  show: UserShow,
}
