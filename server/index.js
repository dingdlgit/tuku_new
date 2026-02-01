
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

const stockCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 mins for successful results

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
  try {
    const meta = await sharp(req.file.path).metadata();
    res.json({ id: path.basename(req.file.filename, path.extname(req.file.filename)), filename: req.file.filename, url: `/api/files/${req.file.filename}`, originalName: req.file.originalname, size: req.file.size, width: meta.width, height: meta.height, format: meta.format });
  } catch (err) { res.json({ id: uuidv4(), filename: req.file.filename, url: `/api/files/${req.file.filename}`, originalName: req.file.originalname, size: req.file.size }); }
});

app.use('/api/files', express.static(UPLOAD_DIR));
app.use('/api/processed', express.static(PROCESSED_DIR));

app.post('/api/process', async (req, res) => {
  const { id, options } = req.body;
  const fileName = fs.readdirSync(UPLOAD_DIR).find(f => f.startsWith(id));
  if (!fileName) return res.status(404).json({ error: 'File not found' });
  const outFilename = `processed_${uuidv4()}.${options.format === 'original' ? 'jpg' : options.format}`;
  const outputPath = path.join(PROCESSED_DIR, outFilename);
  try {
    let p = sharp(path.join(UPLOAD_DIR, fileName));
    if (options.rotate) p = p.rotate(options.rotate);
    if (options.flipX) p = p.flop();
    if (options.flipY) p = p.flip();
    if (options.grayscale) p = p.grayscale();
    if (options.blur) p = p.blur(options.blur);
    if (options.sharpen) p = p.sharpen();
    if (options.width || options.height) p = p.resize(options.width, options.height, { fit: options.resizeMode || 'cover' });
    if (options.format === 'png') p = p.png(); else if (options.format === 'webp') p = p.webp({ quality: options.quality }); else p = p.jpeg({ quality: options.quality });
    await p.toFile(outputPath);
    incrementStats();
    res.json({ url: `/api/processed/${outFilename}`, filename: outFilename, size: fs.statSync(outputPath).size });
  } catch (err) { res.status(500).json({ error: 'Fail' }); }
});

// --- ENHANCED FINANCIAL DATA FETCHER ---

function getSecId(ticker) {
  if (/^[6]/.test(ticker)) return `1.${ticker}`; // SH
  if (/^[03]/.test(ticker)) return `0.${ticker}`; // SZ
  if (/^[5]/.test(ticker)) return `1.${ticker}`; // SH ETF
  if (/^[1]/.test(ticker)) return `0.${ticker}`; // SZ ETF
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
    });
  } catch (e) { return []; }
}

app.post('/api/analyze-stock', async (req, res) => {
  const { code, forceSearch, lang } = req.body;
  const userLang = lang || 'en';
  if (!process.env.API_KEY) return res.status(500).json({ error: "API_KEY_MISSING" });
  const ticker = code.trim().toUpperCase();

  const cacheKey = `${ticker}_${userLang}`;

  // Use cache only if AI succeeded in the previous run
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
    `Asset: ${ticker} (${realQuote.name}). Price: ${realQuote.price}, Change: ${realQuote.changePercent}%. PE: ${realQuote.pe}, PB: ${realQuote.pb}. 180-Day Range: [${low180.toFixed(3)} - ${high180.toFixed(3)}]. Recent 10-day Close Prices: [${trendContext}].` :
    `No real-time data for ${ticker}. Perform general analysis.`;

  const prompt = `${contextData}
  As a Senior Quant Strategist, provide a comprehensive market report.
  CRITICAL: You MUST write ALL qualitative fields (shortTerm, longTerm, trendFollower, and risks) in ${targetLangName}.
  Market Sentiment should be 0-100. Strategy advice should be actionable based on the provided trend.
  OUTPUT JSON ONLY:
  {
    "sentiment": number,
    "strategyAdvice": { 
      "shortTerm": "string in ${targetLangName}", 
      "longTerm": "string in ${targetLangName}", 
      "trendFollower": "string in ${targetLangName}" 
    },
    "risks": ["string array in ${targetLangName}"]
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
      dataSource: realQuote ? "Real-time + Historical API" : "AI Simulation",
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

    // Success: Cache it
    stockCache.set(cacheKey, { data: finalData, timestamp: Date.now() });
    return res.json(finalData);

  } catch (err) {
    // Failure: Return real data but DO NOT cache the "Busy" result long-term
    const isRateLimit = err.message?.includes('429') || err.message?.includes('quota');
    const errorMsg = isRateLimit 
      ? (userLang === 'zh' ? "AI 接口限频，请 1 分钟后再试" : "AI Rate limited. Try again in 1 min.")
      : (userLang === 'zh' ? "AI 引擎暂时无法生成策略" : "AI engine unable to generate advice");

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
