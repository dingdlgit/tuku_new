
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

export type AITaskType = 'vision' | 'generate-image' | 'generate-video';

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
  aiTask: AITaskType;
  aiPrompt: string;
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
  mimeType?: string;
}

export interface ProcessResponse {
  url?: string;
  filename?: string;
  size?: number;
  aiText?: string;
  mimeType?: string;
}

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

// --- Backtest Types ---

export interface Trade {
  date: string;
  type: 'BUY' | 'SELL';
  price: number;
  shares: number;
  cost: number;
  value: number;
  commission: number;
}

export interface BacktestResult {
  final_value: number;
  total_return: number;
  max_drawdown: number;
  sharpe: number;
  equity_curve: { date: string; value: number }[];
  trades: Trade[];
}

export interface StockAnalysisResult {
  code: string;
  market: string;
  name: string;
  currentPrice: number;
  changeAmount: number;
  changePercent: number;
  pe: number;
  pb: number;
  turnoverRate: number;
  amplitude: number;
  trend: 'STRONG' | 'VOLATILE' | 'WEAK';
  support: number;
  resistance: number;
  sentiment: number;
  techAnalysis?: string;
  strategyAdvice?: {
    shortTerm: string;
    longTerm: string;
    trendFollower: string;
  };
  risks?: string[];
  history: OHLC[];
}

export type ChatRole = 'user' | 'model' | 'system';
export type AIWorkMode = 'general' | 'coder' | 'analyst' | 'creative';
export interface AIAttachment {
  id: string;
  type: 'image' | 'file' | 'audio';
  url: string;
  filename: string;
  mimeType: string;
  data?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  timestamp: number;
  isThinking?: boolean;
  attachments?: AIAttachment[];
  audioUrl?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  mode: AIWorkMode;
  createdAt: number;
  lastMessageAt: number;
  preview: string;
}

export type AIModelVersion = 
  | 'gemini-3-flash-preview' 
  | 'gemini-3-pro-preview' 
  | 'gemini-flash-latest' 
  | 'gemini-flash-lite-latest'
  | 'gpt-4o'
  | 'gpt-4-turbo'
  | 'llama-3-local'
  | 'mistral-local'
  | 'stable-diffusion-xl';
