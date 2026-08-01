import { Admin, Resource } from 'react-admin'
import CategoryIcon from '@mui/icons-material/Category'
import InventoryIcon from '@mui/icons-material/Inventory2'
import PeopleIcon from '@mui/icons-material/People'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import { dataProvider } from './dataProvider'
import { categoryResource } from './resources/categories'
import { orderResource } from './resources/orders'
import { productResource } from './resources/products'
import { userResource } from './resources/users'

function App() {
  return (
    <Admin dataProvider={dataProvider} title="Shilp & Soul Admin">
      <Resource name="users" icon={PeopleIcon} {...userResource} />
      <Resource name="products" icon={InventoryIcon} {...productResource} />
      <Resource name="categories" icon={CategoryIcon} {...categoryResource} />
      <Resource name="orders" icon={ShoppingCartIcon} {...orderResource} />
    </Admin>
  )
}

export default App
