import {
  AppBar,
  DashboardMenuItem,
  Layout,
  Menu,
  MenuItemLink,
} from 'react-admin'
import { Typography } from '@mui/material'

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
    <MenuItemLink to="/products" primaryText="Products" />
    <MenuItemLink to="/categories" primaryText="Categories" />
    <MenuItemLink to="/orders" primaryText="Orders" />
    <MenuItemLink to="/users" primaryText="Users" />
  </Menu>
)

export const AdminLayout = (props) => (
  <Layout {...props} appBar={AdminAppBar} menu={AdminMenu} />
)
