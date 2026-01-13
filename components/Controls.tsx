
import React from 'react';
import { ImageFormat, ProcessOptions, Language, RawPixelFormat } from '../types';

interface ControlsProps {
  options: ProcessOptions;
  setOptions: React.Dispatch<React.SetStateAction<ProcessOptions>>;
  onProcess: () => void;
  isProcessing: boolean;
  originalDimensions?: { width: number; height: number };
  lang: Language;
  inputFormat?: string;
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
      sourceDesc: ">> MANUAL OVERRIDE REQUIRED: SPECIFY DIMENSIONS",
      format: "OUTPUT_FORMAT",
      pixelFormat: "PIXEL_MAPPING",
      quality: "COMPRESSION_LEVEL",
      resize: "DIMENSION_SCALING",
      maintainAspect: "LOCK_ASPECT_RATIO",
      transform: "GEOMETRY_TRANSFORM",
      filters: "VISUAL_FILTERS",
      grayscale: "ACHROMATIC_MODE",
      sharpen: "EDGE_ENHANCEMENT",
      blur: "GAUSSIAN_BLUR",
      watermark: "SECURITY_WATERMARK",
      watermarkPlaceholder: "INPUT_TEXT_STRING...",
      processBtn: "EXECUTE_PROCESS",
      processing: "PROCESSING_DATA..."
    },
    zh: {
      settings: "系统配置",
      sourceSettings: "原始数据源",
      sourceDesc: ">> 需要手动干预：指定 RAW 尺寸",
      format: "输出协议",
      pixelFormat: "像素映射",
      quality: "压缩等级",
      resize: "尺寸缩放",
      maintainAspect: "锁定长宽比",
      transform: "几何变换",
      filters: "视觉滤镜",
      grayscale: "去色模式",
      sharpen: "边缘增强",
      blur: "高斯模糊",
      watermark: "安全水印",
      watermarkPlaceholder: "输入文本字符串...",
      processBtn: "执行处理",
      processing: "数据处理中..."
    }
  }[lang];

  const updateOption = <K extends keyof ProcessOptions>(key: K, value: ProcessOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const isRaw = inputFormat && (
      ['.uyvy', '.yuv', '.nv21', '.raw', '.rgb', '.bgr', '.bgra', '.rgba', '.bin'].some(ext => inputFormat.toLowerCase().endsWith(ext))
  );

  return (
    <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 flex flex-col h-full overflow-hidden relative group">
      {/* Decor Line */}
      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-500 to-transparent opacity-50"></div>

      <div className="p-4 border-b border-slate-700 bg-slate-900/90 flex justify-between items-center">
        <h2 className="font-tech font-bold text-cyan-400 flex items-center tracking-widest text-lg">
          <span className="mr-2 text-xs opacity-50">[ 01 ]</span> {t.settings}
        </h2>
        <div className="flex space-x-1">
            <div className="w-1 h-1 bg-cyan-500 rounded-full animate-pulse"></div>
            <div className="w-1 h-1 bg-cyan-500 rounded-full animate-pulse delay-75"></div>
            <div className="w-1 h-1 bg-cyan-500 rounded-full animate-pulse delay-150"></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
        
        {/* RAW Settings */}
        {isRaw && (
          <section className="bg-yellow-900/20 p-4 border-l-2 border-yellow-500 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-1 opacity-20">
                <svg className="w-12 h-12 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
             </div>
             <label className="block text-xs font-code text-yellow-500 mb-1 uppercase tracking-widest">{t.sourceSettings}</label>
             <p className="text-[10px] font-code text-yellow-600/80 mb-4 border-b border-yellow-800/50 pb-2">{t.sourceDesc}</p>
             
             <div className="mb-4">
               <label className="block text-xs font-bold text-slate-400 mb-2 font-tech">{t.pixelFormat}</label>
               <select
                 value={options.rawPixelFormat || 'uyvy'}
                 onChange={(e) => updateOption('rawPixelFormat', e.target.value as RawPixelFormat)}
                 className="w-full px-3 py-2 text-sm bg-black border border-yellow-700/50 text-yellow-400 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none font-code uppercase"
               >
                 <option value="uyvy">UYVY (YUV 4:2:2)</option>
                 <option value="nv21">NV21 (YUV 4:2:0)</option>
                 <option value="rgba">RGBA (32-BIT)</option>
                 <option value="bgra">BGRA (32-BIT)</option>
                 <option value="rgb">RGB (24-BIT)</option>
                 <option value="bgr">BGR (24-BIT)</option>
               </select>
             </div>

             <div className="flex gap-3 items-center">
                <div className="relative w-full">
                  <input
                    type="number"
                    placeholder="W"
                    value={options.rawWidth || ''}
                    onChange={(e) => updateOption('rawWidth', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full pl-3 pr-8 py-2 text-sm bg-black border border-yellow-700/50 text-yellow-400 focus:border-yellow-500 outline-none font-code"
                  />
                  <span className="absolute right-3 top-2 text-[10px] text-yellow-700 font-code">PX</span>
                </div>
                <span className="text-yellow-700 font-code">X</span>
                <div className="relative w-full">
                  <input
                    type="number"
                    placeholder="H"
                    value={options.rawHeight || ''}
                    onChange={(e) => updateOption('rawHeight', e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full pl-3 pr-8 py-2 text-sm bg-black border border-yellow-700/50 text-yellow-400 focus:border-yellow-500 outline-none font-code"
                  />
                  <span className="absolute right-3 top-2 text-[10px] text-yellow-700 font-code">PX</span>
                </div>
              </div>
          </section>
        )}

        {/* Format Selector */}
        <section>
          <label className="block text-xs font-bold text-cyan-400 mb-3 font-tech uppercase tracking-wider">{t.format}</label>
          <div className="grid grid-cols-3 gap-2">
            {[ImageFormat.ORIGINAL, ImageFormat.JPEG, ImageFormat.PNG, ImageFormat.WEBP, ImageFormat.BMP].map(fmt => (
              <button
                key={fmt}
                onClick={() => updateOption('format', fmt)}
                className={`px-2 py-2 text-[10px] font-code border transition-all duration-200 clip-button uppercase ${
                  options.format === fmt 
                    ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_10px_rgba(6,182,212,0.5)]' 
                    : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-200'
                }`}
              >
                {fmt === 'original' ? 'ORIG' : fmt}
              </button>
            ))}
          </div>
        </section>

        {/* Quality Slider */}
        {options.format !== ImageFormat.PNG && options.format !== ImageFormat.BMP && (
          <section>
            <div className="flex justify-between mb-2 items-end">
              <label className="text-xs font-bold text-cyan-400 font-tech uppercase tracking-wider">{t.quality}</label>
              <span className="text-xs font-code text-cyan-300 bg-cyan-900/50 px-2 py-0.5 rounded">{options.quality}%</span>
            </div>
            <div className="relative h-4 bg-slate-800 border border-slate-600 overflow-hidden">
                <div className="absolute top-0 left-0 h-full bg-cyan-600 transition-all duration-100" style={{width: `${options.quality}%`}}>
                    <div className="w-full h-full bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzhhYWGMYAEYB8RmROaABADeOQ8CXl/xfgAAAABJRU5ErkJggg==')] opacity-30"></div>
                </div>
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={options.quality}
                  onChange={(e) => updateOption('quality', Number(e.target.value))}
                  className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                />
            </div>
          </section>
        )}

        {/* Dimensions */}
        <section>
          <label className="block text-xs font-bold text-cyan-400 mb-3 font-tech uppercase tracking-wider">{t.resize}</label>
          <div className="flex gap-2 items-center mb-3">
            <div className="relative w-full group">
              <input
                type="number"
                placeholder={originalDimensions?.width ? originalDimensions.width.toString() : 'W'}
                value={options.width || ''}
                onChange={(e) => updateOption('width', e.target.value ? Number(e.target.value) : null)}
                className="w-full pl-3 pr-8 py-2 text-sm bg-slate-800 border border-slate-600 text-white focus:border-cyan-500 focus:bg-slate-900 transition-colors outline-none font-code"
              />
              <span className="absolute right-3 top-2 text-[10px] text-slate-500 font-code group-focus-within:text-cyan-500">PX</span>
            </div>
            <span className="text-slate-600 font-code">X</span>
            <div className="relative w-full group">
              <input
                type="number"
                placeholder={originalDimensions?.height ? originalDimensions.height.toString() : 'H'}
                value={options.height || ''}
                onChange={(e) => updateOption('height', e.target.value ? Number(e.target.value) : null)}
                className="w-full pl-3 pr-8 py-2 text-sm bg-slate-800 border border-slate-600 text-white focus:border-cyan-500 focus:bg-slate-900 transition-colors outline-none font-code"
              />
              <span className="absolute right-3 top-2 text-[10px] text-slate-500 font-code group-focus-within:text-cyan-500">PX</span>
            </div>
          </div>
          <div className="flex items-center">
            <label className="flex items-center cursor-pointer relative">
                <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={options.maintainAspectRatio}
                    onChange={(e) => updateOption('maintainAspectRatio', e.target.checked)}
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
                <span className="ml-3 text-xs text-slate-400 font-code uppercase">{t.maintainAspect}</span>
            </label>
          </div>
        </section>

        {/* Transforms */}
        <section>
          <label className="block text-xs font-bold text-cyan-400 mb-3 font-tech uppercase tracking-wider">{t.transform}</label>
          <div className="grid grid-cols-2 gap-2 mb-2">
             <button 
               onClick={() => updateOption('rotate', (options.rotate - 90) % 360)}
               className="py-2 bg-slate-800 border border-slate-600 hover:border-cyan-500 hover:text-cyan-400 text-slate-400 text-xs font-code transition-all"
             >
               ↺ ROTATE -90°
             </button>
             <button 
               onClick={() => updateOption('rotate', (options.rotate + 90) % 360)}
               className="py-2 bg-slate-800 border border-slate-600 hover:border-cyan-500 hover:text-cyan-400 text-slate-400 text-xs font-code transition-all"
             >
               ↻ ROTATE +90°
             </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => updateOption('flipX', !options.flipX)}
              className={`py-2 border text-xs font-code transition-all ${options.flipX ? 'bg-purple-900/50 border-purple-500 text-purple-300' : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white'}`}
            >
              FLIP HORZ
            </button>
            <button 
              onClick={() => updateOption('flipY', !options.flipY)}
              className={`py-2 border text-xs font-code transition-all ${options.flipY ? 'bg-purple-900/50 border-purple-500 text-purple-300' : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white'}`}
            >
              FLIP VERT
            </button>
          </div>
        </section>

        {/* Filters */}
        <section>
           <label className="block text-xs font-bold text-cyan-400 mb-3 font-tech uppercase tracking-wider">{t.filters}</label>
           <div className="space-y-3 bg-slate-800/50 p-3 border border-slate-700">
             {[
               { key: 'grayscale', label: t.grayscale },
               { key: 'sharpen', label: t.sharpen }
             ].map((filter) => (
                <div key={filter.key} className="flex items-center justify-between">
                    <span className="text-xs text-slate-300 font-code">{filter.label}</span>
                    <label className="flex items-center cursor-pointer relative">
                        <input 
                            type="checkbox" 
                            className="sr-only peer"
                            // @ts-ignore
                            checked={options[filter.key]}
                            // @ts-ignore
                            onChange={(e) => updateOption(filter.key, e.target.checked)}
                        />
                        <div className="w-8 h-4 bg-slate-900 border border-slate-600 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-slate-500 after:h-2.5 after:w-3.5 after:transition-all peer-checked:bg-purple-900/80 peer-checked:border-purple-500 peer-checked:after:bg-purple-300"></div>
                    </label>
                </div>
             ))}
             
             <div className="pt-2 border-t border-slate-700/50">
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-slate-300 font-code">{t.blur}</span>
                  <span className="text-xs text-purple-400 font-code">{options.blur}PX</span>
                </div>
                <div className="relative h-2 bg-slate-900 border border-slate-600">
                    <div className="absolute top-0 left-0 h-full bg-purple-600" style={{width: `${(options.blur/20)*100}%`}}></div>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="0.5"
                      value={options.blur}
                      onChange={(e) => updateOption('blur', Number(e.target.value))}
                      className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer"
                    />
                </div>
             </div>
           </div>
        </section>

        {/* Watermark */}
        <section>
           <label className="block text-xs font-bold text-cyan-400 mb-3 font-tech uppercase tracking-wider">{t.watermark}</label>
           <div className="relative">
              <input
                type="text"
                placeholder={t.watermarkPlaceholder}
                value={options.watermarkText}
                onChange={(e) => updateOption('watermarkText', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-800 border border-slate-600 text-white focus:border-cyan-500 focus:bg-slate-900 transition-colors outline-none font-code"
              />
              <div className="absolute right-2 top-2 w-2 h-2 bg-cyan-500/50 rounded-full animate-pulse"></div>
           </div>
        </section>
      </div>

      <div className="p-4 border-t border-slate-700 bg-slate-900/90 z-20">
        <button
          onClick={onProcess}
          disabled={isProcessing}
          className={`w-full py-4 px-4 font-tech font-bold text-white tracking-widest clip-button transition-all duration-200 relative overflow-hidden group
            ${isProcessing 
              ? 'bg-slate-700 cursor-wait text-slate-400' 
              : 'bg-cyan-600 hover:bg-cyan-500 hover:shadow-[0_0_20px_rgba(6,182,212,0.6)] active:translate-y-1'
            }
          `}
        >
          <span className="relative z-10">{isProcessing ? t.processing : t.processBtn}</span>
          {!isProcessing && <div className="absolute top-0 -left-full w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 group-hover:animate-[shimmer_1s_infinite]"></div>}
        </button>
      </div>
    </div>
  );
};
