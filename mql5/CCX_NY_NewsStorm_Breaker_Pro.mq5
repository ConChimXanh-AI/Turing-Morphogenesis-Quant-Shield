//+------------------------------------------------------------------+
//|               CCX_NY_NewsStorm_Breaker_Pro.mq5                   |
//|   US DST NEWS-STORM & SPREAD-EXPLOSION CIRCUIT BREAKER UTILITY   |
//|   Author: Con Chim Xanh AI (https://github.com/ConChimXanh-AI)   |
//+------------------------------------------------------------------+
#property copyright "Con Chim Xanh AI — Autonomous Quantitative Engineering Lab"
#property link      "https://github.com/ConChimXanh-AI/Turing-Morphogenesis-Quant-Shield"
#property version   "1.00"
#property description "Automatic US DST (EDT/EST) News-Storm & Spread-Explosion Circuit Breaker for MetaTrader 5."
#property description "Protects prop-firm and retail accounts during CPI/NFP (08:30 NY), Wall Street Open (09:30 NY), and Friday Close."
#property strict

#include <Trade\Trade.mqh>

input group "=== 1. US DST SESSION SHIELD WINDOWS ==="
input bool   InpBlockNY_08_09        = true;   // Shield 08:00-09:59 NY (CPI/NFP 8:30 & NYSE Open 9:30)
input bool   InpBlockLondonOpen      = true;   // Shield 05:00 & 07:00 UTC (European Open Whipsaw)
input bool   InpBlockFridayLate      = true;   // Shield Friday >= 20:00 UTC (Weekend Gap Protection)

input group "=== 2. VOLATILITY & SPREAD CIRCUIT BREAKERS ==="
input double InpMaxAllowedSpreadPts  = 35.0;   // Max Allowed Spread in Points (0 = Disabled)
input double InpMaxAtrRatio          = 1.35;   // Max ATR(14) / ATR(100) Ratio Before Storm Lock
input bool   InpDeletePendingInStorm = true;   // Auto-Remove Pending Orders During Storm Window
input ulong  InpTargetMagic          = 0;      // Target EA Magic Number (0 = All Magics on Symbol)

CTrade       m_trade;
const string HUD_PREFIX = "CCX_STORM_BREAKER_";

int          g_nyHour       = 0;
bool         g_isEDT        = true;
bool         g_isStorm      = false;
string       g_stormReason  = "CLEAR";
int          g_removedCount = 0;

int GetNthSunday(int year, int month, int nth)
{
   MqlDateTime dt;
   dt.year = year; dt.mon = month; dt.day = 1;
   dt.hour = 0;    dt.min = 0;     dt.sec = 0;
   datetime t = StructToTime(dt);
   TimeToStruct(t, dt);
   int firstSun = (dt.day_of_week == 0) ? 1 : (8 - dt.day_of_week);
   return firstSun + (nth - 1) * 7;
}

int GetNYHour(datetime gmt, bool &outEDT)
{
   MqlDateTime utc;
   TimeToStruct(gmt, utc);
   int marSun2 = GetNthSunday(utc.year, 3, 2);
   int novSun1 = GetNthSunday(utc.year, 11, 1);

   MqlDateTime s = utc; s.mon = 3;  s.day = marSun2; s.hour = 7; s.min = 0; s.sec = 0;
   MqlDateTime e = utc; e.mon = 11; e.day = novSun1; e.hour = 6; e.min = 0; e.sec = 0;

   outEDT = (gmt >= StructToTime(s) && gmt < StructToTime(e));
   datetime ny = gmt + (outEDT ? -4 : -5) * 3600;
   MqlDateTime nyDt;
   TimeToStruct(ny, nyDt);
   return nyDt.hour;
}

double CalcAtrRatioM15()
{
   MqlRates r[];
   ArraySetAsSeries(r, true);
   int copied = CopyRates(_Symbol, PERIOD_M15, 0, 120, r);
   if(copied < 105) return 1.0;

   double tr14 = 0.0, tr100 = 0.0;
   for(int i = 1; i <= 100; i++)
   {
      double hl = r[i].high - r[i].low;
      double hc = MathAbs(r[i].high - r[i+1].close);
      double lc = MathAbs(r[i].low  - r[i+1].close);
      double tr = MathMax(hl, MathMax(hc, lc));
      if(i <= 14) tr14 += tr;
      tr100 += tr;
   }
   double atr14  = tr14 / 14.0;
   double atr100 = MathMax(tr100 / 100.0, _Point);
   return atr14 / atr100;
}

void EvaluateStormAndProtect()
{
   datetime gmt = TimeGMT();
   if(gmt <= 0) gmt = TimeCurrent();
   MqlDateTime u;
   TimeToStruct(gmt, u);

   g_nyHour = GetNYHour(gmt, g_isEDT);
   double curSpreadPts = (SymbolInfoDouble(_Symbol, SYMBOL_ASK) - SymbolInfoDouble(_Symbol, SYMBOL_BID)) / _Point;
   double atrRatio     = CalcAtrRatioM15();

   g_isStorm     = false;
   g_stormReason = "SAFE REGIME (ACTIVE)";

   if(InpBlockNY_08_09 && (g_nyHour == 8 || g_nyHour == 9))
   {
      g_isStorm     = true;
      g_stormReason = "NY OPEN / US CPI-NFP SHIELD (08-09 NY)";
   }
   else if(InpBlockLondonOpen && (u.hour == 5 || u.hour == 7))
   {
      g_isStorm     = true;
      g_stormReason = "EUROPEAN SESSION OPEN SHIELD";
   }
   else if(InpBlockFridayLate && u.day_of_week == 5 && u.hour >= 20)
   {
      g_isStorm     = true;
      g_stormReason = "FRIDAY WEEKEND GAP SHIELD (>=20 UTC)";
   }
   else if(InpMaxAllowedSpreadPts > 0.0 && curSpreadPts > InpMaxAllowedSpreadPts)
   {
      g_isStorm     = true;
      g_stormReason = StringFormat("SPREAD EXPLOSION (%.0f > %.0f pts)", curSpreadPts, InpMaxAllowedSpreadPts);
   }
   else if(atrRatio > InpMaxAtrRatio)
   {
      g_isStorm     = true;
      g_stormReason = StringFormat("VOLATILITY STORM (ATR Ratio %.2fx)", atrRatio);
   }

   if(g_isStorm && InpDeletePendingInStorm)
   {
      for(int i = OrdersTotal() - 1; i >= 0; i--)
      {
         ulong t = OrderGetTicket(i);
         if(t > 0 && OrderSelect(t) && OrderGetString(ORDER_SYMBOL) == _Symbol)
         {
            ulong m = (ulong)OrderGetInteger(ORDER_MAGIC);
            if(InpTargetMagic == 0 || m == InpTargetMagic)
            {
               if(m_trade.OrderDelete(t))
                  g_removedCount++;
            }
         }
      }
   }
}

void DrawStatusBanner()
{
   string lbl = HUD_PREFIX + "BANNER";
   if(ObjectFind(0, lbl) < 0)
   {
      ObjectCreate(0, lbl, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, lbl, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, lbl, OBJPROP_XDISTANCE, 20);
      ObjectSetInteger(0, lbl, OBJPROP_YDISTANCE, 285);
      ObjectSetString(0, lbl, OBJPROP_FONT, "Segoe UI Semibold");
      ObjectSetInteger(0, lbl, OBJPROP_FONTSIZE, 9);
   }
   string txt = StringFormat("CCX STORM BREAKER [%s | NY %02d:00 %s] -> %s (Swept: %d Limits)",
                             _Symbol, g_nyHour, (g_isEDT ? "EDT" : "EST"), g_stormReason, g_removedCount);
   ObjectSetString(0, lbl, OBJPROP_TEXT, txt);
   ObjectSetInteger(0, lbl, OBJPROP_COLOR, g_isStorm ? clrOrangeRed : clrSpringGreen);
   ChartRedraw(0);
}

int OnInit()
{
   EventSetTimer(1);
   EvaluateStormAndProtect();
   DrawStatusBanner();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   ObjectsDeleteAll(0, HUD_PREFIX);
}

void OnTick()
{
   EvaluateStormAndProtect();
   DrawStatusBanner();
}

void OnTimer()
{
   EvaluateStormAndProtect();
   DrawStatusBanner();
}
