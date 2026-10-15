import { Image } from 'react-native'

const MAX_EDGE = 1920
const JPEG_QUALITY = 0.85

type ImageManipulatorModule = {
  manipulateAsync: (
    uri: string,
    actions: Array<{ resize: { width?: number; height?: number } }>,
    options: { compress: number; format: string },
  ) => Promise<{ uri: string }>
  SaveFormat: { JPEG: string }
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    )
  })
}

async function loadImageManipulator(): Promise<ImageManipulatorModule | null> {
  try {
    const moduleName = 'expo-image-manipulator'
    return (await import(moduleName)) as ImageManipulatorModule
  } catch {
    // Fallback: if expo-image-manipulator fails to load (older Expo SDK,
    // missing dep, etc.), preserve the upload flow but skip compression.
    return null
  }
}

export async function compressImage(uri: string): Promise<string> {
  const ImageManipulator = await loadImageManipulator()
  if (!ImageManipulator) return uri

  let resize: { width?: number; height?: number } | null = null
  try {
    const { width, height } = await getImageSize(uri)
    if (Math.max(width, height) > MAX_EDGE) {
      resize = width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE }
    }
  } catch {
    resize = { width: MAX_EDGE }
  }

  // Degrade to the ORIGINAL uri if manipulation fails. A job photo is
  // compliance evidence — losing the upload because compression threw (native
  // module mismatch, unreadable uri, out of memory on a big HEIC) is far worse
  // than uploading it uncompressed.
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      resize ? [{ resize }] : [],
      {
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    )
    return result.uri
  } catch {
    return uri
  }
}
