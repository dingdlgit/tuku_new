
/**
 * TUKU High-Performance Backtest Engine (Vectorized)
 */
export class BacktestEngine {
  /**
   * Run strategy backtest
   * @param {Array} data - OHLCV history
   * @param {number} initial_capital - Starting cash
   * @param {number} commission_rate - e.g. 0.0003
   * @param {Function} strategy_fn - (data) => Array of signals (-1, 0, 1)
   */
  static run(data, initial_capital, commission_rate, strategy_fn) {
    if (!data || data.length === 0) throw new Error("No data provided");

    // 1. Generate Signals (Vectorized via strategy function)
    const signals = strategy_fn(data); // 1: BUY, -1: SELL, 0: HOLD/NONE

    let cash = initial_capital;
    let shares = 0;
    const equity_curve = [];
    const trades = [];

    // 2. Compute Transitions and Trades
    for (let i = 0; i < data.length; i++) {
      const day = data[i];
      const signal = signals[i];
      const price = day.close;

      // Handle Signal Logic (Full Position)
      if (signal === 1 && shares === 0) {
        // Full Buy
        const total_cost = cash;
        const commission = total_cost * commission_rate;
        const net_cash = cash - commission;
        shares = net_cash / price;
        cash = 0;

        trades.push({
          date: day.date,
          type: 'BUY',
          price,
          shares,
          cost: total_cost,
          commission,
          value: net_cash
        });
      } else if (signal === -1 && shares > 0) {
        // Full Sell
        const raw_value = shares * price;
        const commission = raw_value * commission_rate;
        cash = raw_value - commission;

        trades.push({
          date: day.date,
          type: 'SELL',
          price,
          shares,
          cost: raw_value,
          commission,
          value: cash
        });
        shares = 0;
      }

      // Record Daily Equity
      const current_equity = cash + (shares * price);
      equity_curve.push({
        date: day.date,
        value: current_equity
      });
    }

    // 3. Calculate Performance Metrics
    const final_value = equity_curve[equity_curve.length - 1].value;
    const total_return = (final_value - initial_capital) / initial_capital;

    // Max Drawdown Calculation (Vectorized logic)
    let peak = initial_capital;
    let max_drawdown = 0;
    equity_curve.forEach(d => {
      if (d.value > peak) peak = d.value;
      const dd = (peak - d.value) / peak;
      if (dd > max_drawdown) max_drawdown = dd;
    });

    // Sharpe Ratio (Daily simplified)
    const daily_returns = [];
    for (let i = 1; i < equity_curve.length; i++) {
      daily_returns.push((equity_curve[i].value - equity_curve[i - 1].value) / equity_curve[i - 1].value);
    }
    
    const mean_return = daily_returns.reduce((a, b) => a + b, 0) / daily_returns.length;
    const std_dev = Math.sqrt(daily_returns.map(x => Math.pow(x - mean_return, 2)).reduce((a, b) => a + b, 0) / daily_returns.length);
    // Annualized Sharpe (approx 252 trading days)
    const sharpe = std_dev !== 0 ? (mean_return / std_dev) * Math.sqrt(252) : 0;

    return {
      final_value,
      total_return,
      max_drawdown,
      sharpe,
      equity_curve,
      trades
    };
  }

  // Sample Strategy: SMA Crossover
  static smaCross(data, fast = 5, slow = 20) {
    const signals = new Array(data.length).fill(0);
    const closes = data.map(d => d.close);

    const calculateSMA = (arr, period, index) => {
      if (index < period - 1) return null;
      let sum = 0;
      for (let i = index; i > index - period; i--) sum += arr[i];
      return sum / period;
    };

    let last_signal = -1; // Start in "neutral/sell" state
    for (let i = 0; i < data.length; i++) {
      const fastMA = calculateSMA(closes, fast, i);
      const slowMA = calculateSMA(closes, slow, i);

      if (fastMA !== null && slowMA !== null) {
        if (fastMA > slowMA && last_signal !== 1) {
          signals[i] = 1;
          last_signal = 1;
        } else if (fastMA < slowMA && last_signal !== -1) {
          signals[i] = -1;
          last_signal = -1;
        }
      }
    }
    return signals;
  }
}
