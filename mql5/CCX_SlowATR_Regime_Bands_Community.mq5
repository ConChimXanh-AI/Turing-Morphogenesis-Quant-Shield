//+------------------------------------------------------------------+
//|            CCX_SlowATR_Regime_Bands_Community.mq5                |
//|     Open-Source Quantitative Microstructure Indicator (MT5)       |
//|     Author: Con Chim Xanh (Bluebird AI)                          |
//|     GitHub: https://github.com/ConChimXanh-AI                    |
//+------------------------------------------------------------------+
#property copyright "Con Chim Xanh AI — Autonomous Quant Lab"
#property link      "https://github.com/ConChimXanh-AI/Turing-Morphogenesis-Quant-Shield"
#property version   "1.00"
#property indicator_chart_window
#property indicator_buffers 3
#property indicator_plots   3

#property indicator_label1  "Session VWAP Anchor"
#property indicator_type1   DRAW_LINE
#property indicator_color1  clrGold
#property indicator_style1  STYLE_SOLID
#property indicator_width1  2

#property indicator_label2  "Upper Slow-ATR Sigma Band"
#property indicator_type2   DRAW_LINE
#property indicator_color2  clrDeepSkyBlue
#property indicator_style2  STYLE_DOT
#property indicator_width2  1

#property indicator_label3  "Lower Slow-ATR Sigma Band"
#property indicator_type3   DRAW_LINE
#property indicator_color3  clrDeepSkyBlue
#property indicator_style3  STYLE_DOT
#property indicator_width3  1

input int    InpVwapLookback   = 48;    // Rolling Microstructure Lookback (M15 Bars)
input int    InpSlowAtrPeriod  = 96;    // Slow-ATR Structural Transformer Period
input double InpBandSigmaMult  = 1.95;  // Sigma Dispersion Multiplier

double BufVWAP[];
double BufUpper[];
double BufLower[];

int OnInit()
{
   SetIndexBuffer(0, BufVWAP,  INDICATOR_DATA);
   SetIndexBuffer(1, BufUpper, INDICATOR_DATA);
   SetIndexBuffer(2, BufLower, INDICATOR_DATA);
   IndicatorSetString(INDICATOR_SHORTNAME, "CCX Slow-ATR Regime Bands");
   return(INIT_SUCCEEDED);
}

int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
{
   int minBars = MathMax(InpVwapLookback, InpSlowAtrPeriod) + 2;
   if(rates_total < minBars) return(0);

   int start = (prev_calculated > minBars) ? prev_calculated - 1 : minBars;
   for(int i = start; i < rates_total; i++)
   {
      double sumPV = 0.0, sumV = 0.0;
      for(int k = 0; k < InpVwapLookback; k++)
      {
         int idx = i - k;
         double tp = (high[idx] + low[idx] + close[idx]) / 3.0;
         double w  = (double)MathMax(tick_volume[idx], 1);
         sumPV += tp * w;
         sumV  += w;
      }
      double vwap = (sumV > 0.0) ? (sumPV / sumV) : close[i];

      double sumVar = 0.0;
      for(int k = 0; k < InpVwapLookback; k++)
      {
         int idx = i - k;
         double tp = (high[idx] + low[idx] + close[idx]) / 3.0;
         double w  = (double)MathMax(tick_volume[idx], 1);
         double d  = tp - vwap;
         sumVar += w * d * d;
      }
      double stdDev = (sumV > 0.0) ? MathSqrt(sumVar / sumV) : 0.0;

      // Slow-ATR floor prevents band collapse during low-liquidity compression
      double sumTR = 0.0;
      for(int k = 0; k < InpSlowAtrPeriod; k++)
      {
         int idx = i - k;
         double hl = high[idx] - low[idx];
         double hc = MathAbs(high[idx] - close[idx - 1]);
         double lc = MathAbs(low[idx]  - close[idx - 1]);
         sumTR += MathMax(hl, MathMax(hc, lc));
      }
      double slowAtr = sumTR / (double)InpSlowAtrPeriod;
      double effDispersion = MathMax(stdDev, 0.55 * slowAtr);

      BufVWAP[i]  = vwap;
      BufUpper[i] = vwap + InpBandSigmaMult * effDispersion;
      BufLower[i] = vwap - InpBandSigmaMult * effDispersion;
   }
   return(rates_total);
}
