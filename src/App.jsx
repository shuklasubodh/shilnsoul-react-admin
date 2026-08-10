import { Admin, CustomRoutes, Resource } from 'react-admin'
import { Route } from 'react-router-dom'
import CategoryIcon from '@mui/icons-material/Category'
import InventoryIcon from '@mui/icons-material/Inventory2'
import PeopleIcon from '@mui/icons-material/People'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import { dataProvider } from './dataProvider'
import { authProvider } from './authProvider'
import { AdminLayout } from './AdminLayout'
import { Dashboard } from './Dashboard'
import { LoginPage } from './LoginPage'
import { categoryResource } from './resources/categories'
import { orderResource } from './resources/orders'
import { productResource } from './resources/products'
import { userResource } from './resources/users'
import { ProductImageMapping } from './ProductImageMapping'
import { ImageMaintenance } from './ImageMaintenance'

function App() {
  return (
    <Admin
      authProvider={authProvider}
      dashboard={Dashboard}
      dataProvider={dataProvider}
      layout={AdminLayout}
      loginPage={LoginPage}
      requireAuth
      title="React Admin - Product Management"
      theme={{
        palette: {
          primary: { main: '#183650' },
          secondary: { main: '#258781' },
          background: { default: '#f7f9fb', paper: '#ffffff' },
          text: { primary: '#243b53', secondary: '#66727f' },
        },
        sidebar: { width: 170, closedWidth: 54 },
        shape: { borderRadius: 2 },
        typography: { fontFamily: 'Inter, "Segoe UI", Arial, sans-serif' },
      }}
    >
      <Resource name="products" icon={InventoryIcon} {...productResource} recordRepresentation="name" />
      <Resource name="categories" icon={CategoryIcon} {...categoryResource} />
      <Resource name="orders" icon={ShoppingCartIcon} {...orderResource} />
      <Resource name="users" icon={PeopleIcon} {...userResource} recordRepresentation={(record) => `${record.first_name || ''} ${record.last_name || ''}`.trim() || record.email} />
      <CustomRoutes>
        <Route path="/product-images" element={<ProductImageMapping />} />
        <Route path="/image-maintenance" element={<ImageMaintenance />} />
      </CustomRoutes>
    </Admin>
  )
}

export default App
