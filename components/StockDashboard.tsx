
import React, { useState, useEffect, useRef } from 'react';
import { StockAnalysisResult, Language, OHLC } from '../types';

interface ExtendedStockResult extends StockAnalysisResult {
  isCached?: boolean;
  dataSource?: string;
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
      inputPlaceholder: "SYMBOL (e.g. 513090, 000021)",
      analyze: "SEARCH",
      refresh: "FORCE_SYNC",
      analyzing: "CONNECTING...",
      refreshing: "SYNCING...",
      metrics: "LIVE QUANT DATA",
      pe: "P/E", pb: "P/B", premium: "PREMIUM", turnover: "TURNOVER",
      strategy: "AI AGENT ADVICE",
      shortTerm: "Intraday/Scalp",
      longTerm: "Value/Hold",
      trend: "MA/Trend",
      risk: "RISK EXPOSURE",
      sentiment: "SENTIMENT",
      chartTitle: "180-DAY K-LINE RECONSTRUCTION",
      source: "SOURCE",
      high52: "52W HIGH",
      low52: "52W LOW"
    },
    zh: {
      title: "图酷量化分析终端",
      inputPlaceholder: "输入代码 (如 513090, 000021)",
      analyze: "搜索",
      refresh: "强制同步",
      analyzing: "连接中...",
      refreshing: "同步中...",
      metrics: "实时量化指标",
      pe: "市盈率", pb: "市净率", premium: "折溢价率", turnover: "换手率",
      strategy: "AI 智能投资顾问",
      shortTerm: "短线 / 投机",
      longTerm: "长线 / 价值",
      trend: "趋势 / 信号",
      risk: "风险预警",
      sentiment: "多空情绪",
      chartTitle: "180日 K线拟合走势",
      source: "行情源",
      high52: "52周最高",
      low52: "52周最低"
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
        body: JSON.stringify({ code: code.trim().toUpperCase(), forceSearch: isDeepRefresh })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'System Overload');
      setData(result);
    } catch (e: any) {
      setError(`Critical: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!data || !data.history || data.history.length === 0 || !mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const kH = h * 0.85; 
    const padding = 75;
    ctx.clearRect(0, 0, w, h);

    const hist = data.history;
    const maxP = Math.max(...hist.map(d => d.high || d.close)) * 1.01;
    const minP = Math.min(...hist.map(d => d.low || d.close)) * 0.99;
    const range = maxP - minP;
    const stepX = (w - padding * 2) / hist.length;
    const getY = (p: number) => padding + (1 - (p - minP) / (range || 1)) * (kH - padding * 2);

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.05)';
    ctx.font = '10px JetBrains Mono';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.textAlign = 'right';

    for (let i = 0; i <= 5; i++) {
       const gridY = padding + (i / 5) * (kH - padding * 2);
       const price = maxP - (i / 5) * range;
       ctx.beginPath(); ctx.moveTo(padding, gridY); ctx.lineTo(w - padding, gridY); ctx.stroke();
       ctx.fillText(price.toFixed(3), padding - 15, gridY + 3);
    }

    hist.forEach((d, i) => {
      const x = padding + i * stepX;
      const isUp = d.close >= d.open;
      const color = isUp ? '#f43f5e' : '#10b981';
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(x + stepX*0.35, getY(d.high || d.close)); ctx.lineTo(x + stepX*0.35, getY(d.low || d.close)); ctx.stroke();
      ctx.fillStyle = color;
      const oY = getY(d.open); const cY = getY(d.close);
      ctx.fillRect(x, Math.min(oY, cY), stepX * 0.7, Math.max(1, Math.abs(oY - cY)));
    });

    const drawMA = (key: 'ma5'|'ma10'|'ma20', color: string) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
      let first = true;
      hist.forEach((d, i) => {
        const val = (d as any)[key];
        if (val) {
          const x = padding + i * stepX + stepX * 0.35;
          const y = getY(val);
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    };
    drawMA('ma5', '#fbbf24'); drawMA('ma10', '#ec4899'); drawMA('ma20', '#3b82f6');
  }, [data, lang]);

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto custom-scrollbar bg-slate-950/40">
      <div className="max-w-6xl w-full mx-auto space-y-6 pb-20">
        <div className="flex justify-between items-end border-b border-cyan-500/10 pb-6">
          <div>
            <h2 className="text-4xl font-tech font-bold text-white tracking-tighter uppercase">{t.title}</h2>
            <div className="flex items-center gap-4 mt-2">
               <span className="text-[10px] text-slate-500 font-code tracking-[0.4em]">REAL-TIME DATA OVERLAY ACTIVE</span>
               {data && (
                 <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/40 px-2 py-0.5">
                    <span className="text-[8px] font-code text-cyan-400 uppercase">{t.source}: {data.dataSource}</span>
                 </div>
               )}
            </div>
          </div>
          <div className="flex gap-2 bg-slate-900 border border-slate-800 p-1">
            <input value={code} onChange={e => setCode(e.target.value)} placeholder={t.inputPlaceholder} className="bg-transparent border-none text-white font-code px-4 py-2 focus:outline-none text-xs uppercase w-48" onKeyDown={e => e.key === 'Enter' && handleAnalyze(false)} />
            <button onClick={() => handleAnalyze(false)} disabled={loading || refreshing} className="bg-cyan-700 hover:bg-cyan-600 text-white font-tech px-6 py-2 text-xs font-bold transition-all disabled:opacity-30">{loading ? t.analyzing : t.analyze}</button>
          </div>
        </div>

        {error && <div className="bg-rose-950/20 border-l-4 border-rose-500 p-4 text-xs font-code text-rose-400 uppercase animate-pulse">● {error}</div>}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="lg:col-span-9 space-y-6">
              <div className="bg-slate-900/80 border border-slate-800 p-10 flex flex-wrap items-center justify-between relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${!data.isCached ? 'bg-cyan-500 shadow-[0_0_10px_#06b6d4]' : 'bg-amber-500'}`}></div>
                <div className="absolute top-2 right-4 flex items-center gap-4">
                  <button onClick={() => handleAnalyze(true)} disabled={refreshing} className="text-[9px] font-tech text-cyan-500 underline uppercase">{refreshing ? t.refreshing : t.refresh}</button>
                  <span className="text-[8px] text-slate-600 font-code uppercase">{data.isCached ? 'CACHED' : 'LIVE'} // {data.lastUpdated ? new Date(data.lastUpdated).toLocaleTimeString() : ''}</span>
                </div>
                <div>
                  <div className="flex items-center gap-4">
                    <h3 className="text-white text-3xl font-tech font-bold">{data.name}</h3>
                    <span className="text-[10px] bg-slate-800 text-cyan-400 px-3 py-1 font-code border border-slate-700">{data.market}</span>
                  </div>
                  <div className="flex items-baseline gap-8 mt-8">
                    <span className="text-7xl font-code font-bold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.05)]">{(data.currentPrice || 0).toFixed(3)}</span>
                    <div className={`text-3xl font-code font-bold ${(data.changePercent || 0) >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                       {(data.changePercent || 0) >= 0 ? '▲' : '▼'} {Math.abs(data.changePercent || 0)}%
                    </div>
                  </div>
                </div>
                <div className="flex gap-12 bg-black/20 p-6 border border-white/5">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-500 font-tech uppercase mb-1">{t.premium}</div>
                    <div className="text-3xl font-code font-bold text-cyan-400">{data.premiumRate || '0.00'}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-slate-500 font-tech uppercase mb-1">{t.sentiment}</div>
                    <div className="text-3xl font-code font-bold text-purple-400">{data.sentiment || '--'}%</div>
                  </div>
                </div>
              </div>

              {data.history && data.history.length > 0 ? (
                <div className="bg-slate-900/60 border border-slate-800 p-6 relative">
                  <div className="absolute top-4 left-8 text-[9px] font-code text-slate-600 uppercase tracking-widest">{t.chartTitle}</div>
                  <canvas ref={mainCanvasRef} width={1200} height={450} className="w-full h-[400px]" />
                </div>
              ) : (
                <div className="bg-slate-900/60 border border-slate-800 h-64 flex items-center justify-center">
                  <span className="text-[10px] font-code text-slate-600 animate-pulse tracking-widest">AWAITING HISTORICAL SIMULATION DATA</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {[
                   { title: t.shortTerm, color: 'rose', text: data.strategyAdvice?.shortTerm },
                   { title: t.longTerm, color: 'cyan', text: data.strategyAdvice?.longTerm },
                   { title: t.trend, color: 'indigo', text: data.strategyAdvice?.trendFollower }
                 ].map(s => (
                   <div key={s.title} className="bg-slate-900 p-6 border border-slate-800 clip-button">
                      <h5 className={`text-${s.color}-500 text-[11px] font-tech mb-4 uppercase tracking-widest border-l-2 border-${s.color}-500 pl-4`}>{s.title}</h5>
                      <p className="text-[12px] text-slate-400 font-code h-24 overflow-y-auto">{s.text || 'Inference engine currently throttled.'}</p>
                   </div>
                 ))}
              </div>
            </div>

            <div className="lg:col-span-3 space-y-6">
               <div className="bg-slate-900 border border-slate-800 p-8">
                  <h4 className="text-[12px] font-tech font-bold text-slate-500 mb-8 uppercase tracking-widest border-b border-slate-800 pb-3">{t.metrics}</h4>
                  <div className="space-y-8">
                     {[{ label: t.pe, val: data.pe }, { label: t.pb, val: data.pb }, { label: t.high52, val: data.high52 }, { label: t.low52, val: data.low52 }].map(item => (
                       <div key={item.label} className="flex justify-between items-end border-b border-slate-800/30 pb-3">
                          <span className="text-[11px] text-slate-500 font-code uppercase">{item.label}</span>
                          <span className="text-lg font-code text-white font-bold">{item.val || '--'}</span>
                       </div>
                     ))}
                  </div>
               </div>
               <div className="bg-rose-950/10 border border-rose-900/30 p-8">
                  <h4 className="text-[12px] font-tech font-bold text-rose-500 mb-6 uppercase tracking-widest flex items-center gap-2">{t.risk}</h4>
                  <ul className="space-y-4">
                     {(data.risks || ['No risks detected by local engine.']).map((r, i) => (
                       <li key={i} className="text-[11px] text-slate-400 font-code flex items-start gap-4">
                          <span className="mt-1.5 w-1.5 h-1.5 bg-rose-500 shrink-0"></span><span>{r}</span>
                       </li>
                     ))}
                  </ul>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
