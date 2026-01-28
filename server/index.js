
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import bmp from 'bmp-js'; 
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import crypto from 'crypto'; // Added for consistent random generation

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Directories
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const PROCESSED_DIR = path.join(__dirname, 'processed');
// Change: Store stats in a dedicated 'data' folder
const DATA_DIR = path.join(__dirname, 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR);
// Change: Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// Helper: Delete old files
const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 mins
setInterval(() => {
  const now = Date.now();
  // Only cleanup uploads and processed, DO NOT touch DATA_DIR
  [UPLOAD_DIR, PROCESSED_DIR].forEach(dir => {
    fs.readdir(dir, (err, files) => {
      if (err) return;
      files.forEach(file => {
        const filePath = path.join(dir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (now - stats.mtimeMs > CLEANUP_INTERVAL) {
            fs.unlink(filePath, () => {});
          }
        });
      });
    });
  });
}, CLEANUP_INTERVAL);

// Helper: Stats Persistence
function getStats() {
  try {
    if (!fs.existsSync(STATS_FILE)) {
      const initial = { processedCount: 0 };
      fs.writeFileSync(STATS_FILE, JSON.stringify(initial));
      return initial;
    }
    const data = fs.readFileSync(STATS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading stats:", error);
    return { processedCount: 0 };
  }
}

function incrementStats() {
  try {
    const stats = getStats();
    stats.processedCount += 1;
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
    return stats.processedCount;
  } catch (error) {
    console.error("Error updating stats:", error);
    return 0;
  }
}

// Serve static files
app.use('/api/uploads', express.static(UPLOAD_DIR));
app.use('/api/processed', express.static(PROCESSED_DIR));

// --- PIXEL CONVERSION HELPERS ---
function convertYuvPixelToRgb(y, u, v, outBuffer, offset) {
  const c = y - 16;
  const d = u - 128;
  const e = v - 128;
  const r = (298 * c + 409 * e + 128) >> 8;
  const g = (298 * c - 100 * d - 208 * e + 128) >> 8;
  const b = (298 * c + 516 * d + 128) >> 8;
  outBuffer[offset] = Math.max(0, Math.min(255, r));
  outBuffer[offset + 1] = Math.max(0, Math.min(255, g));
  outBuffer[offset + 2] = Math.max(0, Math.min(255, b));
  outBuffer[offset + 3] = 255;
}

function uyvyToRgba(buffer, width, height) {
  const numPixels = width * height;
  const rgba = Buffer.alloc(numPixels * 4);
  let ptr = 0;
  let outPtr = 0;
  for (let i = 0; i < numPixels / 2; i++) {
    if (ptr + 3 >= buffer.length) break;
    const u = buffer[ptr];
    const y0 = buffer[ptr + 1];
    const v = buffer[ptr + 2];
    const y1 = buffer[ptr + 3];
    ptr += 4;
    convertYuvPixelToRgb(y0, u, v, rgba, outPtr);
    outPtr += 4;
    convertYuvPixelToRgb(y1, u, v, rgba, outPtr);
    outPtr += 4;
  }
  return rgba;
}

function yuy2ToRgba(buffer, width, height) {
  const numPixels = width * height;
  const rgba = Buffer.alloc(numPixels * 4);
  let ptr = 0;
  let outPtr = 0;
  for (let i = 0; i < numPixels / 2; i++) {
    if (ptr + 3 >= buffer.length) break;
    const y0 = buffer[ptr];
    const u = buffer[ptr + 1];
    const y1 = buffer[ptr + 2];
    const v = buffer[ptr + 3];
    ptr += 4;
    convertYuvPixelToRgb(y0, u, v, rgba, outPtr);
    outPtr += 4;
    convertYuvPixelToRgb(y1, u, v, rgba, outPtr);
    outPtr += 4;
  }
  return rgba;
}

function nv21ToRgba(buffer, width, height) {
  const numPixels = width * height;
  const rgba = Buffer.alloc(numPixels * 4);
  const ySize = width * height;
  const uvOffset = ySize;
  if (buffer.length < width * height * 1.5) {
      console.warn("Buffer too small for NV21 at " + width + "x" + height);
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
       const yIndex = y * width + x;
       const yVal = buffer[yIndex];
       const uvIndex = uvOffset + Math.floor(y/2) * width + Math.floor(x/2) * 2;
       let vVal = 128, uVal = 128;
       if (uvIndex + 1 < buffer.length) {
         vVal = buffer[uvIndex];
         uVal = buffer[uvIndex + 1];
       }
       const outPtr = yIndex * 4;
       convertYuvPixelToRgb(yVal, uVal, vVal, rgba, outPtr);
    }
  }
  return rgba;
}

async function getSharpInstance(filePath, rawOptions = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const STANDARD_FORMATS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.tiff', '.tif', '.svg'];
  const isStandard = STANDARD_FORMATS.includes(ext);
  const explicitRaw = !isStandard && !!(rawOptions.width && rawOptions.height && rawOptions.pixelFormat);
  const implicitRaw = ['.uyvy', '.yuv', '.nv21', '.rgb', '.rgba', '.bgra', '.bgr', '.bin', '.raw'].includes(ext);

  if (!isStandard && (explicitRaw || implicitRaw)) {
    const stats = fs.statSync(filePath);
    const size = stats.size;
    let width, height;
    let pixelFormat = rawOptions.pixelFormat || 'uyvy'; 
    if (rawOptions.width && rawOptions.height) {
        width = rawOptions.width;
        height = rawOptions.height;
    } else {
        const KNOWN_RESOLUTIONS = {
            5898240: [1920, 1536], 
            4147200: [1920, 1080], 
            1843200: [1280, 720], 
            614400:  [640, 480],   
        };
        const dims = KNOWN_RESOLUTIONS[size];
        if (dims) {
            [width, height] = dims;
        }
    }

    if (width && height) {
      const buffer = fs.readFileSync(filePath);
      let rgbaBuffer;
      switch (pixelFormat.toLowerCase()) {
          case 'uyvy': rgbaBuffer = uyvyToRgba(buffer, width, height); break;
          case 'yuy2': rgbaBuffer = yuy2ToRgba(buffer, width, height); break;
          case 'nv21': rgbaBuffer = nv21ToRgba(buffer, width, height); break;
          case 'rgba': return sharp(buffer, { raw: { width, height, channels: 4 } }).toColorspace('srgb');
          case 'bgra':
              rgbaBuffer = Buffer.from(buffer);
              for (let i = 0; i < rgbaBuffer.length; i += 4) {
                  const b = rgbaBuffer[i];
                  const r = rgbaBuffer[i + 2];
                  rgbaBuffer[i] = r;
                  rgbaBuffer[i + 2] = b;
              }
              break;
          case 'rgb': return sharp(buffer, { raw: { width, height, channels: 3 } }).toColorspace('srgb');
          case 'bgr':
              const bgrBuf = Buffer.from(buffer);
              for (let i = 0; i < bgrBuf.length; i += 3) {
                  const b = bgrBuf[i];
                  const r = bgrBuf[i + 2];
                  bgrBuf[i] = r;
                  bgrBuf[i + 2] = b;
              }
              return sharp(bgrBuf, { raw: { width, height, channels: 3 } }).toColorspace('srgb');
          default: rgbaBuffer = uyvyToRgba(buffer, width, height); break;
      }
      return sharp(rgbaBuffer, { raw: { width: width, height: height, channels: 4 } }).toColorspace('srgb');
    }
  }

  if (ext === '.bmp') {
    try {
      const buffer = fs.readFileSync(filePath);
      const bitmap = bmp.decode(buffer);
      const rawData = bitmap.data; 
      const len = rawData.length;
      const width = bitmap.width;
      const height = bitmap.height;
      const rgba = Buffer.alloc(len);
      let maxAlpha = 0;
      for (let i = 0; i < len; i += 4) { if (rawData[i] > maxAlpha) maxAlpha = rawData[i]; }
      const forceOpaque = (maxAlpha === 0);
      for (let i = 0; i < len; i += 4) {
        const a = rawData[i]; const b = rawData[i + 1]; const g = rawData[i + 2]; const r = rawData[i + 3];
        rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = forceOpaque ? 255 : a;
      }
      return sharp(rgba, { raw: { width, height, channels: 4 } }).toColorspace('srgb');
    } catch (bmpError) { console.error("BMP Manual Decode Error:", bmpError); }
  }
  return sharp(filePath, { failOnError: false, limitInputPixels: false }).rotate().toColorspace('srgb');
}

// Routes
app.get('/api/stats', (req, res) => {
  const stats = getStats();
  res.json(stats);
});

// --- STOCK ANALYSIS API (ENHANCED MOCK) ---
app.post('/api/analyze-stock', (req, res) => {
  let { code } = req.body;
  
  if (!code) return res.status(400).json({ error: "Code required" });
  
  // Normalize code
  code = code.toUpperCase().trim();

  // --- Market Detection & Configuration ---
  let market = "UNKNOWN";
  let volatilityMultiplier = 1.0;
  let priceBase = 100;

  // 1. STAR Market (科创板) - 688xxx
  if (/^(SH)?688\d{3}$/.test(code)) {
    market = "CN - STAR Market (科创板)";
    volatilityMultiplier = 1.5; // Higher volatility
    priceBase = 60;
  } 
  // 2. ChiNext (创业板) - 300xxx, 301xxx
  else if (/^(SZ)?30[01]\d{3}$/.test(code)) {
    market = "CN - ChiNext (创业板)";
    volatilityMultiplier = 1.4;
    priceBase = 40;
  }
  // 3. Shanghai Main (沪市主板) - 60xxxx
  else if (/^(SH)?60\d{4}$/.test(code)) {
    market = "CN - SH Main (沪市主板)";
    volatilityMultiplier = 0.8; // More stable
    priceBase = 15;
  }
  // 4. Shenzhen Main (深市主板) - 00xxxx
  else if (/^(SZ)?00\d{4}$/.test(code)) {
    market = "CN - SZ Main (深市主板)";
    volatilityMultiplier = 1.0;
    priceBase = 12;
  }
  // 5. Beijing Exchange (北交所) - 8xxxxx, 4xxxxx
  else if (/^(BJ)?(8|4)\d{5}$/.test(code)) {
    market = "CN - Beijing SE (北交所)";
    volatilityMultiplier = 1.3;
    priceBase = 10;
  }
  // 6. Hong Kong (港股) - 5 digits (0xxxx)
  else if (/^\d{5}$/.test(code) || /^HK\d{5}$/.test(code)) {
    market = "HK - HKEX (港股)";
    volatilityMultiplier = 1.2;
    priceBase = 50; 
  }
  // 7. US Stocks (美股) - Letters only
  else if (/^[A-Z]{1,5}$/.test(code)) {
    market = "US - NYSE/NASDAQ (美股)";
    volatilityMultiplier = 1.1;
    priceBase = 150;
  }
  // Fallback
  else {
    market = "Global/OTC (其他市场)";
    volatilityMultiplier = 1.0;
    priceBase = 100;
  }

  // Consistent Random Generator based on code
  const hash = crypto.createHash('md5').update(code).digest('hex');
  const seed = parseInt(hash.substring(0, 8), 16);
  
  const random = (() => {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  })();

  // Generate Base Price based on hash magnitude to vary it from the default priceBase
  const magnitude = (seed % 5); 
  let startPrice = priceBase;
  if (magnitude === 0) startPrice *= 0.5; // Penny stock
  if (magnitude === 4) startPrice *= 5;   // High priced
  
  // Add some randomness to start price
  startPrice += (random() * startPrice * 0.2);

  const volatility = (0.01 + random() * 0.04) * volatilityMultiplier;
  const history = [];
  let currentP = startPrice;
  
  // Generate 60 days of history for a better chart
  const days = 60;
  for(let i=0; i<days; i++) {
     // Random walk
     const change = (random() - 0.5) * 2 * volatility;
     currentP = currentP * (1 + change);
     // Prevent negative prices
     if(currentP < 0.01) currentP = 0.01;
     
     history.push({
         date: new Date(Date.now() - (days - i) * 86400000).toISOString().split('T')[0],
         price: parseFloat(currentP.toFixed(2))
     });
  }

  const lastPrice = history[history.length - 1].price;
  const prevPrice = history[history.length - 2].price;
  const changePercent = ((lastPrice - prevPrice) / prevPrice) * 100;
  
  // Determine Trend based on overall movement in history
  const startP = history[0].price;
  const totalChange = (lastPrice - startP) / startP;
  
  let selectedTrend = 'VOLATILE';
  if (totalChange > 0.15) selectedTrend = 'STRONG';
  else if (totalChange < -0.15) selectedTrend = 'WEAK';
  
  // Customize analysis text slightly based on market
  const techPhrases = [
    "MACD shows a golden cross formation, indicating upward momentum.",
    "KDJ indicator is entering overbought territory, caution advised.",
    "Price is testing the 20-day moving average support level.",
    "RSI divergence suggests a potential reversal is imminent.",
    "Bollinger Bands are tightening, expecting a breakout soon."
  ];

  const strategies = [
    "Buy on dips near support levels.",
    "Wait and see, volume is low.",
    "Reduce position on rallies.",
    "Accumulate gradually in tranches.",
    "Short-term trading only, tight stop-loss."
  ];
  
  const riskList = [
    "Market volatility due to macroeconomic factors.",
    "Sector rotation might weaken this stock.",
    "Upcoming earnings report uncertainty.",
    "Liquidity issues in short term.",
    "Regulatory headwinds for this industry."
  ];

  res.json({
    code: code,
    market: market,
    currentPrice: lastPrice,
    changePercent: parseFloat(changePercent.toFixed(2)),
    trend: selectedTrend,
    techAnalysis: techPhrases[Math.floor(random() * techPhrases.length)],
    strategy: strategies[Math.floor(random() * strategies.length)],
    risks: riskList[Math.floor(random() * riskList.length)],
    history: history
  });
});


app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  console.log(`Processing upload: ${req.file.originalname} (${req.file.size} bytes)`);

  try {
    const imagePipeline = await getSharpInstance(req.file.path);
    const metadata = await imagePipeline.metadata();
    
    res.json({
      id: path.parse(req.file.filename).name,
      filename: req.file.filename,
      url: `/api/uploads/${req.file.filename}`,
      originalName: req.file.originalname,
      size: req.file.size,
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      depth: metadata.depth
    });
  } catch (error) {
    console.error('Metadata extraction failed:', error.message);
    res.json({
      id: path.parse(req.file.filename).name,
      filename: req.file.filename,
      url: `/api/uploads/${req.file.filename}`,
      originalName: req.file.originalname,
      size: req.file.size,
      width: 0, 
      height: 0
    });
  }
});

app.post('/api/process', async (req, res) => {
  const { id, options } = req.body;
  
  if (!id || !options) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const files = fs.readdirSync(UPLOAD_DIR);
  const originalFile = files.find(f => f.startsWith(id));
  
  if (!originalFile) {
    return res.status(404).json({ error: 'File not found or expired' });
  }

  const inputPath = path.join(UPLOAD_DIR, originalFile);
  
  let format = options.format;
  if (format === 'original') {
    format = path.extname(originalFile).slice(1).toLowerCase();
    if (['uyvy', 'yuv', 'nv21', 'rgb', 'raw', 'bin', 'bgra', 'rgba'].includes(format)) format = 'png';
  }
  if (format === 'jpg') format = 'jpeg';
  if (['uyvy', 'yuv', 'nv21', 'rgb', 'raw', 'bin', 'bgra', 'rgba'].includes(format)) format = 'png';

  const outputFilename = `tuku_${id}_${Date.now()}.${format}`;
  const outputPath = path.join(PROCESSED_DIR, outputFilename);

  console.log(`Processing image ${id} -> ${format}`);

  try {
    const rawOptions = {
        width: options.rawWidth,
        height: options.rawHeight,
        pixelFormat: options.rawPixelFormat
    };

    const instance = await getSharpInstance(inputPath, rawOptions);
    const metadata = await instance.metadata();
    let pipeline = instance.clone();
    pipeline = pipeline.ensureAlpha(); 

    if ((options.width && options.width > 0) || (options.height && options.height > 0)) {
      pipeline = pipeline.resize({
        width: options.width || null,
        height: options.height || null,
        fit: options.maintainAspectRatio ? (options.resizeMode || 'cover') : 'fill'
      });
    }

    if (options.rotate && options.rotate !== 0) {
        const intermediate = await pipeline.png().toBuffer();
        pipeline = sharp(intermediate); 
        pipeline = pipeline.rotate(options.rotate); 
    }

    if (options.flipX) pipeline = pipeline.flop();
    if (options.flipY) pipeline = pipeline.flip();

    if (options.grayscale) pipeline = pipeline.grayscale();
    if (options.blur > 0) pipeline = pipeline.blur(0.3 + options.blur);
    if (options.sharpen) pipeline = pipeline.sharpen();

    if (options.watermarkText) {
       const intermediateBuffer = await pipeline.png().toBuffer();
       pipeline = sharp(intermediateBuffer);
       
       const tempMeta = await pipeline.metadata();
       const svgWidth = tempMeta.width;
       const svgHeight = tempMeta.height;
       
       const fontSize = Math.max(Math.floor(svgWidth * 0.03), 20); 
       const lineHeight = fontSize * 1.2;
       const padding = fontSize; 
       
       const escapeXml = (unsafe) => {
          return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
              case '<': return '&lt;';
              case '>': return '&gt;';
              case '&': return '&amp;';
              case '\'': return '&apos;';
              case '"': return '&quot;';
            }
          });
       };

       const lines = options.watermarkText.split(/\r?\n/);
       const pos = options.watermarkPosition || 'bottom-right';

       let startX, startY, textAnchor;
       const totalTextHeight = (lines.length - 1) * lineHeight;

       switch (pos) {
         case 'top-left': textAnchor = 'start'; startX = padding; startY = padding + fontSize; break;
         case 'top-right': textAnchor = 'end'; startX = svgWidth - padding; startY = padding + fontSize; break;
         case 'center': textAnchor = 'middle'; startX = svgWidth / 2; startY = (svgHeight / 2) - ((lines.length * lineHeight) / 2) + fontSize; break;
         case 'bottom-left': textAnchor = 'start'; startX = padding; startY = svgHeight - padding - totalTextHeight; break;
         case 'bottom-right': default: textAnchor = 'end'; startX = svgWidth - padding; startY = svgHeight - padding - totalTextHeight; break;
       }

       const tspans = lines.map((line, i) => {
          const safeLine = escapeXml(line);
          const dy = i === 0 ? 0 : lineHeight;
          return `<tspan x="${startX}" dy="${dy}">${safeLine}</tspan>`;
       }).join('');

       const svgText = `<svg width="${svgWidth}" height="${svgHeight}"><style>.watermark { fill: rgba(255, 255, 255, 0.85); font-size: ${fontSize}px; font-weight: bold; font-family: 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif; text-anchor: ${textAnchor}; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); }</style><text x="${startX}" y="${startY}" class="watermark">${tspans}</text></svg>`;
       
       pipeline = pipeline.composite([{ input: Buffer.from(svgText), gravity: 'center' }]);
    }

    if (format === 'bmp') {
        const { data: buffer, info } = await pipeline.toColorspace('srgb').raw().toBuffer({ resolveWithObject: true });
        const abgrBuffer = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i += 4) {
          const r = buffer[i]; const g = buffer[i + 1]; const b = buffer[i + 2]; const a = buffer[i + 3];
          abgrBuffer[i] = a; abgrBuffer[i + 1] = b; abgrBuffer[i + 2] = g; abgrBuffer[i + 3] = r; 
        }
        const rawData = { data: abgrBuffer, width: info.width, height: info.height };
        const bmpData = bmp.encode(rawData);
        fs.writeFileSync(outputPath, bmpData.data);
    } else {
        if (['jpeg', 'jpg'].includes(format)) {
             pipeline = pipeline.flatten({ background: '#ffffff' });
             pipeline = pipeline.jpeg({ quality: options.quality });
        } else if (format === 'png') { pipeline = pipeline.png();
        } else if (format === 'webp') { pipeline = pipeline.webp({ quality: options.quality });
        } else if (format === 'avif') { pipeline = pipeline.avif({ quality: options.quality });
        } else { pipeline = pipeline.toFormat(format); }
        await pipeline.toFile(outputPath);
    }
    
    incrementStats();
    const stats = fs.statSync(outputPath);
    console.log(`Processing complete: ${outputFilename}`);

    res.json({
      url: `/api/processed/${outputFilename}`,
      filename: outputFilename,
      size: stats.size
    });

  } catch (error) {
    console.error('Processing error details:', error);
    const msg = error.message.includes('unsupported image format') ? 'Input format corrupted or unsupported.' : error.message;
    res.status(500).json({ error: `Processing failed: ${msg}` });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large (Max 20MB)' });
    }
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
