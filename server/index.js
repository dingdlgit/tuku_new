
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import bmp from 'bmp-js'; 
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

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

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR);

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

// Serve static files
app.use('/api/uploads', express.static(UPLOAD_DIR));
app.use('/api/processed', express.static(PROCESSED_DIR));

// --- PIXEL CONVERSION HELPERS (For RAW formats) ---

function convertYuvPixelToRgb(y, u, v, outBuffer, offset) {
  // Standard BT.601 conversion
  const c = y - 16;
  const d = u - 128;
  const e = v - 128;

  const r = (298 * c + 409 * e + 128) >> 8;
  const g = (298 * c - 100 * d - 208 * e + 128) >> 8;
  const b = (298 * c + 516 * d + 128) >> 8;

  outBuffer[offset] = Math.max(0, Math.min(255, r));     // R
  outBuffer[offset + 1] = Math.max(0, Math.min(255, g)); // G
  outBuffer[offset + 2] = Math.max(0, Math.min(255, b)); // B
  outBuffer[offset + 3] = 255; // Alpha
}

/**
 * UYVY to RGBA (YUV 4:2:2 Packed)
 */
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

/**
 * YUY2 to RGBA (YUV 4:2:2 Packed)
 */
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

/**
 * NV21 to RGBA (YUV 4:2:0 Semi-Planar)
 */
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

/**
 * Robust Image Loader Helper
 */
async function getSharpInstance(filePath, rawOptions = {}) {
  const ext = path.extname(filePath).toLowerCase();
  
  const explicitRaw = !!(rawOptions.width && rawOptions.height && rawOptions.pixelFormat);
  const implicitRaw = ['.uyvy', '.yuv', '.nv21', '.rgb'].includes(ext);

  if (explicitRaw || implicitRaw) {
    const stats = fs.statSync(filePath);
    const size = stats.size;
    let width, height;
    
    let pixelFormat = rawOptions.pixelFormat || 'uyvy'; 

    if (rawOptions.width && rawOptions.height) {
        width = rawOptions.width;
        height = rawOptions.height;
        console.log(`Using manual raw config: ${width}x${height} ${pixelFormat}`);
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
            console.log(`Guessed resolution from size ${size}: ${width}x${height}`);
        }
    }

    if (width && height) {
      const buffer = fs.readFileSync(filePath);
      let rgbaBuffer;

      switch (pixelFormat.toLowerCase()) {
          case 'uyvy':
              rgbaBuffer = uyvyToRgba(buffer, width, height);
              break;
          case 'yuy2':
              rgbaBuffer = yuy2ToRgba(buffer, width, height);
              break;
          case 'nv21':
              rgbaBuffer = nv21ToRgba(buffer, width, height);
              break;
          case 'rgba':
              rgbaBuffer = buffer; 
              break;
          case 'rgb':
              return sharp(buffer, {
                  raw: { width, height, channels: 3 }
              }).toColorspace('srgb');
          default:
              console.warn(`Unknown pixel format ${pixelFormat}, defaulting to UYVY`);
              rgbaBuffer = uyvyToRgba(buffer, width, height);
              break;
      }
      
      return sharp(rgbaBuffer, {
        raw: {
          width: width,
          height: height,
          channels: 4
        }
      }).toColorspace('srgb');
    }
  }

  // --- BMP HANDLING (24-bit & 32-bit Robust Fix) ---
  if (ext === '.bmp') {
    try {
      console.log("Using Robust bmp-js decode for: " + filePath);
      const buffer = fs.readFileSync(filePath);
      const bitmap = bmp.decode(buffer);
      const rawData = bitmap.data; 
      // bmp-js output is ALWAYS formatted as ABGR (Alpha, Blue, Green, Red)
      // For 24-bit inputs, it auto-pads to 32-bit but sets Alpha to 0.

      const len = rawData.length;
      const width = bitmap.width;
      const height = bitmap.height;
      const rgba = Buffer.alloc(len);
      
      // 1. Detect if image is effectively opaque (24-bit or 32-bit without transparency)
      // Check a subset of pixels to see if Alpha is consistently 0
      let maxAlpha = 0;
      for (let i = 0; i < len; i += 4) {
           if (rawData[i] > maxAlpha) {
               maxAlpha = rawData[i];
           }
      }
      
      // If maxAlpha is 0, it means it's likely a 24-bit image (where bmp-js filled A=0)
      // In this case, we MUST force alpha to 255, otherwise it shows as transparent/black.
      const forceOpaque = (maxAlpha === 0);
      if (forceOpaque) console.log("Detected 24-bit BMP (Alpha=0), forcing opacity.");

      // 2. Map ABGR -> RGBA
      // bmp-js Buffer Layout: [A, B, G, R, A, B, G, R ...]
      // Sharp expects:        [R, G, B, A, R, G, B, A ...]
      for (let i = 0; i < len; i += 4) {
        const a = rawData[i];
        const b = rawData[i + 1];
        const g = rawData[i + 2];
        const r = rawData[i + 3];

        rgba[i]     = r;                // R
        rgba[i + 1] = g;                // G
        rgba[i + 2] = b;                // B
        rgba[i + 3] = forceOpaque ? 255 : a; // A
      }

      return sharp(rgba, { 
        raw: { width, height, channels: 4 } 
      }).toColorspace('srgb');

    } catch (bmpError) { 
      console.error("BMP Manual Decode Error:", bmpError);
      // Fallback: Try sharp native, but likely will fail if bmp-js failed
    }
  }

  // --- Standard Formats ---
  return sharp(filePath, { failOnError: false, limitInputPixels: false }).rotate().toColorspace('srgb');
}

// Routes
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
    if (['uyvy', 'yuv', 'nv21', 'rgb'].includes(format)) format = 'png';
  }
  if (format === 'jpg') format = 'jpeg';
  if (['uyvy', 'yuv', 'nv21', 'rgb'].includes(format)) format = 'png';

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
    
    // Force alpha channel for consistency
    pipeline = pipeline.ensureAlpha(); 

    let currentWidth = metadata.width;
    let currentHeight = metadata.height;

    // 1. Resize
    if ((options.width && options.width > 0) || (options.height && options.height > 0)) {
      if (options.width && options.height) {
         currentWidth = options.width;
         currentHeight = options.height;
      } else if (options.width) {
         currentWidth = options.width;
         if (options.maintainAspectRatio) {
            currentHeight = Math.round(metadata.height * (options.width / metadata.width));
         }
      } else if (options.height) {
         currentHeight = options.height;
         if (options.maintainAspectRatio) {
             currentWidth = Math.round(metadata.width * (options.height / metadata.height));
         }
      }

      pipeline = pipeline.resize({
        width: options.width || null,
        height: options.height || null,
        fit: options.maintainAspectRatio ? (options.resizeMode || 'cover') : 'fill'
      });
    }

    // 2. Rotate & Flip
    if (options.rotate) {
        pipeline = pipeline.rotate(options.rotate);
        if (Math.abs(options.rotate) === 90 || Math.abs(options.rotate) === 270) {
            [currentWidth, currentHeight] = [currentHeight, currentWidth];
        }
    }
    if (options.flipX) pipeline = pipeline.flop();
    if (options.flipY) pipeline = pipeline.flip();

    // 3. Filters
    if (options.grayscale) pipeline = pipeline.grayscale();
    if (options.blur > 0) pipeline = pipeline.blur(0.3 + options.blur);
    if (options.sharpen) pipeline = pipeline.sharpen();

    // 4. Watermark
    if (options.watermarkText) {
       const svgWidth = currentWidth;
       const svgHeight = currentHeight;
       const fontSize = Math.max(Math.floor(svgWidth * 0.05), 20);

       const svgText = `
        <svg width="${svgWidth}" height="${svgHeight}">
          <style>
            .title { 
              fill: rgba(255, 255, 255, 0.5); 
              font-size: ${fontSize}px; 
              font-weight: bold; 
              font-family: 'Noto Sans CJK SC', 'Microsoft YaHei', 'WenQuanYi Micro Hei', sans-serif; 
            }
          </style>
          <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" class="title">${options.watermarkText}</text>
        </svg>`;
       
       pipeline = pipeline.composite([{
          input: Buffer.from(svgText),
          gravity: 'center'
       }]);
    }

    // 5. Output Generation
    if (format === 'bmp') {
        // Sharp cannot write BMP natively in standard builds, use bmp-js.
        // Get raw RGBA buffer from Sharp (Sharp is always RGBA internally)
        const { data: buffer, info } = await pipeline
          .toColorspace('srgb')
          .raw()
          .toBuffer({ resolveWithObject: true });

        // Convert RGBA -> ABGR for bmp-js encoding
        // Sharp Buffer: [R, G, B, A, R, G, B, A...]
        // bmp-js Expects: Buffer where encode() maps [i+1]->B, [i+2]->G, [i+3]->R, [i]->A
        // So we must construct input buffer as: [A, B, G, R]
        
        const abgrBuffer = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i += 4) {
          const r = buffer[i];
          const g = buffer[i + 1];
          const b = buffer[i + 2];
          const a = buffer[i + 3];

          abgrBuffer[i]     = a; // Alpha (Byte 0)
          abgrBuffer[i + 1] = b; // Blue  (Byte 1)
          abgrBuffer[i + 2] = g; // Green (Byte 2)
          abgrBuffer[i + 3] = r; // Red   (Byte 3)
        }

        const rawData = {
          data: abgrBuffer,
          width: info.width,
          height: info.height
        };
        const bmpData = bmp.encode(rawData);
        fs.writeFileSync(outputPath, bmpData.data);

    } else {
        if (['jpeg', 'jpg'].includes(format)) {
             pipeline = pipeline.flatten({ background: '#ffffff' });
             pipeline = pipeline.jpeg({ quality: options.quality });
        } else if (format === 'png') {
            pipeline = pipeline.png();
        } else if (format === 'webp') {
            pipeline = pipeline.webp({ quality: options.quality });
        } else if (format === 'avif') {
            pipeline = pipeline.avif({ quality: options.quality });
        } else {
            pipeline = pipeline.toFormat(format);
        }
        
        await pipeline.toFile(outputPath);
    }
    
    const stats = fs.statSync(outputPath);
    console.log(`Processing complete: ${outputFilename}`);

    res.json({
      url: `/api/processed/${outputFilename}`,
      filename: outputFilename,
      size: stats.size
    });

  } catch (error) {
    console.error('Processing error details:', error);
    const msg = error.message.includes('unsupported image format') 
      ? 'Input format corrupted or unsupported.' 
      : error.message;
      
    res.status(500).json({ error: `Processing failed: ${msg}` });
  }
});

// Global Error Handler
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
