import { describe, expect, test } from 'vitest';
import { fitWithin, formatSize, isImageType, renameTo } from './files';

describe('fitWithin', () => {
  test('shrinks the longest side to the limit and keeps the shape', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  test('leaves a picture that already fits alone', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  test('never produces a side of zero, even for extreme shapes', () => {
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
    expect(fitWithin(1, 10000, 1600)).toEqual({ width: 1, height: 1600 });
  });
});

describe('formatSize', () => {
  test('shows bytes and kilobytes', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(20480)).toBe('20 KB');
  });

  test('shows megabytes with one decimal', () => {
    expect(formatSize(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatSize(5 * 1024 * 1024 + 524288)).toBe('5.5 MB');
  });
});

describe('renameTo', () => {
  test('swaps the extension and keeps dots inside the name', () => {
    expect(renameTo('IMG_001.PNG', 'jpg')).toBe('IMG_001.jpg');
    expect(renameTo('my.photo.final.png', 'jpg')).toBe('my.photo.final.jpg');
  });

  test('adds an extension, and falls back to "photo" when there is no name', () => {
    expect(renameTo('holiday', 'jpg')).toBe('holiday.jpg');
    expect(renameTo('', 'jpg')).toBe('photo.jpg');
    expect(renameTo('.png', 'jpg')).toBe('photo.jpg');
  });
});

describe('isImageType', () => {
  test('is true for images only', () => {
    expect(isImageType('image/png')).toBe(true);
    expect(isImageType('application/pdf')).toBe(false);
    expect(isImageType(undefined)).toBe(false);
  });
});