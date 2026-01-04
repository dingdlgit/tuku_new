
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import bmp from 'bmp-js'; // Import bmp-js for fallback decoding
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

/**
 * Robust Image Loader Helper
 * Tries to load image with Sharp directly.
 * If that fails (common with legacy BMPs), falls back to bmp-js decoding.
 */
async function getSharpInstance(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  try {
    // 1. Try standard Sharp loading first.
    // Sharp uses libvips which sniffs the file content (Magic Numbers).
    // This handles cases where a file is named .bmp but contains PNG or JPEG data.
    const instance = sharp(filePath, { 
      failOnError: false, 
      limitInputPixels: false 
    });
    
    // Check Metadata to ensure file is readable and determine true format
    const metadata = await instance.metadata(); 

    // Specific check for files that are TRULY BMP (per metadata) but might be unsupported by libvips.
    // If metadata.format is 'png', 'jpeg', etc., even if extension is .bmp, we are fine.
    // If metadata.format is 'bmp', we try a small render to see if libvips crashes on the pixel data.
    if (metadata.format === 'bmp') {
        try {
           await instance.clone().resize(8, 8).toBuffer();
        } catch (e) {
           // If render fails, throw to trigger fallback
           throw new Error('Libvips failed to render BMP pixel data');
        }
    }
    
    return instance;
  } catch (error) {
    // 2. Fallback: only strictly necessary for actual legacy/unsupported BMPs
    // If standard loading failed, and it might be a BMP (by extension or implication), try bmp-js
    if (ext === '.bmp') {
      console.log(`Standard Sharp load failed for BMP-like file (${error.message}), switching to bmp-js fallback for: ${filePath}`);
      try {
        const buffer = fs.readFileSync(filePath);
        const bitmap = bmp.decode(buffer);
        
        // bmp-js returns data in ABGR format [A, B, G, R]
        // Sharp raw input expects RGBA format [R, G, B, A]
        const abgr = bitmap.data;
        const len = abgr.length;
        const rgba = Buffer.alloc(len);

        for (let i = 0; i < len; i += 4) {
          rgba[i]     = abgr[i + 3]; // R
          rgba[i + 1] = abgr[i + 2]; // G
          rgba[i + 2] = abgr[i + 1]; // B
          rgba[i + 3] = abgr[i];     // A
        }

        return sharp(rgba, {
          raw: {
            width: bitmap.width,
            height: bitmap.height,
            channels: 4
          }
        });

      } catch (bmpError) {
        console.error('bmp-js fallback also failed:', bmpError);
        throw error; // Throw original error
      }
    }
    throw error;
  }
}

// Routes
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  console.log(`Processing upload: ${req.file.originalname} (${req.file.size} bytes)`);

  try {
    // Use helper to get a valid instance (handles BMP/Misnamed files)
    const imagePipeline = await getSharpInstance(req.file.path);
    const metadata = await imagePipeline.metadata();
    
    console.log('Metadata extracted:', metadata.width, 'x', metadata.height, 'Format:', metadata.format, 'Depth:', metadata.depth);
    
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
    console.error('Metadata extraction completely failed:', error.message);
    // Even if we can't extract metadata (e.g. raw uyvy without header), we return success 
    // to allow the user to try processing it, though process step might fail if format is unrecognized.
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
  
  // Determine output format
  let format = options.format;
  if (format === 'original') {
    format = path.extname(originalFile).slice(1).toLowerCase();
  }

  const outputFilename = `tuku_${id}_${Date.now()}.${format}`;
  const outputPath = path.join(PROCESSED_DIR, outputFilename);

  console.log(`Processing image ${id} -> ${format}`);

  try {
    // Use helper to get valid instance
    const instance = await getSharpInstance(inputPath);
    
    // Check input depth to preserve it where possible
    const metadata = await instance.metadata();
    const is16Bit = metadata.depth === 'ushort' || metadata.depth === 'short';

    let pipeline = instance.clone();

    // 1. Resize
    if ((options.width && options.width > 0) || (options.height && options.height > 0)) {
      pipeline = pipeline.resize({
        width: options.width || null,
        height: options.height || null,
        fit: options.maintainAspectRatio ? (options.resizeMode || 'cover') : 'fill'
      });
    }

    // 2. Rotate & Flip
    if (options.rotate) pipeline = pipeline.rotate(options.rotate);
    if (options.flipX) pipeline = pipeline.flop();
    if (options.flipY) pipeline = pipeline.flip();

    // 3. Filters
    if (options.grayscale) pipeline = pipeline.grayscale();
    if (options.blur > 0) pipeline = pipeline.blur(0.3 + options.blur);
    if (options.sharpen) pipeline = pipeline.sharpen();

    // 4. Watermark
    if (options.watermarkText) {
       const width = options.width || 800;
       const svgText = `
        <svg width="${width}" height="100">
          <style>
            .title { 
              fill: rgba(255, 255, 255, 0.5); 
              font-size: 48px; 
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

    // 5. Format Output
    if (['jpeg', 'jpg'].includes(format)) {
        pipeline = pipeline.jpeg({ quality: options.quality });
    } else if (format === 'png') {
        const pngOptions = {};
        if (is16Bit) {
            pngOptions.bitdepth = 16;
            pngOptions.palette = false;
        }
        pipeline = pipeline.png(pngOptions);
    } else if (format === 'webp') {
        pipeline = pipeline.webp({ quality: options.quality });
    } else if (format === 'avif') {
        pipeline = pipeline.avif({ quality: options.quality });
    } else if (format === 'bmp') {
        // Explicit BMP support
        pipeline = pipeline.toFormat('bmp');
    } else {
        pipeline = pipeline.toFormat(format);
    }

    await pipeline.toFile(outputPath);
    
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
