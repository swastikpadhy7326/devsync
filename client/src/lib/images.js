import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_SIDE, fitWithin, renameTo } from './files';

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// Gets a file ready to send: PDFs and GIFs as they are, other photos shrunk and saved as JPEG.
// Returns { blob, name, type } or throws an error with a message for the person.
export async function prepareFile(file) {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error('PDF files can be up to 5 MB');
    return { blob: file, name: file.name, type: 'application/pdf' };
  }
  if (file.type === 'image/gif') {
    if (file.size > MAX_IMAGE_BYTES) throw new Error('GIF images can be up to 2 MB');
    return { blob: file, name: file.name, type: 'image/gif' };
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPEG, WebP, GIF or PDF file');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('This image could not be read');
  }

  try {
    // Try a smaller picture or more compression until it fits in 2 MB
    for (const [side, quality] of [[MAX_SIDE, 0.85], [MAX_SIDE, 0.7], [1200, 0.7], [800, 0.7]]) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, side);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; // transparent areas become white in a JPEG
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await toBlob(canvas, 'image/jpeg', quality);
      if (blob && blob.size <= MAX_IMAGE_BYTES) {
        return { blob, name: renameTo(file.name, 'jpg'), type: 'image/jpeg' };
      }
    }
  } finally {
    if (bitmap.close) bitmap.close();
  }
  throw new Error('This photo is too large even after shrinking');
}