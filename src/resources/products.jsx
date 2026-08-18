/* eslint-disable react-refresh/only-export-components */
import {
  BooleanField, BooleanInput, BulkDeleteButton, Create, CreateButton, Datagrid, DeleteButton, Edit, EditButton, FunctionField,
  List, NumberField, NumberInput, ReferenceField, ReferenceInput, required,
  SearchInput, SelectInput, Show, SimpleForm, SimpleShowLayout, TextField, TextInput,
  TopToolbar, WrapperField,
} from 'react-admin'
import { Box, ImageList, ImageListItem, Stack, Typography } from '@mui/material'
import { ScopePanel } from '../Dashboard'
import { BulkUploadButton } from '../BulkUploadButton'

const ProductActions = () => <TopToolbar><BulkUploadButton mode="products" /><CreateButton label="Add product" /></TopToolbar>
const ProductBulkActions = () => <BulkDeleteButton mutationMode="pessimistic" />
const ProductEmpty = () => (
  <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
    <Typography variant="h5">No products yet</Typography>
    <Typography color="text.secondary">Upload a spreadsheet or add a product manually.</Typography>
    <Stack direction="row" spacing={1}>
      <BulkUploadButton mode="products" />
      <CreateButton label="Add product" />
    </Stack>
  </Stack>
)

const ProductList = () => (
  <List
    actions={<ProductActions />}
    empty={<ProductEmpty />}
    filters={[<SearchInput key="search" source="q" placeholder="Search / filter by category" alwaysOn />]}
    sort={{ field: 'id', order: 'ASC' }}
  >
    <Box>
      <Datagrid bulkActionButtons={<ProductBulkActions />} rowClick={false}>
        <TextField source="sku" label="SKU" /><TextField source="name" /><TextField source="slug" />
        <NumberField source="price" options={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
        <NumberField source="stock_quantity" label="Stock" />
        <FunctionField label="Status" render={(record) => record.is_active ? 'Active' : 'Inactive'} />
        <WrapperField label="Actions"><EditButton label="Edit" /><DeleteButton label="Delete" mutationMode="pessimistic" /></WrapperField>
      </Datagrid>
      <ScopePanel />
    </Box>
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
    <TextField source="id" /><FunctionField label="Images" render={(record) => <ImageList cols={4} sx={{ maxWidth: 720 }}>
      {(record.images?.length ? record.images : record.image_url ? [record.image_url] : []).map((url) => <ImageListItem key={url}><img src={url} alt={record.name} loading="lazy" /></ImageListItem>)}
    </ImageList>} /><TextField source="name" />
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
