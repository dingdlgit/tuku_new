
import React, { useState, useEffect, useRef } from 'react';
import { StockAnalysisResult, Language } from '../types';

interface StockDashboardProps {
  lang: Language;
}

export const StockDashboard: React.FC<StockDashboardProps> = ({ lang }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StockAnalysisResult | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const t = {
    en: {
      title: "QUANTUM FINANCE ANALYZER",
      inputPlaceholder: "STOCK CODE (e.g. 600519, 300750, 00700, AAPL)",
      analyze: "INITIATE ANALYSIS",
      analyzing: "COMPUTING...",
      trend: "TREND JUDGMENT",
      tech: "TECHNICAL ANALYSIS",
      strategy: "STRATEGY",
      risk: "RISK FACTORS",
      strong: "STRONG",
      volatile: "VOLATILE",
      weak: "WEAK",
      chartTitle: "60-DAY PRICE ACTION SIMULATION"
    },
    zh: {
      title: "量子金融分析仪",
      inputPlaceholder: "输入代码 (如 600519, 创业板300xxx, 港股00700)",
      analyze: "开始分析",
      analyzing: "计算中...",
      trend: "当前趋势判断",
      tech: "技术面解读",
      strategy: "操作思路",
      risk: "风险提示",
      strong: "偏强",
      volatile: "震荡",
      weak: "偏弱",
      chartTitle: "60日资金流向模拟"
    }
  }[lang];

  const handleAnalyze = async () => {
    if (!code) return;
    setLoading(true);
    setData(null);

    try {
      const response = await fetch('/api/analyze-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const result = await response.json();
      
      // Artificial delay for "processing" effect
      setTimeout(() => {
        setData(result);
        setLoading(false);
      }, 1500);

    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  // Draw Chart
  useEffect(() => {
    if (!data || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const prices = data.history.map(d => d.price);
    const min = Math.min(...prices) * 0.99;
    const max = Math.max(...prices) * 1.01;
    const range = max - min;
    
    const w = canvas.width;
    const h = canvas.height;
    const padding = 20;
    const stepX = (w - padding * 2) / (prices.length - 1);
    
    // Draw Grid
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.1)';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const y = padding + (i * (h - padding * 2)) / 4;
        ctx.moveTo(padding, y);
        ctx.lineTo(w - padding, y);
    }
    ctx.stroke();

    // Draw Line
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = data.changePercent >= 0 ? '#10b981' : '#ef4444'; // Green or Red
    
    prices.forEach((price, i) => {
        const x = padding + i * stepX;
        const y = h - (padding + ((price - min) / range) * (h - padding * 2));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    
    // Draw Gradient Area
    ctx.lineTo(w - padding, h - padding);
    ctx.lineTo(padding, h - padding);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, data.changePercent >= 0 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw Points
    ctx.fillStyle = '#fff';
    prices.forEach((price, i) => {
        if (i % 8 === 0 || i === prices.length - 1) { // Sparse points
            const x = padding + i * stepX;
            const y = h - (padding + ((price - min) / range) * (h - padding * 2));
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });

  }, [data]);

  return (
    <div className="h-full flex flex-col items-center justify-center p-6 relative">
       {/* Background Decor */}
       <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-cyan-600/10 rounded-full blur-[80px]"></div>
       </div>

       <div className="max-w-4xl w-full z-10 space-y-8">
          <div className="text-center">
             <h2 className="text-4xl font-tech font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 tracking-widest drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                {t.title}
             </h2>
             <div className="h-px w-64 mx-auto bg-gradient-to-r from-transparent via-purple-500 to-transparent mt-4"></div>
          </div>

          {/* Input Area */}
          <div className="flex gap-4 max-w-lg mx-auto bg-slate-900/80 p-2 border border-purple-500/30 backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.15)] clip-button">
             <input 
               type="text" 
               value={code}
               onChange={(e) => setCode(e.target.value)}
               placeholder={t.inputPlaceholder}
               className="flex-1 bg-transparent border-none text-white font-code px-4 focus:outline-none placeholder-slate-600 tracking-wider"
               onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
             />
             <button 
               onClick={handleAnalyze}
               disabled={loading}
               className="bg-purple-600 hover:bg-purple-500 text-white font-tech px-8 py-2 font-bold tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {loading ? t.analyzing : t.analyze}
             </button>
          </div>

          {/* Results Area */}
          {data && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-10 duration-700">
                {/* Left: Stats & Chart */}
                <div className="space-y-6">
                   {/* Price Card */}
                   <div className="bg-slate-900/60 border border-slate-700 p-6 relative overflow-hidden group">
                      <div className="absolute top-0 right-0 flex flex-col items-end p-2">
                         <div className="text-[12px] text-purple-400 font-tech font-bold tracking-wider">{data.market}</div>
                         <div className="text-[10px] text-slate-500 font-code">{data.code}</div>
                      </div>
                      <div className="flex items-end gap-4 mt-4">
                         <span className="text-5xl font-code font-bold text-white tracking-tighter">{data.currentPrice.toFixed(2)}</span>
                         <span className={`text-lg font-code font-bold ${data.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {data.changePercent >= 0 ? '+' : ''}{data.changePercent}%
                         </span>
                      </div>
                      {/* Decorative Lines */}
                      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-slate-800 to-transparent"></div>
                   </div>

                   {/* Chart */}
                   <div className="bg-slate-900/60 border border-slate-700 p-4 relative">
                      <div className="text-[10px] text-cyan-500 font-tech mb-2 tracking-widest">{t.chartTitle}</div>
                      <canvas ref={canvasRef} width={400} height={200} className="w-full h-48 object-contain" />
                   </div>
                </div>

                {/* Right: AI Analysis Text */}
                <div className="space-y-4 font-code text-xs leading-relaxed">
                   {/* Trend */}
                   <div className="bg-slate-900/40 border-l-2 border-cyan-400 p-4">
                      <h4 className="text-cyan-400 font-bold mb-1 tracking-wider">{t.trend}</h4>
                      <div className="text-white text-lg font-tech uppercase">
                          {data.trend === 'STRONG' && <span className="text-green-400 drop-shadow-[0_0_5px_rgba(74,222,128,0.5)]">{t.strong}</span>}
                          {data.trend === 'VOLATILE' && <span className="text-yellow-400 drop-shadow-[0_0_5px_rgba(250,204,21,0.5)]">{t.volatile}</span>}
                          {data.trend === 'WEAK' && <span className="text-red-400 drop-shadow-[0_0_5px_rgba(248,113,113,0.5)]">{t.weak}</span>}
                      </div>
                   </div>

                   <div className="bg-slate-900/40 border-l-2 border-purple-400 p-4">
                      <h4 className="text-purple-400 font-bold mb-1 tracking-wider">{t.tech}</h4>
                      <p className="text-slate-300">{data.techAnalysis}</p>
                   </div>

                   <div className="bg-slate-900/40 border-l-2 border-blue-400 p-4">
                      <h4 className="text-blue-400 font-bold mb-1 tracking-wider">{t.strategy}</h4>
                      <p className="text-slate-300">{data.strategy}</p>
                   </div>

                   <div className="bg-slate-900/40 border-l-2 border-red-500 p-4">
                      <h4 className="text-red-500 font-bold mb-1 tracking-wider">{t.risk}</h4>
                      <p className="text-slate-300">{data.risks}</p>
                   </div>
                </div>
             </div>
          )}
       </div>
    </div>
  );
};
