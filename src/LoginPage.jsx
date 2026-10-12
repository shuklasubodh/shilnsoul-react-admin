import { useEffect, useState } from 'react'
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
import { useLogin } from 'react-admin'
import artisanHero from './assets/artisan-login-hero.webp'
import { apiUrl } from './apiUrl'

const jsonRequest = async (path, options = {}) => {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...options.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(payload.error || 'The request could not be completed.'), { status: response.status })
  return payload
}

export const LoginPage = () => {
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [bootstrap, setBootstrap] = useState(null)
  const [setup, setSetup] = useState({ first_name: '', last_name: '', password: '', confirm_password: '', bootstrap_secret: '', code: '' })
  const [challengeId, setChallengeId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    jsonRequest('bootstrap/status')
      .then(setBootstrap)
      .catch((failure) => setError(failure.message))
      .finally(() => setStatusLoading(false))
  }, [])

  const handleLogin = async (event) => {
    event.preventDefault(); setError(''); setMessage(''); setLoading(true)
    try { await login({ username: email.trim(), password }) }
    catch (loginError) { setError(loginError?.message || 'Unable to sign in. Please check your credentials.'); setLoading(false) }
  }

  const updateSetup = (field, value) => {
    setSetup((current) => ({ ...current, [field]: value }))
    if (field !== 'code') { setChallengeId(''); setMessage('') }
  }

  const setupPayload = () => ({
    first_name: setup.first_name.trim(),
    last_name: setup.last_name.trim(),
    password: setup.password,
    bootstrap_secret: setup.bootstrap_secret,
  })

  const requestCode = async () => {
    setError(''); setMessage('')
    if (setup.password !== setup.confirm_password) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const result = await jsonRequest('bootstrap/request-code', { method: 'POST', body: JSON.stringify(setupPayload()) })
      setChallengeId(String(result.challenge_id))
      setMessage(result.message)
    } catch (failure) { setError(failure.message) }
    finally { setLoading(false) }
  }

  const completeSetup = async (event) => {
    event.preventDefault(); setError(''); setMessage('')
    if (setup.password !== setup.confirm_password) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      const result = await jsonRequest('bootstrap/complete', { method: 'POST', body: JSON.stringify({ ...setupPayload(), challenge_id: challengeId, code: setup.code }) })
      setBootstrap((current) => ({ ...current, setup_required: false }))
      setEmail(result.email || '')
      setPassword('')
      setSetup({ first_name: '', last_name: '', password: '', confirm_password: '', bootstrap_secret: '', code: '' })
      setChallengeId('')
      setMessage(result.message)
    } catch (failure) { setError(failure.message) }
    finally { setLoading(false) }
  }

  const passwordAdornment = {
    startAdornment: <InputAdornment position="start"><LockOutlinedIcon /></InputAdornment>,
    endAdornment: <InputAdornment position="end"><IconButton aria-label={showPassword ? 'Hide password' : 'Show password'} edge="end" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}</IconButton></InputAdornment>,
  }

  return <main className="login-page">
    <section className="login-visual" style={{ backgroundImage: `url(${artisanHero})` }}><div className="login-visual-overlay"/><div className="login-visual-copy"><span className="login-eyebrow">Shilp &amp; Soul</span><Typography component="h2">Crafted with heart.<br/>Managed with care.</Typography><Typography>Supporting artisan stories, one beautiful product at a time.</Typography></div></section>
    <section className="login-form-panel"><Box className="login-form-wrap"><div className="login-monogram" aria-hidden="true">S</div><Typography className="login-site-name" component="p">Shilp &amp; Soul</Typography>
      {statusLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress/></Box> : bootstrap?.setup_required ? <>
        <Typography component="h1">Create first administrator</Typography><Typography className="login-subtitle">Authorize the store before customer registration or ordering can begin.</Typography>
        {!bootstrap.configured && <Alert severity="error">Configure INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_BOOTSTRAP_SECRET in the backend before continuing.</Alert>}
        {bootstrap.approver_email_hint && <Alert severity="info">The authorization code will be sent to {bootstrap.approver_email_hint}.</Alert>}
        {error && <Alert severity="error" className="login-error">{error}</Alert>}{message && <Alert severity="success" className="login-error">{message}</Alert>}
        <Box component="form" onSubmit={completeSetup} className="login-form">
          <TextField autoFocus fullWidth required label="First name" value={setup.first_name} onChange={(event) => updateSetup('first_name', event.target.value)}/>
          <TextField fullWidth required label="Last name" value={setup.last_name} onChange={(event) => updateSetup('last_name', event.target.value)}/>
          <TextField fullWidth disabled label="Administrator email" value="subodhshukla@gmail.com" slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailOutlinedIcon/></InputAdornment> } }}/>
          <TextField autoComplete="new-password" fullWidth required label="Password (minimum 15 characters)" type={showPassword ? 'text' : 'password'} value={setup.password} onChange={(event) => updateSetup('password', event.target.value)} slotProps={{ input: passwordAdornment }} inputProps={{ minLength: 15 }}/>
          <TextField autoComplete="new-password" fullWidth required label="Confirm password" type={showPassword ? 'text' : 'password'} value={setup.confirm_password} onChange={(event) => updateSetup('confirm_password', event.target.value)} inputProps={{ minLength: 15 }}/>
          <TextField autoComplete="off" fullWidth required label="Deployment bootstrap secret" type="password" value={setup.bootstrap_secret} onChange={(event) => updateSetup('bootstrap_secret', event.target.value)} helperText="Retrieve this one-time secret from your password manager or deployment configuration."/>
          {!challengeId ? <Button disabled={loading || !bootstrap.configured} fullWidth size="large" type="button" variant="contained" onClick={requestCode}>{loading ? <CircularProgress color="inherit" size={22}/> : 'Send authorization code'}</Button> : <>
            <TextField autoComplete="one-time-code" fullWidth required label="Six-digit authorization code" inputMode="numeric" value={setup.code} onChange={(event) => updateSetup('code', event.target.value.replace(/\D/g, '').slice(0, 6))}/>
            <Button disabled={loading || setup.code.length !== 6} fullWidth size="large" type="submit" variant="contained">{loading ? <CircularProgress color="inherit" size={22}/> : 'Create administrator'}</Button>
            <Button disabled={loading} fullWidth type="button" onClick={requestCode}>Resend authorization code</Button>
          </>}
        </Box>
      </> : <>
        <Typography component="h1">Welcome back</Typography><Typography className="login-subtitle">Sign in to your administration console</Typography>
        {bootstrap?.recovery_required && <Alert severity="error">No active administrator is available. Ordering is blocked and secure operator recovery is required.</Alert>}
        {error && <Alert severity="error" className="login-error">{error}</Alert>}{message && <Alert severity="success" className="login-error">{message}</Alert>}
        <Box component="form" onSubmit={handleLogin} className="login-form">
          <TextField autoComplete="email" autoFocus fullWidth label="Email address" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailOutlinedIcon/></InputAdornment> } }}/>
          <TextField autoComplete="current-password" fullWidth label="Password" onChange={(event) => setPassword(event.target.value)} required type={showPassword ? 'text' : 'password'} value={password} slotProps={{ input: passwordAdornment }}/>
          <Button disabled={loading} fullWidth size="large" type="submit" variant="contained">{loading ? <CircularProgress color="inherit" size={22}/> : 'Sign in to admin'}</Button>
        </Box>
      </>}
      <Typography className="login-access-note">Restricted to authorised administrators</Typography>
    </Box></section>
  </main>
}
