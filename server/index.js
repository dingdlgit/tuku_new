
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'processed');
const DATA_DIR = path.join(__dirname, 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

// Simple In-Memory Cache to prevent 429 Quota Exhaustion
const stockCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

[UPLOAD_DIR, PROCESSED_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

function getStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) {
      const initial = { processedCount: 0 };
      fs.writeFileSync(STATS_FILE, JSON.stringify(initial));
      return initial;
    }
    const content = fs.readFileSync(STATS_FILE, 'utf8').trim();
    return content ? JSON.parse(content) : { processedCount: 0 };
  } catch (e) { return { processedCount: 0 }; }
}

function incrementStats() {
  const stats = getStats();
  stats.processedCount += 1;
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
}

app.get('/api/stats', (req, res) => res.json(getStats()));

app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const metadata = await sharp(req.file.path).metadata();
    res.json({
      id: path.basename(req.file.filename, path.extname(req.file.filename)),
      filename: req.file.filename,
      url: `/api/files/${req.file.filename}`,
      originalName: req.file.originalname,
      size: req.file.size,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      depth: metadata.depth
    });
  } catch (err) {
    res.json({ id: uuidv4(), filename: req.file.filename, url: `/api/files/${req.file.filename}`, originalName: req.file.originalname, size: req.file.size });
  }
});

app.use('/api/files', express.static(UPLOAD_DIR));
app.use('/api/processed', express.static(PROCESSED_DIR));

app.post('/api/process', async (req, res) => {
  const { id, options } = req.body;
  const files = fs.readdirSync(UPLOAD_DIR);
  const fileName = files.find(f => f.startsWith(id));
  if (!fileName) return res.status(404).json({ error: 'File not found' });

  const inputPath = path.join(UPLOAD_DIR, fileName);
  const outFilename = `processed_${uuidv4()}.${options.format === 'original' ? 'jpg' : options.format}`;
  const outputPath = path.join(PROCESSED_DIR, outFilename);

  try {
    let pipeline = sharp(inputPath);
    if (options.rotate) pipeline = pipeline.rotate(options.rotate);
    if (options.flipX) pipeline = pipeline.flop();
    if (options.flipY) pipeline = pipeline.flip();
    if (options.grayscale) pipeline = pipeline.grayscale();
    if (options.blur) pipeline = pipeline.blur(options.blur);
    if (options.sharpen) pipeline = pipeline.sharpen();
    if (options.width || options.height) pipeline = pipeline.resize(options.width, options.height, { fit: options.resizeMode || 'cover' });

    if (options.format === 'png') pipeline = pipeline.png();
    else if (options.format === 'webp') pipeline = pipeline.webp({ quality: options.quality });
    else pipeline = pipeline.jpeg({ quality: options.quality });

    await pipeline.toFile(outputPath);
    incrementStats();
    res.json({ url: `/api/processed/${outFilename}`, filename: outFilename, size: fs.statSync(outputPath).size });
  } catch (err) { res.status(500).json({ error: 'Processing failed' }); }
});

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) { throw new Error("JSON_PARSE_ERROR"); }
    }
    throw e;
  }
}

app.post('/api/analyze-stock', async (req, res) => {
  const { code, forceSearch } = req.body;
  if (!process.env.API_KEY) return res.status(500).json({ error: "API_KEY_MISSING" });

  const ticker = code.trim().toUpperCase();

  // Check Cache first to save quota
  if (!forceSearch && stockCache.has(ticker)) {
    const cached = stockCache.get(ticker);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`Serving cached data for ${ticker}`);
      return res.json({ ...cached.data, isCached: true });
    }
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-flash-preview';

  const prompt = `Quant Analysis Request for "${ticker}". 
  1. Identify the asset. 513090 = E Fund HK Securities ETF.
  2. Use Google Search to get: Price, Change%, Premium/Discount Rate, 52-week High/Low.
  3. Output JSON ONLY.
  {
    "name": "string",
    "market": "string",
    "currentPrice": number,
    "changePercent": number,
    "premiumRate": number,
    "high52": number,
    "low52": number,
    "turnover": number,
    "sentiment": number,
    "strategyAdvice": { "shortTerm": "string", "longTerm": "string", "trendFollower": "string" },
    "risks": ["string"]
  }`;

  try {
    let result;
    try {
      // Primary attempt with Search Tool
      result = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { 
          responseMimeType: "application/json",
          tools: [{ googleSearch: {} }]
        }
      });
    } catch (apiErr) {
      // If 429 or Search tool failure, retry without search (Lite Mode)
      if (apiErr.message.includes('429') || apiErr.status === 'RESOURCE_EXHAUSTED') {
        console.warn("Quota exhausted, retrying in Lite Mode (no search)...");
        result = await ai.models.generateContent({
          model: modelName,
          contents: `Lite Analysis (Database Only) for Ticker "${ticker}". Output the same JSON schema as before.`,
          config: { responseMimeType: "application/json" }
        });
      } else {
        throw apiErr;
      }
    }

    const data = extractJson(result.text);
    data.lastUpdated = new Date().toISOString();
    data.isRealtime = !!result.candidates?.[0]?.groundingMetadata;

    // K-Line Simulation Logic (programmatic to save LLM tokens)
    const history = [];
    const DAYS = 180;
    const high = data.high52 || data.currentPrice * 1.15;
    const low = data.low52 || data.currentPrice * 0.85;
    let p = (high + low) / 2;
    
    for (let i = 0; i < DAYS; i++) {
      const remaining = DAYS - i;
      const drift = (data.currentPrice - p) / remaining;
      const vol = p * 0.012;
      const change = drift + (Math.random() - 0.5) * vol;
      const close = Math.max(low * 0.95, Math.min(high * 1.05, p + change));
      
      history.push({
        date: new Date(Date.now() - (DAYS - i) * 86400000).toISOString().split('T')[0],
        open: parseFloat(p.toFixed(3)),
        high: parseFloat((Math.max(p, close) * (1 + Math.random() * 0.004)).toFixed(3)),
        low: parseFloat((Math.min(p, close) * (1 - Math.random() * 0.004)).toFixed(3)),
        close: parseFloat(close.toFixed(3)),
        volume: Math.floor(1000000 + Math.random() * 5000000)
      });
      p = close;
    }
    history[history.length - 1].close = data.currentPrice;

    // Moving Averages
    for (let i = 0; i < history.length; i++) {
        const ma = (d) => i < d - 1 ? null : parseFloat((history.slice(i - d + 1, i + 1).reduce((a, b) => a + b.close, 0) / d).toFixed(3));
        history[i].ma5 = ma(5);
        history[i].ma10 = ma(10);
        history[i].ma20 = ma(20);
    }

    const finalResult = { ...data, history, code: ticker };
    
    // Save to cache
    stockCache.set(ticker, {
      data: finalResult,
      timestamp: Date.now()
    });

    return res.json(finalResult);

  } catch (err) {
    console.error("Analysis Critical Failure:", err);
    res.status(err.status === 429 ? 429 : 500).json({ 
      error: "ANALYSIS_FAILED", 
      message: err.message,
      isQuotaError: err.status === 429 
    });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
