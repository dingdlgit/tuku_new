
import React from 'react';
import { ImageFormat, ProcessOptions, Language, RawPixelFormat, WatermarkPosition } from '../types';

interface ControlsProps {
  options: ProcessOptions;
  setOptions: React.Dispatch<React.SetStateAction<ProcessOptions>>;
  onProcess: () => void;
  isProcessing: boolean;
  originalDimensions?: { width: number; height: number };
  lang: Language;
  inputFormat?: string; // Passed from parent to detect if raw inputs are needed
}

export const Controls: React.FC<ControlsProps> = ({ 
  options, 
  setOptions, 
  onProcess, 
  isProcessing,
  originalDimensions,
  lang,
  inputFormat
}) => {
  
  const t = {
    en: {
      settings: "SYSTEM_CONFIG",
      sourceSettings: "RAW_DATA_INPUT",
      sourceDesc: "Required: Specify format & dimensions.",
      format: "OUTPUT_FORMAT",
      pixelFormat: "PIXEL_FORMAT",
      quality: "COMPRESSION",
      resize: "DIMENSIONS",
      maintainAspect: "LOCK_ASPECT",
      transform: "TRANSFORM",
      filters: "FILTERS",
      grayscale: "GRAYSCALE",
      sharpen: "SHARPEN",
      blur: "GAUSSIAN_BLUR",
      watermark: "WATERMARK",
      watermarkPos: "POSITION",
      posTL: "Top Left",
      posTR: "Top Right",
      posC: "Center",
      posBL: "Bottom Left",
      posBR: "Bottom Right",
      processBtn: "EXECUTE_PROCESS",
      processing: "PROCESSING..."
    },
    zh: {
      settings: "系统配置",
      sourceSettings: "RAW 数据源",
      sourceDesc: "必填：指定格式与尺寸",
      format: "输出格式",
      pixelFormat: "像素格式",
      quality: "压缩质量",
      resize: "尺寸调整",
      maintainAspect: "锁定比例",
      transform: "变换控制",
      filters: "图像滤镜",
      grayscale: "灰度模式",
      sharpen: "锐化增强",
      blur: "高斯模糊",
      watermark: "水印叠加",
      watermarkPos: "位置",
      posTL: "左上",
      posTR: "右上",
      posC: "居中",
      posBL: "左下",
      posBR: "右下",
      processBtn: "执行处理",
      processing: "处理中..."
    }
  }[lang];

  const updateOption = <K extends keyof ProcessOptions>(key: K, value: ProcessOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  // Helper to handle dimension changes with aspect ratio locking
  const handleDimensionChange = (dimension: 'width' | 'height', value: string) => {
    const numValue = value ? Number(value) : null;
    
    setOptions(prev => {
      const next = { ...prev, [dimension]: numValue };

      // Auto-calculate the other dimension if aspect ratio is locked and we have original dims
      // Note: originalDimensions.width > 0 check ensures we don't divide by zero or use invalid metadata
      if (
        prev.maintainAspectRatio && 
        originalDimensions && 
        originalDimensions.width > 0 && 
        originalDimensions.height > 0 && 
        numValue !== null
      ) {
        const ratio = originalDimensions.width / originalDimensions.height;
        
        if (dimension === 'width') {
          next.height = Math.round(numValue / ratio);
        } else {
          next.width = Math.round(numValue * ratio);
        }
      }
      return next;
    });
  };

  // Helper to handle toggling the checkbox
  const handleAspectToggle = (checked: boolean) => {
    setOptions(prev => {
      const next = { ...prev, maintainAspectRatio: checked };
      // If turning ON, and we have a width, sync the height immediately
      if (
        checked && 
        originalDimensions && 
        originalDimensions.width > 0 && 
        originalDimensions.height > 0 && 
        next.width
      ) {
         const ratio = originalDimensions.width / originalDimensions.height;
         next.height = Math.round(next.width / ratio);
      }
      return next;
    });
  };

  const isRaw = inputFormat && (
      ['.uyvy', '.yuv', '.nv21', '.raw', '.rgb', '.bgr', '.bgra', '.rgba', '.bin'].some(ext => inputFormat.toLowerCase().endsWith(ext))
  );

  return (
    <div className="bg-slate-900/80 backdrop-blur-md rounded-none border border-cyan-900/50 flex flex-col h-full overflow-hidden relative">
      {/* Header Accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-600 to-transparent"></div>

      <div className="p-4 border-b border-cyan-900/30 bg-slate-900/50 flex justify-between items-center">
        <h2 className="font-tech font-bold text-cyan-400 tracking-wider flex items-center">
          <span className="w-2 h-2 bg-cyan-500 mr-3 animate-pulse"></span>
          {t.settings}
        </h2>
        <div className="flex gap-1">
           <div className="w-1 h-1 bg-slate-600"></div>
           <div className="w-1 h-1 bg-slate-600"></div>
           <div className="w-1 h-1 bg-slate-600"></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
        
        {/* RAW Format Specific Settings */}
        {isRaw && (
          <section className="bg-amber-900/20 p-4 border-l-2 border-amber-500">
             <label className="block text-xs font-bold text-amber-500 mb-1 font-tech tracking-wider">{t.sourceSettings}</label>
             <p className="text-[10px] text-amber-400/70 mb-4 font-code">{t.sourceDesc}</p>
             
             <div className="mb-4">
               <label className="block text-[10px] font-semibold text-slate-400 mb-1 font-code">{t.pixelFormat}</label>
               <select
                 value={options.rawPixelFormat || 'uyvy'}
                 onChange={(e) => updateOption('rawPixelFormat', e.target.value as RawPixelFormat)}
                 className="w-full bg-black/40 border border-amber-500/30 text-amber-100 text-xs py-2 px-3 focus:outline-none focus:border-amber-500 font-code uppercase"
               >
                 <option value="uyvy">UYVY (YUV 4:2:2)</option>
                 <option value="nv21">NV21 (YUV 4:2:0)</option>
                 <option value="rgba">RGBA (32-bit)</option>
                 <option value="bgra">BGRA (32-bit)</option>
                 <option value="rgb">RGB (24-bit)</option>
                 <option value="bgr">BGR (24-bit)</option>
               </select>
             </div>

             <div className="flex gap-2 items-center">
                <div className="relative w-full">
                  <input
                    type="number"
                    placeholder="W"
                    value={options.rawWidth || ''}
                    onChange={(e) => updateOption('rawWidth', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-black/40 border border-amber-500/30 text-amber-100 text-xs py-2 px-3 pl-3 pr-8 focus:outline-none focus:border-amber-500 font-code"
                  />
                  <span className="absolute right-3 top-2 text-[10px] text-slate-500">px</span>
                </div>
                <span className="text-slate-600">×</span>
                <div className="relative w-full">
                  <input
                    type="number"
                    placeholder="H"
                    value={options.rawHeight || ''}
                    onChange={(e) => updateOption('rawHeight', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full bg-black/40 border border-amber-500/30 text-amber-100 text-xs py-2 px-3 pl-3 pr-8 focus:outline-none focus:border-amber-500 font-code"
                  />
                  <span className="absolute right-3 top-2 text-[10px] text-slate-500">px</span>
                </div>
              </div>
          </section>
        )}

        {/* Format */}
        <section>
          <label className="block text-xs font-bold text-cyan-500 mb-3 font-tech tracking-wider uppercase">{t.format}</label>
          <div className="grid grid-cols-3 gap-2">
            {[ImageFormat.ORIGINAL, ImageFormat.JPEG, ImageFormat.PNG, ImageFormat.WEBP, ImageFormat.BMP].map(fmt => (
              <button
                key={fmt}
                onClick={() => updateOption('format', fmt)}
                className={`px-2 py-2 text-[10px] border font-code uppercase transition-all
                  ${options.format === fmt 
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]' 
                    : 'bg-transparent border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                  }`}
              >
                {fmt === 'original' ? 'ORIG' : fmt}
              </button>
            ))}
          </div>
        </section>

        {options.format !== ImageFormat.PNG && options.format !== ImageFormat.BMP && (
          <section>
            <div className="flex justify-between mb-2">
              <label className="text-xs font-bold text-cyan-500 font-tech tracking-wider uppercase">{t.quality}</label>
              <span className="text-xs font-code text-cyan-300">{options.quality}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={options.quality}
              onChange={(e) => updateOption('quality', Number(e.target.value))}
              className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </section>
        )}

        {/* Dimensions */}
        <section>
          <label className="block text-xs font-bold text-cyan-500 mb-3 font-tech tracking-wider uppercase">{t.resize}</label>
          <div className="flex gap-2 items-center mb-3">
            <div className="relative w-full">
              <input
                type="number"
                placeholder={originalDimensions?.width ? originalDimensions.width.toString() : 'Width'}
                value={options.width || ''}
                onChange={(e) => handleDimensionChange('width', e.target.value)}
                className="w-full bg-black/40 border border-slate-700 text-cyan-100 text-xs py-2 px-3 focus:outline-none focus:border-cyan-500 font-code placeholder-slate-600"
              />
              <span className="absolute right-3 top-2 text-[10px] text-slate-600">W</span>
            </div>
            <span className="text-slate-600 text-xs">×</span>
            <div className="relative w-full">
              <input
                type="number"
                placeholder={originalDimensions?.height ? originalDimensions.height.toString() : 'Height'}
                value={options.height || ''}
                onChange={(e) => handleDimensionChange('height', e.target.value)}
                className="w-full bg-black/40 border border-slate-700 text-cyan-100 text-xs py-2 px-3 focus:outline-none focus:border-cyan-500 font-code placeholder-slate-600"
              />
              <span className="absolute right-3 top-2 text-[10px] text-slate-600">H</span>
            </div>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="aspect"
              checked={options.maintainAspectRatio}
              onChange={(e) => handleAspectToggle(e.target.checked)}
              className="h-3 w-3 text-cyan-600 bg-black border-slate-600 rounded focus:ring-cyan-500 focus:ring-offset-0"
            />
            <label htmlFor="aspect" className="ml-2 text-xs text-slate-400 font-code">{t.maintainAspect}</label>
          </div>
        </section>

        {/* Adjustments */}
        <section>
          <label className="block text-xs font-bold text-cyan-500 mb-3 font-tech tracking-wider uppercase">{t.transform}</label>
          <div className="flex gap-2 mb-2">
             <button 
               onClick={() => updateOption('rotate', (options.rotate - 90) % 360)}
               className="flex-1 py-1.5 border border-slate-700 bg-black/20 text-[10px] font-code text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors"
             >
               ROT -90°
             </button>
             <button 
               onClick={() => updateOption('rotate', (options.rotate + 90) % 360)}
               className="flex-1 py-1.5 border border-slate-700 bg-black/20 text-[10px] font-code text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors"
             >
               ROT +90°
             </button>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => updateOption('flipX', !options.flipX)}
              className={`flex-1 py-1.5 border text-[10px] font-code transition-colors ${options.flipX ? 'bg-cyan-900/40 border-cyan-500 text-cyan-400' : 'border-slate-700 bg-black/20 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50'}`}
            >
              FLIP H
            </button>
            <button 
              onClick={() => updateOption('flipY', !options.flipY)}
              className={`flex-1 py-1.5 border text-[10px] font-code transition-colors ${options.flipY ? 'bg-cyan-900/40 border-cyan-500 text-cyan-400' : 'border-slate-700 bg-black/20 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/50'}`}
            >
              FLIP V
            </button>
          </div>
        </section>

        {/* Filters */}
        <section>
           <label className="block text-xs font-bold text-cyan-500 mb-3 font-tech tracking-wider uppercase">{t.filters}</label>
           <div className="space-y-3">
             <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs text-slate-400 font-code">{t.grayscale}</span>
                <input 
                  type="checkbox" 
                  checked={options.grayscale}
                  onChange={(e) => updateOption('grayscale', e.target.checked)}
                  className="h-3 w-3 text-cyan-600 bg-black border-slate-600 rounded focus:ring-cyan-500 focus:ring-offset-0"
                />
             </div>
             <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs text-slate-400 font-code">{t.sharpen}</span>
                <input 
                  type="checkbox" 
                  checked={options.sharpen}
                  onChange={(e) => updateOption('sharpen', e.target.checked)}
                  className="h-3 w-3 text-cyan-600 bg-black border-slate-600 rounded focus:ring-cyan-500 focus:ring-offset-0"
                />
             </div>
             <div>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-slate-400 font-code">{t.blur}</span>
                  <span className="text-[10px] text-cyan-500 font-code">{options.blur}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="0.5"
                  value={options.blur}
                  onChange={(e) => updateOption('blur', Number(e.target.value))}
                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
             </div>
           </div>
        </section>

        {/* Watermark */}
        <section>
           <label className="block text-xs font-bold text-cyan-500 mb-3 font-tech tracking-wider uppercase">{t.watermark}</label>
           <div className="mb-2">
             <label className="block text-[10px] text-slate-500 mb-1 font-code">{t.watermarkPos}</label>
             <select 
               value={options.watermarkPosition || 'bottom-right'}
               onChange={(e) => updateOption('watermarkPosition', e.target.value as WatermarkPosition)}
               className="w-full bg-black/40 border border-slate-700 text-cyan-100 text-xs py-2 px-3 focus:outline-none focus:border-cyan-500 font-code uppercase"
             >
               <option value="top-left">{t.posTL}</option>
               <option value="top-right">{t.posTR}</option>
               <option value="center">{t.posC}</option>
               <option value="bottom-left">{t.posBL}</option>
               <option value="bottom-right">{t.posBR}</option>
             </select>
           </div>
           <textarea
             rows={2}
             placeholder=""
             value={options.watermarkText}
             onChange={(e) => updateOption('watermarkText', e.target.value)}
             className="w-full bg-black/40 border border-slate-700 text-cyan-100 text-xs py-2 px-3 focus:outline-none focus:border-cyan-500 font-code rounded-sm"
           />
        </section>
      </div>

      <div className="p-4 border-t border-cyan-900/30 bg-slate-900/50 relative">
        <button
          onClick={onProcess}
          disabled={isProcessing}
          className={`w-full py-3 px-4 font-tech font-bold uppercase tracking-widest text-sm clip-button transition-all relative overflow-hidden group
            ${isProcessing 
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
              : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)]'
            }
          `}
        >
          <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
          {isProcessing ? t.processing : t.processBtn}
        </button>
      </div>
    </div>
  );
};
