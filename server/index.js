
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
  
  const fileId = path.basename(req.file.filename, path.extname(req.file.filename));

  try {
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

// --- STANDARD IMAGE PROCESSING ---
app.post('/api/process', async (req, res) => {
  const { id, options } = req.body;
  const files = await fs.promises.readdir(UPLOAD_DIR);
  const fileName = files.find(f => f.startsWith(id));
  
  if (!fileName) return res.status(404).json({ error: 'File not found' });
  
  const originalExt = path.extname(fileName).toLowerCase().replace('.', '');
  let targetFormat = options.format;
  
  if (targetFormat === 'original') {
    if (['bmp', 'png', 'webp', 'gif', 'avif', 'tiff'].includes(originalExt)) {
      targetFormat = originalExt;
    } else {
      targetFormat = 'jpeg'; 
    }
  }

  const outExt = targetFormat === 'jpeg' ? 'jpg' : targetFormat;
  const outFilename = `processed_${uuidv4()}.${outExt}`;
  const outputPath = path.join(PROCESSED_DIR, outFilename);
  const filePath = path.join(UPLOAD_DIR, fileName);

  try {
    let p;
    if (options.rawWidth && options.rawHeight) {
      const isFourChannel = ['rgba', 'bgra', 'uyvy'].includes(options.rawPixelFormat || '');
      p = sharp(filePath, {
        raw: {
          width: options.rawWidth,
          height: options.rawHeight,
          channels: isFourChannel ? 4 : 3
        }
      });
    } else if (fileName.toLowerCase().endsWith('.bmp')) {
      try {
        p = sharp(filePath);
        await p.metadata(); 
      } catch (e) {
        const buffer = fs.readFileSync(filePath);
        const bmpData = bmp.decode(buffer);
        const abgr = bmpData.data;
        const rgba = Buffer.alloc(abgr.length);
        
        for (let i = 0; i < abgr.length; i += 4) {
          const alpha = abgr[i];
          const blue = abgr[i + 1];
          const green = abgr[i + 2];
          const red = abgr[i + 3];
          rgba[i]     = red;
          rgba[i + 1] = green;
          rgba[i + 2] = blue;
          rgba[i + 3] = alpha === 0 ? 255 : alpha; 
        }

        p = sharp(rgba, {
          raw: {
            width: bmpData.width,
            height: bmpData.height,
            channels: 4
          }
        });
      }
    } else {
      p = sharp(filePath);
    }

    if (options.rotate) p = p.rotate(options.rotate);
    if (options.flipX) p = p.flop();
    if (options.flipY) p = p.flip();
    if (options.grayscale) p = p.grayscale();
    if (options.blur) p = p.blur(options.blur);
    if (options.sharpen) p = p.sharpen();
    if (options.width || options.height) p = p.resize(options.width, options.height, { fit: options.resizeMode || 'cover' });
    
    if (targetFormat === 'bmp') {
      p = p.toColorspace('srgb').ensureAlpha();
      const { data: rgbaBuffer, info } = await p.raw().toBuffer({ resolveWithObject: true });
      const abgrBuffer = Buffer.alloc(rgbaBuffer.length);
      for (let i = 0; i < rgbaBuffer.length; i += 4) {
        const r = rgbaBuffer[i];
        const g = rgbaBuffer[i+1];
        const b = rgbaBuffer[i+2];
        const a = rgbaBuffer[i+3];
        abgrBuffer[i]   = a; 
        abgrBuffer[i+1] = b;
        abgrBuffer[i+2] = g;
        abgrBuffer[i+3] = r;
      }
      const bmpData = bmp.encode({
        data: abgrBuffer,
        width: info.width,
        height: info.height
      });
      fs.writeFileSync(outputPath, bmpData.data);
    } else {
      if (targetFormat === 'png') p = p.png(); 
      else if (targetFormat === 'webp') p = p.webp({ quality: options.quality }); 
      else p = p.jpeg({ quality: options.quality });
      await p.toFile(outputPath);
    }

    incrementStats();
    res.json({ url: `/api/processed/${outFilename}`, filename: outFilename, size: fs.statSync(outputPath).size });

  } catch (err) { 
    console.error("Processing Error", err);
    res.status(500).json({ error: 'Processing failed: ' + err.message }); 
  }
});

// --- AI PROCESSING (VISION / GEN / VEO) ---
app.post('/api/ai-process', async (req, res) => {
  if (!process.env.API_KEY) return res.status(500).json({ error: "API_KEY_MISSING" });
  
  const { id, task, prompt } = req.body;
  const files = await fs.promises.readdir(UPLOAD_DIR);
  const fileName = files.find(f => f.startsWith(id));

  if (!fileName) return res.status(404).json({ error: 'File not found' });
  const filePath = path.join(UPLOAD_DIR, fileName);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    // 1. Read file and prepare base64
    // Note: Sharp/bmp-js logic above might be needed if we want to support sending fixed BMPs to AI,
    // but for simplicity, we send the file as-is or convert to PNG if raw.
    // For now, assuming the input file is supported by Gemini (JPEG, PNG, WEBP).
    // If it's a RAW/BMP that gemini doesn't support, frontend should probably convert it first via standard process.
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg'; // Simplification
    const base64Data = fileBuffer.toString('base64');

    if (task === 'vision') {
      // --- VISION (Describe) ---
      const model = 'gemini-2.5-flash-image';
      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: base64Data } },
            { text: prompt || "Describe this image in detail." }
          ]
        }
      });
      incrementStats();
      return res.json({ aiText: response.text });

    } else if (task === 'generate-image') {
      // --- IMAGE GENERATION (Edit/Create) ---
      const model = 'gemini-2.5-flash-image';
      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType, data: base64Data } },
            { text: prompt || "Enhance this image." }
          ]
        }
      });

      // Extract image from response
      let outBase64 = null;
      if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
          for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) {
                  outBase64 = part.inlineData.data;
                  break;
              }
          }
      }

      if (outBase64) {
          const outFilename = `ai_gen_${uuidv4()}.png`;
          const outputPath = path.join(PROCESSED_DIR, outFilename);
          fs.writeFileSync(outputPath, Buffer.from(outBase64, 'base64'));
          incrementStats();
          return res.json({ 
            url: `/api/processed/${outFilename}`, 
            filename: outFilename, 
            mimeType: 'image/png',
            aiText: response.text // Optional text explanation
          });
      } else {
         return res.status(500).json({ error: "AI did not return an image. It might have refused the request." });
      }

    } else if (task === 'generate-video') {
      // --- VIDEO GENERATION (Veo) ---
      const model = 'veo-3.1-fast-generate-preview';
      
      let operation = await ai.models.generateVideos({
        model: model,
        prompt: prompt || "Animate this image cinematically.",
        image: {
          imageBytes: base64Data,
          mimeType: mimeType
        },
        config: {
            numberOfVideos: 1,
            resolution: '720p',
            aspectRatio: '16:9' // Veo default
        }
      });

      // Polling loop
      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({operation: operation});
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
         // Fetch the video content using the API Key
         const vidRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
         if (!vidRes.ok) throw new Error("Failed to download generated video");
         
         const arrayBuffer = await vidRes.arrayBuffer();
         const outFilename = `ai_video_${uuidv4()}.mp4`;
         const outputPath = path.join(PROCESSED_DIR, outFilename);
         fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
         
         incrementStats();
         return res.json({
             url: `/api/processed/${outFilename}`,
             filename: outFilename,
             mimeType: 'video/mp4'
         });
      } else {
         throw new Error("Video generation completed but no URI returned.");
      }
    } else {
      return res.status(400).json({ error: "Invalid task type" });
    }

  } catch (err) {
    console.error("AI Processing Error", err);
    res.status(500).json({ error: 'AI Error: ' + (err.message || err.toString()) });
  }
});

// --- STOCK ANALYSIS ---
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
