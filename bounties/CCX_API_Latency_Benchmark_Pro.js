#!/usr/bin/env node
/**
 * CCX API LATENCY & THROUGHPUT BENCHMARK SUITE (ZERO-DEPENDENCY NODE.JS)
 * Author: Con Chim Xanh AI (https://github.com/ConChimXanh-AI)
 *
 * Captures high-resolution nanoseconds metrics per endpoint:
 * - p50, p95, p99 latency (ms)
 * - Time to First Byte (TTFB in ms)
 * - Peak & Sustained Requests Per Second (RPS)
 * - HTTP Error Rate (%)
 * Outputs both JSON and Markdown summary report.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1));
  return sortedArr[idx];
}

function singleRequest(targetUrl, method = 'GET', headers = {}, body = null, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const u = new URL(targetUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const startNs = process.hrtime.bigint();
    let ttfbNs = null;

    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method,
      headers: { 'User-Agent': 'CCX-API-Benchmark-Pro/1.0 (ConChimXanh-AI)', ...headers },
      timeout: timeoutMs
    }, (res) => {
      res.once('data', () => {
        if (ttfbNs === null) ttfbNs = process.hrtime.bigint();
      });
      res.on('data', () => {});
      res.on('end', () => {
        const endNs = process.hrtime.bigint();
        if (ttfbNs === null) ttfbNs = endNs;
        const totalMs = Number(endNs - startNs) / 1e6;
        const ttfbMs = Number(ttfbNs - startNs) / 1e6;
        const isErr = res.statusCode >= 400;
        resolve({ ok: !isErr, status: res.statusCode, totalMs, ttfbMs });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const endNs = process.hrtime.bigint();
      const totalMs = Number(endNs - startNs) / 1e6;
      resolve({ ok: false, status: 0, totalMs, ttfbMs: totalMs });
    });

    req.on('error', () => {
      const endNs = process.hrtime.bigint();
      const totalMs = Number(endNs - startNs) / 1e6;
      resolve({ ok: false, status: 0, totalMs, ttfbMs: totalMs });
    });

    if (body) req.write(body);
    req.end();
  });
}

async function benchmarkEndpoint({ name, url, method = 'GET', totalRequests = 30, concurrency = 5 }) {
  const latencies = [];
  const ttfbs = [];
  let errors = 0;
  let completed = 0;

  const suiteStartNs = process.hrtime.bigint();

  async function worker() {
    while (true) {
      const idx = completed++;
      if (idx >= totalRequests) break;
      const r = await singleRequest(url, method);
      latencies.push(r.totalMs);
      ttfbs.push(r.ttfbMs);
      if (!r.ok) errors++;
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, totalRequests); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const suiteDurationSec = Math.max(Number(process.hrtime.bigint() - suiteStartNs) / 1e9, 0.001);
  latencies.sort((a, b) => a - b);
  ttfbs.sort((a, b) => a - b);

  return {
    endpoint: name || url,
    url,
    method,
    totalRequests,
    concurrency,
    rps: +(totalRequests / suiteDurationSec).toFixed(2),
    errorRatePct: +((errors / totalRequests) * 100).toFixed(2),
    p50Ms: +percentile(latencies, 50).toFixed(2),
    p95Ms: +percentile(latencies, 95).toFixed(2),
    p99Ms: +percentile(latencies, 99).toFixed(2),
    ttfbP50Ms: +percentile(ttfbs, 50).toFixed(2),
    ttfbP95Ms: +percentile(ttfbs, 95).toFixed(2)
  };
}

function formatMarkdownReport(results) {
  const lines = [
    '# ⚡ CCX API Latency & Throughput Benchmark Report',
    '',
    '| Endpoint | Method | RPS | Error % | p50 (ms) | p95 (ms) | p99 (ms) | TTFB p50 (ms) |',
    '| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |'
  ];
  for (const r of results) {
    lines.push(`| \`${r.endpoint}\` | ${r.method} | **${r.rps}** | ${r.errorRatePct}% | ${r.p50Ms} | ${r.p95Ms} | **${r.p99Ms}** | ${r.ttfbP50Ms} |`);
  }
  return lines.join('\n');
}

module.exports = { benchmarkEndpoint, formatMarkdownReport };

if (require.main === module) {
  (async () => {
    const target = process.argv[2] || 'https://api.github.com/zen';
    const res = await benchmarkEndpoint({ name: 'GitHub Zen Probe', url: target, totalRequests: 10, concurrency: 2 });
    console.log(formatMarkdownReport([res]));
  })();
}
