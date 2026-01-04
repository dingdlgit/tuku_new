
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import bmp from 'bmp-js'; // Import bmp-js for fallback decoding AND encoding
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
    const instance = sharp(filePath, { 
      failOnError: false, 
      limitInputPixels: false 
    });
    
    // Check Metadata to ensure file is readable
    const metadata = await instance.metadata(); 

    // Specific check for files that are TRULY BMP but might be unsupported by libvips.
    if (metadata.format === 'bmp') {
        try {
           await instance.clone().resize(8, 8).toBuffer();
        } catch (e) {
           throw new Error('Libvips failed to render BMP pixel data');
        }
    }
    
    return instance.rotate().toColorspace('srgb');
  } catch (error) {
    // 2. Fallback: only strictly necessary for actual legacy/unsupported BMPs
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
          
          // CRITICAL FIX FOR INPUT:
          // Instead of copying A (abgr[i]), we FORCE opacity (255).
          // Many "24-bit" BMPs are saved as 32-bit XRGB where X is 0.
          // If we copy '0', the image becomes transparent (invisible).
          rgba[i + 3] = 255; 
        }

        return sharp(rgba, {
          raw: {
            width: bitmap.width,
            height: bitmap.height,
            channels: 4
          }
        }).toColorspace('srgb');

      } catch (bmpError) {
        console.error('bmp-js fallback also failed:', bmpError);
        throw error; 
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
    console.error('Metadata extraction completely failed:', error.message);
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
  }
  if (format === 'jpg') format = 'jpeg';

  const outputFilename = `tuku_${id}_${Date.now()}.${format}`;
  const outputPath = path.join(PROCESSED_DIR, outputFilename);

  console.log(`Processing image ${id} -> ${format}`);

  try {
    const instance = await getSharpInstance(inputPath);
    const metadata = await instance.metadata();
    const is16Bit = metadata.depth === 'ushort' || metadata.depth === 'short';

    let pipeline = instance.clone();
    
    // SAFETY FIX: 
    // If the input is BMP, we force remove alpha channel immediately.
    // Even if we fixed the bmp-js loader, libvips might have loaded a 32-bit BMP (XRGB) as RGBA(0).
    // Removing alpha forces it to ignore the transparency channel and keep pixel values.
    // We DO NOT do this for PNG/WebP, as users might want to preserve transparency there.
    if (metadata.format === 'bmp' || path.extname(originalFile).toLowerCase() === '.bmp') {
        pipeline = pipeline.removeAlpha();
    }

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
        const { data: buffer, info } = await pipeline
          .ensureAlpha() // Add opaque alpha back if it was removed
          .toColorspace('srgb')
          .raw()
          .toBuffer({ resolveWithObject: true });

        const abgrBuffer = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i += 4) {
          abgrBuffer[i]     = 255;             // Force Opaque Output
          abgrBuffer[i + 1] = buffer[i + 2];   // B
          abgrBuffer[i + 2] = buffer[i + 1];   // G
          abgrBuffer[i + 3] = buffer[i];       // R
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
