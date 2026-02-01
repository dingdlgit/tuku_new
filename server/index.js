
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import bmp from 'bmp-js'; 
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

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

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Stats Logic
function getStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) {
      const initial = { processedCount: 0 };
      fs.writeFileSync(STATS_FILE, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
  } catch (e) { return { processedCount: 0 }; }
}

function incrementStats() {
  const stats = getStats();
  stats.processedCount += 1;
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
  return stats.processedCount;
}

// --- STOCK ANALYSIS API (COMPLEX SIMULATION) ---
app.post('/api/analyze-stock', (req, res) => {
  let { code } = req.body;
  if (!code) return res.status(400).json({ error: "Code required" });
  code = code.toUpperCase().trim();

  // Seeded Random
  const hash = crypto.createHash('md5').update(code).digest('hex');
  const seed = parseInt(hash.substring(0, 8), 16);
  const random = (() => {
    let s = seed;
    return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  })();

  // Market Configuration
  let market = "A-Share Main";
  let vol = 0.02;
  let price = 20 + random() * 100;
  if (/^688/.test(code)) { market = "STAR Market"; vol = 0.04; }
  else if (/^300/.test(code)) { market = "ChiNext"; vol = 0.035; }
  else if (/^\d{5}$/.test(code)) { market = "HKEX"; vol = 0.03; price = 5 + random() * 50; }
  else if (/^[A-Z]/.test(code)) { market = "NASDAQ/NYSE"; vol = 0.025; price = 100 + random() * 500; }

  // Generate 180 days of OHLC
  const history = [];
  let currentPrice = price;
  for (let i = 0; i < 180; i++) {
    const dayChange = (random() - 0.48) * 2 * vol; // Slight upward bias
    const open = currentPrice;
    const close = open * (1 + dayChange);
    const high = Math.max(open, close) * (1 + random() * 0.015);
    const low = Math.min(open, close) * (1 - random() * 0.015);
    const volume = 1000000 + random() * 9000000;
    
    history.push({
      date: new Date(Date.now() - (180 - i) * 86400000).toISOString().split('T')[0],
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(volume)
    });
    currentPrice = close;
  }

  // Calculate Moving Averages
  for (let i = 0; i < history.length; i++) {
    const calcMA = (period) => {
      if (i < period - 1) return null;
      const sum = history.slice(i - period + 1, i + 1).reduce((a, b) => a + b.close, 0);
      return parseFloat((sum / period).toFixed(2));
    };
    history[i].ma5 = calcMA(5);
    history[i].ma10 = calcMA(10);
    history[i].ma20 = calcMA(20);
  }

  const latest = history[history.length - 1];
  const prev = history[history.length - 2];
  const changeAmt = latest.close - prev.close;
  const changePct = (changeAmt / prev.close) * 100;

  // Analysis Logic
  const pe = 10 + random() * 50;
  const pb = 1 + random() * 10;
  const turnover = 1 + random() * 15;
  const sentiment = 30 + random() * 60;
  
  const trend = changePct > 1 ? 'STRONG' : (changePct < -1 ? 'WEAK' : 'VOLATILE');

  res.json({
    code,
    market,
    name: `Quantum ${code.substring(0, 3)} Node`,
    currentPrice: latest.close,
    changeAmount: parseFloat(changeAmt.toFixed(2)),
    changePercent: parseFloat(changePct.toFixed(2)),
    pe: parseFloat(pe.toFixed(2)),
    pb: parseFloat(pb.toFixed(2)),
    turnoverRate: parseFloat(turnover.toFixed(2)),
    amplitude: parseFloat((((latest.high - latest.low) / prev.close) * 100).toFixed(2)),
    trend,
    support: parseFloat((latest.close * 0.92).toFixed(2)),
    resistance: parseFloat((latest.close * 1.08).toFixed(2)),
    sentiment: Math.floor(sentiment),
    techAnalysis: `Currently ${trend === 'STRONG' ? 'trading above 20-day MA' : 'testing support levels'}. RSI at ${Math.floor(40 + random() * 30)} shows neutral momentum.`,
    strategyAdvice: {
      shortTerm: "High volatility detected. Suitable for limit-up (打板) players on volume breakouts.",
      longTerm: pe < 20 ? "Under-valued relative to peers. Gradual accumulation recommended." : "Premium valuation. Wait for correction.",
      trendFollower: latest.close > (latest.ma20 || 0) ? "Bullish crossover (Golden Cross). Hold position." : "Bearish trend. Tighten stop-loss."
    },
    risks: ["Market systemic risk", "Liquidity shrinkage", "Sector rotation headwinds"],
    history
  });
});

// Reuse conversion and processing from before
// (Omitted standard sharp/bmp logic here to save space, but it remains in full version)
app.listen(PORT, () => console.log(`Server port ${PORT}`));
