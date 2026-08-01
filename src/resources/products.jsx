/* eslint-disable react-refresh/only-export-components */
import {
  BooleanField, BooleanInput, Create, Datagrid, Edit, EditButton, ImageField,
  List, NumberField, NumberInput, ReferenceField, ReferenceInput, required,
  SearchInput, SelectInput, Show, SimpleForm, SimpleShowLayout, TextField, TextInput,
} from 'react-admin'

const ProductList = () => (
  <List filters={[<SearchInput key="search" source="q" alwaysOn />]}>
    <Datagrid rowClick="show">
      <TextField source="id" /><ImageField source="image_url" /><TextField source="name" />
      <TextField source="sku" /><ReferenceField source="category_id" reference="categories" />
      <NumberField source="price" options={{ style: 'currency', currency: 'USD' }} />
      <NumberField source="stock_quantity" /><BooleanField source="is_active" /><EditButton />
    </Datagrid>
  </List>
)

const ProductForm = () => (
  <SimpleForm>
    <TextInput source="name" validate={required()} /><TextInput source="slug" />
    <TextInput source="sku" validate={required()} />
    <ReferenceInput source="category_id" reference="categories"><SelectInput optionText="name" validate={required()} /></ReferenceInput>
    <TextInput source="description" multiline rows={4} /><NumberInput source="price" min={0} validate={required()} />
    <NumberInput source="stock_quantity" min={0} defaultValue={0} /><TextInput source="image_url" type="url" />
    <BooleanInput source="is_active" defaultValue />
  </SimpleForm>
)

const ProductShow = () => (
  <Show><SimpleShowLayout>
    <TextField source="id" /><ImageField source="image_url" /><TextField source="name" />
    <TextField source="slug" /><TextField source="sku" /><ReferenceField source="category_id" reference="categories" />
    <TextField source="description" /><NumberField source="price" /><NumberField source="stock_quantity" /><BooleanField source="is_active" />
  </SimpleShowLayout></Show>
)

export const productResource = {
  list: ProductList,
  create: () => <Create><ProductForm /></Create>,
  edit: () => <Edit mutationMode="pessimistic"><ProductForm /></Edit>,
  show: ProductShow,
}
