import { Card, CardContent, Typography } from '@mui/material'

export const ScopePanel = () => (
  <Card className="scope-panel">
    <CardContent>
      <Typography component="h2" variant="h6">Phase 1 admin scope</Typography>
      <Typography>Create, edit and delete products; maintain categories; review users and orders.</Typography>
    </CardContent>
  </Card>
)

export const Dashboard = () => (
  <main className="admin-dashboard">
    <Typography component="h1" variant="h5">Dashboard</Typography>
    <Typography className="dashboard-intro">
      Manage the Shilp &amp; Soul product catalogue, categories, customers and orders.
    </Typography>
    <ScopePanel />
  </main>
)
