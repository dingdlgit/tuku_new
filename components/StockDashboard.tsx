
import React, { useState, useEffect, useRef } from 'react';
import { StockAnalysisResult, Language, OHLC, BacktestResult, Trade } from '../types';

interface ExtendedStockResult extends StockAnalysisResult {
  isCached?: boolean;
  dataSource?: string;
}

interface StockDashboardProps {
  lang: Language;
}

export const StockDashboard: React.FC<StockDashboardProps> = ({ lang }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExtendedStockResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AI Analysis State
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  // Backtest State
  const [btLoading, setBtLoading] = useState(false);
  const [btResult, setBtResult] = useState<BacktestResult | null>(null);
  const [btConfig, setBtConfig] = useState({ capital: 100000, commission: 0.0003, strategy: 'smaCross' });

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);

  const t = {
    en: {
      title: "QUANT_DATA_CORE",
      placeholder: "SYMBOL (e.g. 513090, 000021)",
      search: "SEARCH",
      marketData: "MARKET OVERVIEW",
      aiAnalyze: "AI NEURAL ANALYSIS",
      backtest: "STRATEGY LAB / BACKTEST",
      runBt: "EXECUTE BACKTEST",
      btParams: "PARAMETERS",
      capital: "Initial Capital",
      commission: "Commission Rate",
      strategy: "Selection",
      finalValue: "FINAL VALUE",
      totalReturn: "TOTAL RETURN",
      maxDD: "MAX DRAWDOWN",
      sharpe: "SHARPE RATIO",
      equityCurve: "EQUITY CURVE",
      trades: "TRADE LOG",
      loading: "SYNCING...",
      aiHint: "Click to generate deep intelligence diagnostic.",
      noData: "AWAITING TICKER INPUT"
    },
    zh: {
      title: "量化数据核心",
      placeholder: "输入代码 (如 513090, 000021)",
      search: "查询",
      marketData: "市场实时概览",
      aiAnalyze: "AI 神经诊断",
      backtest: "策略实验室 / 回测",
      runBt: "执行回测",
      btParams: "回测参数配置",
      capital: "初始资金",
      commission: "手续费率",
      strategy: "策略选择",
      finalValue: "最终资金",
      totalReturn: "累计收益",
      maxDD: "最大回撤",
      sharpe: "夏普比率",
      equityCurve: "资产曲线",
      trades: "交易明细",
      loading: "同步中...",
      aiHint: "点击发起深度 AI 智能诊断与形态预测",
      noData: "等待输入代码信号"
    }
  }[lang];

  const handleSearch = async () => {
    if (!code) return;
    setError(null);
    setLoading(true);
    setAiResult(null);
    setBtResult(null);
    try {
      const response = await fetch('/api/analyze-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), lang })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Connection Failed');
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAiAnalysis = async () => {
    if (!data) return;
    setAiLoading(true);
    try {
      const response = await fetch('/api/ai-analyze-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: data.code, history: data.history, lang })
      });
      const result = await response.json();
      setAiResult(result);
    } catch (e: any) {
      setError("AI Analysis Failed");
    } finally {
      setAiLoading(false);
    }
  };

  const handleBacktest = async () => {
    if (!data) return;
    setBtLoading(true);
    try {
      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: data.history,
          initial_capital: btConfig.capital,
          commission_rate: btConfig.commission,
          strategy: btConfig.strategy
        })
      });
      const result = await response.json();
      setBtResult(result);
    } catch (e: any) {
      setError("Backtest Failed");
    } finally {
      setBtLoading(false);
    }
  };

  useEffect(() => {
    if (!data || !mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const padding = { left: 60, right: 40, top: 40, bottom: 40 };
    ctx.clearRect(0, 0, w, h);

    const hist = data.history;
    const prices = hist.map(d => d.close);
    const maxP = Math.max(...hist.map(d => d.high)) * 1.02;
    const minP = Math.min(...hist.map(d => d.low)) * 0.98;
    const range = maxP - minP;
    const stepX = (w - padding.left - padding.right) / hist.length;

    const getY = (p: number) => padding.top + (1 - (p - minP) / range) * (h - padding.top - padding.bottom);

    // Grid
    ctx.strokeStyle = 'rgba(6,182,212,0.1)';
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (i/4) * (h - padding.top - padding.bottom);
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
    }
    ctx.stroke();

    // Line Chart (Main)
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    hist.forEach((d, i) => {
        const x = padding.left + i * stepX;
        const y = getY(d.close);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Volume (bottom)
    const maxV = Math.max(...hist.map(d => d.volume));
    hist.forEach((d, i) => {
        const x = padding.left + i * stepX;
        const vH = (d.volume / maxV) * 50;
        ctx.fillStyle = d.close >= d.open ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)';
        ctx.fillRect(x, h - padding.bottom - vH, stepX * 0.8, vH);
    });

    // Draw Backtest Trades if available
    if (btResult && btResult.trades) {
        btResult.trades.forEach(trade => {
            const index = hist.findIndex(d => d.date === trade.date);
            if (index !== -1) {
                const x = padding.left + index * stepX;
                const y = getY(trade.price);
                ctx.font = 'bold 12px Rajdhani';
                ctx.textAlign = 'center';
                if (trade.type === 'BUY') {
                    ctx.fillStyle = '#f43f5e';
                    ctx.fillText('B', x + 5, y - 10);
                    ctx.beginPath(); ctx.arc(x + 5, y, 3, 0, Math.PI*2); ctx.fill();
                } else {
                    ctx.fillStyle = '#10b981';
                    ctx.fillText('S', x + 5, y + 20);
                    ctx.beginPath(); ctx.arc(x + 5, y, 3, 0, Math.PI*2); ctx.fill();
                }
            }
        });
    }

  }, [data, btResult]);

  return (
    <div className="h-full flex flex-col bg-slate-950/20 custom-scrollbar p-6">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        
        {/* Header Search */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-cyan-900/30 pb-6">
            <h2 className="text-3xl font-tech font-bold text-white tracking-widest uppercase">{t.title}</h2>
            <div className="flex bg-slate-900 border border-cyan-900/50 p-1 group">
                <input value={code} onChange={e => setCode(e.target.value)} placeholder={t.placeholder} className="bg-transparent text-white px-4 py-2 font-code focus:outline-none uppercase w-64" onKeyDown={e=>e.key==='Enter' && handleSearch()} />
                <button onClick={handleSearch} disabled={loading} className="bg-cyan-600 hover:bg-cyan-500 text-white font-tech px-8 py-2 font-bold tracking-widest clip-button transition-all">
                    {loading ? t.loading : t.search}
                </button>
            </div>
        </div>

        {error && <div className="p-3 bg-rose-950/20 border border-rose-500 text-rose-500 text-xs font-code uppercase animate-pulse">! SYSTEM ERROR: {error}</div>}

        {!data ? (
            <div className="h-96 flex flex-col items-center justify-center opacity-40">
                <div className="w-16 h-16 border-2 border-slate-800 rounded-full animate-spin mb-4 border-t-cyan-500"></div>
                <div className="font-code text-sm tracking-widest">{t.noData}</div>
            </div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
                
                {/* Left: Chart & Stats */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-slate-900/60 border border-slate-800 p-6 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-full h-0.5 bg-cyan-500 opacity-30"></div>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-2xl font-tech font-bold text-white">{data.name} <span className="text-sm font-code text-cyan-500 ml-2">{data.code}</span></h3>
                                <div className="text-4xl font-code font-black mt-2">
                                    {data.currentPrice.toFixed(2)} 
                                    <span className={`text-lg ml-4 ${data.changePercent >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {data.changePercent >= 0 ? '▲' : '▼'} {Math.abs(data.changePercent)}%
                                    </span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[10px] font-code uppercase">
                                <div className="text-slate-500">PE: <span className="text-white">{data.pe}</span></div>
                                <div className="text-slate-500">PB: <span className="text-white">{data.pb}</span></div>
                                <div className="text-slate-500">MK: <span className="text-white">{data.market}</span></div>
                            </div>
                        </div>

                        <div className="relative h-[400px] w-full">
                            <canvas ref={mainCanvasRef} width={800} height={400} className="w-full h-full" />
                        </div>
                    </div>

                    {/* Backtest Section */}
                    <div className="bg-slate-900/60 border border-slate-800 p-6">
                        <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-3">
                            <h4 className="font-tech text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-2">
                                <span className="w-2 h-2 bg-cyan-500 animate-pulse"></span>
                                {t.backtest}
                            </h4>
                            <button onClick={handleBacktest} disabled={btLoading} className="bg-cyan-900/30 border border-cyan-500 text-cyan-400 px-6 py-1.5 text-xs font-tech font-bold hover:bg-cyan-500 hover:text-white transition-all">
                                {btLoading ? 'CALCULATING...' : t.runBt}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                             <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-code uppercase">{t.capital}</label>
                                <input type="number" value={btConfig.capital} onChange={e=>setBtConfig({...btConfig, capital: Number(e.target.value)})} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500" />
                             </div>
                             <div className="space-y-1">
                                <label className="text-[10px] text-slate-500 font-code uppercase">{t.commission}</label>
                                <input type="number" step="0.0001" value={btConfig.commission} onChange={e=>setBtConfig({...btConfig, commission: Number(e.target.value)})} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500" />
                             </div>
                             <div className="space-y-1 md:col-span-2">
                                <label className="text-[10px] text-slate-500 font-code uppercase">{t.strategy}</label>
                                <select value={btConfig.strategy} onChange={e=>setBtConfig({...btConfig, strategy: e.target.value})} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500">
                                    <option value="smaCross">SMA CROSSOVER (5/20)</option>
                                    <option value="ma5Hold">BUY AND HOLD (BENCHMARK)</option>
                                </select>
                             </div>
                        </div>

                        {btResult && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 animate-in fade-in zoom-in duration-300">
                                <div className="bg-black/40 p-4 border-l-2 border-cyan-500">
                                    <div className="text-[10px] text-slate-500 font-tech mb-1 uppercase">{t.finalValue}</div>
                                    <div className="text-xl font-code font-bold text-white">{btResult.final_value.toFixed(2)}</div>
                                </div>
                                <div className="bg-black/40 p-4 border-l-2 border-purple-500">
                                    <div className="text-[10px] text-slate-500 font-tech mb-1 uppercase">{t.totalReturn}</div>
                                    <div className={`text-xl font-code font-bold ${btResult.total_return >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {(btResult.total_return * 100).toFixed(2)}%
                                    </div>
                                </div>
                                <div className="bg-black/40 p-4 border-l-2 border-orange-500">
                                    <div className="text-[10px] text-slate-500 font-tech mb-1 uppercase">{t.maxDD}</div>
                                    <div className="text-xl font-code font-bold text-orange-400">{(btResult.max_drawdown * 100).toFixed(2)}%</div>
                                </div>
                                <div className="bg-black/40 p-4 border-l-2 border-emerald-500">
                                    <div className="text-[10px] text-slate-500 font-tech mb-1 uppercase">{t.sharpe}</div>
                                    <div className="text-xl font-code font-bold text-emerald-400">{btResult.sharpe.toFixed(3)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: AI & Trades */}
                <div className="lg:col-span-4 space-y-6">
                    {/* AI DIAGNOSTICS */}
                    <div className="bg-slate-900 border border-slate-800 p-6 relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-cyan-500/5 rounded-full blur-3xl group-hover:bg-cyan-500/10 transition-all"></div>
                        <h4 className="font-tech text-purple-400 font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                             {t.aiAnalyze}
                        </h4>
                        
                        {!aiResult ? (
                            <div className="text-center py-6">
                                <p className="text-xs text-slate-500 font-code mb-6 uppercase tracking-tight">{t.aiHint}</p>
                                <button onClick={handleAiAnalysis} disabled={aiLoading} className="w-full py-3 bg-purple-900/20 border border-purple-500/50 text-purple-400 font-tech font-bold uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all relative overflow-hidden group">
                                    <span className="relative z-10">{aiLoading ? 'PROCESSING NEURAL NETWORK...' : 'START DIAGNOSTIC'}</span>
                                    {aiLoading && <div className="absolute inset-0 bg-purple-500/10 animate-pulse"></div>}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in duration-500">
                                <div className="flex justify-between items-center bg-black/40 p-3">
                                    <span className="text-[10px] font-tech text-slate-500 uppercase">Sentiment Index</span>
                                    <div className="flex gap-1">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={i} className={`w-2 h-4 ${i < (aiResult.sentiment/20) ? 'bg-purple-500' : 'bg-slate-800'}`}></div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <div className="text-[9px] font-tech text-slate-600 uppercase mb-1">STRATEGY ADVICE</div>
                                        <p className="text-[11px] text-slate-300 font-code leading-relaxed bg-black/20 p-2">{aiResult.strategyAdvice?.shortTerm}</p>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-tech text-rose-600 uppercase mb-1">RISK ALERT</div>
                                        <ul className="text-[10px] text-rose-400/80 font-code list-disc list-inside">
                                            {aiResult.risks?.map((r: string, i: number) => <li key={i}>{r}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* TRADE LOG */}
                    <div className="bg-slate-900 border border-slate-800 p-6 flex-1 flex flex-col h-[500px]">
                        <h4 className="font-tech text-slate-500 font-bold uppercase tracking-widest mb-4">{t.trades}</h4>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                             {btResult?.trades && btResult.trades.length > 0 ? (
                                 btResult.trades.map((trade, i) => (
                                     <div key={i} className={`p-3 border-l-2 bg-black/20 font-code flex justify-between items-center ${trade.type === 'BUY' ? 'border-rose-500' : 'border-emerald-500'}`}>
                                         <div>
                                             <div className="text-[10px] text-slate-500">{trade.date}</div>
                                             <div className={`text-xs font-bold ${trade.type === 'BUY' ? 'text-rose-400' : 'text-emerald-400'}`}>{trade.type} @ {trade.price.toFixed(2)}</div>
                                         </div>
                                         <div className="text-right">
                                             <div className="text-[10px] text-slate-500">COST: {trade.cost.toFixed(0)}</div>
                                             <div className="text-[9px] text-slate-600">FEE: {trade.commission.toFixed(1)}</div>
                                         </div>
                                     </div>
                                 )).reverse()
                             ) : (
                                 <div className="h-full flex items-center justify-center text-[10px] text-slate-700 font-code uppercase tracking-widest">No Signals Recorded</div>
                             )}
                        </div>
                    </div>
                </div>

            </div>
        )}
      </div>
    </div>
  );
};
