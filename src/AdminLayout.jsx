import {
  AppBar,
  DashboardMenuItem,
  Layout,
  Menu,
  MenuItemLink,
} from 'react-admin'
import { Typography } from '@mui/material'
import CollectionsIcon from '@mui/icons-material/Collections'
import InventoryIcon from '@mui/icons-material/Inventory2'
import ImageSearchIcon from '@mui/icons-material/ImageSearch'
import TransformIcon from '@mui/icons-material/Transform'

const AdminAppBar = (props) => (
  <AppBar {...props} className="admin-app-bar">
    <Typography className="admin-brand" variant="h6">
      React Admin - Product Management
    </Typography>
  </AppBar>
)

const AdminMenu = () => (
  <Menu className="admin-menu">
    <DashboardMenuItem />
    <Typography className="admin-menu-section">Products</Typography>
    <MenuItemLink className="admin-product-submenu" to="/products" primaryText="Product Maintenance" leftIcon={<InventoryIcon />} />
    <MenuItemLink className="admin-product-submenu" to="/product-images" primaryText="Product Image Mapping" leftIcon={<CollectionsIcon />} />
    <MenuItemLink className="admin-product-submenu" to="/image-maintenance" primaryText="Image Maintenance" leftIcon={<ImageSearchIcon />} />
    <MenuItemLink className="admin-product-submenu" to="/media-conversion" primaryText="Convert Media to JPG" leftIcon={<TransformIcon />} />
    <MenuItemLink to="/categories" primaryText="Categories" />
    <MenuItemLink to="/orders" primaryText="Orders" />
    <MenuItemLink to="/users" primaryText="Users" />
  </Menu>
)

export const AdminLayout = (props) => (
  <Layout {...props} appBar={AdminAppBar} menu={AdminMenu} />
)
