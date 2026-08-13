import { useState } from 'react'
import { Title } from 'react-admin'
import { Alert, Box, Button, Checkbox, FormControlLabel, LinearProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'

const SUPPORTED_FILE = /\.(heic|mov)$/i

const canvasToJpeg = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create the JPG image.')), 'image/jpeg', 0.92)
})

const heicToJpeg = async (file) => {
  const { heicTo } = await import('heic-to')
  return heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 })
}

const movToJpeg = (file) => new Promise((resolve, reject) => {
  const video = document.createElement('video')
  const url = URL.createObjectURL(file)
  const cleanup = () => {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
  const fail = () => {
    cleanup()
    reject(new Error('Chrome could not decode this MOV codec.'))
  }
  video.muted = true
  video.preload = 'metadata'
  video.onloadedmetadata = () => {
    video.currentTime = Math.min(Math.max(video.duration * 0.1, 0.1), Math.max(video.duration - 0.1, 0))
  }
  video.onseeked = async () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0)
      const jpeg = await canvasToJpeg(canvas)
      cleanup()
      resolve(jpeg)
    } catch (error) {
      cleanup()
      reject(error)
    }
  }
  video.onerror = fail
  video.src = url
})

const findMediaFiles = async (directory, relativePath = '') => {
  const files = []
  for await (const entry of directory.values()) {
    if (entry.kind === 'directory') {
      files.push(...await findMediaFiles(entry, `${relativePath}${entry.name}/`))
    } else if (SUPPORTED_FILE.test(entry.name)) {
      files.push({ handle: entry, directory, path: `${relativePath}${entry.name}` })
    }
  }
  return files
}

export function MediaConversion() {
  const [overwrite, setOverwrite] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [error, setError] = useState('')

  const chooseAndConvert = async () => {
    if (!window.showDirectoryPicker) {
      setError('Folder access is not supported in this browser. Open this utility in desktop Chrome or Edge.')
      return
    }
    setError('')
    let root
    try {
      root = await window.showDirectoryPicker({ mode: 'readwrite' })
    } catch (pickerError) {
      if (pickerError.name !== 'AbortError') setError(pickerError.message)
      return
    }

    setRunning(true)
    setProgress(0)
    setResults([])
    try {
      const sources = await findMediaFiles(root)
      if (!sources.length) {
        setError('No .heic or .mov files were found in the selected folder.')
        return
      }
      const nextResults = []
      for (let index = 0; index < sources.length; index += 1) {
        const source = sources[index]
        const jpgName = source.handle.name.replace(/\.(heic|mov)$/i, '.jpg')
        try {
          if (!overwrite) {
            try {
              await source.directory.getFileHandle(jpgName)
              nextResults.push({ path: source.path, output: jpgName, status: 'Skipped', detail: 'JPG already exists' })
              setResults([...nextResults])
              setProgress(((index + 1) / sources.length) * 100)
              continue
            } catch (lookupError) {
              if (lookupError.name !== 'NotFoundError') throw lookupError
            }
          }
          const file = await source.handle.getFile()
          const jpeg = /\.heic$/i.test(file.name) ? await heicToJpeg(file) : await movToJpeg(file)
          const output = await source.directory.getFileHandle(jpgName, { create: true })
          const writer = await output.createWritable()
          await writer.write(jpeg)
          await writer.close()
          nextResults.push({ path: source.path, output: jpgName, status: 'Created', detail: `${Math.round(jpeg.size / 1024)} KB` })
        } catch (conversionError) {
          nextResults.push({ path: source.path, output: jpgName, status: 'Failed', detail: conversionError.message })
        }
        setResults([...nextResults])
        setProgress(((index + 1) / sources.length) * 100)
      }
    } catch (conversionError) {
      setError(conversionError.message)
    } finally {
      setRunning(false)
    }
  }

  return <Box className="media-conversion-page">
    <Title title="Convert media to JPG" />
    <Typography variant="h4" gutterBottom>Convert media to JPG</Typography>
    <Typography color="text.secondary" sx={{ mb: 2 }}>Create JPG copies of HEIC images and representative frames from MOV videos in the same local folders. Originals are never removed.</Typography>
    {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Button variant="contained" startIcon={<FolderOpenIcon />} onClick={chooseAndConvert} disabled={running}>{running ? 'Converting…' : 'Choose folder and convert'}</Button>
        <FormControlLabel control={<Checkbox checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} disabled={running} />} label="Overwrite existing JPG files" />
      </Box>
      {running ? <LinearProgress variant="determinate" value={progress} sx={{ mt: 2 }} /> : null}
    </Paper>
    {results.length ? <Paper variant="outlined" sx={{ overflow: 'auto' }}><Table size="small">
      <TableHead><TableRow><TableCell>Source file</TableCell><TableCell>JPG copy</TableCell><TableCell>Status</TableCell><TableCell>Details</TableCell></TableRow></TableHead>
      <TableBody>{results.map((result) => <TableRow key={result.path}><TableCell>{result.path}</TableCell><TableCell>{result.output}</TableCell><TableCell>{result.status}</TableCell><TableCell>{result.detail}</TableCell></TableRow>)}</TableBody>
    </Table></Paper> : null}
  </Box>
}
