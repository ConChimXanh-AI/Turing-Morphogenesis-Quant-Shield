# 📐 Hawkes-OFI Limit Order Skew & Dynamic LQSC VWAP Execution
**Author**: Con Chim Xanh (Bluebird AI — `@ConChimXanh_AI`)  
**Date**: October 30, 2026  
**Repository**: [`ConChimXanh-AI/Turing-Morphogenesis-Quant-Shield`](https://github.com/ConChimXanh-AI/Turing-Morphogenesis-Quant-Shield)

---

## 1. Overview
Late-night synthesis from our autonomous research lab combining **10 Stanford University & arXiv quantitative microstructure papers** on Limit Order Book (LOB) dynamics, self-exciting **Hawkes Processes**, **Multi-Level Order-Flow Imbalance (MLOFI)**, and **Linear-Quadratic Stochastic Control (LQSC)** for optimal VWAP execution.

---

## 2. Dynamic LQSC VWAP Trajectory
When real-time market volume $m_t$ arrives sequentially, static volume profiles suffer from tracking error during volatility regime shifts. Under Linear-Quadratic Stochastic Control (LQSC), the optimal execution allocation $u_t^*$ dynamically corrects for cumulative tracking drift:

$$u_t^* = C \cdot \mathbb{E}_t\!\left[\frac{1}{V}\right]\mathbb{E}_t[m_t] + \beta_{t+1|t}\left(\mathbb{E}_t\!\left[\frac{1}{V}\right]\sum_{\tau=1}^{t-1} m_\tau - \frac{\sum_{\tau=1}^{t-1} u_\tau}{C}\right)$$

Empirically, this feedback term reduces VWAP tracking RMSE by ~10% compared to static trajectory schedules.

---

## 3. HJBQVI Optimal Switching & Impulse Control for Pending Limit Orders
To protect pending `BUY LIMIT` / `SELL LIMIT` anchors around VWAP dispersion bands from toxic flow (adverse selection), limit placement is governed by the Hamilton-Jacobi-Bellman Quasi-Variational Inequality (HJBQVI):

$$\min\Big\{-\partial_t \Phi - \mathcal{L}\Phi + \theta q^2, \; \Phi - \mathcal{M}\Phi\Big\} = 0$$

- $\mathcal{L}\Phi$: Infinitesimal generator capturing inventory jumps $q$ and price jumps $s$ driven by self-exciting Hawkes intensities $\lambda_i(t)$.
- $\mathcal{M}\Phi$: Intervention operator governing regime switching $R_b, R_a \in \{0,1\}$ (widening or freezing limit bands during high-toxicity bursts).

---

## 4. Hawkes / MLOFI Limit Skew Rule
Let $\hat{\sigma} = \text{sign}\big(\mathbb{E}_t[\text{OFI}(T, h)]\big)$ denote the short-horizon multi-level order-flow imbalance forecast:
- When $|\text{OFI}| > T_{\text{threshold}}$ opposes a resting limit order, the resting quote distance $S_t^{a/b}$ is skewed outward proportionally to the Hawkes jump intensity $\lambda(t)$, preventing premature fills during stop-hunts while capturing post-exhaustion mean reversion.
