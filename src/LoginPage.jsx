import { useState } from 'react'
import { useLogin, useNotify } from 'react-admin'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material'
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import artisanHero from './assets/artisan-login-hero.png'

export const LoginPage = () => {
  const login = useLogin()
  const notify = useNotify()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login({ username: email.trim(), password })
    } catch (loginError) {
      const message = loginError?.message || 'Unable to sign in. Please check your credentials.'
      setError(message)
      notify(message, { type: 'error' })
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-visual" style={{ backgroundImage: `url(${artisanHero})` }}>
        <div className="login-visual-overlay" />
        <div className="login-visual-copy">
          <span className="login-eyebrow">Shilp &amp; Soul</span>
          <Typography component="h2">Crafted with heart.<br />Managed with care.</Typography>
          <Typography>Supporting artisan stories, one beautiful product at a time.</Typography>
        </div>
      </section>

      <section className="login-form-panel">
        <Box className="login-form-wrap">
          <div className="login-monogram" aria-hidden="true">S</div>
          <Typography className="login-site-name" component="p">Shilp &amp; Soul</Typography>
          <Typography component="h1">Welcome back</Typography>
          <Typography className="login-subtitle">Sign in to your administration console</Typography>

          {error && <Alert severity="error" className="login-error">{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit} className="login-form">
            <TextField
              autoComplete="email"
              autoFocus
              fullWidth
              label="Email address"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
              slotProps={{
                input: { startAdornment: <InputAdornment position="start"><EmailOutlinedIcon /></InputAdornment> },
              }}
            />
            <TextField
              autoComplete="current-password"
              fullWidth
              label="Password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type={showPassword ? 'text' : 'password'}
              value={password}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><LockOutlinedIcon /></InputAdornment>,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} edge="end" onClick={() => setShowPassword((visible) => !visible)}>
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button disabled={loading} fullWidth size="large" type="submit" variant="contained">
              {loading ? <CircularProgress color="inherit" size={22} /> : 'Sign in to admin'}
            </Button>
          </Box>

          <Typography className="login-access-note">Restricted to authorised administrators</Typography>
        </Box>
      </section>
    </main>
  )
}
