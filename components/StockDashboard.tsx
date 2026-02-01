
import React, { useState, useEffect, useRef } from 'react';
import { StockAnalysisResult, Language, OHLC } from '../types';

interface ExtendedStockResult extends StockAnalysisResult {
  isRealtime?: boolean;
  lastUpdated?: string;
  premiumRate?: number;
  high52?: number;
  low52?: number;
  turnover?: number;
}

interface StockDashboardProps {
  lang: Language;
}

export const StockDashboard: React.FC<StockDashboardProps> = ({ lang }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<ExtendedStockResult | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);

  const t = {
    en: {
      title: "TUKU QUANT TERMINAL",
      inputPlaceholder: "ENTER TICKER (e.g. 513090, NVDA)",
      analyze: "SEARCH",
      refresh: "LIVE_SYNC",
      analyzing: "SCANNING...",
      refreshing: "SYNCING...",
      metrics: "QUANT DATA",
      pe: "P/E", pb: "P/B", premium: "PREMIUM", turnover: "TURNOVER",
      strategy: "AI AGENT RECOMMENDATIONS",
      shortTerm: "Scalp/Short",
      longTerm: "Value/Long",
      trend: "MA/Trend",
      risk: "RISK EXPOSURE",
      sentiment: "SENTIMENT",
      chartTitle: "180-DAY K-LINE (SMART RECONSTRUCTION)",
      startTime: "START",
      endTime: "NOW",
      high52: "52W HIGH",
      low52: "52W LOW"
    },
    zh: {
      title: "图酷量化分析终端",
      inputPlaceholder: "输入代码 (如 513090, NVDA)",
      analyze: "搜索",
      refresh: "实时同步",
      analyzing: "正在检索...",
      refreshing: "同步中...",
      metrics: "量化多维指标",
      pe: "市盈率", pb: "市净率", premium: "折溢价率", turnover: "换手率",
      strategy: "AI 智能策略建议",
      shortTerm: "短线 / 策略",
      longTerm: "长线 / 价值",
      trend: "趋势 / 均线",
      risk: "风险敞口",
      sentiment: "多空情绪",
      chartTitle: "180日 K线走势 (智能拟合模拟)",
      startTime: "起始",
      endTime: "当前",
      high52: "52周最高",
      low52: "52周最低"
    }
  }[lang];

  const handleAnalyze = async (isDeepRefresh = false) => {
    if (!code) return;
    if (isDeepRefresh) setRefreshing(true); else setLoading(true);
    
    try {
      const response = await fetch('/api/analyze-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, forceSearch: true })
      });

      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Server Error');
      }
      const result = await response.json();
      setData(result);
    } catch (e: any) {
      console.error("Analysis Error:", e);
      alert(`Terminal Error: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!data || !mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const kH = h * 0.82; 
    const padding = 70;
    ctx.clearRect(0, 0, w, h);

    const hist = data.history;
    const maxP = Math.max(...hist.map(d => d.high)) * 1.01;
    const minP = Math.min(...hist.map(d => d.low)) * 0.99;
    const range = maxP - minP;
    const stepX = (w - padding * 2) / (hist.length || 1);
    const getY = (p: number) => padding + (1 - (p - minP) / (range || 1)) * (kH - padding * 2);

    // Grid System
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.05)';
    ctx.lineWidth = 1;
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.textAlign = 'right';

    for (let i = 0; i < 6; i++) {
       const gridY = padding + (i / 5) * (kH - padding * 2);
       const price = maxP - (i / 5) * range;
       ctx.beginPath();
       ctx.moveTo(padding, gridY);
       ctx.lineTo(w - padding, gridY);
       ctx.stroke();
       ctx.fillText(price.toFixed(3), padding - 15, gridY + 3);
    }

    // Candles
    hist.forEach((d, i) => {
      const x = padding + i * stepX;
      const isUp = d.close >= d.open;
      const color = isUp ? '#f43f5e' : '#10b981';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      
      // Shadow Line
      ctx.beginPath();
      ctx.moveTo(x + stepX*0.35, getY(d.high));
      ctx.lineTo(x + stepX*0.35, getY(d.low));
      ctx.stroke();
      
      // Body
      ctx.fillStyle = color;
      const oY = getY(d.open);
      const cY = getY(d.close);
      ctx.fillRect(x, Math.min(oY, cY), stepX * 0.7, Math.max(1, Math.abs(oY - cY)));
    });

    // MAs
    const drawMA = (key: 'ma5'|'ma10'|'ma20', color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let first = true;
      hist.forEach((d, i) => {
        const val = (d as any)[key];
        if (val) {
          const x = padding + i * stepX + stepX * 0.35;
          const y = getY(val);
          if (first) { ctx.moveTo(x, y); first = false; }
          else ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    };
    drawMA('ma5', '#fbbf24'); drawMA('ma10', '#ec4899'); drawMA('ma20', '#3b82f6');

    // Labels
    if (hist.length > 0) {
       ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
       ctx.textAlign = 'left';
       ctx.fillText(`${t.startTime}: ${hist[0].date}`, padding, kH + 25);
       ctx.textAlign = 'right';
       ctx.fillText(`${t.endTime}: ${hist[hist.length-1].date}`, w - padding, kH + 25);
    }
  }, [data, lang]);

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar bg-slate-950/40">
      <div className="max-w-6xl w-full mx-auto space-y-6 pb-16">
        {/* Title Bar */}
        <div className="flex justify-between items-end border-b border-cyan-500/20 pb-4">
          <div>
            <h2 className="text-3xl font-tech font-bold text-white tracking-tighter uppercase">{t.title}</h2>
            <p className="text-[10px] text-cyan-500 font-code mt-1 tracking-[0.4em]">PRO-GRADE MARKET ANALYSIS SYSTEM</p>
          </div>
          <div className="flex gap-4">
             <div className="bg-slate-900 px-3 py-1 border border-slate-800">
                <span className="text-[9px] text-slate-500 block">SERVER</span>
                <span className="text-[10px] text-green-400 font-code">STABLE // EST.</span>
             </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="flex gap-2 max-w-xl bg-slate-900 p-1 border border-slate-800">
          <input 
            type="text" 
            value={code} 
            onChange={(e) => setCode(e.target.value)} 
            placeholder={t.inputPlaceholder} 
            className="flex-1 bg-transparent border-none text-white font-code px-4 py-2 focus:outline-none text-sm uppercase" 
            onKeyDown={(e) => e.key === 'Enter' && handleAnalyze(false)} 
          />
          <button 
            onClick={() => handleAnalyze(false)} 
            disabled={loading || refreshing} 
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-tech px-6 py-2 text-xs font-bold transition-all disabled:opacity-50"
          >
            {loading ? t.analyzing : t.analyze}
          </button>
        </div>

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Left Main */}
            <div className="lg:col-span-3 space-y-6">
              {/* Price HUD */}
              <div className="bg-slate-900 border border-slate-800 p-8 flex flex-wrap items-center justify-between relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${data.isRealtime ? 'bg-cyan-500' : 'bg-amber-500'}`}></div>
                <div className="absolute top-2 right-4 flex items-center gap-4">
                    <button onClick={() => handleAnalyze(true)} disabled={refreshing} className="text-[9px] font-tech text-cyan-500 underline uppercase hover:text-cyan-400">
                        {refreshing ? t.refreshing : t.refresh}
                    </button>
                    <span className="text-[9px] font-code text-slate-500 uppercase">{data.isRealtime ? 'LATEST' : 'CACHE'}</span>
                </div>

                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-white text-2xl font-bold font-tech">{data.name}</h3>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 font-code border border-slate-700">{data.market}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-code mt-1">{data.code}</div>
                  <div className="flex items-baseline gap-6 mt-6">
                    <span className="text-6xl font-code font-bold text-white">{(data.currentPrice || 0).toFixed(3)}</span>
                    <div className={`text-2xl font-code font-bold ${(data.changePercent || 0) >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {(data.changePercent || 0) >= 0 ? '+' : ''}{data.changePercent}%
                    </div>
                  </div>
                </div>

                <div className="flex gap-10">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 font-tech uppercase mb-1">{t.premium}</div>
                    <div className={`text-2xl font-code font-bold ${Math.abs(data.premiumRate || 0) > 0.5 ? 'text-rose-400' : 'text-cyan-400'}`}>
                       {data.premiumRate !== undefined ? `${data.premiumRate}%` : '--'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 font-tech uppercase mb-1">{t.sentiment}</div>
                    <div className="text-2xl font-code font-bold text-purple-400">{data.sentiment}%</div>
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div className="bg-slate-900/60 border border-slate-800 p-6 relative">
                <div className="absolute top-4 left-6 text-[9px] font-code text-slate-600 uppercase tracking-widest">{t.chartTitle}</div>
                <canvas ref={mainCanvasRef} width={1000} height={450} className="w-full h-[400px]" />
                <div className="absolute top-4 right-8 flex gap-6">
                   <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-[#fbbf24]"></div><span className="text-[9px] font-code text-slate-500 uppercase">MA5</span></div>
                   <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-[#ec4899]"></div><span className="text-[9px] font-code text-slate-500 uppercase">MA10</span></div>
                   <div className="flex items-center gap-2"><div className="w-3 h-0.5 bg-[#3b82f6]"></div><span className="text-[9px] font-code text-slate-500 uppercase">MA20</span></div>
                </div>
              </div>

              {/* Strategy Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {[
                   { title: t.shortTerm, color: 'rose', text: data.strategyAdvice.shortTerm },
                   { title: t.longTerm, color: 'cyan', text: data.strategyAdvice.longTerm },
                   { title: t.trend, color: 'indigo', text: data.strategyAdvice.trendFollower }
                 ].map(s => (
                   <div key={s.title} className="bg-slate-900 p-5 border border-slate-800">
                      <h5 className={`text-${s.color}-500 text-[10px] font-tech mb-4 uppercase tracking-widest border-l-2 border-${s.color}-500 pl-3`}>{s.title}</h5>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-code h-20 overflow-y-auto custom-scrollbar">{s.text}</p>
                   </div>
                 ))}
              </div>
            </div>

            {/* Sidebar Right */}
            <div className="space-y-6">
               <div className="bg-slate-900 border border-slate-800 p-6">
                  <h4 className="text-[11px] font-tech font-bold text-slate-500 mb-6 uppercase tracking-widest border-b border-slate-800 pb-2">{t.metrics}</h4>
                  <div className="space-y-6">
                     {[
                       { label: t.pe, val: data.pe }, { label: t.pb, val: data.pb },
                       { label: t.turnover, val: (data.turnover || '--') + '%' },
                       { label: t.high52, val: data.high52 }, { label: t.low52, val: data.low52 }
                     ].map(item => (
                       <div key={item.label} className="flex justify-between items-end border-b border-slate-800/50 pb-2">
                          <span className="text-[10px] text-slate-500 font-code uppercase">{item.label}</span>
                          <span className="text-md font-code text-white font-bold">{item.val || '--'}</span>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="bg-rose-950/10 border border-rose-900/30 p-6">
                  <h4 className="text-[11px] font-tech font-bold text-rose-500 mb-5 uppercase tracking-widest">{t.risk}</h4>
                  <ul className="space-y-4">
                     {data.risks.map((r, i) => (
                       <li key={i} className="text-[11px] text-slate-400 font-code flex items-start gap-3">
                          <span className="mt-1.5 w-1 h-1 bg-rose-500 shrink-0"></span>{r}
                       </li>
                     ))}
                  </ul>
               </div>
               
               <div className="p-4 border border-slate-800 text-[10px] font-code text-slate-600 uppercase leading-loose text-center">
                  QUANTUM ENGINE VER. 2.5.0<br/>
                  GROUNDED DATA PROTOCOL ACTIVE
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
