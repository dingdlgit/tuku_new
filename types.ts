
export type Language = 'en' | 'zh';

export enum ImageFormat {
  ORIGINAL = 'original',
  JPEG = 'jpeg',
  PNG = 'png',
  WEBP = 'webp',
  AVIF = 'avif',
  BMP = 'bmp'
}

export type RawPixelFormat = 'uyvy' | 'nv21' | 'rgba' | 'bgra' | 'rgb' | 'bgr';

export type WatermarkPosition = 'top-left' | 'top-right' | 'center' | 'bottom-left' | 'bottom-right';

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
  watermarkPosition: WatermarkPosition;
  // New fields for RAW handling
  rawWidth?: number;
  rawHeight?: number;
  rawPixelFormat?: RawPixelFormat;
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

// --- Stock Analysis Types ---

export interface StockDataPoint {
  date: string;
  price: number;
}

export interface StockAnalysisResult {
  code: string;
  market: string; // Market identifier (e.g., A-Share, HK, US)
  currentPrice: number;
  changePercent: number;
  trend: 'STRONG' | 'VOLATILE' | 'WEAK'; // 偏强 / 震荡 / 偏弱
  techAnalysis: string; // 技术面解读
  strategy: string; // 操作思路
  risks: string; // 风险点
  history: StockDataPoint[]; // For charting
}
