
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
  quality: number;
  width: number | null;
  height: number | null;
  maintainAspectRatio: boolean;
  resizeMode: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  rotate: number;
  flipX: boolean;
  flipY: boolean;
  grayscale: boolean;
  blur: number;
  sharpen: boolean;
  watermarkText: string;
  watermarkPosition: WatermarkPosition;
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

// --- Enhanced Stock Analysis Types ---

export interface OHLC {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
}

export interface StockAnalysisResult {
  code: string;
  market: string;
  name: string;
  currentPrice: number;
  changeAmount: number;
  changePercent: number;
  // Fundamental
  pe: number;
  pb: number;
  turnoverRate: number;
  amplitude: number;
  // Technical Stats
  trend: 'STRONG' | 'VOLATILE' | 'WEAK';
  support: number;
  resistance: number;
  sentiment: number; // 0-100
  // Textual Analysis
  techAnalysis: string;
  strategyAdvice: {
    shortTerm: string; // 打板选手/短线
    longTerm: string;  // 价值投资
    trendFollower: string; // 均线/趋势
  };
  risks: string[];
  history: OHLC[];
}
