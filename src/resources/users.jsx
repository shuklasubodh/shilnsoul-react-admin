/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import { BooleanField, BooleanInput, Create, Datagrid, DateField, Edit, EditButton, EmailField, List, NumberField, NumberInput, PasswordInput, required, SearchInput, SelectInput, Show, SimpleForm, SimpleShowLayout, TextField, TextInput, useInput } from 'react-admin'
import { Checkbox, FormControlLabel, TextField as MuiTextField } from '@mui/material'
import CountryCodeInput from '../CountryCodeInput'

const roles = [{ id: 'ADMIN', name: 'Admin' }, { id: 'CUSTOMER', name: 'Customer' }]
const channels = [{ id: 'EMAIL', name: 'Email' }, { id: 'SMS', name: 'SMS' }, { id: 'WHATSAPP', name: 'WhatsApp' }]
const LinkedContactInputs = ({ creating }) => {
  const sms = useInput({ source: 'phone' })
  const whatsapp = useInput({ source: 'whatsapp_number' })
  const whatsappOnChange = whatsapp.field.onChange
  const [sameAsMobile, setSameAsMobile] = useState(Boolean(creating))
  useEffect(() => {
    if (sameAsMobile) whatsappOnChange(sms.field.value || '')
  }, [sameAsMobile, sms.field.value, whatsappOnChange])
  return <>
    <MuiTextField {...sms.field} value={sms.field.value || ''} label="Mobile number (optional)" helperText="Local or E.164 format." error={Boolean(sms.fieldState.error)} />
    <FormControlLabel control={<Checkbox checked={sameAsMobile} onChange={(event) => setSameAsMobile(event.target.checked)} />} label="WhatsApp same as mobile" />
    <MuiTextField {...whatsapp.field} value={whatsapp.field.value || ''} disabled={sameAsMobile} label="WhatsApp number (optional)" helperText="Uncheck to enter a different number or leave it blank." error={Boolean(whatsapp.fieldState.error)} />
  </>
}
const UserList = () => <List filters={[<SearchInput key="search" source="q" alwaysOn />]}><Datagrid rowClick="show">
  <TextField source="id" /><TextField source="first_name" /><TextField source="last_name" /><EmailField source="email" />
  <TextField source="country_code" label="Country code" /><TextField source="phone" label="SMS phone" /><TextField source="whatsapp_number" label="WhatsApp" /><TextField source="preferred_notification_channel" label="Preferred channel" /><NumberField source="return_window_days" label="Return days" /><TextField source="role" /><BooleanField source="is_active" /><DateField source="created_at" showTime /><EditButton />
</Datagrid></List>
const UserForm = ({ creating = false }) => <SimpleForm autoComplete={creating ? 'off' : undefined}>
  <TextInput source="first_name" validate={required()} /><TextInput source="last_name" validate={required()} />
  <TextInput source="email" type="email" autoComplete={creating ? 'off' : 'email'} validate={required()} /><CountryCodeInput />
  <LinkedContactInputs creating={creating} />
  {!creating && <PasswordInput source="password_hash" label="New password (optional)" autoComplete="new-password" />}
  {!creating && <SelectInput source="preferred_notification_channel" choices={channels} defaultValue="EMAIL" validate={required()} />}
  <NumberInput source="return_window_days" label="Return window (days)" min={0} max={365} defaultValue={2} validate={required()} />
  <SelectInput source="role" choices={roles} validate={required()} />{!creating && <BooleanInput source="is_active" />}
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
