
import React, { useState, useEffect, useRef } from 'react';
import { StockAnalysisResult, Language, OHLC } from '../types';

interface StockDashboardProps {
  lang: Language;
}

export const StockDashboard: React.FC<StockDashboardProps> = ({ lang }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StockAnalysisResult | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);

  const t = {
    en: {
      title: "QUANTUM TRADING TERMINAL",
      inputPlaceholder: "ENTER CODE (e.g. 600519, 00700, TSLA)",
      analyze: "INITIALIZE",
      analyzing: "SCANNING MARKET...",
      metrics: "FUNDAMENTALS",
      pe: "P/E", pb: "P/B", turnover: "TURNOVER", amp: "AMPLITUDE",
      strategy: "OPERATIONAL STRATEGY",
      shortTerm: "Short-term / Limit-up",
      longTerm: "Value Investing",
      trend: "Trend / MA Strategy",
      risk: "RISK PROFILE",
      sentiment: "SENTIMENT",
      chartTitle: "180-DAY K-LINE & VOLUME",
      up: "UP", down: "DOWN"
    },
    zh: {
      title: "量子金融交易终端",
      inputPlaceholder: "输入股票代码 (如 600519, 00700, TSLA)",
      analyze: "开始分析",
      analyzing: "正在扫描盘面...",
      metrics: "基本面指标",
      pe: "市盈率", pb: "市净率", turnover: "换手率", amp: "振幅",
      strategy: "多维度操作策略",
      shortTerm: "打板选手 / 短线策略",
      longTerm: "价值投资 / 长期持股",
      trend: "均线系统 / 趋势跟踪",
      risk: "风险提示",
      sentiment: "市场情绪",
      chartTitle: "180日 K线与成交量分析",
      up: "涨", down: "跌"
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
      setTimeout(() => { setData(result); setLoading(false); }, 1000);
    } catch (e) { setLoading(false); }
  };

  useEffect(() => {
    if (!data || !mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Drawing Constants
    const w = canvas.width;
    const h = canvas.height;
    const kLineHeight = h * 0.7;
    const volHeight = h * 0.2;
    const padding = 30;
    
    ctx.clearRect(0, 0, w, h);

    const history = data.history;
    const maxP = Math.max(...history.map(d => d.high)) * 1.02;
    const minP = Math.min(...history.map(d => d.low)) * 0.98;
    const rangeP = maxP - minP;
    
    const maxV = Math.max(...history.map(d => d.volume));
    const stepX = (w - padding * 2) / history.length;

    const getY = (price: number) => padding + (1 - (price - minP) / rangeP) * (kLineHeight - padding * 2);
    const getVolY = (vol: number) => h - padding - (vol / maxV) * (volHeight);

    // 1. Draw Grid
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.05)';
    ctx.lineWidth = 1;
    for(let i=0; i<5; i++) {
       const y = padding + (i * (kLineHeight - padding*2)) / 4;
       ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(w - padding, y); ctx.stroke();
    }

    // 2. Draw K-Lines & Volume
    history.forEach((d, i) => {
      const x = padding + i * stepX;
      const isUp = d.close >= d.open;
      const color = isUp ? '#ef4444' : '#22c55e'; // A-Share: Red Up, Green Down
      
      // Volume Bar
      ctx.fillStyle = color + '66';
      const vY = getVolY(d.volume);
      ctx.fillRect(x, vY, stepX * 0.8, h - padding - vY);

      // Candlestick Body
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + stepX*0.4, getY(d.high));
      ctx.lineTo(x + stepX*0.4, getY(d.low));
      ctx.stroke();
      
      const openY = getY(d.open);
      const closeY = getY(d.close);
      ctx.fillRect(x, Math.min(openY, closeY), stepX * 0.8, Math.max(0.5, Math.abs(openY - closeY)));
    });

    // 3. Draw Moving Averages
    const drawMA = (key: 'ma5'|'ma10'|'ma20', color: string) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      let first = true;
      history.forEach((d, i) => {
        const val = d[key];
        if (val) {
          const x = padding + i * stepX + stepX * 0.4;
          const y = getY(val);
          if (first) { ctx.moveTo(x, y); first = false; }
          else ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    };
    drawMA('ma5', '#fef08a');   // Yellow
    drawMA('ma10', '#f472b6');  // Pink
    drawMA('ma20', '#60a5fa');  // Blue

  }, [data]);

  return (
    <div className="h-full flex flex-col p-6 bg-transparent relative custom-scrollbar overflow-y-auto">
      <div className="max-w-6xl w-full mx-auto space-y-8 pb-10">
        <div className="text-center">
          <h2 className="text-3xl font-tech font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 tracking-tighter">
            {t.title}
          </h2>
          <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-900 to-transparent mt-2"></div>
        </div>

        <div className="flex gap-4 max-w-xl mx-auto bg-black/60 p-1 border border-cyan-500/20 clip-button">
          <input 
            type="text" value={code} onChange={(e) => setCode(e.target.value)}
            placeholder={t.inputPlaceholder}
            className="flex-1 bg-transparent border-none text-white font-code px-4 focus:outline-none placeholder-slate-700"
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          />
          <button onClick={handleAnalyze} disabled={loading} className="bg-cyan-700 hover:bg-cyan-600 text-white font-tech px-6 py-2 transition-all disabled:opacity-50">
            {loading ? t.analyzing : t.analyze}
          </button>
        </div>

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in zoom-in-95 duration-500">
            {/* Main Viz Panel */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-slate-900/80 border border-cyan-900/30 p-6 flex items-center justify-between relative group overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
                <div>
                   <div className="flex items-center gap-2 mb-1">
                      <span className="text-slate-500 font-code text-xs uppercase">{data.market}</span>
                      <span className="bg-cyan-500/10 text-cyan-400 text-[10px] px-1 font-tech">{data.code}</span>
                   </div>
                   <h3 className="text-4xl font-code font-bold text-white">{data.currentPrice.toFixed(2)}</h3>
                   <div className={`text-lg font-code font-bold ${data.changePercent >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      {data.changePercent >= 0 ? '▲ +' : '▼ '}{data.changeAmount} ({data.changePercent}%)
                   </div>
                </div>
                <div className="text-right">
                   <div className="text-xs text-slate-500 font-tech uppercase mb-2">{t.sentiment}</div>
                   <div className="text-3xl font-code font-bold text-purple-400">{data.sentiment}%</div>
                   <div className="w-24 h-1 bg-slate-800 mt-2 ml-auto overflow-hidden">
                      <div className="h-full bg-purple-500 animate-pulse" style={{width: `${data.sentiment}%`}}></div>
                   </div>
                </div>
              </div>

              {/* Advanced Chart */}
              <div className="bg-black/40 border border-slate-800 p-2 relative">
                <div className="flex gap-4 text-[10px] font-code absolute top-4 left-6 z-10">
                   <span className="text-yellow-400">MA5: {data.history[data.history.length-1].ma5}</span>
                   <span className="text-pink-400">MA10: {data.history[data.history.length-1].ma10}</span>
                   <span className="text-blue-400">MA20: {data.history[data.history.length-1].ma20}</span>
                </div>
                <canvas ref={mainCanvasRef} width={800} height={450} className="w-full h-[400px]" />
                <div className="absolute bottom-4 left-6 text-[9px] text-slate-600 font-tech tracking-widest">{t.chartTitle}</div>
              </div>

              {/* Operational Strategy Card */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="bg-slate-900/60 p-4 border border-slate-800 hover:border-cyan-500/30 transition-colors">
                    <h5 className="text-cyan-400 text-xs font-tech mb-2 tracking-tighter">{t.shortTerm}</h5>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-code">{data.strategyAdvice.shortTerm}</p>
                 </div>
                 <div className="bg-slate-900/60 p-4 border border-slate-800 hover:border-purple-500/30 transition-colors">
                    <h5 className="text-purple-400 text-xs font-tech mb-2 tracking-tighter">{t.longTerm}</h5>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-code">{data.strategyAdvice.longTerm}</p>
                 </div>
                 <div className="bg-slate-900/60 p-4 border border-slate-800 hover:border-blue-500/30 transition-colors">
                    <h5 className="text-blue-400 text-xs font-tech mb-2 tracking-tighter">{t.trend}</h5>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-code">{data.strategyAdvice.trendFollower}</p>
                 </div>
              </div>
            </div>

            {/* Side Panel: Metrics & Risks */}
            <div className="space-y-6">
               <div className="bg-slate-900/80 border border-slate-800 p-5">
                  <h4 className="text-xs font-tech font-bold text-slate-500 mb-6 tracking-widest uppercase">{t.metrics}</h4>
                  <div className="space-y-4">
                     {[
                       { label: t.pe, val: data.pe },
                       { label: t.pb, val: data.pb },
                       { label: t.turnover, val: data.turnoverRate + '%' },
                       { label: t.amp, val: data.amplitude + '%' }
                     ].map(item => (
                       <div key={item.label} className="flex justify-between items-center border-b border-slate-800 pb-2">
                          <span className="text-xs text-slate-400 font-code">{item.label}</span>
                          <span className="text-sm font-code text-white font-bold">{item.val}</span>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="bg-red-900/10 border border-red-900/30 p-5">
                  <h4 className="text-xs font-tech font-bold text-red-500 mb-4 tracking-widest uppercase">{t.risk}</h4>
                  <ul className="space-y-2">
                     {data.risks.map((r, i) => (
                       <li key={i} className="text-[11px] text-red-200/60 font-code flex items-start gap-2">
                          <span className="mt-1 w-1.5 h-1.5 bg-red-500 shrink-0"></span>
                          {r}
                       </li>
                     ))}
                  </ul>
                  <div className="mt-6 pt-4 border-t border-red-900/20">
                     <p className="text-[9px] text-red-500/50 font-tech italic text-center">FOR SIMULATION ONLY :: NOT FINANCIAL ADVICE</p>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
