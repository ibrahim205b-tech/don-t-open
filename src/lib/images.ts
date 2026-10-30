import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES = 6;

export class ImageError extends Error {}

/** يتعرّف على الصورة من محتواها (Magic bytes)، لا من الامتداد أو نوع MIME الذي يرسله المتصفح. */
export function sniffImage(buf: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export interface StoredImage { file: string; thumb: string; width: number; height: number }

/**
 * يعيد ترميز الصورة بالكامل إلى WebP: يزيل بيانات EXIF (ومنها الموقع الجغرافي)
 * ويُبطل أي محتوى مدسوس داخل الملف، ويحفظها باسم عشوائي خارج المجلد العام.
 */
export async function storeImage(buf: Buffer, dir: string): Promise<StoredImage> {
  if (buf.length > MAX_IMAGE_BYTES) throw new ImageError('حجم الصورة أكبر من ٥ ميغابايت.');
  if (!sniffImage(buf)) throw new ImageError('نوع الملف غير مسموح. المسموح: JPG وPNG وWebP فقط.');
  let img: ReturnType<typeof sharp>;
  try {
    img = sharp(buf, { limitInputPixels: 40_000_000, failOn: 'error', animated: false }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height || meta.width < 50 || meta.height < 50) throw new ImageError('الصورة صغيرة جداً.');
  } catch (e) {
    if (e instanceof ImageError) throw e;
    throw new ImageError('تعذّر قراءة الصورة. تأكد أنها صورة سليمة.');
  }
  await fs.mkdir(dir, { recursive: true });
  const id = crypto.randomBytes(16).toString('hex');
  // الصورة المصغّرة: المعرّف نفسه مع رقم إضافي، ليبقى الاسم ست عشرياً فقط
  const file = `${id}.webp`, thumb = `${id}0.webp`;
  const full = await img.clone().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
  const small = await img.clone().resize(480, 360, { fit: 'cover', position: 'attention' }).webp({ quality: 70 }).toBuffer();
  await fs.writeFile(path.join(dir, file), full.data, { flag: 'wx', mode: 0o640 });
  await fs.writeFile(path.join(dir, thumb), small, { flag: 'wx', mode: 0o640 });
  return { file, thumb, width: full.info.width, height: full.info.height };
}

export async function deleteImageFiles(dir: string, names: string[]) {
  for (const n of names) {
    if (!/^[0-9a-f]{32,33}\.webp$/.test(n)) continue;
    await fs.rm(path.join(dir, n), { force: true });
  }
}
