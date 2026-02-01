
import React, { useState, useEffect, useRef } from 'react';
import { StockAnalysisResult, Language, OHLC } from '../types';

interface ExtendedStockResult extends StockAnalysisResult {
  isRealtime?: boolean;
}

interface StockDashboardProps {
  lang: Language;
}

export const StockDashboard: React.FC<StockDashboardProps> = ({ lang }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExtendedStockResult | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);

  const t = {
    en: {
      title: "QUANTUM TRADING TERMINAL",
      inputPlaceholder: "STOCK CODE (e.g. 000021, 600519, AAPL)",
      analyze: "INITIATE SCAN",
      analyzing: "CONNECTING TO DATA STREAM...",
      metrics: "REAL-TIME METRICS",
      pe: "P/E", pb: "P/B", turnover: "Turnover", amp: "Amplitude",
      strategy: "AI STRATEGY ANALYSIS",
      shortTerm: "Short-term/Scalp",
      longTerm: "Value/Long-term",
      trend: "Trend/MA",
      risk: "RISK PROFILE",
      sentiment: "SENTIMENT",
      chartTitle: "180-DAY K-LINE (GROUNDED SIMULATION)",
      support: "Support", resistance: "Resistance",
      realtimeStatus: "LIVE_SEARCH",
      fallbackStatus: "INTERNAL_KNOWLEDGE"
    },
    zh: {
      title: "量子金融交易终端",
      inputPlaceholder: "输入股票代码 (如 000021, 600519, NVDA)",
      analyze: "开启扫描",
      analyzing: "正在检索实时联网数据...",
      metrics: "实时行情指标",
      pe: "市盈率", pb: "市净率", turnover: "换手率", amp: "振幅",
      strategy: "AI 投资策略建议",
      shortTerm: "短线 / 打板选手",
      longTerm: "长线 / 价值投资",
      trend: "趋势 / 均线跟踪",
      risk: "风险预警",
      sentiment: "多空情绪指数",
      chartTitle: "180日 K线走势 (实时锚定模拟)",
      support: "支撑位", resistance: "阻力位",
      realtimeStatus: "实时联网数据",
      fallbackStatus: "离线分析模式 (由于配额限制)"
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
    }
  };

  useEffect(() => {
    if (!data || !mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const kH = h * 0.7;
    const padding = 40;
    ctx.clearRect(0, 0, w, h);

    const hist = data.history;
    const maxP = Math.max(...hist.map(d => d.high)) * 1.02;
    const minP = Math.min(...hist.map(d => d.low)) * 0.98;
    const range = maxP - minP;
    const stepX = (w - padding * 2) / (hist.length || 1);
    const getY = (p: number) => padding + (1 - (p - minP) / (range || 1)) * (kH - padding * 2);

    hist.forEach((d, i) => {
      const x = padding + i * stepX;
      const isUp = d.close >= d.open;
      const color = isUp ? '#ef4444' : '#22c55e';
      ctx.strokeStyle = color;
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
    drawMA('ma5', '#fef08a'); drawMA('ma10', '#f472b6'); drawMA('ma20', '#60a5fa');
  }, [data]);

  return (
    <div className="h-full flex flex-col p-6 relative custom-scrollbar overflow-y-auto">
      <div className="max-w-6xl w-full mx-auto space-y-6 pb-12">
        <div className="text-center">
          <h2 className="text-4xl font-tech font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 uppercase tracking-widest">{t.title}</h2>
          <div className="flex justify-center gap-4 mt-2">
            <p className="text-[10px] text-slate-500 font-code uppercase tracking-[0.2em]">Live Grounding powered by Backend AI Node</p>
          </div>
        </div>

        <div className="flex gap-4 max-w-2xl mx-auto bg-slate-900/80 p-1.5 border border-cyan-500/30 backdrop-blur-xl clip-button">
          <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.inputPlaceholder} className="flex-1 bg-transparent border-none text-white font-code px-5 focus:outline-none text-lg" onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()} />
          <button onClick={handleAnalyze} disabled={loading} className="bg-cyan-600 hover:bg-cyan-500 text-white font-tech px-10 py-3 disabled:opacity-50 font-bold transition-all relative overflow-hidden group">
            <span className="relative z-10">{loading ? t.analyzing : t.analyze}</span>
            {loading && <div className="absolute inset-0 bg-cyan-400/20 animate-pulse"></div>}
          </button>
        </div>

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-slate-900/60 border border-slate-800 p-8 flex flex-wrap items-center justify-between relative backdrop-blur-sm overflow-hidden">
                <div className={`absolute top-0 left-0 w-2 h-full ${data.isRealtime ? 'bg-cyan-500' : 'bg-amber-500'}`}></div>
                
                {/* Status Indicator */}
                <div className="absolute top-2 right-4 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${data.isRealtime ? 'bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]' : 'bg-amber-500'}`}></span>
                    <span className={`text-[9px] font-code uppercase tracking-tighter ${data.isRealtime ? 'text-cyan-400' : 'text-amber-500'}`}>
                        {data.isRealtime ? t.realtimeStatus : t.fallbackStatus}
                    </span>
                </div>

                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-white font-tech text-xl font-bold">{data.name}</span>
                    <span className="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-code border border-cyan-500/30">{data.market}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-code tracking-[0.3em]">{data.code}</div>
                  <div className="flex items-baseline gap-4 mt-4">
                    <span className="text-6xl font-code font-bold text-white tabular-nums">{(data.currentPrice || 0).toFixed(2)}</span>
                    <div className={`font-code font-bold ${(data.changePercent || 0) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                      <span className="text-2xl">{(data.changePercent || 0) >= 0 ? '▲' : '▼'} {Math.abs(data.changeAmount || 0)}</span>
                      <span className="text-lg ml-2">({data.changePercent || 0}%)</span>
                    </div>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-xs text-slate-500 font-tech uppercase">{t.sentiment}</div>
                  <div className="text-5xl font-code font-bold text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.3)]">{data.sentiment}%</div>
                </div>
              </div>

              <div className="bg-black/60 border border-slate-800 p-4 shadow-2xl overflow-hidden relative">
                <div className="absolute top-4 left-6 text-[10px] font-code text-slate-600 uppercase z-10">K-Line Visualization Matrix</div>
                <canvas ref={mainCanvasRef} width={900} height={400} className="w-full h-[350px]" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 {[
                   { title: t.shortTerm, color: 'cyan', text: data.strategyAdvice.shortTerm },
                   { title: t.longTerm, color: 'purple', text: data.strategyAdvice.longTerm },
                   { title: t.trend, color: 'blue', text: data.strategyAdvice.trendFollower }
                 ].map(s => (
                   <div key={s.title} className="bg-slate-900/80 p-5 border border-slate-800 clip-button group hover:border-slate-600 transition-colors">
                      <h5 className={`text-${s.color}-400 text-xs font-tech mb-3 uppercase tracking-tighter`}>{s.title}</h5>
                      <p className="text-[12px] text-slate-300 leading-relaxed font-code group-hover:text-white transition-colors">{s.text}</p>
                   </div>
                 ))}
              </div>
            </div>

            <div className="space-y-6">
               <div className="bg-slate-900/80 border border-slate-800 p-6">
                  <h4 className="text-[11px] font-tech font-bold text-slate-500 mb-6 uppercase border-b border-slate-800 pb-2 tracking-widest">{t.metrics}</h4>
                  <div className="space-y-5">
                     {[
                       { label: t.pe, val: data.pe }, { label: t.pb, val: data.pb },
                       { label: t.turnover, val: data.turnoverRate + '%' }, { label: t.amp, val: data.amplitude + '%' }
                     ].map(item => (
                       <div key={item.label} className="flex justify-between items-end border-b border-slate-800/50 pb-1">
                          <span className="text-[11px] text-slate-400 font-code uppercase tracking-tighter">{item.label}</span>
                          <span className="text-lg font-code text-white font-bold">{item.val}</span>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="bg-red-900/10 border border-red-900/30 p-6">
                  <h4 className="text-[11px] font-tech font-bold text-red-500 mb-4 uppercase tracking-widest">{t.risk}</h4>
                  <ul className="space-y-3">
                     {data.risks.map((r, i) => (
                       <li key={i} className="text-[12px] text-red-200/70 font-code flex items-start gap-3">
                          <span className="mt-1.5 w-1.5 h-1.5 bg-red-500 shrink-0 shadow-[0_0_5px_red]"></span>{r}
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
