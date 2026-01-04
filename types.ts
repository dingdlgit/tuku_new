
export type Language = 'en' | 'zh';

export enum ImageFormat {
  ORIGINAL = 'original',
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  AVIF = 'avif',
  BMP = 'bmp'
}

export interface ProcessOptions {
  format: ImageFormat;
  quality: number; // 1-100
  width: number | null;
  height: number | null;
  maintainAspectRatio: boolean;
  resizeMode: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  rotate: number; // degrees
  flipX: boolean;
  flipY: boolean;
  grayscale: boolean;
  blur: number; // 0-100
  sharpen: boolean;
  watermarkText: string;
}

export interface UploadResponse {
  id: string;
  filename: string;
  url: string;
  originalName: string;
  size: number;
  width?: number;
  height?: number;
  depth?: string;
  format?: string;
}

export interface ProcessResponse {
  url: string;
  filename: string;
  size: number;
}
