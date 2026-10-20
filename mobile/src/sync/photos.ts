/**
 * Photos on the phone: shrunk before they're kept, held in the app's own
 * folder until they've gone to the engine, then cleared.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

/** Long edge of a kept photo. Plenty for a gas meter or a fuse board, small enough to send on one bar. */
const LONG_EDGE = Platform.OS === 'web' ? 1000 : 1600;
const QUALITY = Platform.OS === 'web' ? 0.6 : 0.7;
const FOLDER = 'ardent-photos';

function folder() {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

/**
 * Shrink a photo to JPEG with its long edge at most LONG_EDGE, and keep it.
 * On a phone it's a file in the app's documents (the cache can be wiped);
 * in the browser prototype it's a data URI, since there's no file system.
 */
export async function keepPhoto(source: { uri: string; width?: number; height?: number }): Promise<string> {
  const { uri, width = 0, height = 0 } = source;
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > LONG_EDGE || !width) {
    ctx.resize(width >= height ? { width: Math.min(width || LONG_EDGE, LONG_EDGE) } : { height: LONG_EDGE });
  }
  const image = await ctx.renderAsync();
  if (Platform.OS === 'web') {
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY, base64: true });
    return saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : saved.uri;
  }
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY });
  const kept = new File(folder(), `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  new File(saved.uri).moveSync(kept);
  return kept.uri;
}

/** The bytes to send. */
export async function readPhoto(uri: string): Promise<Blob | Uint8Array> {
  if (uri.startsWith('data:') || uri.startsWith('blob:') || Platform.OS === 'web') return (await fetch(uri)).blob();
  return new File(uri).bytes();
}

/** Clear a photo from the phone once the engine has it. */
export function clearPhoto(uri: string) {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

/** Clear every kept photo, for a demo reset or signing out. */
export function clearAllPhotos() {
  if (Platform.OS === 'web') return;
  try {
    const dir = new Directory(Paths.document, FOLDER);
    if (dir.exists) dir.delete();
  } catch {
    // Nothing kept.
  }
}
