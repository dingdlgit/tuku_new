
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StockAnalysisResult, Language, OHLC, BacktestResult, Trade } from '../types';

interface ExtendedStockResult extends StockAnalysisResult {
  isCached?: boolean;
  dataSource?: string;
}

interface StockDashboardProps {
  lang: Language;
}

type IndicatorType = 'VOL' | 'MACD' | 'AMT';

export const StockDashboard: React.FC<StockDashboardProps> = ({ lang }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExtendedStockResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Indicator Switching
  const [indicator, setIndicator] = useState<IndicatorType>('VOL');

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
      noData: "AWAITING TICKER INPUT",
      indicator: "SUB_INDICATOR",
      vol: "VOL",
      macd: "MACD",
      amt: "AMT",
      strategyDesc: "STRATEGY INTEL",
      strategies: {
          smaCross: {
              name: "SMA Crossover (5/20)",
              desc: "A trend-following strategy that generates a BUY signal when the 5-day SMA crosses above the 20-day SMA (Golden Cross) and a SELL signal when it crosses below (Death Cross)."
          },
          ma5Hold: {
              name: "Buy & Hold Benchmark",
              desc: "Enters a full position at the start of the timeframe and holds until the final day. Used to compare strategy performance against market alpha."
          }
      }
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
      noData: "等待输入代码信号",
      indicator: "副图指标",
      vol: "成交量",
      macd: "指数平滑异同移动平均线",
      amt: "成交额",
      strategyDesc: "策略逻辑说明",
      strategies: {
          smaCross: {
              name: "双均线交叉策略 (5/20)",
              desc: "经典的趋势跟随策略。当 5 日均线向上穿越 20 日均线时触发“金叉”买入信号；反之，当 5 日均线向下穿越 20 日均线时触发“死叉”卖出信号。适合捕捉中短期趋势。"
          },
          ma5Hold: {
              name: "买入持有 (基准测试)",
              desc: "回测首日全仓买入并一直持有到期末。用于评估选定策略是否能够跑赢该标的的市场平均表现（Alpha 收益）。"
          }
      }
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

  // --- INDICATOR CALCULATION HELPERS ---
  const calculateMA = (data: OHLC[], period: number) => {
    return data.map((_, i, arr) => {
      if (i < period - 1) return null;
      const slice = arr.slice(i - period + 1, i + 1);
      return slice.reduce((sum, item) => sum + item.close, 0) / period;
    });
  };

  const calculateMACD = (data: OHLC[]) => {
      const ema = (arr: number[], period: number) => {
          const k = 2 / (period + 1);
          let emaArr = [arr[0]];
          for (let i = 1; i < arr.length; i++) {
              emaArr.push(arr[i] * k + emaArr[i-1] * (1 - k));
          }
          return emaArr;
      };
      const closes = data.map(d => d.close);
      const ema12 = ema(closes, 12);
      const ema26 = ema(closes, 26);
      const diff = ema12.map((val, i) => val - ema26[i]);
      const dea = ema(diff, 9);
      const hist = diff.map((val, i) => (val - dea[i]) * 2);
      return { diff, dea, hist };
  };

  useEffect(() => {
    if (!data || !mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Use device pixel ratio for sharper rendering
    const dpr = window.devicePixelRatio || 1;
    const logicalW = canvas.clientWidth;
    const logicalH = canvas.clientHeight;
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    ctx.scale(dpr, dpr);

    const w = logicalW;
    const h = logicalH;
    const padding = { left: 60, right: 60, top: 40, bottom: 40, subTop: 0.7 * h };
    ctx.clearRect(0, 0, w, h);

    const hist = data.history;
    const ma5 = calculateMA(hist, 5);
    const ma10 = calculateMA(hist, 10);
    const ma20 = calculateMA(hist, 20);
    const ma30 = calculateMA(hist, 30);
    const macd = calculateMACD(hist);

    const maxPrice = Math.max(...hist.map(d => d.high)) * 1.02;
    const minPrice = Math.min(...hist.map(d => d.low)) * 0.98;
    const priceRange = maxPrice - minPrice;
    const stepX = (w - padding.left - padding.right) / hist.length;

    const getPriceY = (p: number) => padding.top + (1 - (p - minPrice) / priceRange) * (padding.subTop - 20 - padding.top);
    const getSubY = (val: number, max: number, min: number = 0) => {
        const range = max - min;
        return padding.subTop + 20 + (1 - (val - min) / range) * (h - padding.bottom - (padding.subTop + 20));
    };

    // --- DRAW BACKGROUND & GRID ---
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(6,182,212,0.1)';
    ctx.lineWidth = 1;

    // Horiz Lines
    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (i/5) * (padding.subTop - 20 - padding.top);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        
        // Price labels
        ctx.fillStyle = '#475569';
        ctx.font = '10px JetBrains Mono';
        ctx.textAlign = 'left';
        ctx.fillText((maxPrice - (i/5) * priceRange).toFixed(2), w - padding.right + 5, y + 3);
    }

    // --- DRAW K-LINES (CANDLESTICKS) ---
    const candleW = Math.max(2, stepX * 0.7);
    hist.forEach((d, i) => {
        const x = padding.left + i * stepX;
        const color = d.close >= d.open ? '#f43f5e' : '#10b981'; // Red for Up, Green for Down
        ctx.strokeStyle = color;
        ctx.fillStyle = color;

        // Wick
        ctx.beginPath();
        ctx.moveTo(x + candleW / 2, getPriceY(d.high));
        ctx.lineTo(x + candleW / 2, getPriceY(d.low));
        ctx.stroke();

        // Body
        const bodyY = getPriceY(Math.max(d.open, d.close));
        const bodyH = Math.max(1, Math.abs(getPriceY(d.open) - getPriceY(d.close)));
        ctx.fillRect(x, bodyY, candleW, bodyH);

        // Date X-Axis
        if (i % Math.floor(hist.length / 5) === 0) {
            ctx.fillStyle = '#475569';
            ctx.textAlign = 'center';
            ctx.fillText(d.date.substring(5), x + candleW/2, h - 10);
            ctx.beginPath();
            ctx.moveTo(x + candleW/2, padding.top);
            ctx.lineTo(x + candleW/2, h - padding.bottom);
            ctx.stroke();
        }
    });

    // --- DRAW MOVING AVERAGES ---
    const drawMA = (ma: (number | null)[], color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        let first = true;
        ma.forEach((val, i) => {
            if (val === null) return;
            const x = padding.left + i * stepX + candleW / 2;
            const y = getPriceY(val);
            if (first) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            first = false;
        });
        ctx.stroke();
    };

    drawMA(ma5, '#fbbf24'); // MA5 - Yellow
    drawMA(ma10, '#a855f7'); // MA10 - Purple
    drawMA(ma20, '#06b6d4'); // MA20 - Cyan
    drawMA(ma30, '#ffffff'); // MA30 - White

    // --- DRAW SUB-INDICATOR ---
    if (indicator === 'VOL') {
        const maxV = Math.max(...hist.map(d => d.volume));
        hist.forEach((d, i) => {
            const x = padding.left + i * stepX;
            const vH = (d.volume / maxV) * (h - padding.bottom - padding.subTop - 20);
            ctx.fillStyle = d.close >= d.open ? 'rgba(244,63,94,0.4)' : 'rgba(16,185,129,0.4)';
            ctx.fillRect(x, h - padding.bottom - vH, candleW, vH);
        });
    } else if (indicator === 'MACD') {
        const maxMacd = Math.max(...macd.diff, ...macd.dea, ...macd.hist.map(Math.abs));
        const minMacd = Math.min(...macd.diff, ...macd.dea, ...macd.hist.map(v => -Math.abs(v)));
        const zeroY = getSubY(0, maxMacd, minMacd);
        
        // Hist
        hist.forEach((d, i) => {
            const x = padding.left + i * stepX;
            const val = macd.hist[i];
            const y = getSubY(val, maxMacd, minMacd);
            ctx.fillStyle = val >= 0 ? '#f43f5e' : '#10b981';
            ctx.fillRect(x, Math.min(y, zeroY), candleW, Math.abs(y - zeroY));
        });

        // DIFF/DEA Lines
        const drawLine = (arr: number[], color: string) => {
            ctx.strokeStyle = color;
            ctx.beginPath();
            arr.forEach((v, i) => {
                const x = padding.left + i * stepX + candleW/2;
                const y = getSubY(v, maxMacd, minMacd);
                if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
            });
            ctx.stroke();
        };
        drawLine(macd.diff, '#ffffff');
        drawLine(macd.dea, '#fbbf24');
    } else if (indicator === 'AMT') {
        const turnover = hist.map(d => d.volume * d.close);
        const maxAmt = Math.max(...turnover);
        hist.forEach((d, i) => {
            const x = padding.left + i * stepX;
            const vH = (turnover[i] / maxAmt) * (h - padding.bottom - padding.subTop - 20);
            ctx.fillStyle = 'rgba(6,182,212,0.4)';
            ctx.fillRect(x, h - padding.bottom - vH, candleW, vH);
        });
    }

    // --- DRAW BACKTEST SIGNALS ---
    if (btResult && btResult.trades) {
        btResult.trades.forEach(trade => {
            const index = hist.findIndex(d => d.date === trade.date);
            if (index !== -1) {
                const x = padding.left + index * stepX + candleW / 2;
                const y = getPriceY(trade.price);
                if (trade.type === 'BUY') {
                    ctx.fillStyle = '#f43f5e';
                    ctx.beginPath(); ctx.moveTo(x-5, y+15); ctx.lineTo(x+5, y+15); ctx.lineTo(x, y+5); ctx.closePath(); ctx.fill();
                    ctx.fillText('B', x-3, y + 25);
                } else {
                    ctx.fillStyle = '#10b981';
                    ctx.beginPath(); ctx.moveTo(x-5, y-15); ctx.lineTo(x+5, y-15); ctx.lineTo(x, y-5); ctx.closePath(); ctx.fill();
                    ctx.fillText('S', x-3, y - 20);
                }
            }
        });
    }

  }, [data, btResult, indicator, lang]);

  return (
    <div className="h-full flex flex-col bg-[#020617] custom-scrollbar p-6">
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
                
                {/* Left: Chart & Indicators */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-slate-900/60 border border-slate-800 p-6 relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-2xl font-tech font-bold text-white">{data.name} <span className="text-sm font-code text-cyan-500 ml-2">{data.code}</span></h3>
                                <div className="flex items-center gap-4 mt-1">
                                    <span className={`text-2xl font-code font-black ${data.changePercent >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{data.currentPrice.toFixed(2)}</span>
                                    <span className={`text-sm font-bold ${data.changePercent >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {data.changePercent >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                                    </span>
                                    <div className="flex gap-2 text-[9px] font-code ml-4">
                                        <span className="text-yellow-400">MA5</span>
                                        <span className="text-purple-400">MA10</span>
                                        <span className="text-cyan-400">MA20</span>
                                        <span className="text-white">MA30</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex gap-1">
                                {(['VOL', 'MACD', 'AMT'] as IndicatorType[]).map(type => (
                                    <button key={type} onClick={() => setIndicator(type)} className={`px-3 py-1 text-[10px] font-tech border transition-all ${indicator === type ? 'bg-cyan-500 text-black border-cyan-400' : 'text-slate-500 border-slate-700 hover:border-cyan-500'}`}>
                                        {t[type.toLowerCase() as keyof typeof t] as string}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="relative h-[550px] w-full bg-[#020617] border border-slate-800">
                            <canvas ref={mainCanvasRef} className="w-full h-full cursor-crosshair" />
                        </div>
                    </div>

                    {/* Backtest Config & Docs */}
                    <div className="bg-slate-900/60 border border-slate-800 p-6">
                        <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-3">
                            <h4 className="font-tech text-cyan-400 font-bold uppercase tracking-widest flex items-center gap-2">
                                <span className="w-2 h-2 bg-cyan-500 animate-pulse"></span>
                                {t.backtest}
                            </h4>
                            <button onClick={handleBacktest} disabled={btLoading} className="bg-cyan-900/30 border border-cyan-500 text-cyan-400 px-6 py-1.5 text-xs font-tech font-bold hover:bg-cyan-500 hover:text-white transition-all">
                                {btLoading ? 'PROCESSING...' : t.runBt}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             {/* Form */}
                             <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-code uppercase">{t.capital}</label>
                                        <input type="number" value={btConfig.capital} onChange={e=>setBtConfig({...btConfig, capital: Number(e.target.value)})} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-500 font-code uppercase">{t.commission}</label>
                                        <input type="number" step="0.0001" value={btConfig.commission} onChange={e=>setBtConfig({...btConfig, commission: Number(e.target.value)})} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500" />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] text-slate-500 font-code uppercase">{t.strategy}</label>
                                    <select value={btConfig.strategy} onChange={e=>setBtConfig({...btConfig, strategy: e.target.value})} className="w-full bg-black border border-slate-700 text-white p-2 text-xs focus:border-cyan-500">
                                        <option value="smaCross">{t.strategies.smaCross.name}</option>
                                        <option value="ma5Hold">{t.strategies.ma5Hold.name}</option>
                                    </select>
                                </div>
                             </div>

                             {/* Documentation */}
                             <div className="bg-black/40 p-4 border-l-2 border-cyan-500/30">
                                <h5 className="text-[10px] font-tech text-cyan-500 uppercase mb-2">{t.strategyDesc}</h5>
                                <p className="text-[11px] text-slate-400 font-code leading-relaxed">
                                    {t.strategies[btConfig.strategy as keyof typeof t.strategies]?.desc}
                                </p>
                             </div>
                        </div>

                        {btResult && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8 animate-in fade-in zoom-in duration-300">
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
                                    <span className="relative z-10">{aiLoading ? 'SYNCING NEURAL NETWORK...' : 'START DIAGNOSTIC'}</span>
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
