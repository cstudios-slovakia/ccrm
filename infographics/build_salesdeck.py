#!/usr/bin/env python3
"""
CCRM Enterprise Sales Deck Builder
Generates a multi-page landscape PDF presentation (1920x1080) with embedded infographics,
executive styling, and comprehensive feature breakdowns.
"""
import os
import sys
import base64
import subprocess
import pypdf

INFOGRAPHICS_DIR = "/Users/erik/Documents/vibe coding/crm/infographics"
OUTPUT_HTML = "/tmp/ccrm_salesdeck.html"
OUTPUT_PDF = "/Users/erik/Documents/vibe coding/crm/infographics/CCRM_Enterprise_Salesdeck.pdf"

def get_base64_image(filename):
    path = os.path.join(INFOGRAPHICS_DIR, filename)
    if not os.path.exists(path):
        print(f"Warning: {path} not found!")
        return ""
    with open(path, "rb") as f:
        data = f.read()
    return f"data:image/jpeg;base64,{base64.b64encode(data).decode('utf-8')}"

img_1_11 = get_base64_image("1.11-lemon-infographic.jpg")
img_1_10 = get_base64_image("1.10-kiwi-infographic.jpg")
img_1_9  = get_base64_image("1.9-jackfruit-infographic.jpg")
img_1_8  = get_base64_image("1.8-imbe-infographic.jpg")
img_1_7  = get_base64_image("1.7-huckleberry-infographic.jpg")
img_1_6  = get_base64_image("1.6-grapefruit-infographic.jpg")

print(f"Loaded images successfully. Building HTML...")

html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CCRM Enterprise Sales Deck</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600&display=swap');

  @page {{
    size: 1920px 1080px;
    margin: 0;
  }}

  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }}

  body {{
    background-color: #030712;
    color: #f8fafc;
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 18px;
    line-height: 1.45;
  }}

  .slide {{
    width: 1920px;
    height: 1080px;
    position: relative;
    page-break-after: always;
    page-break-inside: avoid;
    overflow: hidden;
    background: radial-gradient(circle at 80% 20%, rgba(30, 27, 75, 0.7) 0%, rgba(9, 13, 22, 0.95) 55%, #030712 100%);
    padding: 56px 72px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }}

  /* Top Glows & Ambient Orbs */
  .slide::before {{
    content: '';
    position: absolute;
    top: -150px;
    right: -150px;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, rgba(168, 85, 247, 0.15) 0%, rgba(59, 130, 246, 0.05) 50%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
  }}

  .slide::after {{
    content: '';
    position: absolute;
    bottom: -150px;
    left: -150px;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, transparent 70%);
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
  }}

  .slide > * {{
    position: relative;
    z-index: 1;
  }}

  /* Header Bar */
  .slide-header {{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 20px;
    margin-bottom: 32px;
  }}

  .badge-tag {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 10px;
  }}

  .badge-tag.lemon {{ color: #fde047; border-color: rgba(250, 204, 21, 0.35); background: rgba(250, 204, 21, 0.1); }}
  .badge-tag.kiwi {{ color: #4ade80; border-color: rgba(74, 222, 128, 0.35); background: rgba(74, 222, 128, 0.1); }}
  .badge-tag.jackfruit {{ color: #fbbf24; border-color: rgba(251, 191, 36, 0.35); background: rgba(251, 191, 36, 0.1); }}
  .badge-tag.imbe {{ color: #fb923c; border-color: rgba(251, 146, 60, 0.35); background: rgba(251, 146, 60, 0.1); }}
  .badge-tag.huckleberry {{ color: #c084fc; border-color: rgba(192, 132, 252, 0.35); background: rgba(192, 132, 252, 0.1); }}
  .badge-tag.grapefruit {{ color: #f43f5e; border-color: rgba(244, 63, 94, 0.35); background: rgba(244, 63, 94, 0.1); }}

  .slide-title {{
    font-size: 40px;
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
    background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }}

  .slide-subtitle {{
    font-size: 20px;
    color: #94a3b8;
    margin-top: 6px;
    font-weight: 400;
  }}

  .header-meta {{
    text-align: right;
  }}

  .header-meta .system-title {{
    font-family: 'JetBrains Mono', monospace;
    font-size: 15px;
    font-weight: 600;
    color: #38bdf8;
    letter-spacing: 0.05em;
  }}

  .header-meta .slide-number {{
    font-size: 24px;
    font-weight: 800;
    color: #64748b;
    margin-top: 4px;
  }}

  /* Footer */
  .slide-footer {{
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 18px;
    font-size: 14px;
    color: #64748b;
  }}

  .slide-footer .confidential {{
    color: #f59e0b;
    font-weight: 600;
    letter-spacing: 0.05em;
  }}

  /* Content Containers */
  .slide-body {{
    flex: 1;
    display: flex;
    gap: 40px;
    align-items: stretch;
    height: calc(1080px - 250px);
    overflow: hidden;
  }}

  /* Infographic Split Layout */
  .split-visual {{
    flex: 0 0 520px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.45);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 16px;
    box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5), inset 0 0 20px rgba(255, 255, 255, 0.02);
  }}

  .split-visual img {{
    max-width: 100%;
    max-height: 100%;
    border-radius: 12px;
    object-fit: contain;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  }}

  .split-content {{
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 20px;
    overflow: hidden;
  }}

  /* Glass Card */
  .glass-card {{
    background: rgba(15, 23, 42, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 16px;
    padding: 24px;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
  }}

  .glass-card.highlight {{
    border-color: rgba(56, 189, 248, 0.35);
    background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%);
  }}

  .card-title {{
    font-size: 20px;
    font-weight: 700;
    color: #f1f5f9;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 12px;
  }}

  .card-title .icon-box {{
    width: 34px;
    height: 34px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }}

  /* Feature Grid Layouts */
  .grid-2x2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    flex: 1;
  }}

  .grid-3col {{
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 24px;
    width: 100%;
    height: 100%;
  }}

  .grid-4col {{
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
    width: 100%;
    height: 100%;
  }}

  /* Feature List Items */
  .feature-list {{
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }}

  .feature-list li {{
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-size: 16px;
    color: #cbd5e1;
    line-height: 1.4;
  }}

  .feature-list li::before {{
    content: '✦';
    color: #38bdf8;
    font-size: 14px;
    margin-top: 2px;
    flex-shrink: 0;
  }}

  .feature-list.lemon li::before {{ color: #facc15; }}
  .feature-list.kiwi li::before {{ color: #4ade80; }}
  .feature-list.jackfruit li::before {{ color: #fbbf24; }}
  .feature-list.imbe li::before {{ color: #fb923c; }}
  .feature-list.huckleberry li::before {{ color: #c084fc; }}
  .feature-list.grapefruit li::before {{ color: #f43f5e; }}

  /* Metric Pill */
  .metric-callout {{
    display: flex;
    gap: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 14px 20px;
    align-items: center;
  }}

  .metric-callout .val {{
    font-size: 32px;
    font-weight: 800;
    font-family: 'JetBrains Mono', monospace;
    color: #38bdf8;
    letter-spacing: -0.03em;
  }}

  .metric-callout .lbl {{
    font-size: 14px;
    color: #94a3b8;
    line-height: 1.25;
  }}

  /* Specific Cover Slide */
  .cover-slide {{
    justify-content: center;
    align-items: center;
    text-align: center;
    padding: 100px;
  }}

  .cover-title {{
    font-size: 76px;
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1.05;
    margin-bottom: 24px;
    background: linear-gradient(135deg, #ffffff 10%, #93c5fd 60%, #38bdf8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }}

  .cover-subtitle {{
    font-size: 28px;
    font-weight: 400;
    color: #94a3b8;
    max-width: 1200px;
    margin: 0 auto 48px auto;
    line-height: 1.4;
  }}

  .cover-badges {{
    display: flex;
    justify-content: center;
    gap: 16px;
    margin-bottom: 60px;
  }}

  .cover-meta {{
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px;
    color: #64748b;
  }}

  /* Table styling */
  table.comp-table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 15px;
    text-align: left;
  }}

  table.comp-table th {{
    background: rgba(30, 41, 59, 0.8);
    padding: 14px 18px;
    color: #f1f5f9;
    font-weight: 700;
    border-bottom: 2px solid rgba(255, 255, 255, 0.15);
  }}

  table.comp-table td {{
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    color: #cbd5e1;
  }}

  table.comp-table tr:hover td {{
    background: rgba(255, 255, 255, 0.02);
  }}

  .check-icon {{ color: #10b981; font-weight: 800; font-size: 18px; }}
  .cross-icon {{ color: #ef4444; font-weight: 800; font-size: 18px; }}

  /* Process Flow Chevron */
  .flow-row {{
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
  }}

  .flow-step {{
    flex: 1;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 20px;
    text-align: center;
  }}

  .flow-arrow {{
    font-size: 28px;
    color: #38bdf8;
    flex-shrink: 0;
  }}
</style>
</head>
<body>

<!-- SLIDE 1: COVER -->
<div class="slide cover-slide">
  <div class="badge-tag lemon">CCRM ENTERPRISE OPERATING SYSTEM • PRODUCT BRIEFING</div>
  <h1 class="cover-title">THE AUTONOMOUS CRM &amp; WORKFLOW REVOLUTION</h1>
  <p class="cover-subtitle">
    Next-generation CRM ecosystem uniting Multi-Agent Swarm Intelligence, Visual Workflow Automation, Deep Financial Due Diligence, and Hybrid Offline-First Sync.
  </p>
  <div class="cover-badges">
    <span class="badge-tag">🍋 v1.11 Lemon</span>
    <span class="badge-tag">🥝 v1.10 Kiwi</span>
    <span class="badge-tag">🍈 v1.9 Jackfruit</span>
    <span class="badge-tag">🍊 v1.8 Imbe</span>
    <span class="badge-tag">🫐 v1.7 Huckleberry</span>
    <span class="badge-tag">🍇 v1.6 Grapefruit</span>
  </div>
  <div class="cover-meta">
    CSTUDIOS ENTERPRISE ARCHITECTURE • EXECUTIVE SALES DECK • CONFIDENTIAL
  </div>
</div>

<!-- SLIDE 2: THE PROBLEM VS THE CCRM SOLUTION -->
<div class="slide">
  <div class="slide-header">
    <div>
      <div class="badge-tag">MARKET ANALYSIS &amp; PAIN POINTS</div>
      <h2 class="slide-title">Fragmented SaaS Stacks vs. Unified CCRM Architecture</h2>
      <p class="slide-subtitle">Why traditional CRM subscriptions bleed capital, leak confidential client data, and break operations.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // PLATFORM</div>
      <div class="slide-number">02 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="grid-2x2">
      <div class="glass-card" style="border-left: 4px solid #ef4444;">
        <div class="card-title" style="color: #f87171;">
          <div class="icon-box" style="background: rgba(239, 68, 68, 0.15);">⚠️</div>
          The Fragmented Enterprise Nightmare
        </div>
        <ul class="feature-list" style="margin-top: 16px;">
          <li><strong>Disjointed Tool Sprawl:</strong> Companies pay separately for Salesforce/HubSpot, Zapier/Make, Gong/Voice AI, FinStat registries, and E2E test suites.</li>
          <li><strong>Outrageous Per-Seat Pricing:</strong> A 25-person team easily exceeds $3,500/month with compounding third-party add-ons and tier lock-ins.</li>
          <li><strong>Sync Friction &amp; Data Loss:</strong> Webhooks fail silently, API rate limits throttle operations, and field changes vanish during browser refresh.</li>
          <li><strong>Sovereignty &amp; Data Privacy Risks:</strong> Client financial statements and confidential deals pass through dozens of unregulated cloud vendors.</li>
        </ul>
      </div>

      <div class="glass-card highlight" style="border-left: 4px solid #10b981;">
        <div class="card-title" style="color: #34d399;">
          <div class="icon-box" style="background: rgba(16, 185, 129, 0.15);">⚡</div>
          The CCRM Unified Operating System
        </div>
        <ul class="feature-list" style="margin-top: 16px;">
          <li><strong>All-In-One Enterprise Core:</strong> Full CRM, Visual Automation Canvas, Swarm AI Simulators, Financial Ledger, and QA Audit built into one engine.</li>
          <li><strong>One-Time / Predictable Cloud Hosting:</strong> Zero per-seat artificial tax. Self-hosted on your own infrastructure or secure dedicated cloud instance.</li>
          <li><strong>Zero-Latency Offline-First Sync:</strong> Instant UI responses, optimistic UI updates, checksum drift protection, and bulletproof background persistence.</li>
          <li><strong>100% Data Sovereignty:</strong> Local MariaDB storage, zero third-party telemetry, encrypted secret vaults, and localized RAG grounding.</li>
        </ul>
      </div>

      <div class="metric-callout">
        <div class="val">83%</div>
        <div class="lbl">Reduction in annual software subscription costs compared to legacy CRM &amp; iPaaS stacks</div>
      </div>

      <div class="metric-callout">
        <div class="val">&lt; 50ms</div>
        <div class="lbl">Optimistic UI response time across all 12 modules with real-time state synchronization</div>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 1: Executive Overview</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 3: 6 KEY SELLING POINTS (KSPs) -->
<div class="slide">
  <div class="slide-header">
    <div>
      <div class="badge-tag">COMPETITIVE MOAT</div>
      <h2 class="slide-title">The 6 Pillars of CCRM Enterprise Superiority</h2>
      <p class="slide-subtitle">Unmatched technological capabilities built directly into the core application engine.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // ADVANTAGE</div>
      <div class="slide-number">03 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="grid-3col">
      <div class="glass-card">
        <div class="card-title">
          <div class="icon-box" style="background: rgba(168, 85, 247, 0.2); color: #c084fc;">🧠</div>
          1. Swarm AI (SAI) Simulation
        </div>
        <p style="color: #94a3b8; font-size: 15px; margin-bottom: 12px;">Run predictive multi-agent market war-games. Rehearse price increases, contract disputes, and competitive retaliation before taking public action.</p>
        <div class="badge-tag kiwi" style="font-size: 11px;">Zero-Docker Client Orchestration</div>
      </div>

      <div class="glass-card">
        <div class="card-title">
          <div class="icon-box" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">⚡</div>
          2. Visual Workflow Engine
        </div>
        <p style="color: #94a3b8; font-size: 15px; margin-bottom: 12px;">Full visual node-canvas automation. Connect database hooks, AI providers, conditional branching, and email triggers with zero external subscriptions.</p>
        <div class="badge-tag huckleberry" style="font-size: 11px;">n8n &amp; Make Parity</div>
      </div>

      <div class="glass-card">
        <div class="card-title">
          <div class="icon-box" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">📊</div>
          3. Deep Financial RAG
        </div>
        <p style="color: #94a3b8; font-size: 15px; margin-bottom: 12px;">Direct live connection to RegisterÚZ and FinStat registries. Instant corporate balance sheets, solvency scoring, and EBITDA analysis in seconds.</p>
        <div class="badge-tag imbe" style="font-size: 11px;">National Registry Ingestion</div>
      </div>

      <div class="glass-card">
        <div class="card-title">
          <div class="icon-box" style="background: rgba(250, 204, 21, 0.2); color: #facc15;">⭐</div>
          4. Universal Favorites &amp; Voice
        </div>
        <p style="color: #94a3b8; font-size: 15px; margin-bottom: 12px;">Fast multi-entity pinning, quick-access drawer, and AI voice task capture. Talk on mobile, and CCRM automatically parses client, deadline, and priority.</p>
        <div class="badge-tag lemon" style="font-size: 11px;">Sub-Second Navigation</div>
      </div>

      <div class="glass-card">
        <div class="card-title">
          <div class="icon-box" style="background: rgba(244, 63, 94, 0.2); color: #fb7185;">🛡️</div>
          5. Autonomous QA Auditor
        </div>
        <p style="color: #94a3b8; font-size: 15px; margin-bottom: 12px;">Autonomous Playwright crawler with visual occlusion testing. Scans all 12 views in under 50 seconds to ensure 0 UI defects before deployment.</p>
        <div class="badge-tag imbe" style="font-size: 11px;">Self-Healing Quality Gate</div>
      </div>

      <div class="glass-card">
        <div class="card-title">
          <div class="icon-box" style="background: rgba(251, 146, 60, 0.2); color: #fb923c;">🔌</div>
          6. Model Context Protocol (MCP)
        </div>
        <p style="color: #94a3b8; font-size: 15px; margin-bottom: 12px;">Seamless enterprise connectivity. Supports 41 tools across OpenAI, Anthropic Claude, and Google Gemini with encrypted secret masking.</p>
        <div class="badge-tag lemon" style="font-size: 11px;">Multi-LLM Agnostic</div>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 1: Executive Overview</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 4: SYSTEM ARCHITECTURE & HYBRID ENGINE -->
<div class="slide">
  <div class="slide-header">
    <div>
      <div class="badge-tag">ENGINEERING EXCELLENCE</div>
      <h2 class="slide-title">Hybrid Client-Server Enterprise Architecture</h2>
      <p class="slide-subtitle">Combines the snappy speed of local browser runtime with robust server-side database durability.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // STACK</div>
      <div class="slide-number">04 / 18</div>
    </div>
  </div>
  <div class="slide-body" style="flex-direction: column; gap: 24px;">
    <div class="grid-4col" style="height: auto;">
      <div class="glass-card">
        <div class="card-title" style="color: #60a5fa;">1. Client UI &amp; State</div>
        <p style="font-size: 14px; color: #94a3b8; margin-bottom: 10px;">React 19, TypeScript, Tailwind CSS, Lucide Icons, and React Bits WebGL LightRays.</p>
        <ul class="feature-list" style="font-size: 13px;">
          <li>Optimistic local mutation</li>
          <li>PWA mobile capabilities</li>
          <li>Screen wake-lock for SAI</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #a78bfa;">2. Autonomous SAI Engine</div>
        <p style="font-size: 14px; color: #94a3b8; margin-bottom: 10px;">Runs multi-agent turn loops in browser memory without heavy Python/Celery clusters.</p>
        <ul class="feature-list" style="font-size: 13px;">
          <li>Linear RecSys feed ranking</li>
          <li>Dynamic per-sim table sharding</li>
          <li>ReAct strategic briefings</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #34d399;">3. Backend &amp; Sync Engine</div>
        <p style="font-size: 14px; color: #94a3b8; margin-bottom: 10px;">High-speed PHP 8.3 REST &amp; SSE server with real-time sync checksum validation.</p>
        <ul class="feature-list" style="font-size: 13px;">
          <li>Automated sync-backend drift fix</li>
          <li>Encrypted secret vault (AES-256)</li>
          <li>Headless Craft CMS GraphQL sync</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #facc15;">4. Storage &amp; Data Fabric</div>
        <p style="font-size: 14px; color: #94a3b8; margin-bottom: 10px;">MariaDB/MySQL relational storage paired with national corporate registries.</p>
        <ul class="feature-list" style="font-size: 13px;">
          <li>RegisterÚZ &amp; FinStat APIs</li>
          <li>Vector DB RAG embeddings</li>
          <li>Automated incremental backups</li>
        </ul>
      </div>
    </div>

    <div class="glass-card highlight" style="flex: 1;">
      <div class="card-title" style="color: #38bdf8;">Data Flow &amp; Resiliency Pipeline</div>
      <div class="flow-row" style="margin-top: 14px;">
        <div class="flow-step">
          <strong style="color: #f1f5f9; display: block; margin-bottom: 4px;">User Interaction</strong>
          <span style="font-size: 13px; color: #94a3b8;">Instant optimistic update (&lt;16ms)</span>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <strong style="color: #f1f5f9; display: block; margin-bottom: 4px;">Checksum Engine</strong>
          <span style="font-size: 13px; color: #94a3b8;">Calculates delta &amp; version hash</span>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <strong style="color: #f1f5f9; display: block; margin-bottom: 4px;">sync.php Handshake</strong>
          <span style="font-size: 13px; color: #94a3b8;">Verifies atomic lock &amp; merges delta</span>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <strong style="color: #f1f5f9; display: block; margin-bottom: 4px;">Automation Hooks</strong>
          <span style="font-size: 13px; color: #94a3b8;">Queues workflow triggers &amp; notifications</span>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <strong style="color: #f1f5f9; display: block; margin-bottom: 4px;">RAG Index Refresh</strong>
          <span style="font-size: 13px; color: #94a3b8;">Syncs vector DB context for AI agents</span>
        </div>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 1: Executive Overview</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 5: EVOLUTIONARY TIMELINE -->
<div class="slide">
  <div class="slide-header">
    <div>
      <div class="badge-tag">RELEASE CADENCE</div>
      <h2 class="slide-title">The Fruit Release Evolution: Constant Innovation</h2>
      <p class="slide-subtitle">A proven track record of rapid, reliable continuous delivery with zero regressions.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // ROADMAP</div>
      <div class="slide-number">05 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="grid-3col">
      <div class="glass-card" style="border-top: 4px solid #f43f5e;">
        <span class="badge-tag grapefruit">1.6 GRAPEFRUIT</span>
        <h3 style="margin-top: 8px; font-size: 20px;">Dynamic AI Dashboards</h3>
        <p style="color: #94a3b8; font-size: 14px; margin: 10px 0;">Introduced custom dashboard creation, WebGL LightRays login experience, and modernized Docker container foundation.</p>
        <div style="font-size: 13px; color: #64748b;">Released: Summer 2026</div>
      </div>

      <div class="glass-card" style="border-top: 4px solid #c084fc;">
        <span class="badge-tag huckleberry">1.7 HUCKLEBERRY</span>
        <h3 style="margin-top: 8px; font-size: 20px;">Visual Automation Engine</h3>
        <p style="color: #94a3b8; font-size: 14px; margin: 10px 0;">Built n8n/Make-style drag-and-drop node workflow editor, cron task runner, and execution trace inspection debugger.</p>
        <div style="font-size: 13px; color: #64748b;">Released: Late Summer 2026</div>
      </div>

      <div class="glass-card" style="border-top: 4px solid #fb923c;">
        <span class="badge-tag imbe">1.8 IMBE</span>
        <h3 style="margin-top: 8px; font-size: 20px;">QA Audit &amp; Financial RAG</h3>
        <p style="color: #94a3b8; font-size: 14px; margin: 10px 0;">Deployed autonomous Playwright UI crawler, RegisterÚZ / FinStat RAG integration, and encrypted SecretInput state protection.</p>
        <div style="font-size: 13px; color: #64748b;">Released: August 2026</div>
      </div>

      <div class="glass-card" style="border-top: 4px solid #fbbf24;">
        <span class="badge-tag jackfruit">1.9 JACKFRUIT</span>
        <h3 style="margin-top: 8px; font-size: 20px;">Ledger &amp; Drag-and-Drop</h3>
        <p style="color: #94a3b8; font-size: 14px; margin: 10px 0;">Engineered full financial ledger, recurring revenue engine, project drag-and-drop ordering, and system SMTP server.</p>
        <div style="font-size: 13px; color: #64748b;">Released: September 2026</div>
      </div>

      <div class="glass-card" style="border-top: 4px solid #4ade80;">
        <span class="badge-tag kiwi">1.10 KIWI</span>
        <h3 style="margin-top: 8px; font-size: 20px;">Swarm AI (SAI) Engine</h3>
        <p style="color: #94a3b8; font-size: 14px; margin: 10px 0;">Debuted multi-agent market simulation engine, Live War Room knowledge graph, Craft structure view, and pre-flight token guard.</p>
        <div style="font-size: 13px; color: #64748b;">Released: September 2026</div>
      </div>

      <div class="glass-card" style="border-top: 4px solid #facc15;">
        <span class="badge-tag lemon">1.11 LEMON (CURRENT)</span>
        <h3 style="margin-top: 8px; font-size: 20px;">Universal Favorites &amp; MCP</h3>
        <p style="color: #94a3b8; font-size: 14px; margin: 10px 0;">Universal Favorites drawer, team payroll &amp; attendance matrix, voice task recorder, and 41-tool Model Context Protocol (MCP).</p>
        <div style="font-size: 13px; color: #64748b;">Active Release: Present</div>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 1: Executive Overview</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 6: UPDATE 1.11 CITROM -->
<div class="slide">
  <div class="slide-header">
    <div>
      <span class="badge-tag lemon">ACTIVE FLAGSHIP RELEASE</span>
      <h2 class="slide-title">Update 1.11 (Codename: Citrom) — Universal Favorites &amp; MCP</h2>
      <p class="slide-subtitle">Revolutionizing daily productivity, team payroll management, and external agent integrations.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // v1.11</div>
      <div class="slide-number">06 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="split-visual">
      <img src="{img_1_11}" alt="CCRM 1.11 Lemon Infographic">
    </div>
    <div class="split-content">
      <div class="glass-card">
        <div class="card-title" style="color: #facc15;">⭐ Universal Favorites &amp; Sub-Second Drawer</div>
        <ul class="feature-list lemon">
          <li><strong>Pin Anything:</strong> Instant one-click bookmarking of Leads, Clients, Projects, Tasks, and Warehouse Items.</li>
          <li><strong>Top Slide-Out Drawer:</strong> Accessible from any view with category pills, contrast-checked color chips, and keyboard navigation.</li>
          <li><strong>Cross-Device Profile Sync:</strong> Favorites follow the authenticated user profile across mobile, tablet, and desktop.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #38bdf8;">💼 Team HR, Attendance &amp; Payroll Matrix</div>
        <ul class="feature-list">
          <li><strong>Comprehensive Employee Roster:</strong> Deep-linked profile cards, role management, and compensation rate tiers.</li>
          <li><strong>Monthly Attendance Calendar:</strong> Matrix view, weekly summaries, day tags, and Toggl Track v3 integration.</li>
          <li><strong>Central European Number Formatting:</strong> Native currency and decimal locale parsing across all financial figures.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #4ade80;">🎙️ Voice-to-Task &amp; Model Context Protocol (MCP)</div>
        <ul class="feature-list">
          <li><strong>Android-Hardened Voice Capture:</strong> Direct audio dictation with automated task name, deadline, and priority tagging.</li>
          <li><strong>Enterprise MCP Server:</strong> 41 native business tools enabling autonomous external AI agents to perform audited CRM actions safely.</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 2: Release Deep Dives</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 7: UPDATE 1.10 KIWI -->
<div class="slide">
  <div class="slide-header">
    <div>
      <span class="badge-tag kiwi">AI BREAKTHROUGH RELEASE</span>
      <h2 class="slide-title">Update 1.10 (Codename: Kivi) — Swarm AI &amp; Live War Room</h2>
      <p class="slide-subtitle">Autonomous multi-agent predictive simulation engine running entirely in modern browser runtimes.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // v1.10</div>
      <div class="slide-number">07 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="split-visual">
      <img src="{img_1_10}" alt="CCRM 1.10 Kiwi Infographic">
    </div>
    <div class="split-content">
      <div class="glass-card">
        <div class="card-title" style="color: #4ade80;">🧠 Swarm Artificial Intelligence (SAI) Engine</div>
        <ul class="feature-list kiwi">
          <li><strong>Client-Orchestrated Multi-Agent Architecture:</strong> Simulates dozens of autonomous personas without Python or Redis servers.</li>
          <li><strong>Linear RecSys Feed Algorithm:</strong> Dynamic formula (0.4 Recency + 0.3 Popularity + 0.3 Relevance) drives agent information feeds.</li>
          <li><strong>Pre-Flight Cost Estimator:</strong> Real-time token and USD cost forecasting for GPT-5.6 Luna / Terra before running a simulation.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #a78bfa;">⚔️ Live War Room &amp; Knowledge Graph</div>
        <ul class="feature-list">
          <li><strong>Animated SVG Entity Canvas:</strong> Live visual ripples representing posting, retweeting, and counter-arguments between stakeholders.</li>
          <li><strong>Dual-Platform Feed Stream:</strong> Cascading Twitter/X and Reddit mock feeds with real-time sentiment tracking and consensus bar.</li>
          <li><strong>ReAct Chief Intelligence Analyst:</strong> Generates strategic executive briefing playbooks with actionable counter-measures.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #38bdf8;">📐 Craft CMS Structure View &amp; Module Guards</div>
        <ul class="feature-list">
          <li><strong>Hand-Set Structure Order:</strong> Drag-and-drop hierarchy view that preserves custom positioning during column sorts.</li>
          <li><strong>Setup Required State Guards:</strong> Inactive modules gracefully guide users to missing API keys or DB connections.</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 2: Release Deep Dives</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 8: UPDATE 1.9 JACKFRUIT -->
<div class="slide">
  <div class="slide-header">
    <div>
      <span class="badge-tag jackfruit">FINANCIAL FOUNDATION RELEASE</span>
      <h2 class="slide-title">Update 1.9 (Codename: Jákfa) — Unified Ledger &amp; Drag-and-Drop</h2>
      <p class="slide-subtitle">Robust financial cash flow intelligence, system-level communications, and multi-tab state persistence.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // v1.9</div>
      <div class="slide-number">08 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="split-visual">
      <img src="{img_1_9}" alt="CCRM 1.9 Jackfruit Infographic">
    </div>
    <div class="split-content">
      <div class="glass-card">
        <div class="card-title" style="color: #fbbf24;">💰 Unified Financial Ledger &amp; Recurring Cashflow</div>
        <ul class="feature-list jackfruit">
          <li><strong>Invoicing Sync to Ledger:</strong> Invoices generated in billing automatically feed the central cashflow ledger.</li>
          <li><strong>Standalone Payment Editing:</strong> Edit specific monthly instances of recurring payments without breaking parent rule integrity.</li>
          <li><strong>Net Margin &amp; Realized Cashflow:</strong> Separates earned revenue from paid receipts with overdue receivables tracking.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #38bdf8;">✨ Project Drag-and-Drop &amp; Checklists</div>
        <ul class="feature-list">
          <li><strong>Universal Drag Hook:</strong> Smoothly reorder project rows or cards with animated visual drop guides.</li>
          <li><strong>Mandatory Task Checklists:</strong> Project requirements tracking with a live "missing required tasks" counter badge.</li>
          <li><strong>Custom View Menu:</strong> Save custom sort orders and column visibility preferences per user.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #4ade80;">📧 System Mail Server &amp; Persistence Audit</div>
        <ul class="feature-list">
          <li><strong>Dedicated System SMTP:</strong> Task reminders, cron alerts, and password resets route through central server SMTP.</li>
          <li><strong>Multi-Tab Persistence Hardening:</strong> Solved edge-case race conditions so background tab saves never overwrite active work.</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 2: Release Deep Dives</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 9: UPDATE 1.8 IMBE -->
<div class="slide">
  <div class="slide-header">
    <div>
      <span class="badge-tag imbe">QUALITY &amp; INTELLIGENCE RELEASE</span>
      <h2 class="slide-title">Update 1.8 (Codename: Imbe) — QA Audit &amp; Financial RAG</h2>
      <p class="slide-subtitle">Autonomous UI exploration crawler, deep corporate registry synthesis, and encrypted credential masking.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // v1.8</div>
      <div class="slide-number">09 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="split-visual">
      <img src="{img_1_8}" alt="CCRM 1.8 Imbe Infographic">
    </div>
    <div class="split-content">
      <div class="glass-card">
        <div class="card-title" style="color: #fb923c;">🤖 Autonomous QA Exploration Crawler</div>
        <ul class="feature-list imbe">
          <li><strong>Deep UI Crawler:</strong> Traverses all 12 core application views, tabs, modals, and drawers in under 50 seconds.</li>
          <li><strong>Physical Occlusion Detection:</strong> Uses DOM bounding geometry to autonomously detect when dropdowns are hidden behind overlays.</li>
          <li><strong>Zero-Regression Gate:</strong> Deployments are strictly gated by automated Playwright test verification (`npm run test:qa`).</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #38bdf8;">🏛️ RegisterÚZ &amp; FinStat Financial RAG</div>
        <ul class="feature-list">
          <li><strong>Direct Corporate Intelligence:</strong> Automatically injects company balance sheets, revenue, and profit history into AI agent context.</li>
          <li><strong>Actionable AI Error Codes:</strong> Clear, human-readable codes (`ai_key_missing`, `company_not_found`) with direct settings shortcuts.</li>
          <li><strong>Warehouse Stock Awareness:</strong> Autonomous agents retain real-time knowledge of stock levels, SKUs, and replenishment limits.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #ef4444;">🛡️ SecretInput Encrypted Vault &amp; Sync Drift Fix</div>
        <ul class="feature-list">
          <li><strong>State-Based Secret Masking:</strong> Displays clean "Saved &amp; encrypted" shield badges instead of confusing raw asterisk strings.</li>
          <li><strong>Accidental Clear Protection:</strong> Warning modal with instant "Keep secret" rollback prevents accidental credential loss.</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 2: Release Deep Dives</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 10: UPDATE 1.7 HUCKLEBERRY -->
<div class="slide">
  <div class="slide-header">
    <div>
      <span class="badge-tag huckleberry">WORKFLOW AUTOMATION RELEASE</span>
      <h2 class="slide-title">Update 1.7 (Codename: Huckleberry) — Visual Workflow Engine</h2>
      <p class="slide-subtitle">Full-featured node-canvas automation engine replacing external Zapier and Make subscriptions.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // v1.7</div>
      <div class="slide-number">10 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="split-visual">
      <img src="{img_1_7}" alt="CCRM 1.7 Huckleberry Infographic">
    </div>
    <div class="split-content">
      <div class="glass-card">
        <div class="card-title" style="color: #c084fc;">⚡ Node-Based Workflow Canvas (n8n/Make Parity)</div>
        <ul class="feature-list huckleberry">
          <li><strong>Drag-and-Drop Visual Graph:</strong> Build complex multi-branch business logic with interactive horizontal bezier connection wires.</li>
          <li><strong>Collapsible Node Cards:</strong> Expand to edit parameters, collapse to maintain clean canvas architecture with active centered ports.</li>
          <li><strong>Color-Coded Custom Dropdowns:</strong> Module-themed selectors (Leads/Blue, Clients/Green, Tasks/Orange, System/Pink).</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #38bdf8;">🔄 Real-Time Database Event Triggers</div>
        <ul class="feature-list">
          <li><strong>Native sync.php Hooks:</strong> Fires workflows automatically on lead creation, stage transitions, client onboarding, and task updates.</li>
          <li><strong>Dynamic Variable Tag Popover:</strong> Insert dynamic runtime variables (`{{$trigger.name}}`, `{{$trigger.email}}`) with one click.</li>
          <li><strong>Cron Task Runner:</strong> Evaluates delay timers, scheduled batches, and recurring workflow loops securely via `api/cron.php`.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #4ade80;">🔍 Visual Execution Debugger &amp; Quick Actions</div>
        <ul class="feature-list">
          <li><strong>Run History Explorer:</strong> Inspect the exact raw JSON input and output payload for any individual node across past executions.</li>
          <li><strong>Toolbox Quick-Actions:</strong> Pinned trigger buttons in the global top bar with custom icons and color-coded themes.</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 2: Release Deep Dives</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 11: UPDATE 1.6 GRAPEFRUIT -->
<div class="slide">
  <div class="slide-header">
    <div>
      <span class="badge-tag grapefruit">FOUNDATION &amp; DESIGN RELEASE</span>
      <h2 class="slide-title">Update 1.6 (Codename: Grapefruit) — Dynamic Dashboards &amp; WebGL</h2>
      <p class="slide-subtitle">User-customizable AI dashboards, cutting-edge WebGL visual shaders, and production Docker containerization.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // v1.6</div>
      <div class="slide-number">11 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="split-visual">
      <img src="{img_1_6}" alt="CCRM 1.6 Grapefruit Infographic">
    </div>
    <div class="split-content">
      <div class="glass-card">
        <div class="card-title" style="color: #f43f5e;">📊 Custom Dynamic AI Dashboards</div>
        <ul class="feature-list grapefruit">
          <li><strong>Custom Dashboard Engine:</strong> Stored schema (`custom_dashboards`) supporting personalized widget layouts, icons, and colors.</li>
          <li><strong>Real-Time Sync Checksums:</strong> Dashboard configurations are validated in the global sync loop with zero multi-client collision.</li>
          <li><strong>AI Prompt Customization:</strong> Configure dedicated system prompts per dashboard to extract bespoke business insights.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #38bdf8;">✨ React Bits WebGL LightRays Login Experience</div>
        <ul class="feature-list">
          <li><strong>High-Performance 3D Shaders:</strong> Replaced static canvases with dynamic fullscreen WebGL light rays originating from the left viewport.</li>
          <li><strong>Fluid Framerates:</strong> Smooth 60 FPS GPU-accelerated rendering on both desktop workstations and mobile browsers.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #a78bfa;">🐳 Enterprise Docker &amp; Build Optimization</div>
        <ul class="feature-list">
          <li><strong>Explicit Container Orchestration:</strong> Clean `docker-compose.yml` stack with explicit `container_name: crm` bindings.</li>
          <li><strong>Vite Bundler Hot-Reload:</strong> Restored root entry script compilation to `/src/main.tsx` eliminating cache bypass anomalies.</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 2: Release Deep Dives</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 12: STRATEGIC USE CASE 1: SAI MARKET SIMULATION -->
<div class="slide">
  <div class="slide-header">
    <div>
      <div class="badge-tag kiwi">ENTERPRISE SCENARIO 01</div>
      <h2 class="slide-title">Predictive Market War-Gaming: The 25% Pricing Rehearsal</h2>
      <p class="slide-subtitle">How enterprise leadership simulates high-stakes strategic decisions before public execution.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // SAI</div>
      <div class="slide-number">12 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="grid-3col">
      <div class="glass-card">
        <div class="card-title" style="color: #fb7185;">1. The High-Risk Decision</div>
        <p style="font-size: 15px; color: #cbd5e1; margin-bottom: 14px;">A SaaS provider plans to raise enterprise retainer fees by 25%, introduce a 99.9% uptime SLA, and bundle a new WhatsApp developer API bridge.</p>
        <ul class="feature-list" style="font-size: 14px;">
          <li>Risk of immediate client backlash</li>
          <li>Threat of rival competitor discounting</li>
          <li>Uncertainty in sales team rebuttals</li>
        </ul>
      </div>

      <div class="glass-card highlight">
        <div class="card-title" style="color: #4ade80;">2. Running the SAI Rehearsal</div>
        <p style="font-size: 15px; color: #cbd5e1; margin-bottom: 14px;">Leadership seeds CCRM's SAI engine with historical lost deal objections, CRM client transcripts, and competitor pricing profiles.</p>
        <ul class="feature-list kiwi" style="font-size: 14px;">
          <li>50 simulated agents debate over 3 rounds</li>
          <li>Twitter/Reddit feeds reflect community sentiment</li>
          <li>Consensus bar clusters into 4 primary factions</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #38bdf8;">3. Strategic Executive Playbook</div>
        <p style="font-size: 15px; color: #cbd5e1; margin-bottom: 14px;">The Chief Intelligence Analyst delivers an immediate post-rehearsal strategic report with precise countermeasures.</p>
        <ul class="feature-list" style="font-size: 14px;">
          <li>Grandfather existing clients for 6 months</li>
          <li>Highlight WhatsApp API cost savings ($400/mo)</li>
          <li>Pre-empt competitor FUD campaigns</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 3: Strategic Use Cases</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 13: STRATEGIC USE CASE 2: WORKFLOW AUTOMATION -->
<div class="slide">
  <div class="slide-header">
    <div>
      <div class="badge-tag huckleberry">ENTERPRISE SCENARIO 02</div>
      <h2 class="slide-title">Autonomous Client Onboarding &amp; Contract Generation</h2>
      <p class="slide-subtitle">Eliminating 95% of manual administrative busywork with visual drag-and-drop node logic.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // AUTOMATION</div>
      <div class="slide-number">13 / 18</div>
    </div>
  </div>
  <div class="slide-body" style="flex-direction: column;">
    <div class="glass-card highlight" style="flex: 1;">
      <div class="card-title" style="color: #c084fc;">Fully Automated End-to-End Deal Flow</div>
      <div class="flow-row" style="margin-top: 24px;">
        <div class="flow-step">
          <strong style="color: #f1f5f9; display: block; margin-bottom: 6px;">1. Lead "Won"</strong>
          <span style="font-size: 13px; color: #94a3b8;">sync.php triggers workflow when stage changes to WON</span>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <strong style="color: #f1f5f9; display: block; margin-bottom: 6px;">2. FinStat Due Diligence</strong>
          <span style="font-size: 13px; color: #94a3b8;">Verifies IČO, VAT solvency, and official address automatically</span>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <strong style="color: #f1f5f9; display: block; margin-bottom: 6px;">3. Client &amp; Project Created</strong>
          <span style="font-size: 13px; color: #94a3b8;">Converts lead into formal Client and provisions Project Kanban</span>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <strong style="color: #f1f5f9; display: block; margin-bottom: 6px;">4. Invoicing &amp; Contract</strong>
          <span style="font-size: 13px; color: #94a3b8;">Generates initial deposit invoice and pushes to ledger</span>
        </div>
        <div class="flow-arrow">➔</div>
        <div class="flow-step">
          <strong style="color: #f1f5f9; display: block; margin-bottom: 6px;">5. Email &amp; Slack Alert</strong>
          <span style="font-size: 13px; color: #94a3b8;">Notifies assigned project manager and welcomes client</span>
        </div>
      </div>
    </div>

    <div class="grid-2x2" style="height: auto; margin-top: 24px;">
      <div class="metric-callout">
        <div class="val">0 min</div>
        <div class="lbl">Human administrative time required to onboard won accounts and issue retainer agreements</div>
      </div>
      <div class="metric-callout">
        <div class="val">100%</div>
        <div class="lbl">Audit trail compliance with complete JSON execution trace inspection in visual debugger</div>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 3: Strategic Use Cases</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 14: STRATEGIC USE CASE 3: FINANCIAL DUE DILIGENCE -->
<div class="slide">
  <div class="slide-header">
    <div>
      <div class="badge-tag imbe">ENTERPRISE SCENARIO 03</div>
      <h2 class="slide-title">Real-Time Corporate Financial Due Diligence via RegisterÚZ</h2>
      <p class="slide-subtitle">Instant corporate balance sheet analysis and risk scoring directly inside client dossiers.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // FINANCE</div>
      <div class="slide-number">14 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="grid-3col">
      <div class="glass-card">
        <div class="card-title" style="color: #38bdf8;">1. Automated Registry Lookup</div>
        <p style="font-size: 15px; color: #cbd5e1; margin-bottom: 12px;">Type or paste any Slovak or European company ID (IČO). CCRM connects to RegisterÚZ and FinStat APIs to pull official records.</p>
        <ul class="feature-list">
          <li>Full registered legal name &amp; address</li>
          <li>Official tax IDs (DIČ, IČ DPH / VAT)</li>
          <li>Historical filings and balance sheets</li>
        </ul>
      </div>

      <div class="glass-card highlight">
        <div class="card-title" style="color: #10b981;">2. AI Financial Synthesis</div>
        <p style="font-size: 15px; color: #cbd5e1; margin-bottom: 12px;">With one click, CCRM ingests raw corporate financial statements into the LLM reasoning pipeline.</p>
        <ul class="feature-list kiwi">
          <li>EBITDA, profit margin, and liquidity ratios</li>
          <li>Revenue trajectory over past 3 years</li>
          <li>Creditworthiness and insolvency flags</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #facc15;">3. Risk-Adjusted Sales Strategy</div>
        <p style="font-size: 15px; color: #cbd5e1; margin-bottom: 12px;">Sales directors set contract payment terms based on empirical financial health rather than guesswork.</p>
        <ul class="feature-list lemon">
          <li>Require upfront deposit for declining margins</li>
          <li>Offer annual retainer discount for high cash reserves</li>
          <li>Flag potential debt collection liabilities early</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 3: Strategic Use Cases</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 15: SECURITY & COMPLIANCE -->
<div class="slide">
  <div class="slide-header">
    <div>
      <div class="badge-tag">GOVERNANCE &amp; TRUST</div>
      <h2 class="slide-title">Enterprise Security, Privacy &amp; Data Sovereignty</h2>
      <p class="slide-subtitle">Designed from the ground up for strict European data privacy, zero-leak credential storage, and RBAC.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // SECURITY</div>
      <div class="slide-number">15 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="grid-2x2">
      <div class="glass-card">
        <div class="card-title" style="color: #38bdf8;">
          <div class="icon-box" style="background: rgba(56, 189, 248, 0.2);">🔐</div>
          Encrypted Secret Vault (SecretInput)
        </div>
        <ul class="feature-list">
          <li><strong>State-Based Secret Masking:</strong> Passwords, API tokens, and private keys never render as plain text or ambiguous raw asterisks.</li>
          <li><strong>Server-Side Decryption Only:</strong> Outgoing LLM completions and SMTP connections decrypt secrets purely in memory on the server.</li>
          <li><strong>Accidental Clear Protection:</strong> Rollback warning modal protects against accidental token erasure.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #4ade80;">
          <div class="icon-box" style="background: rgba(74, 222, 128, 0.2);">👥</div>
          Granular Role-Based Access Control (RBAC)
        </div>
        <ul class="feature-list">
          <li><strong>15+ Discrete Permission Nodes:</strong> Control view and edit rights for Financials, AI Settings, Client Lists, and User Rosters.</li>
          <li><strong>View Inactivity Guards:</strong> Users without permission see clear fallback cards rather than broken runtime exceptions.</li>
          <li><strong>Personal vs. System Scopes:</strong> Clear separation between private personal settings and company-wide configurations.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #facc15;">
          <div class="icon-box" style="background: rgba(250, 204, 21, 0.2);">🇪🇺</div>
          GDPR &amp; European Data Sovereignty
        </div>
        <ul class="feature-list">
          <li><strong>100% Private Cloud / On-Prem:</strong> Host on your own EU servers or isolated VPC; zero US vendor data transfer requirements.</li>
          <li><strong>Zero Model Training:</strong> Your client communications, financials, and transcripts are never shared with AI model trainers.</li>
          <li><strong>Right to be Forgotten:</strong> Atomic customer deletion removes all associated notes, leads, and simulation records.</li>
        </ul>
      </div>

      <div class="glass-card">
        <div class="card-title" style="color: #f43f5e;">
          <div class="icon-box" style="background: rgba(244, 63, 94, 0.2);">🛡️</div>
          Automated QA Crawler Quality Gate
        </div>
        <ul class="feature-list">
          <li><strong>Autonomous UI Regression Testing:</strong> Headless Playwright sweeps simulate authentic user journeys before code commits.</li>
          <li><strong>Physical Occlusion Inspection:</strong> Ensures z-index conflicts and hidden interactive elements are flagged immediately.</li>
          <li><strong>Continuous Integrity:</strong> Every build passes strict static type verification (`tsc --noEmit`) and integration suites.</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 4: Security &amp; TCO</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 16: TCO & ROI COMPARISON -->
<div class="slide">
  <div class="slide-header">
    <div>
      <div class="badge-tag">FINANCIAL JUSTIFICATION</div>
      <h2 class="slide-title">Total Cost of Ownership (TCO) &amp; ROI Analysis</h2>
      <p class="slide-subtitle">Comparing annual software expenditures for a typical 25-person high-growth business team.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // ROI</div>
      <div class="slide-number">16 / 18</div>
    </div>
  </div>
  <div class="slide-body" style="flex-direction: column; gap: 24px;">
    <div class="glass-card" style="padding: 0; overflow: hidden;">
      <table class="comp-table">
        <thead>
          <tr>
            <th>Software Category / Capability</th>
            <th>Traditional SaaS Tool</th>
            <th>Typical 25-Seat Cost / Year</th>
            <th>CCRM Integrated Platform</th>
            <th>CCRM Advantage</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Core CRM &amp; Pipeline Management</strong></td>
            <td>HubSpot / Salesforce Sales Cloud</td>
            <td>$15,000 – $24,000</td>
            <td><span class="check-icon">✓</span> Included in Core</td>
            <td>Zero per-seat markup</td>
          </tr>
          <tr>
            <td><strong>Workflow Automation (iPaaS)</strong></td>
            <td>Make.com / Zapier Enterprise</td>
            <td>$3,600 – $7,200</td>
            <td><span class="check-icon">✓</span> Included Node Canvas</td>
            <td>Unlimited internal runs</td>
          </tr>
          <tr>
            <td><strong>Corporate Due Diligence / Registries</strong></td>
            <td>FinStat Corporate + RegisterÚZ API</td>
            <td>$1,800 – $3,000</td>
            <td><span class="check-icon">✓</span> Built-in Direct API RAG</td>
            <td>Seamless client dossier link</td>
          </tr>
          <tr>
            <td><strong>AI Strategy &amp; Market Simulation</strong></td>
            <td>Dedicated AI Consultancies / Custom</td>
            <td>$18,000 – $35,000</td>
            <td><span class="check-icon">✓</span> Native SAI Engine</td>
            <td>Direct CRM groundings</td>
          </tr>
          <tr>
            <td><strong>Continuous QA &amp; Regression Testing</strong></td>
            <td>BrowserStack / Datadog Synthetics</td>
            <td>$4,800 – $9,600</td>
            <td><span class="check-icon">✓</span> Built-in QA Crawler</td>
            <td>Zero additional infra cost</td>
          </tr>
          <tr style="background: rgba(16, 185, 129, 0.08); font-weight: 700;">
            <td style="color: #34d399;">TOTAL ESTIMATED ANNUAL COST</td>
            <td style="color: #f87171;">Fragmented SaaS Stack</td>
            <td style="color: #f87171;">$43,200 – $78,800 / year</td>
            <td style="color: #34d399;">CCRM Platform</td>
            <td style="color: #34d399;">Over 80% Capital Savings</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="grid-2x2" style="height: auto;">
      <div class="metric-callout">
        <div class="val">$52,000+</div>
        <div class="lbl">Average annual net savings achieved by consolidating SaaS operations into CCRM</div>
      </div>
      <div class="metric-callout">
        <div class="val">4.2x</div>
        <div class="lbl">Faster time-to-value with pre-integrated workflows, registries, and real-time state sync</div>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 4: Security &amp; TCO</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 17: IMPLEMENTATION ROADMAP -->
<div class="slide">
  <div class="slide-header">
    <div>
      <div class="badge-tag">SPEED TO VALUE</div>
      <h2 class="slide-title">Frictionless Turnkey Deployment &amp; Onboarding</h2>
      <p class="slide-subtitle">Go live in days rather than quarters with our streamlined migration and validation pipeline.</p>
    </div>
    <div class="header-meta">
      <div class="system-title">CCRM // ROLLOUT</div>
      <div class="slide-number">17 / 18</div>
    </div>
  </div>
  <div class="slide-body">
    <div class="grid-4col">
      <div class="glass-card" style="border-top: 4px solid #38bdf8;">
        <div class="card-title" style="color: #38bdf8;">Phase 1: Deploy</div>
        <div style="font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 12px;">DAY 1 – 2</div>
        <p style="font-size: 15px; color: #cbd5e1; margin-bottom: 12px;">Rapid deployment on your private server, Docker cluster, or managed cloud instance.</p>
        <ul class="feature-list" style="font-size: 13px;">
          <li>Automated DB migrations</li>
          <li>Docker Compose startup</li>
          <li>SSL &amp; Domain configuration</li>
        </ul>
      </div>

      <div class="glass-card" style="border-top: 4px solid #4ade80;">
        <div class="card-title" style="color: #4ade80;">Phase 2: Migrate</div>
        <div style="font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 12px;">DAY 3 – 4</div>
        <p style="font-size: 15px; color: #cbd5e1; margin-bottom: 12px;">Seamless data import from legacy CRMs, CSV spreadsheets, and financial ledgers.</p>
        <ul class="feature-list kiwi" style="font-size: 13px;">
          <li>Lead &amp; client records import</li>
          <li>Historical timeline sync</li>
          <li>Company IČO data enrichment</li>
        </ul>
      </div>

      <div class="glass-card" style="border-top: 4px solid #facc15;">
        <div class="card-title" style="color: #facc15;">Phase 3: Automate</div>
        <div style="font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 12px;">DAY 5 – 7</div>
        <p style="font-size: 15px; color: #cbd5e1; margin-bottom: 12px;">Configure custom business workflows, AI model keys, and automated team notification rules.</p>
        <ul class="feature-list lemon" style="font-size: 13px;">
          <li>Node workflow activation</li>
          <li>OpenAI / Claude API link</li>
          <li>System SMTP configuration</li>
        </ul>
      </div>

      <div class="glass-card" style="border-top: 4px solid #a78bfa;">
        <div class="card-title" style="color: #a78bfa;">Phase 4: Scale</div>
        <div style="font-size: 13px; font-weight: 700; color: #94a3b8; margin-bottom: 12px;">DAY 8+</div>
        <p style="font-size: 15px; color: #cbd5e1; margin-bottom: 12px;">Team training, mobile PWA rollout, and continuous updates via Craft CMS release channel.</p>
        <ul class="feature-list" style="font-size: 13px;">
          <li>Zero-downtime updates</li>
          <li>Automated QA gate checks</li>
          <li>Enterprise dedicated support</li>
        </ul>
      </div>
    </div>
  </div>
  <div class="slide-footer">
    <span>CCRM Enterprise Sales Deck • Section 5: Implementation &amp; Next Steps</span>
    <span class="confidential">STRICTLY CONFIDENTIAL</span>
  </div>
</div>

<!-- SLIDE 18: CLOSING & CALL TO ACTION -->
<div class="slide cover-slide" style="text-align: center;">
  <div class="badge-tag lemon">THE NEXT EVOLUTION OF ENTERPRISE CRM</div>
  <h1 class="cover-title" style="font-size: 64px; margin-bottom: 20px;">Ready to Elevate Your Operations?</h1>
  <p class="cover-subtitle" style="max-width: 900px; margin-bottom: 40px;">
    Experience the unmatched speed, predictive power, and workflow automation of CCRM in an interactive private demonstration.
  </p>

  <div style="display: inline-flex; gap: 32px; margin-bottom: 50px;">
    <div class="glass-card highlight" style="text-align: left; padding: 24px 32px; min-width: 320px;">
      <div style="font-size: 14px; font-weight: 700; color: #38bdf8; text-transform: uppercase; margin-bottom: 6px;">Executive Contact</div>
      <div style="font-size: 22px; font-weight: 800; color: #ffffff;">Erik Csefalvay</div>
      <div style="font-size: 16px; color: #94a3b8; margin-top: 4px;">Managing Director, CStudios</div>
      <div style="font-size: 16px; color: #38bdf8; margin-top: 8px; font-family: 'JetBrains Mono', monospace;">erik@cstudios.sk</div>
    </div>

    <div class="glass-card" style="text-align: left; padding: 24px 32px; min-width: 320px;">
      <div style="font-size: 14px; font-weight: 700; color: #4ade80; text-transform: uppercase; margin-bottom: 6px;">Live Demonstration</div>
      <div style="font-size: 20px; font-weight: 800; color: #ffffff;">Custom War Room Simulation</div>
      <div style="font-size: 15px; color: #94a3b8; margin-top: 4px;">Experience SAI live on your industry's specific challenges and competitors.</div>
    </div>
  </div>

  <div class="cover-meta">
    CCRM ENTERPRISE OPERATING SYSTEM • ALL RIGHTS RESERVED • CSTUDIOS SLOVAKIA
  </div>
</div>

</body>
</html>
"""

with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"HTML saved to {OUTPUT_HTML} ({len(html_content)} bytes).")
print(f"Executing Google Chrome headless PDF export...")

cmd = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    f"--print-to-pdf={OUTPUT_PDF}",
    OUTPUT_HTML
]

res = subprocess.run(cmd, capture_output=True, text=True)
print("Chrome return code:", res.returncode)

if os.path.exists(OUTPUT_PDF):
    size = os.path.getsize(OUTPUT_PDF)
    reader = pypdf.PdfReader(OUTPUT_PDF)
    print(f"SUCCESS: Generated PDF at {OUTPUT_PDF}")
    print(f"File Size: {size / (1024*1024):.2f} MB")
    print(f"Total Pages: {len(reader.pages)}")
else:
    print(f"FAILED to generate {OUTPUT_PDF}")
    print(res.stderr)
