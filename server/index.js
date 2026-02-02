
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import bmp from 'bmp-js'; // Import bmp-js for fallback decoding
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

const stockCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; 

[UPLOAD_DIR, PROCESSED_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage });

function incrementStats() {
  try {
    const stats = fs.existsSync(STATS_FILE) ? JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) : { processedCount: 0 };
    stats.processedCount += 1;
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
  } catch (e) {}
}

app.get('/api/stats', (req, res) => {
  try {
    res.json(fs.existsSync(STATS_FILE) ? JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')) : { processedCount: 0 });
  } catch (e) { res.json({ processedCount: 0 }); }
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  
  // FIX 1: Generate ID based on the ACTUAL saved filename immediately.
  // This prevents the "File not found" error where the catch block previously returned a mismatched random UUID.
  const fileId = path.basename(req.file.filename, path.extname(req.file.filename));

  try {
    // Try standard metadata extraction (works for JPG, PNG, some BMPs)
    const meta = await sharp(req.file.path).metadata();
    res.json({ 
      id: fileId, 
      filename: req.file.filename, 
      url: `/api/files/${req.file.filename}`, 
      originalName: req.file.originalname, 
      size: req.file.size, 
      width: meta.width, 
      height: meta.height, 
      format: meta.format 
    });
  } catch (err) { 
    // FIX 2: Fallback for BMPs that sharp fails to read.
    // We use bmp-js to parse the header so the frontend gets the correct dimensions.
    let fallbackMeta = {};
    if (req.file.originalname.toLowerCase().endsWith('.bmp')) {
       try {
         const buffer = fs.readFileSync(req.file.path);
         const bmpData = bmp.decode(buffer);
         fallbackMeta = { width: bmpData.width, height: bmpData.height };
       } catch (bmpErr) {
         console.error("BMP decode failed", bmpErr);
       }
    }

    // Return the consistent fileId even if metadata failed
    res.json({ 
      id: fileId, 
      filename: req.file.filename, 
      url: `/api/files/${req.file.filename}`, 
      originalName: req.file.originalname, 
      size: req.file.size,
      ...fallbackMeta 
    }); 
  }
});

app.use('/api/files', express.static(UPLOAD_DIR));
app.use('/api/processed', express.static(PROCESSED_DIR));

app.post('/api/process', async (req, res) => {
  const { id, options } = req.body;
  
  // Async readdir to prevent blocking
  const files = await fs.promises.readdir(UPLOAD_DIR);
  const fileName = files.find(f => f.startsWith(id));
  
  if (!fileName) return res.status(404).json({ error: 'File not found' });
  
  const outFilename = `processed_${uuidv4()}.${options.format === 'original' ? 'jpg' : options.format}`;
  const outputPath = path.join(PROCESSED_DIR, outFilename);
  const filePath = path.join(UPLOAD_DIR, fileName);

  try {
    let p;

    // --- Input Handling Logic ---
    if (options.rawWidth && options.rawHeight) {
      // 1. Explicit RAW config from frontend
      const isFourChannel = ['rgba', 'bgra', 'uyvy'].includes(options.rawPixelFormat || '');
      p = sharp(filePath, {
        raw: {
          width: options.rawWidth,
          height: options.rawHeight,
          channels: isFourChannel ? 4 : 3
        }
      });
    } else if (fileName.toLowerCase().endsWith('.bmp')) {
      // 2. BMP Logic: Try native first, fall back to bmp-js decoding
      try {
        p = sharp(filePath);
        await p.metadata(); // Verify native support
      } catch (e) {
        // Native failed, use bmp-js
        const buffer = fs.readFileSync(filePath);
        const bmpData = bmp.decode(buffer);
        p = sharp(bmpData.data, {
          raw: {
            width: bmpData.width,
            height: bmpData.height,
            channels: 4 // bmp-js returns rgba/abgr
          }
        });
      }
    } else {
      // 3. Standard Logic
      p = sharp(filePath);
    }

    // --- Transformations ---
    if (options.rotate) p = p.rotate(options.rotate);
    if (options.flipX) p = p.flop();
    if (options.flipY) p = p.flip();
    if (options.grayscale) p = p.grayscale();
    if (options.blur) p = p.blur(options.blur);
    if (options.sharpen) p = p.sharpen();
    if (options.width || options.height) p = p.resize(options.width, options.height, { fit: options.resizeMode || 'cover' });
    
    // --- Output Format ---
    if (options.format === 'png') p = p.png(); 
    else if (options.format === 'webp') p = p.webp({ quality: options.quality }); 
    else if (options.format === 'bmp') p = p.toFormat('bmp');
    else p = p.jpeg({ quality: options.quality });

    await p.toFile(outputPath);
    incrementStats();
    res.json({ url: `/api/processed/${outFilename}`, filename: outFilename, size: fs.statSync(outputPath).size });

  } catch (err) { 
    console.error("Processing Error", err);
    res.status(500).json({ error: 'Processing failed: ' + err.message }); 
  }
});

function getSecId(ticker) {
  if (/^[6]/.test(ticker)) return `1.${ticker}`; 
  if (/^[03]/.test(ticker)) return `0.${ticker}`; 
  if (/^[5]/.test(ticker)) return `1.${ticker}`; 
  if (/^[1]/.test(ticker)) return `0.${ticker}`; 
  return null;
}

async function fetchRealTimeQuote(ticker) {
  const secid = getSecId(ticker);
  if (!secid) return null;
  try {
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f59,f60,f161,f162,f163,f164,f167,f168,f169,f170,f171,f116`;
    const response = await fetch(url);
    const json = await response.json();
    if (!json.data) return null;
    const d = json.data;
    const scale = Math.pow(10, d.f59 || 2);
    
    return {
      name: d.f58, 
      price: d.f43 / scale, 
      open: d.f46 / scale, 
      high: d.f44 / scale, 
      low: d.f45 / scale, 
      vol: d.f47, 
      turnover: d.f168 / 100, 
      changePercent: d.f170 / 100, 
      pe: d.f162 / 100, 
      pb: d.f167 / 100, 
      isETF: /ETF/.test(d.f58) || /基金/.test(d.f58)
    };
  } catch (e) { return null; }
}

async function fetchHistoricalKLines(ticker, limit = 180) {
  const secid = getSecId(ticker);
  if (!secid) return [];
  try {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&end=20500101&lmt=${limit}`;
    const response = await fetch(url);
    const json = await response.json();
    if (!json.data || !json.data.klines) return [];
    
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    return json.data.klines.map(line => {
      const [date, open, close, high, low, vol, amount, amplitude, pctChange, changeAmt, turnover] = line.split(',');
      return {
        date,
        open: parseFloat(open),
        close: parseFloat(close),
        high: parseFloat(high),
        low: parseFloat(low),
        volume: parseFloat(vol)
      };
    }).filter(k => new Date(k.date) <= today); 
  } catch (e) { return []; }
}

app.post('/api/analyze-stock', async (req, res) => {
  const { code, forceSearch, lang } = req.body;
  const userLang = lang || 'en';
  if (!process.env.API_KEY) return res.status(500).json({ error: "API_KEY_MISSING" });
  const ticker = code.trim().toUpperCase();

  const cacheKey = `${ticker}_${userLang}`;

  if (!forceSearch && stockCache.has(cacheKey)) {
    const cached = stockCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
       return res.json({ ...cached.data, isCached: true });
    }
  }

  const [realQuote, history] = await Promise.all([
    fetchRealTimeQuote(ticker),
    fetchHistoricalKLines(ticker)
  ]);

  let high180 = 0;
  let low180 = 0;
  if (history.length > 0) {
    high180 = Math.max(...history.map(h => h.high));
    low180 = Math.min(...history.map(h => h.low));
    if (realQuote) {
      high180 = Math.max(high180, realQuote.high);
      low180 = Math.min(low180, realQuote.low);
    }
  } else if (realQuote) {
    high180 = realQuote.high;
    low180 = realQuote.low;
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-flash-preview';

  const trendContext = history.length > 0 ? history.slice(-10).map(h => `${h.date}: ${h.close}`).join(', ') : 'No history';
  const targetLangName = userLang === 'zh' ? 'Chinese (Simplified)' : 'English';

  const contextData = realQuote ? 
    `Asset: ${ticker} (${realQuote.name}). Current Price: ${realQuote.price}, Change: ${realQuote.changePercent}%. Metrics: PE=${realQuote.pe}, PB=${realQuote.pb}. 180-Day Statistics: Range [${low180.toFixed(3)} - ${high180.toFixed(3)}]. Recent 10-day Closes: [${trendContext}].` :
    `No real-time data for ${ticker}. Perform general market analysis based on historical knowledge.`;

  const prompt = `${contextData}
  As an Expert Financial Analyst, generate a structured market intelligence report.
  CRITICAL: Every single word of the "shortTerm", "longTerm", "trendFollower", and "risks" fields MUST be in ${targetLangName}. 
  Do not include any English technical terms in those fields if the language is Chinese.
  OUTPUT JSON FORMAT ONLY:
  {
    "sentiment": number (0-100),
    "strategyAdvice": { 
      "shortTerm": "Advice in ${targetLangName}", 
      "longTerm": "Advice in ${targetLangName}", 
      "trendFollower": "Advice in ${targetLangName}" 
    },
    "risks": ["Risk 1 in ${targetLangName}", "Risk 2 in ${targetLangName}"]
  }`;

  try {
    const result = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const aiData = JSON.parse(result.text);
    
    const finalData = {
      code: ticker,
      name: realQuote?.name || ticker,
      market: realQuote?.isETF ? "ETF" : (getSecId(ticker)?.startsWith('1') ? "SH" : "SZ"),
      currentPrice: realQuote?.price || 0,
      changePercent: realQuote?.changePercent || 0,
      pe: realQuote?.pe || 0,
      pb: realQuote?.pb || 0,
      high52: high180, 
      low52: low180,
      sentiment: aiData.sentiment,
      strategyAdvice: aiData.strategyAdvice,
      risks: aiData.risks,
      dataSource: realQuote ? "Real-time + Historical API" : "AI Simulation Only",
      lastUpdated: new Date().toISOString(),
      history: history
    };

    if (finalData.history && finalData.history.length > 0) {
      for (let i = 0; i < finalData.history.length; i++) {
        const calcMA = (period) => {
          if (i < period - 1) return null;
          const sum = finalData.history.slice(i - period + 1, i + 1).reduce((acc, curr) => acc + curr.close, 0);
          return parseFloat((sum / period).toFixed(3));
        };
        finalData.history[i].ma5 = calcMA(5);
        finalData.history[i].ma10 = calcMA(10);
        finalData.history[i].ma20 = calcMA(20);
      }
    }

    stockCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
    return res.json(finalData);

  } catch (err) {
    const isRateLimit = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('limit');
    const errorMsg = isRateLimit 
      ? (userLang === 'zh' ? "AI 接口限频 (Google Rate Limit)，请稍后再试" : "AI Rate limited. Please retry in 1 minute.")
      : (userLang === 'zh' ? "AI 引擎暂时无法生成策略 (AI Busy)" : "AI engine overloaded. Showing raw data only.");

    if (realQuote) {
      return res.json({
        code: ticker, name: realQuote.name, currentPrice: realQuote.price, changePercent: realQuote.changePercent,
        pe: realQuote.pe, pb: realQuote.pb, high52: high180, low52: low180,
        history, dataSource: "Real-time API",
        strategyAdvice: { shortTerm: errorMsg, longTerm: errorMsg, trendFollower: errorMsg },
        risks: [errorMsg],
        sentiment: 50
      });
    }
    res.status(500).json({ error: "FAIL", message: err.message });
  }
});

app.listen(PORT, () => console.log(`Backend Active: ${PORT}`));
