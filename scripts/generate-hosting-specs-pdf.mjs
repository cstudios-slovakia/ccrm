import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT_PDF = path.resolve(__dirname, '../docs/CCRM_Hosting_Server_Specifications.pdf');

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>CCRM - Modern High-Performance Hosting Specifications</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    background-color: #ffffff;
    line-height: 1.38;
    font-size: 10px;
    margin: 0;
    padding: 0;
  }

  .page {
    position: relative;
  }

  .page-break {
    page-break-before: always;
  }

  .header {
    border-bottom: 2px solid #0f172a;
    padding-bottom: 8px;
    margin-bottom: 11px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .brand-badge {
    display: inline-flex;
    align-items: center;
    background: #0f172a;
    color: #ffffff;
    padding: 2.5px 7px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 9px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .tech-badge {
    background: #0284c7;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 8.5px;
    font-weight: 700;
    text-transform: uppercase;
    margin-left: 6px;
  }

  .doc-title {
    font-size: 19px;
    font-weight: 800;
    color: #0f172a;
    margin: 4px 0 2px 0;
    letter-spacing: -0.4px;
  }

  .doc-subtitle {
    font-size: 10.5px;
    color: #64748b;
    margin: 0;
    font-weight: 500;
  }

  .meta-box {
    text-align: right;
    font-size: 8.5px;
    color: #475569;
    line-height: 1.35;
  }

  .meta-box strong {
    color: #0f172a;
  }

  .section {
    margin-bottom: 10px;
  }

  .section-title {
    font-size: 10.5px;
    font-weight: 700;
    color: #0f172a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 2.5px;
    margin-bottom: 5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-title .badge {
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    color: #334155;
    font-size: 8px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
  }

  p {
    margin: 0 0 5px 0;
    color: #334155;
    font-size: 9.5px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 5px;
    font-size: 9px;
  }

  th {
    background-color: #f8fafc;
    color: #0f172a;
    font-weight: 600;
    text-align: left;
    padding: 4px 7px;
    border: 1px solid #cbd5e1;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  td {
    padding: 3.5px 7px;
    border: 1px solid #e2e8f0;
    vertical-align: top;
  }

  tr:nth-child(even) td {
    background-color: #f8fafc;
  }

  code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    background: #f1f5f9;
    color: #0f172a;
    padding: 1px 3px;
    border-radius: 2.5px;
    border: 1px solid #e2e8f0;
  }

  pre {
    background: #0f172a;
    color: #f8fafc;
    padding: 5px 8px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8px;
    line-height: 1.35;
    margin: 2px 0 5px 0;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .card {
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    padding: 5px 8px;
  }

  .card-title {
    font-weight: 700;
    font-size: 9px;
    color: #0f172a;
    margin-bottom: 3px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .status-tag {
    font-size: 7.5px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 2px;
    text-transform: uppercase;
  }

  .tag-required {
    background: #fee2e2;
    color: #991b1b;
  }

  .tag-latest {
    background: #e0f2fe;
    color: #0369a1;
  }

  .alert-box {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-left: 3px solid #d97706;
    color: #92400e;
    padding: 4px 7px;
    border-radius: 3px;
    margin-bottom: 5px;
    font-size: 8.5px;
  }

  .alert-box.rag-box {
    background: #f5f3ff;
    border: 1px solid #ddd6fe;
    border-left: 3px solid #7c3aed;
    color: #4c1d95;
  }

  .alert-box.tech-banner {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-left: 3px solid #0284c7;
    color: #0369a1;
  }

  .checklist {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .checklist li {
    padding: 2.5px 0;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 8.5px;
  }

  .checklist li:last-child {
    border-bottom: none;
  }

  .checkbox {
    width: 10px;
    height: 10px;
    border: 1.5px solid #64748b;
    border-radius: 2px;
    display: inline-block;
    flex-shrink: 0;
  }
</style>
</head>
<body>

  <!-- ==================== PAGE 1 ==================== -->
  <div class="page">
    <div class="header">
      <div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="brand-badge">CCRM Systems</span>
          <span class="tech-badge">Next-Gen Technology Stack</span>
        </div>
        <h1 class="doc-title">Hosting & Server Infrastructure Specifications</h1>
        <p class="doc-subtitle">High-performance environment prerequisites, cutting-edge PHP runtime & MariaDB vector requirements</p>
      </div>
      <div class="meta-box">
        <div><strong>Document Version:</strong> 1.11 (Lemon — High Performance Spec)</div>
        <div><strong>Date:</strong> October 2026</div>
        <div><strong>Stack:</strong> React 19 SPA &bull; PHP 8.3/8.4 JIT &bull; MariaDB 11.8+ Vector</div>
        <div><strong>Target Infrastructure:</strong> Modern Cloud VPS / Dedicated Server</div>
      </div>
    </div>

    <!-- Alert: High Tech Requirement -->
    <div class="alert-box tech-banner">
      <strong>Modern Technology Directive:</strong> This application relies on modern web standards, JIT-accelerated backend execution, and native SQL vector indexing. We require modern software versions (PHP 8.3/8.4, MariaDB 11.8+, HTTP/3 QUIC) rather than legacy hosting defaults.
    </div>

    <!-- Section 1: Architecture Overview -->
    <div class="section">
      <div class="section-title">
        <span>1. Architecture & Platform Overview</span>
        <span class="badge">Application Stack</span>
      </div>
      <p>
        <strong>CCRM</strong> is a real-time business management system combining an ultra-fast client-side SPA (React 19, TypeScript, Vite) with an asynchronous PHP REST backend and a dual relational + vector database layer. It is built to support offline synchronization, real-time WebPush notifications, and native RAG (Retrieval-Augmented Generation) semantic vector search.
      </p>
    </div>

    <!-- Section 2: Hardware Profiles -->
    <div class="section">
      <div class="section-title">
        <span>2. Modern Hardware & Hypervisor Specifications</span>
        <span class="badge">Hardware Baseline</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 20%;">Component</th>
            <th style="width: 40%;">Standard Deployment (Up to 15 Users)</th>
            <th style="width: 40%;">High-Load / Enterprise (15–50+ Users)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>CPU Architecture</strong></td>
            <td>2 to 4 vCPUs (Modern AMD EPYC Genoa/Bergamo or Intel Xeon 4th/5th Gen with AVX2/AVX-512)</td>
            <td>4 to 8 dedicated vCPUs (High single-thread frequency &gt;3.4 GHz with AVX-512 vector support)</td>
          </tr>
          <tr>
            <td><strong>Memory (RAM)</strong></td>
            <td>4 GB DDR5 ECC RAM</td>
            <td>8 GB – 16 GB DDR5 ECC RAM</td>
          </tr>
          <tr>
            <td><strong>Storage Array</strong></td>
            <td>25 GB+ Enterprise PCIe 4.0/5.0 NVMe SSD (High IOPS, RAID 10 or Ceph)</td>
            <td>80 GB+ Enterprise PCIe 4.0/5.0 NVMe SSD (Dedicated high-IOPS storage)</td>
          </tr>
          <tr>
            <td><strong>Network & CDN</strong></td>
            <td>1 Gbps uplink, dedicated static IPv4 + IPv6, TLS 1.3</td>
            <td>1 Gbps – 10 Gbps uplink, DDoS mitigation, low latency routing</td>
          </tr>
          <tr>
            <td><strong>Operating System</strong></td>
            <td>Modern Linux: <strong>Ubuntu 24.04 LTS (Noble Numbat)</strong> or <strong>Debian 12 (Bookworm)</strong> with Kernel 6.8+</td>
            <td>Ubuntu 24.04 LTS / Container host (Docker Engine 27+ / Containerd)</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Section 3: Web Server & Modern Protocols -->
    <div class="section">
      <div class="section-title">
        <span>3. Web Server & Modern Transport Protocols</span>
        <span class="badge">HTTP/3 &bull; TLS 1.3</span>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-title">
            <span>Web Server Engine</span>
            <span class="status-tag tag-latest">Apache 2.4.60+ / LiteSpeed / Nginx</span>
          </div>
          <ul style="margin: 0; padding-left: 13px; font-size: 8.5px; color: #334155; line-height: 1.45;">
            <li><strong>HTTP/2 and HTTP/3 (QUIC):</strong> Required for instantaneous PWA asset multiplexing.</li>
            <li><strong>Brotli & Gzip Compression:</strong> <code>mod_brotli</code> active for static JavaScript/CSS.</li>
            <li><strong>Modules:</strong> <code>mod_rewrite</code>, <code>mod_headers</code>, <code>mod_authz_core</code>.</li>
            <li><strong>AllowOverride All:</strong> Strictly enabled on docroot for <code>.htaccess</code> router guards.</li>
            <li><code>DirectoryIndex index.html index.php</code></li>
          </ul>
        </div>

        <div class="card">
          <div class="card-title">
            <span>SSL / TLS & Security Headers</span>
            <span class="status-tag tag-required">Strict Mandatory</span>
          </div>
          <p style="font-size: 8.5px; margin: 0; color: #334155; line-height: 1.45;">
            Automated <strong>SSL / TLS 1.3</strong> certificate (Let's Encrypt / ZeroSSL with modern ECDSA P-256 keys).
            Mandatory for Progressive Web App (PWA) installation, background Service Worker sync, and RFC 8291 Web Push APIs.
          </p>
        </div>
      </div>
    </div>

    <!-- Section 4: PHP Runtime & Extensions -->
    <div class="section">
      <div class="section-title">
        <span>4. Next-Gen PHP Runtime (PHP 8.3 / 8.4 with JIT)</span>
        <span class="badge">PHP 8.3+ Preferred</span>
      </div>
      <p style="margin-bottom: 4px;">Target version: <strong>PHP 8.3 or PHP 8.4</strong> (Minimum supported: PHP 8.2). Required extensions & settings:</p>
      <table>
        <thead>
          <tr>
            <th style="width: 22%;">PHP Extension</th>
            <th style="width: 20%;">Category</th>
            <th style="width: 58%;">Purpose in CCRM Stack</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>pdo_mysql</code></td>
            <td>Database</td>
            <td>PDO connector for MySQL 8 & MariaDB 11.8 with prepared statements & DDL migrations.</td>
          </tr>
          <tr>
            <td><code>imap</code></td>
            <td>Mail Client</td>
            <td>Direct IMAP synchronization, TLS mail socket negotiation, and multi-part attachment parsing.</td>
          </tr>
          <tr>
            <td><code>zip</code> (ZipArchive)</td>
            <td>Compression</td>
            <td>Asynchronous backup creation, bulk data exports, and packaging client invoices.</td>
          </tr>
          <tr>
            <td><code>curl</code></td>
            <td>Network API</td>
            <td>High-performance cURL client for OpenAI/LLM streaming, SuperFaktura, iDoklad, and RegisterUZ.</td>
          </tr>
          <tr>
            <td><code>openssl</code></td>
            <td>Crypto / WebPush</td>
            <td>RFC 8291/8292 VAPID ECDSA P-256 signing, AES-256-GCM encryption, and JWT validation.</td>
          </tr>
          <tr>
            <td><code>mbstring</code></td>
            <td>Multilingual</td>
            <td>UTF-8 text processing across multi-lingual datasets (Slovak, Hungarian, Czech, English).</td>
          </tr>
          <tr>
            <td><code>fileinfo</code></td>
            <td>File Safety</td>
            <td>Server-side MIME inspection to prevent malicious executable file uploads.</td>
          </tr>
          <tr>
            <td><code>opcache</code></td>
            <td>JIT Acceleration</td>
            <td><strong>OPcache with JIT compiler enabled</strong> (<code>opcache.jit=tracing</code>, <code>opcache.jit_buffer_size=128M</code>).</td>
          </tr>
        </tbody>
      </table>

      <div class="card" style="margin-top: 3px;">
        <div class="card-title">
          <span>Target PHP Configuration Parameters (php.ini or .user.ini)</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; font-size: 8px;">
          <div><code>memory_limit = 512M</code></div>
          <div><code>upload_max_filesize = 128M</code></div>
          <div><code>post_max_size = 140M</code></div>
          <div><code>max_execution_time = 180</code></div>
          <div><code>max_file_uploads = 50</code></div>
          <div><code>opcache.enable = 1</code></div>
        </div>
      </div>
    </div>
  </div>

  <!-- ==================== PAGE 2 ==================== -->
  <div class="page page-break">
    <!-- Section 5: Primary Database -->
    <div class="section">
      <div class="section-title">
        <span>5. Primary Relational Database</span>
        <span class="badge">Modern SQL Baseline</span>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 25%;">Parameter</th>
            <th style="width: 75%;">Technical Specification</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Engine & Version</strong></td>
            <td><strong>MySQL 8.4 LTS / MySQL 8.0+</strong> OR <strong>MariaDB 11.8+</strong> (Latest stable release)</td>
          </tr>
          <tr>
            <td><strong>Character Encoding</strong></td>
            <td>Full UTF-8 4-byte charset: <code>utf8mb4</code> with collation <code>utf8mb4_unicode_ci</code> (or <code>utf8mb4_0900_ai_ci</code> on MySQL 8)</td>
          </tr>
          <tr>
            <td><strong>Database Permissions</strong></td>
            <td><code>SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES</code> (needed for automated DDL migration engine)</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Section 6: AI & RAG Vector Database -->
    <div class="section">
      <div class="section-title">
        <span>6. Cutting-Edge RAG & AI Vector Database (MariaDB 11.8+)</span>
        <span class="badge" style="background: #ede9fe; color: #5b21b6; border-color: #ddd6fe;">MariaDB 11.8+ Rolling Series</span>
      </div>
      <div class="alert-box rag-box">
        <strong>Mandatory MariaDB Version for Native Vector RAG:</strong> CCRM's internal semantic retrieval engine utilizes native SQL vector capabilities introduced in <strong>MariaDB 11.8.0 or newer</strong>. Older MariaDB series (10.5, 10.6, 10.11 LTS, 11.4 LTS) and standard MySQL do <u>NOT</u> have native vector datatypes or cosine similarity functions.
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 25%;">Feature / Requirement</th>
            <th style="width: 75%;">Technical Requirement & Verification Details</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Exact Database Engine</strong></td>
            <td><strong>MariaDB 11.8.0 or higher</strong> (Rolling series with native vector storage plugin enabled)</td>
          </tr>
          <tr>
            <td><strong>Native Vector Datatype</strong></td>
            <td>Native <code>VECTOR(&lt;dim&gt;)</code> column type (e.g. <code>VECTOR(1536)</code> for OpenAI text-embedding-3 or <code>VECTOR(384)</code> for local MiniLM)</td>
          </tr>
          <tr>
            <td><strong>Vector Search Functions</strong></td>
            <td>Hardware-accelerated <code>VEC_DISTANCE_COSINE()</code>, <code>VEC_DISTANCE_EUCLIDEAN()</code>, <code>VEC_DISTANCE()</code></td>
          </tr>
          <tr>
            <td><strong>Index Architecture</strong></td>
            <td>Native <strong>HNSW</strong> (Hierarchical Navigable Small World) index support for sub-millisecond approximate nearest neighbor search</td>
          </tr>
          <tr>
            <td><strong>CPU Acceleration</strong></td>
            <td>Host CPU must expose <strong>AVX2 or AVX-512</strong> vector instructions to the database process for high-speed dot-product calculations</td>
          </tr>
          <tr>
            <td><strong>Deployment Model</strong></td>
            <td>
              &bull; <strong>Option A (Unified MariaDB 11.8+):</strong> Single instance powering both relational CRM records & native vector tables.<br>
              &bull; <strong>Option B (Dedicated Vector Sidecar):</strong> MariaDB 11.8+ running on dedicated port (e.g. <code>3309</code>) alongside MySQL.<br>
              &bull; <strong>Option C (Alternative Fallback):</strong> Dedicated <strong>Qdrant sidecar container</strong> (v1.9+, port <code>6333</code>) or external <strong>Pinecone Cloud</strong>.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Section 7: Network & Firewall -->
    <div class="section">
      <div class="section-title">
        <span>7. Network Firewall & Outbound Socket Permissions</span>
        <span class="badge">Critical Connectivity</span>
      </div>
      <div class="alert-box">
        <strong>Host Firewall Verification:</strong> Outbound socket connections must not be filtered. The following outbound ports are required:
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 22%;">Target Port</th>
            <th style="width: 20%;">Protocol</th>
            <th style="width: 58%;">Service & API Description</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Port 443</strong> (Outbound)</td>
            <td>HTTPS / TLS</td>
            <td>LLM APIs (OpenAI, Anthropic, OpenRouter), SuperFaktura, iDoklad, RegisterUZ, ARES, Pinecone.</td>
          </tr>
          <tr>
            <td><strong>Port 993</strong> (Outbound)</td>
            <td>IMAP over SSL</td>
            <td>Real-time synchronization of client emails into user CRM mailboxes.</td>
          </tr>
          <tr>
            <td><strong>Port 465 / 587</strong> (Outbound)</td>
            <td>SMTP / TLS</td>
            <td>Outbound transactional notifications, task reminders, and automated workflow dispatches.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Section 8: Deployment & Automation Grid -->
    <div class="section">
      <div class="grid-2">
        <div>
          <div class="section-title">
            <span>8A. Deployment & Modern CLI</span>
          </div>
          <p style="font-size: 8px; margin-bottom: 3px;">Automated deployment via <code>php ccrm update</code> over SSH:</p>
          <ul style="margin: 0; padding-left: 12px; font-size: 8px; color: #334155; line-height: 1.4;">
            <li><strong>OpenSSH:</strong> Ed25519 key authentication.</li>
            <li><strong>Git 2.40+:</strong> Fast-forward release synchronization.</li>
            <li><strong>Composer 2.7+:</strong> PHP dependency autoloader optimization.</li>
          </ul>
        </div>
        <div>
          <div class="section-title">
            <span>8B. High-Frequency Task Scheduler</span>
          </div>
          <p style="font-size: 8px; margin-bottom: 2px;">Triggers asynchronous queues & reminder dispatchers every 1 min:</p>
          <pre style="margin: 0; font-size: 7.5px;">* * * * * curl -s -f "https://crm.yourdomain.sk/api/cron.php?token=TOKEN" >/dev/null 2>&1</pre>
        </div>
      </div>
    </div>

    <!-- Section 9: Provider Compliance Checklist -->
    <div class="section" style="margin-top: 4px;">
      <div class="section-title">
        <span>9. State-of-the-Art Hosting Compliance Checklist</span>
        <span class="badge">Provider Sign-off</span>
      </div>
      <div class="card" style="padding: 5px 8px;">
        <ul class="checklist">
          <li><span class="checkbox"></span> Modern PHP runtime: <strong>PHP 8.3+ or 8.4</strong> with OPcache JIT enabled</li>
          <li><span class="checkbox"></span> Mandatory PHP modules active: <code>pdo_mysql</code>, <code>imap</code>, <code>zip</code>, <code>curl</code>, <code>openssl</code>, <code>mbstring</code>, <code>fileinfo</code></li>
          <li><span class="checkbox"></span> Modern Web Server with <strong>HTTP/2 & HTTP/3 (QUIC)</strong>, Brotli compression, and <code>AllowOverride All</code></li>
          <li><span class="checkbox"></span> <strong>RAG Vector Database:</strong> Native <strong>MariaDB 11.8+</strong> (with <code>VECTOR</code> datatype & HNSW) OR Qdrant container support</li>
          <li><span class="checkbox"></span> Host CPU vector extensions enabled (AVX2 / AVX-512) for vector distance calculations</li>
          <li><span class="checkbox"></span> High-speed PCIe NVMe SSD storage with automated daily snapshot backups</li>
          <li><span class="checkbox"></span> Unrestricted outbound connectivity on Port 993 (IMAP) and Port 443 (HTTPS)</li>
          <li><span class="checkbox"></span> Modern Linux OS (Ubuntu 24.04 LTS / Debian 12) with SSH shell and Git 2.40+</li>
        </ul>
      </div>
    </div>

    <!-- Contact & Sign-off Box -->
    <div style="margin-top: 5px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 5px 10px; background: #f8fafc; font-size: 8px; color: #475569; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <strong style="color: #0f172a; font-size: 8.5px;">Cstudios Slovakia s.r.o.</strong> &bull; Web: <span style="color: #0284c7;">https://cstudios.sk</span> &bull; Email: <span style="color: #0284c7;">info@cstudios.sk</span>
      </div>
      <div style="text-align: right;">
        <strong>Hosting Provider Technical Confirmation</strong> &bull; Signature / Date: __________________________
      </div>
    </div>
  </div>

</body>
</html>`;

async function generatePDF() {
  console.log('Launching browser to generate PDF...');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle' });
  await page.evaluateHandle('document.fonts.ready');

  console.log('Rendering PDF to:', OUTPUT_PDF);
  await page.pdf({
    path: OUTPUT_PDF,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="font-size: 7.5px; width: 100%; display: flex; justify-content: space-between; padding: 0 10mm; color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <span>CCRM Systems &bull; Next-Gen Production Hosting Specifications</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `,
    margin: {
      top: '8mm',
      bottom: '9mm',
      left: '9mm',
      right: '9mm'
    }
  });

  await browser.close();
  const stats = fs.statSync(OUTPUT_PDF);
  console.log(`PDF created successfully! Size: ${(stats.size / 1024).toFixed(1)} KB`);
}

generatePDF().catch(err => {
  console.error('Error generating PDF:', err);
  process.exit(1);
});
