
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
  const [btConfig, setBtConfig] = useState({ 
    capital: 100000, 
    commission: 0.0003, 
    strategy: 'smaCross',
    startDate: '', // New Filter Date
    endDate: ''   // New Filter Date
  });

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
      startDate: "Start Date",
      endDate: "End Date",
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
      startDate: "开始日期",
      endDate: "结束日期",
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
      macd: "MACD",
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

  // Logic to filter history based on dates
  const filteredHistory = useMemo(() => {
    if (!data) return [];
    let hist = [...data.history];
    if (btConfig.startDate) {
        hist = hist.filter(d => d.date >= btConfig.startDate);
    }
    if (btConfig.endDate) {
        hist = hist.filter(d => d.date <= btConfig.endDate);
    }
    return hist;
  }, [data, btConfig.startDate, btConfig.endDate]);

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
      
      // Initialize dates if not set
      if (result.history && result.history.length > 0) {
        setBtConfig(prev => ({
            ...prev,
            startDate: result.history[0].date,
            endDate: result.history[result.history.length - 1].date
        }));
      }
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
          history: filteredHistory,
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
  const calculateMA = (hist: OHLC[], period: number) => {
    return hist.map((_, i, arr) => {
      if (i < period - 1) return null;
      const slice = arr.slice(i - period + 1, i + 1);
      return slice.reduce((sum, item) => sum + item.close, 0) / period;
    });
  };

  const calculateMACD = (hist: OHLC[]) => {
      const ema = (arr: number[], period: number) => {
          const k = 2 / (period + 1);
          let emaArr = [arr[0] || 0];
          for (let i = 1; i < arr.length; i++) {
              emaArr.push(arr[i] * k + emaArr[i-1] * (1 - k));
          }
          return emaArr;
      };
      const closes = hist.map(d => d.close);
      const ema12 = ema(closes, 12);
      const ema26 = ema(closes, 26);
      const diff = ema12.map((val, i) => val - ema26[i]);
      const dea = ema(diff, 9);
      const histMacd = diff.map((val, i) => (val - dea[i]) * 2);
      return { diff, dea, hist: histMacd };
  };

  useEffect(() => {
    if (filteredHistory.length === 0 || !mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const logicalW = canvas.clientWidth;
    const logicalH = canvas.clientHeight;
    canvas.width = logicalW * dpr;
    canvas.height = logicalH * dpr;
    ctx.scale(dpr, dpr);

    const w = logicalW;
    const h = logicalH;
    const padding = { left: 60, right: 60, top: 40, bottom: 40, subTop: 0.75 * h };
    
    // 1. Draw Background (White)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);

    const hist = filteredHistory;
    const ma5 = calculateMA(hist, 5);
    const ma10 = calculateMA(hist, 10);
    const ma20 = calculateMA(hist, 20);
    const ma30 = calculateMA(hist, 30);
    const macd = calculateMACD(hist);

    const maxPrice = Math.max(...hist.map(d => d.high)) * 1.01;
    const minPrice = Math.min(...hist.map(d => d.low)) * 0.99;
    const priceRange = maxPrice - minPrice;
    const stepX = (w - padding.left - padding.right) / hist.length;

    const getPriceY = (p: number) => padding.top + (1 - (p - minPrice) / priceRange) * (padding.subTop - 20 - padding.top);
    const getSubY = (val: number, max: number, min: number = 0) => {
        const range = Math.max(0.0001, max - min);
        return padding.subTop + 10 + (1 - (val - min) / range) * (h - padding.bottom - (padding.subTop + 10));
    };

    // 2. Draw Grid (Subtle)
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (i/4) * (padding.subTop - 20 - padding.top);
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(w - padding.right, y);
        ctx.stroke();
        
        ctx.fillStyle = '#64748b';
        ctx.font = '10px "JetBrains Mono"';
        ctx.textAlign = 'right';
        ctx.fillText((maxPrice - (i/4) * priceRange).toFixed(2), padding.left - 5, y + 4);
    }

    // 3. Draw K-Lines
    const candleW = Math.max(1, stepX * 0.7);
    hist.forEach((d, i) => {
        const x = padding.left + i * stepX;
        const color = d.close >= d.open ? '#eb4432' : '#009b72'; // Chinese style: Red Up, Green Down
        ctx.strokeStyle = color;
        ctx.fillStyle = d.close >= d.open ? '#FFFFFF' : color; // Hollow red for up is common in CN, but let's use solid for clarity

        // Wick
        ctx.beginPath();
        ctx.moveTo(x + candleW / 2, getPriceY(d.high));
        ctx.lineTo(x + candleW / 2, getPriceY(d.low));
        ctx.stroke();

        // Body (Always solid for better readability here)
        ctx.fillStyle = color;
        const bodyY = getPriceY(Math.max(d.open, d.close));
        const bodyH = Math.max(1, Math.abs(getPriceY(d.open) - getPriceY(d.close)));
        ctx.fillRect(x, bodyY, candleW, bodyH);

        // Date labels
        if (i % Math.floor(hist.length / 6) === 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText(d.date.substring(2), x + candleW/2, h - 15);
        }
    });

    // 4. Draw Moving Averages (MA5:Black, MA10:Yellow, MA20:Pink, MA30:Green)
    const drawMA = (ma: (number | null)[], color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
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

    drawMA(ma5, '#000000'); // MA5 - Black
    drawMA(ma10, '#eab308'); // MA10 - Yellow
    drawMA(ma20, '#ec4899'); // MA20 - Pink
    drawMA(ma30, '#22c55e'); // MA30 - Green

    // 5. Draw Sub-Indicator
    if (indicator === 'VOL') {
        const maxV = Math.max(...hist.map(d => d.volume));
        hist.forEach((d, i) => {
            const x = padding.left + i * stepX;
            const vH = (d.volume / maxV) * (h - padding.bottom - padding.subTop - 10);
            ctx.fillStyle = d.close >= d.open ? '#eb4432' : '#009b72';
            ctx.fillRect(x, h - padding.bottom - vH, candleW, vH);
        });
    } else if (indicator === 'MACD') {
        const maxM = Math.max(...macd.diff, ...macd.dea, ...macd.hist.map(Math.abs));
        const minM = Math.min(...macd.diff, ...macd.dea, ...macd.hist.map(v => -Math.abs(v)));
        const zeroY = getSubY(0, maxM, minM);
        
        hist.forEach((d, i) => {
            const x = padding.left + i * stepX;
            const val = macd.hist[i];
            const y = getSubY(val, maxM, minM);
            ctx.fillStyle = val >= 0 ? '#eb4432' : '#009b72';
            ctx.fillRect(x, Math.min(y, zeroY), candleW, Math.abs(y - zeroY));
        });

        ctx.strokeStyle = '#000000'; // DIFF
        ctx.beginPath();
        macd.diff.forEach((v, i) => {
            const x = padding.left + i * stepX + candleW/2;
            const y = getSubY(v, maxM, minM);
            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.stroke();

        ctx.strokeStyle = '#eab308'; // DEA
        ctx.beginPath();
        macd.dea.forEach((v, i) => {
            const x = padding.left + i * stepX + candleW/2;
            const y = getSubY(v, maxM, minM);
            if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.stroke();
    }

    // 6. Draw Highly Significant Backtest Signals
    if (btResult && btResult.trades) {
        btResult.trades.forEach(trade => {
            const index = hist.findIndex(d => d.date === trade.date);
            if (index !== -1) {
                const x = padding.left + index * stepX + candleW / 2;
                const y = getPriceY(trade.price);
                
                ctx.font = 'bold 12px Rajdhani';
                ctx.textAlign = 'center';
                
                if (trade.type === 'BUY') {
                    // Bright Red Circle with B
                    ctx.fillStyle = '#eb4432';
                    ctx.beginPath(); ctx.arc(x, y + 25, 10, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText('B', x, y + 29);
                    // Connection line
                    ctx.strokeStyle = '#eb4432';
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 15); ctx.stroke();
                } else {
                    // Bright Green Circle with S
                    ctx.fillStyle = '#009b72';
                    ctx.beginPath(); ctx.arc(x, y - 25, 10, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText('S', x, y - 21);
                    // Connection line
                    ctx.strokeStyle = '#009b72';
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 15); ctx.stroke();
                }
            }
        });
    }

  }, [filteredHistory, btResult, indicator, lang]);

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] custom-scrollbar p-6">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        
        {/* Header Search */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between border-b border-slate-200 pb-6">
            <h2 className="text-3xl font-tech font-bold text-slate-900 tracking-widest uppercase">{t.title}</h2>
            <div className="flex bg-white border border-slate-300 p-1 shadow-sm">
                <input value={code} onChange={e => setCode(e.target.value)} placeholder={t.placeholder} className="bg-transparent text-slate-900 px-4 py-2 font-code focus:outline-none uppercase w-64" onKeyDown={e=>e.key==='Enter' && handleSearch()} />
                <button onClick={handleSearch} disabled={loading} className="bg-slate-900 hover:bg-black text-white font-tech px-8 py-2 font-bold tracking-widest clip-button transition-all">
                    {loading ? t.loading : t.search}
                </button>
            </div>
        </div>

        {error && <div className="p-3 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-code uppercase animate-pulse">! SYSTEM ERROR: {error}</div>}

        {!data ? (
            <div className="h-96 flex flex-col items-center justify-center opacity-40">
                <div className="w-16 h-16 border-2 border-slate-200 rounded-full animate-spin mb-4 border-t-slate-900"></div>
                <div className="font-code text-sm tracking-widest text-slate-900">{t.noData}</div>
            </div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-20">
                
                {/* Left: Chart & Indicators */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white border border-slate-200 p-6 relative overflow-hidden shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-2xl font-tech font-bold text-slate-900">{data.name} <span className="text-sm font-code text-slate-400 ml-2">{data.code}</span></h3>
                                <div className="flex items-center gap-4 mt-1">
                                    <span className={`text-2xl font-code font-black ${data.changePercent >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{data.currentPrice.toFixed(2)}</span>
                                    <span className={`text-sm font-bold ${data.changePercent >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {data.changePercent >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                                    </span>
                                    <div className="flex gap-2 text-[10px] font-bold font-code ml-4">
                                        <span className="text-black border-b border-black">MA5</span>
                                        <span className="text-yellow-600 border-b border-yellow-600">MA10</span>
                                        <span className="text-pink-600 border-b border-pink-600">MA20</span>
                                        <span className="text-emerald-600 border-b border-emerald-600">MA30</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex gap-1">
                                {(['VOL', 'MACD'] as IndicatorType[]).map(type => (
                                    <button key={type} onClick={() => setIndicator(type)} className={`px-4 py-1.5 text-[10px] font-tech border transition-all ${indicator === type ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-400 border-slate-200 hover:border-slate-400 hover:text-slate-900'}`}>
                                        {t[type.toLowerCase() as keyof typeof t] as string}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="relative h-[550px] w-full bg-white border border-slate-100">
                            <canvas ref={mainCanvasRef} className="w-full h-full cursor-crosshair" />
                        </div>
                    </div>

                    {/* Backtest Config & Docs */}
                    <div className="bg-white border border-slate-200 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-3">
                            <h4 className="font-tech text-slate-900 font-bold uppercase tracking-widest flex items-center gap-2">
                                <span className="w-2 h-2 bg-slate-900 animate-pulse"></span>
                                {t.backtest}
                            </h4>
                            <button onClick={handleBacktest} disabled={btLoading} className="bg-slate-900 text-white px-8 py-2 text-xs font-tech font-bold hover:bg-black transition-all clip-button">
                                {btLoading ? 'PROCESSING...' : t.runBt}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                             {/* Form */}
                             <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-code uppercase">{t.startDate}</label>
                                        <input type="date" value={btConfig.startDate} onChange={e=>setBtConfig({...btConfig, startDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-900 p-2 text-xs focus:border-slate-900 focus:outline-none" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-code uppercase">{t.endDate}</label>
                                        <input type="date" value={btConfig.endDate} onChange={e=>setBtConfig({...btConfig, endDate: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-900 p-2 text-xs focus:border-slate-900 focus:outline-none" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-code uppercase">{t.capital}</label>
                                        <input type="number" value={btConfig.capital} onChange={e=>setBtConfig({...btConfig, capital: Number(e.target.value)})} className="w-full bg-slate-50 border border-slate-200 text-slate-900 p-2 text-xs focus:border-slate-900 focus:outline-none" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-slate-400 font-code uppercase">{t.strategy}</label>
                                        <select value={btConfig.strategy} onChange={e=>setBtConfig({...btConfig, strategy: e.target.value})} className="w-full bg-slate-50 border border-slate-200 text-slate-900 p-2 text-xs focus:border-slate-900 focus:outline-none">
                                            <option value="smaCross">{t.strategies.smaCross.name}</option>
                                            <option value="ma5Hold">{t.strategies.ma5Hold.name}</option>
                                        </select>
                                    </div>
                                </div>
                             </div>

                             {/* Documentation */}
                             <div className="bg-slate-50 p-4 border-l-2 border-slate-300">
                                <h5 className="text-[10px] font-tech text-slate-500 uppercase mb-2">{t.strategyDesc}</h5>
                                <p className="text-[11px] text-slate-600 font-code leading-relaxed">
                                    {t.strategies[btConfig.strategy as keyof typeof t.strategies]?.desc}
                                </p>
                             </div>
                        </div>

                        {btResult && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-8 animate-in fade-in zoom-in duration-300">
                                <div className="bg-slate-50 p-4 border-l-2 border-slate-900">
                                    <div className="text-[10px] text-slate-400 font-tech mb-1 uppercase">{t.finalValue}</div>
                                    <div className="text-xl font-code font-bold text-slate-900">{btResult.final_value.toFixed(2)}</div>
                                </div>
                                <div className="bg-slate-50 p-4 border-l-2 border-rose-500">
                                    <div className="text-[10px] text-slate-400 font-tech mb-1 uppercase">{t.totalReturn}</div>
                                    <div className={`text-xl font-code font-bold ${btResult.total_return >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {(btResult.total_return * 100).toFixed(2)}%
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-4 border-l-2 border-orange-500">
                                    <div className="text-[10px] text-slate-400 font-tech mb-1 uppercase">{t.maxDD}</div>
                                    <div className="text-xl font-code font-bold text-orange-600">{(btResult.max_drawdown * 100).toFixed(2)}%</div>
                                </div>
                                <div className="bg-slate-50 p-4 border-l-2 border-emerald-500">
                                    <div className="text-[10px] text-slate-400 font-tech mb-1 uppercase">{t.sharpe}</div>
                                    <div className="text-xl font-code font-bold text-emerald-600">{btResult.sharpe.toFixed(3)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: AI & Trades */}
                <div className="lg:col-span-4 space-y-6">
                    {/* AI DIAGNOSTICS */}
                    <div className="bg-white border border-slate-200 p-6 relative overflow-hidden group shadow-sm">
                        <h4 className="font-tech text-slate-900 font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                             {t.aiAnalyze}
                        </h4>
                        
                        {!aiResult ? (
                            <div className="text-center py-6">
                                <p className="text-xs text-slate-500 font-code mb-6 uppercase tracking-tight">{t.aiHint}</p>
                                <button onClick={handleAiAnalysis} disabled={aiLoading} className="w-full py-3 bg-slate-900 text-white font-tech font-bold uppercase tracking-widest hover:bg-black transition-all clip-button">
                                    {aiLoading ? 'ANALYZING...' : 'START DIAGNOSTIC'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-4 animate-in fade-in duration-500">
                                <div className="bg-slate-50 p-3 rounded">
                                    <span className="text-[10px] font-tech text-slate-400 uppercase">Sentiment Index</span>
                                    <div className="flex gap-1 mt-1">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={i} className={`w-3 h-5 ${i < (aiResult.sentiment/20) ? 'bg-slate-900' : 'bg-slate-200'}`}></div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <div className="text-[9px] font-tech text-slate-400 uppercase mb-1">STRATEGY ADVICE</div>
                                        <p className="text-[11px] text-slate-700 font-code leading-relaxed bg-slate-50 p-2 border-l-2 border-slate-300">{aiResult.strategyAdvice?.shortTerm}</p>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-tech text-rose-500 uppercase mb-1">RISK ALERT</div>
                                        <ul className="text-[10px] text-rose-600 font-code list-disc list-inside">
                                            {aiResult.risks?.map((r: string, i: number) => <li key={i}>{r}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* TRADE LOG */}
                    <div className="bg-white border border-slate-200 p-6 flex-1 flex flex-col h-[500px] shadow-sm">
                        <h4 className="font-tech text-slate-400 font-bold uppercase tracking-widest mb-4">{t.trades}</h4>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                             {btResult?.trades && btResult.trades.length > 0 ? (
                                 btResult.trades.map((trade, i) => (
                                     <div key={i} className={`p-3 border-l-4 bg-slate-50 font-code flex justify-between items-center ${trade.type === 'BUY' ? 'border-rose-500' : 'border-emerald-500'}`}>
                                         <div>
                                             <div className="text-[10px] text-slate-400">{trade.date}</div>
                                             <div className={`text-xs font-bold ${trade.type === 'BUY' ? 'text-rose-600' : 'text-emerald-600'}`}>{trade.type} @ {trade.price.toFixed(2)}</div>
                                         </div>
                                         <div className="text-right">
                                             <div className="text-[10px] text-slate-400">VAL: {trade.cost.toFixed(0)}</div>
                                             <div className="text-[9px] text-slate-500">FEE: {trade.commission.toFixed(1)}</div>
                                         </div>
                                     </div>
                                 )).reverse()
                             ) : (
                                 <div className="h-full flex items-center justify-center text-[10px] text-slate-300 font-code uppercase tracking-widest">Awaiting execution</div>
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
