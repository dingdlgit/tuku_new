
import React from 'react';
import { ImageFormat, ProcessOptions, Language } from '../types';

interface ControlsProps {
  options: ProcessOptions;
  setOptions: React.Dispatch<React.SetStateAction<ProcessOptions>>;
  onProcess: () => void;
  isProcessing: boolean;
  originalDimensions?: { width: number; height: number };
  lang: Language;
}

export const Controls: React.FC<ControlsProps> = ({ 
  options, 
  setOptions, 
  onProcess, 
  isProcessing,
  originalDimensions,
  lang
}) => {
  
  const t = {
    en: {
      settings: "Settings",
      format: "Format",
      quality: "Quality",
      resize: "Resize",
      maintainAspect: "Maintain Aspect Ratio",
      transform: "Transform",
      filters: "Filters",
      grayscale: "Grayscale",
      sharpen: "Sharpen",
      blur: "Blur",
      watermark: "Watermark",
      watermarkPlaceholder: "Enter text...",
      processBtn: "Process Image",
      processing: "Processing..."
    },
    zh: {
      settings: "设置",
      format: "输出格式",
      quality: "画质质量",
      resize: "调整尺寸",
      maintainAspect: "保持长宽比",
      transform: "旋转与翻转",
      filters: "滤镜效果",
      grayscale: "黑白 (灰度)",
      sharpen: "锐化",
      blur: "模糊",
      watermark: "添加水印",
      watermarkPlaceholder: "输入水印文字...",
      processBtn: "开始处理",
      processing: "处理中..."
    }
  }[lang];

  const updateOption = <K extends keyof ProcessOptions>(key: K, value: ProcessOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50">
        <h2 className="font-semibold text-slate-800 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-2 text-indigo-600">
            <path d="M10 3.75a2 2 0 10-4 0 2 2 0 004 0zM17.25 4.5a.75.75 0 00-1.5 0h-2.5a.75.75 0 000 1.5h2.5a.75.75 0 001.5 0zm-14.5 0a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5zM10 8.5a2 2 0 10-4 0 2 2 0 004 0zM17.25 9.25a.75.75 0 00-1.5 0h-2.5a.75.75 0 000 1.5h2.5a.75.75 0 001.5 0zm-14.5 0a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5zM10 13.25a2 2 0 10-4 0 2 2 0 004 0zM17.25 14a.75.75 0 00-1.5 0h-2.5a.75.75 0 000 1.5h2.5a.75.75 0 001.5 0zm-14.5 0a.75.75 0 000 1.5h2.5a.75.75 0 000-1.5h-2.5z" />
          </svg>
          {t.settings}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Format & Quality */}
        <section>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t.format}</label>
          <div className="grid grid-cols-3 gap-2">
            {[ImageFormat.ORIGINAL, ImageFormat.JPEG, ImageFormat.PNG, ImageFormat.WEBP, ImageFormat.BMP].map(fmt => (
              <button
                key={fmt}
                onClick={() => updateOption('format', fmt)}
                className={`px-3 py-2 text-sm rounded-md border uppercase ${
                  options.format === fmt 
                    ? 'bg-indigo-600 text-white border-indigo-600' 
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
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
              <label className="text-sm font-medium text-slate-700">{t.quality}</label>
              <span className="text-sm text-slate-500">{options.quality}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={options.quality}
              onChange={(e) => updateOption('quality', Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
          </section>
        )}

        {/* Dimensions */}
        <section>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t.resize}</label>
          <div className="flex gap-2 items-center mb-3">
            <div className="relative w-full">
              <input
                type="number"
                placeholder={originalDimensions?.width ? originalDimensions.width.toString() : 'Width'}
                value={options.width || ''}
                onChange={(e) => updateOption('width', e.target.value ? Number(e.target.value) : null)}
                className="w-full pl-3 pr-8 py-2 text-sm border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-400">px</span>
            </div>
            <span className="text-slate-400">×</span>
            <div className="relative w-full">
              <input
                type="number"
                placeholder={originalDimensions?.height ? originalDimensions.height.toString() : 'Height'}
                value={options.height || ''}
                onChange={(e) => updateOption('height', e.target.value ? Number(e.target.value) : null)}
                className="w-full pl-3 pr-8 py-2 text-sm border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              />
              <span className="absolute right-3 top-2 text-xs text-slate-400">px</span>
            </div>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="aspect"
              checked={options.maintainAspectRatio}
              onChange={(e) => updateOption('maintainAspectRatio', e.target.checked)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="aspect" className="ml-2 text-sm text-slate-600">{t.maintainAspect}</label>
          </div>
        </section>

        {/* Adjustments */}
        <section>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t.transform}</label>
          <div className="flex gap-2 mb-3">
             <button 
               onClick={() => updateOption('rotate', (options.rotate - 90) % 360)}
               className="flex-1 py-2 border border-slate-300 rounded-md text-sm hover:bg-slate-50 text-slate-700"
             >
               ↺ -90°
             </button>
             <button 
               onClick={() => updateOption('rotate', (options.rotate + 90) % 360)}
               className="flex-1 py-2 border border-slate-300 rounded-md text-sm hover:bg-slate-50 text-slate-700"
             >
               ↻ +90°
             </button>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => updateOption('flipX', !options.flipX)}
              className={`flex-1 py-2 border rounded-md text-sm ${options.flipX ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
            >
              Flip H
            </button>
            <button 
              onClick={() => updateOption('flipY', !options.flipY)}
              className={`flex-1 py-2 border rounded-md text-sm ${options.flipY ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}
            >
              Flip V
            </button>
          </div>
        </section>

        {/* Filters */}
        <section>
           <label className="block text-sm font-medium text-slate-700 mb-2">{t.filters}</label>
           <div className="space-y-3">
             <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{t.grayscale}</span>
                <input 
                  type="checkbox" 
                  checked={options.grayscale}
                  onChange={(e) => updateOption('grayscale', e.target.checked)}
                  className="toggle-checkbox h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500"
                />
             </div>
             <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{t.sharpen}</span>
                <input 
                  type="checkbox" 
                  checked={options.sharpen}
                  onChange={(e) => updateOption('sharpen', e.target.checked)}
                  className="toggle-checkbox h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500"
                />
             </div>
             <div>
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-slate-600">{t.blur}</span>
                  <span className="text-xs text-slate-400">{options.blur}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="0.5"
                  value={options.blur}
                  onChange={(e) => updateOption('blur', Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
             </div>
           </div>
        </section>

        {/* Watermark */}
        <section>
           <label className="block text-sm font-medium text-slate-700 mb-2">{t.watermark}</label>
           <input
             type="text"
             placeholder={t.watermarkPlaceholder}
             value={options.watermarkText}
             onChange={(e) => updateOption('watermarkText', e.target.value)}
             className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
           />
        </section>
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50">
        <button
          onClick={onProcess}
          disabled={isProcessing}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-white shadow-lg transition-all
            ${isProcessing 
              ? 'bg-indigo-400 cursor-not-allowed' 
              : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/30 active:scale-[0.98]'
            }
          `}
        >
          {isProcessing ? t.processing : t.processBtn}
        </button>
      </div>
    </div>
  );
};
