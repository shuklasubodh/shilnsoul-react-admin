/* eslint-disable react-refresh/only-export-components */
import {
  BooleanField, BooleanInput, Create, Datagrid, DateField, Edit, EditButton,
  List, required, SearchInput, Show, SimpleForm, SimpleShowLayout, TextField, TextInput,
} from 'react-admin'

const CategoryList = () => (
  <List filters={[<SearchInput key="search" source="q" alwaysOn />]}>
    <Datagrid rowClick="show">
      <TextField source="id" /><TextField source="name" /><TextField source="slug" />
      <BooleanField source="is_active" /><DateField source="created_at" showTime /><EditButton />
    </Datagrid>
  </List>
)

const CategoryForm = () => (
  <SimpleForm>
    <TextInput source="name" validate={required()} /><TextInput source="slug" validate={required()} />
    <TextInput source="description" multiline rows={4} /><BooleanInput source="is_active" defaultValue />
  </SimpleForm>
)

const CategoryShow = () => (
  <Show><SimpleShowLayout>
    <TextField source="id" /><TextField source="name" /><TextField source="slug" />
    <TextField source="description" /><BooleanField source="is_active" />
    <DateField source="created_at" showTime /><DateField source="updated_at" showTime />
  </SimpleShowLayout></Show>
)

export const categoryResource = {
  list: CategoryList,
  create: () => <Create><CategoryForm /></Create>,
  edit: () => <Edit mutationMode="pessimistic"><CategoryForm /></Edit>,
  show: CategoryShow,
}
