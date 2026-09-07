import { AutocompleteInput, required } from 'react-admin'
import { getCountries, getCountryCallingCode } from 'libphonenumber-js'

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })
const namesByCode = getCountries().reduce((result, country) => {
  const code = `+${getCountryCallingCode(country)}`
  const names = result.get(code) || []
  names.push(countryNames.of(country) || country)
  result.set(code, names)
  return result
}, new Map())

const choices = [...namesByCode.entries()]
  .map(([code, names]) => ({ id: code, name: `${names.sort().join(' / ')} (${code})` }))
  .sort((left, right) => left.name.localeCompare(right.name))

export default function CountryCodeInput() {
  return <AutocompleteInput
    source="country_code"
    label="Country / calling code"
    choices={choices}
    defaultValue="+65"
    validate={required()}
    fullWidth
  />
}
