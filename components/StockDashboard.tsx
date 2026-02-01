
import React, { useState, useEffect, useRef } from 'react';
import { StockAnalysisResult, Language, OHLC } from '../types';

interface ExtendedStockResult extends StockAnalysisResult {
  isRealtime?: boolean;
  isCached?: boolean;
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
  const [error, setError] = useState<string | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);

  const t = {
    en: {
      title: "TUKU QUANT TERMINAL",
      inputPlaceholder: "SYMBOL (e.g. 513090, BTC, AAPL)",
      analyze: "EXECUTE",
      refresh: "SYNC_LIVE",
      analyzing: "SCANNING...",
      refreshing: "SYNCING...",
      metrics: "QUANT DATA",
      pe: "P/E", pb: "P/B", premium: "PREMIUM", turnover: "TURNOVER",
      strategy: "AI STRATEGY AGENT",
      shortTerm: "Intraday/Scalp",
      longTerm: "Value/Hold",
      trend: "MA/Breakout",
      risk: "RISK PROFILE",
      sentiment: "SENTIMENT",
      chartTitle: "180-DAY K-LINE RECONSTRUCTION",
      startTime: "START",
      endTime: "NOW",
      high52: "52W HIGH",
      low52: "52W LOW",
      quotaError: "QUOTA EXHAUSTED: Please wait 60s before next sync.",
      cacheHint: "SERVING FROM LOCAL CACHE",
      liveHint: "GROUNDED REAL-TIME DATA"
    },
    zh: {
      title: "图酷量化分析终端",
      inputPlaceholder: "输入代码 (如 513090, BTC, NVDA)",
      analyze: "搜索",
      refresh: "实时同步",
      analyzing: "扫描中...",
      refreshing: "同步中...",
      metrics: "量化多维指标",
      pe: "市盈率", pb: "市净率", premium: "折溢价率", turnover: "换手率",
      strategy: "AI 智能投资顾问",
      shortTerm: "短线 / 投机",
      longTerm: "长线 / 价值",
      trend: "趋势 / 信号",
      risk: "风险预警",
      sentiment: "多空情绪",
      chartTitle: "180日 K线走势 (智能数据拟合)",
      startTime: "起始",
      endTime: "当前",
      high52: "52周最高",
      low52: "52周最低",
      quotaError: "配额耗尽：请等待60秒后再次同步。",
      cacheHint: "本地缓存数据",
      liveHint: "联网实时查询"
    }
  }[lang];

  const handleAnalyze = async (isDeepRefresh = false) => {
    if (!code) return;
    setError(null);
    if (isDeepRefresh) setRefreshing(true); else setLoading(true);
    
    try {
      const response = await fetch('/api/analyze-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), forceSearch: isDeepRefresh })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429) {
            setError(t.quotaError);
        } else {
            setError(errorData.message || 'System Breach Detected');
        }
        return;
      }
      const result = await response.json();
      setData(result);
    } catch (e: any) {
      setError(`Fatal Terminal Error: ${e.message}`);
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
    const kH = h * 0.85; 
    const padding = 75;
    ctx.clearRect(0, 0, w, h);

    const hist = data.history;
    const maxP = Math.max(...hist.map(d => d.high)) * 1.01;
    const minP = Math.min(...hist.map(d => d.low)) * 0.99;
    const range = maxP - minP;
    const stepX = (w - padding * 2) / (hist.length || 1);
    const getY = (p: number) => padding + (1 - (p - minP) / (range || 1)) * (kH - padding * 2);

    // Grid System
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.05)';
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

    // K-Line Drawing
    hist.forEach((d, i) => {
      const x = padding + i * stepX;
      const isUp = d.close >= d.open;
      const color = isUp ? '#f43f5e' : '#10b981';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      
      ctx.beginPath();
      ctx.moveTo(x + stepX*0.35, getY(d.high));
      ctx.lineTo(x + stepX*0.35, getY(d.low));
      ctx.stroke();
      
      ctx.fillStyle = color;
      const oY = getY(d.open);
      const cY = getY(d.close);
      ctx.fillRect(x, Math.min(oY, cY), stepX * 0.7, Math.max(1, Math.abs(oY - cY)));
    });

    const drawMA = (key: 'ma5'|'ma10'|'ma20', color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
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
      <div className="max-w-6xl w-full mx-auto space-y-6 pb-20">
        
        {/* Modern Terminal Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-cyan-500/10 pb-6">
          <div>
            <div className="flex items-center gap-3">
               <h2 className="text-4xl font-tech font-bold text-white tracking-tighter uppercase">{t.title}</h2>
               <div className="bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 animate-pulse">
                  <span className="text-[9px] font-code text-cyan-400">V2.5 LITE_ENGINE</span>
               </div>
            </div>
            <p className="text-[10px] text-slate-500 font-code mt-2 tracking-[0.5em] uppercase">Multi-Asset Grounded Analysis Module</p>
          </div>
          
          <div className="flex gap-4">
             <div className="flex gap-2 max-w-sm bg-slate-900 border border-slate-800 p-1 group focus-within:border-cyan-500/50 transition-all">
                <input 
                  type="text" 
                  value={code} 
                  onChange={(e) => setCode(e.target.value)} 
                  placeholder={t.inputPlaceholder} 
                  className="bg-transparent border-none text-white font-code px-4 py-2 focus:outline-none text-xs uppercase" 
                  onKeyDown={(e) => e.key === 'Enter' && handleAnalyze(false)} 
                />
                <button 
                  onClick={() => handleAnalyze(false)} 
                  disabled={loading || refreshing} 
                  className="bg-cyan-700 hover:bg-cyan-600 text-white font-tech px-6 py-2 text-xs font-bold transition-all disabled:opacity-30"
                >
                  {loading ? t.analyzing : t.analyze}
                </button>
             </div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-950/20 border-l-4 border-rose-500 p-4 animate-in fade-in slide-in-from-top-2">
             <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-rose-500 rounded-full animate-ping"></div>
                <span className="text-xs font-code text-rose-400 uppercase font-bold">{error}</span>
             </div>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
            {/* Main Section */}
            <div className="lg:col-span-9 space-y-6">
              
              {/* Asset Overview Card */}
              <div className="bg-slate-900/80 border border-slate-800 p-10 flex flex-wrap items-center justify-between relative overflow-hidden backdrop-blur-md">
                <div className={`absolute top-0 left-0 w-1 h-full ${data.isRealtime ? 'bg-cyan-500 shadow-[0_0_10px_#06b6d4]' : 'bg-amber-500'}`}></div>
                
                {/* Status HUD */}
                <div className="absolute top-3 right-6 flex items-center gap-6">
                    <button onClick={() => handleAnalyze(true)} disabled={refreshing} className="flex items-center gap-2 group">
                        <div className={`w-3 h-3 border border-cyan-500/50 rounded-full flex items-center justify-center group-hover:bg-cyan-500/20 transition-all ${refreshing ? 'animate-spin' : ''}`}>
                           <div className="w-1 h-1 bg-cyan-400"></div>
                        </div>
                        <span className="text-[10px] font-tech text-cyan-500 hover:text-cyan-400 transition-colors uppercase">{refreshing ? t.refreshing : t.refresh}</span>
                    </button>
                    <div className="flex flex-col items-end">
                       <span className={`text-[9px] font-code uppercase tracking-tighter ${data.isCached ? 'text-amber-500' : 'text-cyan-400'}`}>
                          {data.isCached ? t.cacheHint : t.liveHint}
                       </span>
                       <span className="text-[8px] text-slate-600 font-code">{data.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString() : '--'}</span>
                    </div>
                </div>

                <div>
                  <div className="flex items-center gap-4">
                    <h3 className="text-white text-3xl font-tech font-bold tracking-tighter">{data.name}</h3>
                    <span className="text-[10px] bg-slate-800 text-cyan-400 px-3 py-1 font-code border border-slate-700 uppercase">{data.market}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-code mt-2 tracking-[0.3em] uppercase">{data.code}</div>
                  
                  <div className="flex items-baseline gap-8 mt-8">
                    <div className="flex flex-col">
                        <span className="text-7xl font-code font-bold text-white tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                          {(data.currentPrice || 0).toFixed(3)}
                        </span>
                    </div>
                    <div className={`text-3xl font-code font-bold flex flex-col items-start ${(data.changePercent || 0) >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                       <span>{(data.changePercent || 0) >= 0 ? '▲' : '▼'} {Math.abs(data.changePercent || 0)}%</span>
                       <span className="text-[10px] text-slate-500 uppercase font-tech tracking-wider mt-1">Daily Drift</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-12 mt-8 md:mt-0 bg-black/20 p-6 border border-white/5">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-500 font-tech uppercase mb-2 tracking-widest">{t.premium}</div>
                    <div className={`text-3xl font-code font-bold ${Math.abs(data.premiumRate || 0) > 0.4 ? 'text-rose-400' : 'text-cyan-400'}`}>
                       {data.premiumRate !== undefined ? `${data.premiumRate}%` : '--'}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-slate-500 font-tech uppercase mb-2 tracking-widest">{t.sentiment}</div>
                    <div className="text-3xl font-code font-bold text-purple-400">{data.sentiment}%</div>
                  </div>
                </div>
              </div>

              {/* TradingView-style Chart Container */}
              <div className="bg-slate-900/60 border border-slate-800 p-6 relative group overflow-hidden">
                <div className="absolute top-4 left-8 text-[10px] font-code text-slate-600 uppercase tracking-widest z-10">{t.chartTitle}</div>
                
                {/* MA Legend Overlay */}
                <div className="absolute top-4 right-10 flex gap-6 z-10">
                   <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#fbbf24]"></div><span className="text-[9px] font-code text-slate-400 uppercase">MA5</span></div>
                   <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#ec4899]"></div><span className="text-[9px] font-code text-slate-400 uppercase">MA10</span></div>
                   <div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-[#3b82f6]"></div><span className="text-[9px] font-code text-slate-400 uppercase">MA20</span></div>
                </div>

                <canvas ref={mainCanvasRef} width={1200} height={500} className="w-full h-[450px]" />
                
                {/* Simulation Watermark */}
                <div className="absolute bottom-6 right-10 pointer-events-none opacity-20">
                   <span className="text-[40px] font-tech text-cyan-900 font-black">SIMULATED CORE</span>
                </div>
              </div>

              {/* AI Strategy Insights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {[
                   { title: t.shortTerm, color: 'rose', text: data.strategyAdvice.shortTerm },
                   { title: t.longTerm, color: 'cyan', text: data.strategyAdvice.longTerm },
                   { title: t.trend, color: 'indigo', text: data.strategyAdvice.trendFollower }
                 ].map(s => (
                   <div key={s.title} className="bg-slate-900/80 p-6 border border-slate-800 hover:border-slate-700 transition-all clip-button">
                      <h5 className={`text-${s.color}-500 text-[11px] font-tech mb-5 uppercase tracking-widest border-l-2 border-${s.color}-500 pl-4`}>{s.title}</h5>
                      <div className="h-32 overflow-y-auto custom-scrollbar">
                        <p className="text-[12px] text-slate-400 leading-relaxed font-code">{s.text}</p>
                      </div>
                   </div>
                 ))}
              </div>
            </div>

            {/* Right Side Metrics Panel */}
            <div className="lg:col-span-3 space-y-6">
               <div className="bg-slate-900 border border-slate-800 p-8 shadow-xl">
                  <h4 className="text-[12px] font-tech font-bold text-slate-500 mb-8 uppercase tracking-widest border-b border-slate-800 pb-3">
                    <span className="text-cyan-500 mr-2">//</span>{t.metrics}
                  </h4>
                  <div className="space-y-8">
                     {[
                       { label: t.pe, val: data.pe }, 
                       { label: t.pb, val: data.pb },
                       { label: t.turnover, val: (data.turnover || '--') + '%' },
                       { label: t.high52, val: data.high52 }, 
                       { label: t.low52, val: data.low52 }
                     ].map(item => (
                       <div key={item.label} className="flex justify-between items-end border-b border-slate-800/30 pb-3">
                          <span className="text-[11px] text-slate-500 font-code uppercase">{item.label}</span>
                          <span className="text-lg font-code text-white font-bold tracking-tighter">{item.val || '--'}</span>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="bg-rose-950/10 border border-rose-900/30 p-8 shadow-inner">
                  <h4 className="text-[12px] font-tech font-bold text-rose-500 mb-6 uppercase tracking-widest flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    {t.risk}
                  </h4>
                  <ul className="space-y-5">
                     {data.risks.map((r, i) => (
                       <li key={i} className="text-[11px] text-slate-400 font-code flex items-start gap-4 group">
                          <span className="mt-1.5 w-1.5 h-1.5 bg-rose-500 shrink-0 shadow-[0_0_5px_red] group-hover:scale-150 transition-all"></span>
                          <span>{r}</span>
                       </li>
                     ))}
                  </ul>
               </div>
               
               <div className="p-6 border border-slate-800/50 bg-slate-900/30">
                  <div className="text-[10px] font-code text-slate-600 uppercase leading-relaxed text-center">
                    TUKU QUANTUM ANALYZER<br/>
                    ENGINE_STATE: <span className="text-green-500">NOMINAL</span><br/>
                    API_QUOTA_REMAINING: <span className="text-cyan-500">CALCULATING...</span>
                  </div>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
