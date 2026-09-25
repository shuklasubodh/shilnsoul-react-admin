const DEFAULT_MAX_DIMENSION = 2560
const DEFAULT_QUALITY = 0.82

const fileStem = (name) => String(name || 'image')
  .replace(/\.[^.]+$/, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'image'

const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(
    (blob) => blob?.type === type
      ? resolve(blob)
      : reject(new Error('This browser could not encode this image as WebP. Please use a current Chrome, Edge, Firefox, or Safari browser.')),
    type,
    quality,
  )
})

const isWebP = async (blob) => {
  const signature = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  return signature.length === 12
    && String.fromCharCode(...signature.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...signature.slice(8, 12)) === 'WEBP'
}

const loadWithImageElement = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = () => resolve({
    width: image.naturalWidth,
    height: image.naturalHeight,
    draw: (context, width, height) => context.drawImage(image, 0, 0, width, height),
    close: () => URL.revokeObjectURL(url),
  })
  image.onerror = () => {
    URL.revokeObjectURL(url)
    reject(new Error(`${file.name} could not be decoded as an image.`))
  }
  image.src = url
})

const decodeImage = async (file) => {
  if (typeof createImageBitmap !== 'function') return loadWithImageElement(file)
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (context, width, height) => context.drawImage(bitmap, 0, 0, width, height),
      close: () => bitmap.close(),
    }
  } catch {
    return loadWithImageElement(file)
  }
}

/**
 * Converts an uploaded image once, before it is sent to Blob storage.
 * Metadata is stripped and large dimensions are reduced while aspect ratio is retained.
 */
export const optimizeImageForUpload = async (file, options = {}) => {
  if (!(file instanceof Blob) || (!file.type.startsWith('image/') && !/\.(avif|bmp|gif|jfif|jpe?g|png|tiff?|webp)$/i.test(file.name))) {
    throw new Error('Select a supported image file.')
  }

  const maxDimension = options.maxDimension || DEFAULT_MAX_DIMENSION
  const quality = options.quality ?? DEFAULT_QUALITY
  const source = await decodeImage(file)

  try {
    if (!source.width || !source.height) throw new Error(`${file.name} has invalid image dimensions.`)
    const scale = Math.min(1, maxDimension / Math.max(source.width, source.height))
    const width = Math.max(1, Math.round(source.width * scale))
    const height = Math.max(1, Math.round(source.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) throw new Error('This browser could not prepare the image for upload.')
    source.draw(context, width, height)
    const blob = await canvasToBlob(canvas, 'image/webp', quality)
    if (!(await isWebP(blob))) {
      throw new Error('Image conversion did not produce a valid WebP file, so it was not uploaded.')
    }
    const optimized = new File([blob], `${fileStem(file.name)}.webp`, {
      type: 'image/webp',
      lastModified: file.lastModified || Date.now(),
    })
    return {
      file: optimized,
      originalBytes: file.size,
      optimizedBytes: optimized.size,
      width,
      height,
    }
  } finally {
    source.close()
  }
}
