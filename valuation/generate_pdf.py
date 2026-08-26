#!/usr/bin/env python3
"""Generate polished PDF valuation reports from the markdown files."""

import re
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import fonts

# ─── Colour palette ────────────────────────────────────────────────────────────
BRAND_DARK    = HexColor("#0F172A")   # slate-900
BRAND_MID     = HexColor("#1E293B")   # slate-800
BRAND_ACCENT  = HexColor("#6366F1")   # indigo-500
BRAND_LIGHT   = HexColor("#E0E7FF")   # indigo-100
BRAND_TEXT    = HexColor("#1E293B")   # body text
BRAND_MUTED   = HexColor("#64748B")   # slate-500
BRAND_BG      = HexColor("#F8FAFC")   # slate-50
TABLE_HEADER  = HexColor("#4F46E5")   # indigo-600
TABLE_ROW1    = HexColor("#F8FAFC")
TABLE_ROW2    = HexColor("#EEF2FF")   # indigo-50
BORDER_COLOR  = HexColor("#C7D2FE")   # indigo-200
RULE_COLOR    = HexColor("#E2E8F0")   # slate-200
GREEN_BG      = HexColor("#DCFCE7")
YELLOW_BG     = HexColor("#FEF9C3")
RED_BG        = HexColor("#FEE2E2")

W, H = A4  # 595.27 x 841.89 pts

def make_styles():
    base = getSampleStyleSheet()

    def s(name, **kw):
        return ParagraphStyle(name, **kw)

    styles = {
        "cover_title": s("cover_title",
            fontName="Helvetica-Bold", fontSize=32, leading=38,
            textColor=white, alignment=TA_LEFT, spaceAfter=8),
        "cover_sub": s("cover_sub",
            fontName="Helvetica", fontSize=14, leading=20,
            textColor=HexColor("#C7D2FE"), alignment=TA_LEFT, spaceAfter=4),
        "cover_meta": s("cover_meta",
            fontName="Helvetica", fontSize=10, leading=14,
            textColor=HexColor("#94A3B8"), alignment=TA_LEFT, spaceAfter=3),
        "h1": s("h1",
            fontName="Helvetica-Bold", fontSize=18, leading=24,
            textColor=BRAND_ACCENT, spaceBefore=18, spaceAfter=8,
            borderPad=4, leftIndent=0),
        "h2": s("h2",
            fontName="Helvetica-Bold", fontSize=13, leading=18,
            textColor=BRAND_DARK, spaceBefore=14, spaceAfter=6),
        "h3": s("h3",
            fontName="Helvetica-Bold", fontSize=11, leading=16,
            textColor=BRAND_MID, spaceBefore=10, spaceAfter=4),
        "body": s("body",
            fontName="Helvetica", fontSize=10, leading=15,
            textColor=BRAND_TEXT, spaceBefore=2, spaceAfter=4,
            alignment=TA_JUSTIFY),
        "bullet": s("bullet",
            fontName="Helvetica", fontSize=10, leading=14,
            textColor=BRAND_TEXT, leftIndent=16, bulletIndent=6,
            spaceBefore=1, spaceAfter=2),
        "code": s("code",
            fontName="Courier", fontSize=8.5, leading=12,
            textColor=BRAND_MID, backColor=HexColor("#F1F5F9"),
            borderColor=BORDER_COLOR, borderWidth=0.5, borderPad=4,
            spaceAfter=6),
        "table_header": s("table_header",
            fontName="Helvetica-Bold", fontSize=8.5, leading=12,
            textColor=white, alignment=TA_CENTER),
        "table_cell": s("table_cell",
            fontName="Helvetica", fontSize=8.5, leading=12,
            textColor=BRAND_TEXT, alignment=TA_LEFT),
        "table_cell_c": s("table_cell_c",
            fontName="Helvetica", fontSize=8.5, leading=12,
            textColor=BRAND_TEXT, alignment=TA_CENTER),
        "caption": s("caption",
            fontName="Helvetica-Oblique", fontSize=8, leading=11,
            textColor=BRAND_MUTED, alignment=TA_CENTER, spaceAfter=8),
        "kpi_label": s("kpi_label",
            fontName="Helvetica-Bold", fontSize=9, leading=12,
            textColor=BRAND_MUTED, alignment=TA_CENTER),
        "kpi_value": s("kpi_value",
            fontName="Helvetica-Bold", fontSize=20, leading=24,
            textColor=BRAND_ACCENT, alignment=TA_CENTER),
        "footer": s("footer",
            fontName="Helvetica", fontSize=7.5, leading=10,
            textColor=BRAND_MUTED, alignment=TA_CENTER),
        "toc_item": s("toc_item",
            fontName="Helvetica", fontSize=10, leading=16,
            textColor=BRAND_TEXT, leftIndent=8),
    }
    return styles

# ─── Helper builders ───────────────────────────────────────────────────────────

def kpi_table(data_rows, styles):
    """data_rows: list of (label, value) tuples — rendered as KPI cards."""
    cells = []
    for label, value in data_rows:
        cells.append([
            Paragraph(value, styles["kpi_value"]),
            Paragraph(label, styles["kpi_label"]),
        ])
    col_w = (W - 80) / len(cells) if cells else 80
    rows = [[c[0] for c in cells], [c[1] for c in cells]]
    t = Table(rows, colWidths=[col_w]*len(cells))
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), TABLE_ROW2),
        ("ROUNDEDCORNERS", [6]*4),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t

def data_table(headers, rows, styles, col_widths=None):
    """Generic striped data table."""
    header_cells = [Paragraph(h, styles["table_header"]) for h in headers]
    table_data = [header_cells]
    for i, row in enumerate(rows):
        cells = []
        for j, cell in enumerate(row):
            style = styles["table_cell"] if j == 0 else styles["table_cell_c"]
            cells.append(Paragraph(str(cell), style))
        table_data.append(cells)

    usable = W - 80
    if col_widths is None:
        col_widths = [usable / len(headers)] * len(headers)

    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.5),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, BORDER_COLOR),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]
    for i in range(1, len(table_data)):
        bg = TABLE_ROW2 if i % 2 == 0 else TABLE_ROW1
        style_cmds.append(("BACKGROUND", (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

def section_rule(color=BRAND_ACCENT):
    return HRFlowable(width="100%", thickness=2, color=color,
                      spaceAfter=4, spaceBefore=0)

def light_rule():
    return HRFlowable(width="100%", thickness=0.5, color=RULE_COLOR,
                      spaceAfter=6, spaceBefore=6)

def info_box(text, styles, bg=BRAND_LIGHT, border=BRAND_ACCENT):
    """Coloured info callout box."""
    style = ParagraphStyle("info_box",
        fontName="Helvetica", fontSize=9.5, leading=14,
        textColor=BRAND_DARK, backColor=bg,
        borderColor=border, borderWidth=1.5, borderPad=8,
        spaceAfter=8, spaceBefore=4)
    return Paragraph(text, style)

# ─── Cover page ────────────────────────────────────────────────────────────────

def cover_page(doc, canvas, title_en, title_hu, lang, styles):
    canvas.saveState()
    # Full-bleed dark background
    canvas.setFillColor(BRAND_DARK)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    # Accent strip top
    canvas.setFillColor(BRAND_ACCENT)
    canvas.rect(0, H - 8*mm, W, 8*mm, fill=1, stroke=0)
    # Accent strip bottom
    canvas.rect(0, 0, W, 3*mm, fill=1, stroke=0)
    # Decorative diagonal gradient rectangles
    canvas.setFillColor(HexColor("#312E81"))
    canvas.rect(W*0.55, H*0.3, W*0.6, H*0.5, fill=1, stroke=0)
    canvas.setFillColor(HexColor("#1E1B4B"))
    canvas.rect(W*0.65, H*0.1, W*0.5, H*0.7, fill=1, stroke=0)
    # Left content
    x0 = 40
    # Logo placeholder / brand mark
    canvas.setFillColor(BRAND_ACCENT)
    canvas.roundRect(x0, H - 50*mm, 14*mm, 14*mm, 3*mm, fill=1, stroke=0)
    canvas.setFont("Helvetica-Bold", 16)
    canvas.setFillColor(white)
    canvas.drawString(x0 + 4*mm, H - 42*mm, "E")
    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawString(x0 + 20*mm, H - 41*mm, "Effectime Enterprise")
    # Title block
    y = H - 90*mm
    canvas.setFont("Helvetica-Bold", 34)
    canvas.setFillColor(white)
    title = title_en if lang == "en" else title_hu
    # word-wrap
    words = title.split()
    lines_out = []
    line = ""
    for w in words:
        test = (line + " " + w).strip()
        if canvas.stringWidth(test, "Helvetica-Bold", 34) < W*0.55:
            line = test
        else:
            lines_out.append(line)
            line = w
    if line:
        lines_out.append(line)
    for li, ltext in enumerate(lines_out):
        canvas.drawString(x0, y - li*42, ltext)
    y2 = y - len(lines_out)*42 - 12
    canvas.setFont("Helvetica", 14)
    canvas.setFillColor(HexColor("#C7D2FE"))
    sub = "Software Valuation & Technical Due-Diligence Report" if lang=="en" else "Szoftver Értékelési és Technikai Átvilágítási Jelentés"
    canvas.drawString(x0, y2, sub)
    # Metadata block
    meta_y = y2 - 50
    canvas.setFont("Helvetica", 10)
    canvas.setFillColor(HexColor("#94A3B8"))
    meta = [
        ("Date / Dátum", "2026-05-11"),
        ("Repository", "HenrikFaul/effectime-app-enterprise-a95029a1"),
        ("Version", "v2.6.0+"),
        ("Language", "English" if lang=="en" else "Magyar"),
        ("Confidence", "Medium-High / Közepes-Magas"),
    ]
    for i, (k, v) in enumerate(meta):
        canvas.setFillColor(HexColor("#64748B"))
        canvas.drawString(x0, meta_y - i*14, k + ":  ")
        canvas.setFillColor(white)
        canvas.drawString(x0 + 80, meta_y - i*14, v)
    canvas.restoreState()

# ─── Page template ─────────────────────────────────────────────────────────────

def on_page(canvas, doc, lang="en"):
    canvas.saveState()
    # Header strip
    canvas.setFillColor(BRAND_DARK)
    canvas.rect(0, H - 14*mm, W, 14*mm, fill=1, stroke=0)
    canvas.setFillColor(BRAND_ACCENT)
    canvas.rect(0, H - 15*mm, W, 1*mm, fill=1, stroke=0)
    # Header text
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(white)
    header_txt = "Effectime Enterprise — Software Valuation Report" if lang=="en" else "Effectime Enterprise — Szoftver Értékelési Jelentés"
    canvas.drawString(20*mm, H - 9*mm, header_txt)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(HexColor("#94A3B8"))
    canvas.drawRightString(W - 20*mm, H - 9*mm, "CONFIDENTIAL")
    # Footer strip
    canvas.setFillColor(BRAND_BG)
    canvas.rect(0, 0, W, 12*mm, fill=1, stroke=0)
    canvas.setFillColor(BRAND_ACCENT)
    canvas.rect(0, 12*mm, W, 0.5*mm, fill=1, stroke=0)
    # Footer text
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(BRAND_MUTED)
    footer_txt = "© 2026 Effectime. All rights reserved. For informational purposes only." if lang=="en" else "© 2026 Effectime. Minden jog fenntartva. Csak tájékoztató jelleggel."
    canvas.drawString(20*mm, 4.5*mm, footer_txt)
    canvas.drawRightString(W - 20*mm, 4.5*mm, f"Page {doc.page}")
    canvas.restoreState()

# ─── Main report builder ───────────────────────────────────────────────────────

def build_en_report(filename):
    styles = make_styles()
    lang = "en"

    doc = SimpleDocTemplate(
        filename, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=22*mm, bottomMargin=18*mm,
        title="Effectime Enterprise — Software Valuation Report",
        author="AI-assisted Technical Due-Diligence",
        subject="Software Valuation & Market Analysis",
    )

    story = []

    # ── Cover ──────────────────────────────────────────────────────────────────
    story.append(PageBreak())  # forces cover template via first page

    # ── TOC ────────────────────────────────────────────────────────────────────
    toc_items = [
        "1.  Executive Summary",
        "2.  Product Reconstruction",
        "3.  Scope Decomposition",
        "4.  Methodology",
        "5.  Team Composition",
        "6.  Effort Estimate",
        "7.  Cost Estimate",
        "8.  Market Comparison",
        "9.  Market Value Estimate",
        "10. Assumptions and Limitations",
        "11. Recommended Next Steps",
        "12. Appendix",
    ]
    story.append(Paragraph("Table of Contents", styles["h1"]))
    story.append(section_rule())
    for item in toc_items:
        story.append(Paragraph(item, styles["toc_item"]))
    story.append(PageBreak())

    # ── 1. Executive Summary ───────────────────────────────────────────────────
    story.append(Paragraph("1. Executive Summary", styles["h1"]))
    story.append(section_rule())
    story.append(Paragraph(
        "Effectime Enterprise is a <b>multi-tenant, enterprise-grade HR leave management and "
        "workforce planning SaaS platform</b> built for the Hungarian/CEE SME and mid-market "
        "segment. It provides end-to-end leave lifecycle management, multi-view calendar with "
        "real-time timeline, resource and project capacity planning, Agile integration (Jira + "
        "Azure DevOps), custom report builder with SQL mode, and mobile support via Capacitor.",
        styles["body"]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Key Statistics", styles["h2"]))
    story.append(kpi_table([
        ("Source Files (.ts/.tsx)", "170"),
        ("Lines of Code", "31,435"),
        ("DB Migrations", "53"),
        ("Edge Functions", "17"),
        ("Enterprise Components", "77"),
        ("Dev Timeline", "2 months"),
    ], styles))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Build Effort Summary", styles["h2"]))
    story.append(data_table(
        ["Metric", "Low", "Most Likely", "High"],
        [
            ["Person-hours", "2,041", "3,051", "4,485"],
            ["Person-months (160 h/mo)", "12.8", "19.1", "28.0"],
            ["Calendar months (3-person team)", "5.5 mo", "7.5 mo", "11 mo"],
        ],
        styles,
        col_widths=[140, 100, 110, 100]
    ))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Build Cost Summary", styles["h2"]))
    story.append(data_table(
        ["Scenario", "Low", "Most Likely", "High"],
        [
            ["CEE / Hungary team", "€118,000", "€178,000", "€245,000"],
            ["Western EU agency", "€265,000", "€380,000", "€520,000"],
            ["Mixed CEE + WEU lead", "€165,000", "€235,000", "€330,000"],
        ],
        styles,
        col_widths=[160, 90, 110, 90]
    ))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Market Value Summary", styles["h2"]))
    story.append(data_table(
        ["Scenario", "Estimated Range", "Central Estimate"],
        [
            ["Pre-revenue IP sale", "€200K – €600K", "€380K"],
            ["Early customers (€50–100K ARR)", "€400K – €1,200K", "€700K"],
            ["Growth stage (€300–500K ARR)", "€1.8M – €4.5M", "€3.0M"],
            ["Strategic acquisition", "€700K – €2,500K", "€1.5M"],
            ["Current state (unknown revenue)", "€350K – €900K", "€550K"],
        ],
        styles,
        col_widths=[180, 130, 120]
    ))
    story.append(Spacer(1, 8))

    story.append(info_box(
        "⚠  <b>Biggest Uncertainty Driver:</b> Revenue/ARR data is not available in the "
        "repository. This single factor is the most dominant variable in market valuation. "
        "A €100K ARR trajectory would move the central estimate from €550K to ~€700–1,000K.",
        styles))
    story.append(PageBreak())

    # ── 2. Product Reconstruction ──────────────────────────────────────────────
    story.append(Paragraph("2. Product Reconstruction", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Technical Architecture", styles["h2"]))
    arch_rows = [
        ["Layer", "Technology", "Version"],
        ["Frontend Framework", "React + TypeScript + Vite", "18.3 / 5.8 / 5.4"],
        ["UI Components", "shadcn/ui (Radix UI) + Tailwind CSS", "3.4.17"],
        ["Animation", "Framer Motion", "12.35"],
        ["State / Data Fetching", "TanStack Query", "v5.83"],
        ["Charts", "Recharts", "2.15"],
        ["Virtualization", "@tanstack/react-virtual", "3.13"],
        ["Drag & Drop", "@dnd-kit", "6.3"],
        ["Mobile", "Capacitor (iOS + Android)", "8.2"],
        ["Forms / Validation", "React Hook Form + Zod", "7.6 / 3.25"],
        ["Backend / DB", "Supabase (PostgreSQL)", "2.98"],
        ["Edge Functions", "Deno (TypeScript)", "17 functions"],
        ["Auth", "Supabase Auth + Google OAuth", "Custom activation"],
        ["Agile Integration", "Jira REST API v3 + Azure DevOps WIQL", "Bidirectional"],
        ["Email", "Lovable Email API (Mailgun)", "Transactional"],
        ["Scheduling", "pg_cron", "2 jobs"],
    ]
    story.append(data_table(
        arch_rows[0], arch_rows[1:], styles,
        col_widths=[150, 190, 110]
    ))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Feature Module Map", styles["h2"]))
    modules = [
        ("Authentication & Identity", "Google OAuth + custom activation gate, OTP email, account deletion (GDPR), admin panel"),
        ("Workspace & Tenancy", "Multi-workspace, invitation system, instant member creation, role management, branding"),
        ("Leave Request Lifecycle", "6-status state machine, 2-step submit, substitute picker, attachment upload, quota tracking, admin override"),
        ("Conflict Engine", "Parallel validation: holidays, blocked dates, daily rules, office coverage, self-overlap (lib/conflictEngine.ts)"),
        ("Capacity Engine", "Hours-based: base_working_hours × allocation%, leave deduction, project allocation (lib/capacityEngine.ts)"),
        ("Calendar & Timeline", "3 views: monthly / Absentify-timeline (TanStack Virtual) / annual grid; dynamic filter bar with drag&drop"),
        ("Coverage Planner", "Weekly/monthly requirement vs. supply; smart batch scheduling algorithm; skill/role matching"),
        ("Approval Chain & Escalation", "Multi-step configurable chains, escalation rules with hour threshold, bulk approve/reject"),
        ("Resource Management", "Projects + Gantt + capacity gap + utilization heatmap + scenario planner + financials"),
        ("Agile Integration", "Jira + ADO: backlog browser, issue writeback, capacity fit, what-if simulation, field discovery"),
        ("Report Builder", "Visual config + SQL mode + live preview + scheduled delivery; pinned report widgets"),
        ("Email Infrastructure", "Auth hook, transactional templates, email queue, suppression/unsubscribe, scheduled reports"),
        ("Notifications", "In-app notifications, read/unread, preferences per event type, iCal subscription"),
        ("Audit & Compliance", "Immutable audit log, GDPR account deletion, CSV export, export job tracking"),
    ]
    feat_rows = [[Paragraph(m, styles["table_cell"]), Paragraph(d, styles["table_cell"])] for m, d in modules]
    feat_headers = [Paragraph("Module", styles["table_header"]), Paragraph("Key Capabilities", styles["table_header"])]
    feat_table = Table([feat_headers] + feat_rows, colWidths=[130, 320], repeatRows=1)
    feat_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        *[("BACKGROUND", (0, i+1), (-1, i+1), TABLE_ROW2 if i % 2 == 0 else TABLE_ROW1) for i in range(len(feat_rows))],
    ]))
    story.append(feat_table)
    story.append(PageBreak())

    # ── 3. Scope Decomposition ─────────────────────────────────────────────────
    story.append(Paragraph("3. Scope Decomposition", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Complexity Ratings by Area", styles["h2"]))
    comp_rows = [
        ["Feature Area", "Complexity", "Hidden Cost Drivers"],
        ["Auth & Identity", "Medium", "Custom Google OAuth activation gate (300+ lines backend logic); legacy bypass rules"],
        ["Multi-Tenant Architecture", "High", "RLS policies on 30+ tables; schema split (syncfolk/plannermaster); dynamic permission tree"],
        ["Leave Request Lifecycle", "High", "6-state machine; quota transaction scoping bug (fixed v2.6); substitute ordering"],
        ["Conflict Engine", "Medium-High", "6-table parallel fetch; multi-position OR semantics; scalar/array column fallback"],
        ["Capacity Engine", "Medium", "Hours math; allocation %; leave deduction; silent failure risk (fixed)"],
        ["Calendar & Timeline", "High", "TanStack Virtual (200+ rows); coverage planner race conditions; filter persistence"],
        ["Approval Chain", "Medium", "Multi-step config; escalation timers; role routing"],
        ["Resource Management", "High", "Gantt drag-resize; scenario planner; financials; utilization heatmap"],
        ["Agile Integration", "Very High", "Jira REST v3 + ADO WIQL in one proxy; empty patch protection; base-URL normalisation"],
        ["Report Builder", "High", "SQL mode with workspace-scoped access control; live preview; scheduled cron delivery"],
        ["Email Infrastructure", "High", "Auth hook intercept; suppression/bounce; React Email templates; queue retry logic"],
    ]
    story.append(data_table(comp_rows[0], comp_rows[1:], styles, col_widths=[130, 80, 240]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Complexity Multipliers", styles["h2"]))
    mult_rows = [
        ["Factor", "Impact", "Rationale"],
        ["Hungarian-only UI", "+0%", "No i18n framework; hardcoded strings (tech debt, not build cost)"],
        ["Multi-schema PostgreSQL", "+15%", "3 schemas; helper functions; non-destructive migration constraint"],
        ["Dual-product codebase", "+10%", "Syncfolk + Enterprise share infrastructure; coordination overhead"],
        ["AI-accelerated development", "−30%", "Build time reflects AI tooling; traditional estimate 2–3× longer"],
        ["Minimal automated tests", "+20%", "Manual QA burden; regression risk higher; bug-fix cycles needed"],
        ["17 Deno edge functions", "+15%", "Cold start considerations; Deno vs Node API differences; cold-start latency"],
    ]
    story.append(data_table(mult_rows[0], mult_rows[1:], styles, col_widths=[160, 70, 220]))
    story.append(PageBreak())

    # ── 4. Methodology ────────────────────────────────────────────────────────
    story.append(Paragraph("4. Methodology", styles["h1"]))
    story.append(section_rule())
    methods = [
        ("Bottom-Up Estimation", "Each of 10 major areas decomposed into sub-components. Effort estimated per component based on: lines of code, DB tables, API endpoints, UI interaction complexity, edge cases evidenced in changelog."),
        ("Analogous Estimation", "Comparable products (Calamari, Timetastic, Sloneek, Absence.io) used as reference points. Public engineering blog posts from HR SaaS startups confirm 6–18 month MVP timelines."),
        ("Three-Point PERT", "Optimistic / Most Likely / Pessimistic estimates per area. Formula: E = (O + 4M + P) / 6. Standard deviation: SD = (P − O) / 6."),
        ("Code Volume Baseline", "31,435 lines ÷ 120 LOC/day average = 262 developer-days. × 2.2 overhead multiplier (QA, PM, design, review, meetings, rework) = ~576 days = ~2,880 person-hours. Aligns with bottom-up estimate."),
    ]
    for title, desc in methods:
        story.append(Paragraph(title, styles["h3"]))
        story.append(Paragraph(desc, styles["body"]))
        story.append(light_rule())

    story.append(Paragraph("Important Distinctions", styles["h2"]))
    distinctions = [
        "<b>Effort ≠ Duration:</b> 2,880 person-hours can be delivered in 5 months (3 FTE) or 24 months (0.5 FTE).",
        "<b>Build Cost ≠ Market Value:</b> Replacement cost is the floor; revenue traction and strategic positioning multiply it significantly.",
        "<b>Code ≠ Product:</b> A shipped product includes design decisions, user research, content strategy, and customer success not visible in code.",
        "<b>AI-assisted ≠ Traditional:</b> The 2-month build reflects Lovable/Claude tooling. Conventional teams take 2–3× longer.",
    ]
    for d in distinctions:
        story.append(Paragraph(f"• {d}", styles["bullet"]))
    story.append(PageBreak())

    # ── 5. Team Composition ───────────────────────────────────────────────────
    story.append(Paragraph("5. Team Composition", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Required Roles", styles["h2"]))
    role_rows = [
        ["Role", "Why Needed", "Phase", "Effort %"],
        ["Senior Full-Stack Engineer", "Architecture, Supabase schema, RLS, edge functions, business logic", "All", "35%"],
        ["Mid-Level Frontend Engineer", "React components, Recharts, DnD Kit, Framer Motion, responsive UI", "2–8", "30%"],
        ["Backend / DB Engineer", "PostgreSQL schema, RLS policies, SECURITY DEFINER functions, migrations", "1–3, 6–8", "15%"],
        ["UX/UI Designer", "Information architecture, component library, mobile layouts, data viz", "1–2, 4–5", "10%"],
        ["Product Manager", "Requirements, sprint planning, backlog prioritisation, stakeholder mgmt", "All", "7%"],
        ["QA Engineer", "Manual testing, regression, cross-browser/device", "3–8", "3%"],
    ]
    story.append(data_table(role_rows[0], role_rows[1:], styles, col_widths=[130, 170, 70, 60]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Delivery Team Options", styles["h2"]))
    teams = [
        ("Lean Team (3 people, 7–10 months)",
         "1× Senior Full-Stack (lead, 100%) · 1× Mid Frontend (100%) · 0.5× UX/UI Designer (50%)",
         "Lowest cost; PM/QA done by lead + stakeholder. Best for a solo founder or bootstrapped product."),
        ("Balanced Team (5 people, 5–7 months)",
         "1× Senior Full-Stack · 1× Mid Frontend · 1× Backend/DB · 0.5× UX/UI · 0.5× PM",
         "Recommended for a seed-stage startup. Parallel tracks on frontend/backend. Reasonable velocity."),
        ("Enterprise Delivery Team (8 people, 4–5 months)",
         "2× Senior · 2× Mid Frontend · 1× Backend/DB · 1× UX/UI · 1× PM · 1× QA",
         "Maximum velocity. Suitable for agency delivery or well-funded sprint. Highest coordination overhead."),
    ]
    for t_name, t_comp, t_notes in teams:
        story.append(info_box(f"<b>{t_name}</b><br/>{t_comp}<br/><i>{t_notes}</i>", styles))
    story.append(PageBreak())

    # ── 6. Effort Estimate ────────────────────────────────────────────────────
    story.append(Paragraph("6. Effort Estimate", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Area-by-Area Breakdown (PERT)", styles["h2"]))
    effort_rows = [
        ["Feature Area", "Opt. (h)", "ML (h)", "Pess. (h)", "PERT (h)"],
        ["Auth & Identity", "80", "120", "180", "122"],
        ["Workspace & Tenancy", "120", "180", "260", "183"],
        ["Leave Request Lifecycle", "180", "260", "380", "263"],
        ["Conflict Engine", "60", "90", "140", "92"],
        ["Capacity Engine", "50", "75", "120", "77"],
        ["Calendar & Timeline Views", "200", "290", "420", "293"],
        ["Approval Chain & Escalation", "60", "90", "140", "92"],
        ["Resource Management", "180", "260", "380", "263"],
        ["Agile Integration", "140", "200", "300", "203"],
        ["Report Builder & Reporting", "120", "180", "270", "183"],
        ["Email Infrastructure", "90", "130", "200", "133"],
        ["Admin, Profile, Landing", "60", "90", "140", "92"],
        ["Mobile (Capacitor) + Polish", "60", "90", "130", "90"],
        ["DB Schema + RLS + Migrations", "80", "120", "180", "122"],
        ["Smart Schedule Algorithm", "40", "60", "90", "61"],
        ["Permission System (dynamic tree)", "50", "75", "120", "77"],
        ["Subtotal (coding)", "1,570", "2,310", "3,450", "2,347"],
        ["+ 30% overhead (QA, PM, design, deploy)", "471", "693", "1,035", "704"],
        ["TOTAL", "2,041", "3,003", "4,485", "3,051"],
    ]
    t = data_table(effort_rows[0], effort_rows[1:], styles,
                   col_widths=[160, 65, 65, 75, 65])
    # Highlight totals
    n = len(effort_rows)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, n-2), (-1, n-2), HexColor("#E0E7FF")),
        ("FONTNAME", (0, n-2), (-1, n-2), "Helvetica-Bold"),
        ("BACKGROUND", (0, n-1), (-1, n-1), TABLE_HEADER),
        ("FONTNAME", (0, n-1), (-1, n-1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, n-1), (-1, n-1), white),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Summary in Multiple Units", styles["h2"]))
    summary_rows = [
        ["Metric", "Low", "Most Likely", "High"],
        ["Person-hours", "2,041", "3,051", "4,485"],
        ["Person-days (8h)", "255", "381", "561"],
        ["Person-months (160h)", "12.8", "19.1", "28.0"],
        ["Calendar months (3-person core)", "5.5", "7.5", "11"],
        ["Calendar months (5-person team)", "3.5", "5.0", "7.0"],
    ]
    story.append(data_table(summary_rows[0], summary_rows[1:], styles,
                            col_widths=[160, 90, 110, 90]))
    story.append(PageBreak())

    # ── 7. Cost Estimate ──────────────────────────────────────────────────────
    story.append(Paragraph("7. Cost Estimate", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("CEE / Hungary Rate Assumptions (2025–2026)", styles["h2"]))
    rate_rows = [
        ["Role", "Junior (€/h)", "Mid (€/h)", "Senior (€/h)"],
        ["Full-Stack Engineer", "€15–22", "€28–40", "€42–65"],
        ["Frontend Engineer", "€14–20", "€25–38", "€38–60"],
        ["Backend / DB Engineer", "€15–22", "€28–42", "€42–65"],
        ["UX/UI Designer", "€14–20", "€24–36", "€36–55"],
        ["Product Manager", "€18–25", "€32–45", "€45–70"],
        ["QA Engineer", "€12–18", "€22–32", "€32–48"],
    ]
    story.append(data_table(rate_rows[0], rate_rows[1:], styles,
                            col_widths=[140, 90, 90, 90]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Detailed Cost Model — Most Likely (CEE Rates)", styles["h2"]))
    cost_rows = [
        ["Role", "Share", "Hours", "Rate", "Cost"],
        ["Senior Full-Stack Engineer", "35%", "1,068", "€52/h", "€55,536"],
        ["Mid-Level Frontend Engineer", "30%", "915", "€33/h", "€30,195"],
        ["Backend / DB Engineer", "15%", "458", "€48/h", "€21,984"],
        ["UX/UI Designer", "10%", "305", "€30/h", "€9,150"],
        ["Product Manager", "7%", "214", "€38/h", "€8,132"],
        ["QA Engineer", "3%", "91", "€28/h", "€2,548"],
        ["Direct Labour", "", "3,051", "", "€127,545"],
        ["Overhead (25%)", "", "", "", "€31,886"],
        ["Contingency (15%)", "", "", "", "€19,132"],
        ["TOTAL", "", "", "", "€178,563"],
    ]
    ct = data_table(cost_rows[0], cost_rows[1:], styles,
                    col_widths=[160, 55, 65, 65, 85])
    n = len(cost_rows)
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0, n-4), (-1, n-4), HexColor("#E0E7FF")),
        ("FONTNAME", (0, n-4), (-1, n-4), "Helvetica-Bold"),
        ("BACKGROUND", (0, n-1), (-1, n-1), TABLE_HEADER),
        ("FONTNAME", (0, n-1), (-1, n-1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, n-1), (-1, n-1), white),
    ]))
    story.append(ct)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Cost Ranges by Scenario", styles["h2"]))
    scenario_rows = [
        ["Scenario", "Low", "Most Likely", "High"],
        ["CEE / Hungary (lean team)", "€118,000", "€178,000", "€245,000"],
        ["Western EU agency", "€265,000", "€380,000", "€520,000"],
        ["Mixed CEE + WEU lead", "€165,000", "€235,000", "€330,000"],
    ]
    story.append(data_table(scenario_rows[0], scenario_rows[1:], styles,
                            col_widths=[160, 90, 110, 90]))
    story.append(PageBreak())

    # ── 8. Market Comparison ──────────────────────────────────────────────────
    story.append(Paragraph("8. Market Comparison", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Comparable Products", styles["h2"]))
    comp_prod_rows = [
        ["Product", "HQ", "Price/User/Mo", "Key Notes vs. Effectime"],
        ["Calamari", "Poland", "€2.50–5.00", "Closest CEE peer; no Agile integration"],
        ["Timetastic", "UK", "$1.50–2.50", "Much simpler; acquired 2023; $1.7M ARR"],
        ["Absence.io", "Germany", "€3.50–5.00", "EU-focused, GDPR; similar scope"],
        ["Factorial HR", "Spain", "€5–8", "Broader HR (payroll); less Agile depth"],
        ["Personio", "Germany", "€5–25", "Enterprise, payroll; €8.5B valuation peak"],
        ["Sloneek", "Czech/CEE", "~€5–10 est.", "Closest CEE; Hungarian UI; €3.6M raised 2024"],
        ["BambooHR", "USA", "$10–25 est.", "North American SME; no Agile; strong brand"],
        ["Float", "Australia", "$6–12", "Resource planning only; no leave management"],
        ["Teamdeck", "Poland", "$3.99", "Resource + leave; closest overall comparable"],
    ]
    story.append(data_table(comp_prod_rows[0], comp_prod_rows[1:], styles,
                            col_widths=[80, 65, 75, 230]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("HR SaaS Valuation Multiples (2024–2026)", styles["h2"]))
    mult_data = [
        ["Growth Rate", "Typical ARR Multiple", "Examples"],
        [">100% YoY (early stage)", "10–15× ARR", "Rippling: 29×; HiBob: 22×"],
        ["50–100% YoY", "7–10× ARR", "Personio peak: 24×"],
        ["20–50% YoY (mature SaaS)", "5–8× ARR", "Deputy: ~11× (2022)"],
        ["<20% YoY (stable)", "3–5× ARR", "Bootstrapped SaaS median: 4.8×"],
        ["M&A median (2024)", "4.1× ARR", "SaaS Capital Index"],
        ["M&A median (2025)", "3.1–3.8× ARR", "Current deal environment"],
    ]
    story.append(data_table(mult_data[0], mult_data[1:], styles,
                            col_widths=[140, 110, 200]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Market Sizing", styles["h2"]))
    market_data = [
        ["Segment", "2024 Market Size", "CAGR", "Notes"],
        ["Global HR Software", "$20.5 billion", "10.1%", "To 2032"],
        ["Absence & Leave Management", "~$1.2 billion", "9.5%", "To 2035"],
        ["European Workforce Management", "$2.66 billion", "8.67%", "To 2030"],
        ["CEE HR Tech", "~€200–250M", "~12–15%", "Estimate"],
    ]
    story.append(data_table(market_data[0], market_data[1:], styles,
                            col_widths=[140, 110, 70, 130]))
    story.append(PageBreak())

    # ── 9. Market Value Estimate ──────────────────────────────────────────────
    story.append(Paragraph("9. Market Value Estimate", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph(
        "Five valuation lenses are applied and triangulated to produce a range-based estimate.",
        styles["body"]))
    story.append(Spacer(1, 6))

    lenses = [
        ("Lens 1: Replacement / IP Value",
         "Build cost at CEE rates: €145K–€245K. As marketed IP asset, 1.5–2.5× multiplier applied. "
         "Result: <b>€200,000 – €550,000</b> (floor value — zero revenue assumed)."),
        ("Lens 2: Comparable-Based Valuation",
         "At 5–8× ARR multiples (current market): €30K ARR → €240–400K; €100K ARR → €700K–1M; "
         "€500K ARR → €2.5–4M. Sloneek (closest CEE peer) raised €3.6M at ~€5–9M ARR."),
        ("Lens 3: Feature Depth Premium",
         "Agile integration (Jira+ADO bidirectional), SQL report builder, smart scheduling, "
         "multi-schema architecture — features exceeding typical price-tier competitors. "
         "Premium: 1.3–1.8× vs. IP value → <b>€260,000 – €990,000</b>."),
        ("Lens 4: Risk Adjustment",
         "Risk haircuts: minimal test coverage (−15%), AI-assisted quality variability (−10%), "
         "Hungarian-only UI (−10%). Offsetting: modern stack (+10%), clean RLS (+5%), active "
         "maintenance (+8%). Net: −12% adjustment."),
        ("Lens 5: Strategic Acquisition Premium",
         "Strategic acquirer (CEE HR roll-up, Jira-adjacent vendor) would pay 1.5–3× IP value "
         "for the agile integration module, enterprise workflow engine, or CEE market entry. "
         "Range: <b>€300,000 – €1,650,000</b>."),
    ]
    for lens_title, lens_desc in lenses:
        story.append(Paragraph(lens_title, styles["h3"]))
        story.append(Paragraph(lens_desc, styles["body"]))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Final Market Value Ranges", styles["h2"]))
    final_rows = [
        ["Scenario", "Range", "Central Estimate"],
        ["Pre-revenue IP sale", "€200K – €600K", "€380K"],
        ["Early customers (€30–100K ARR)", "€400K – €1,200K", "€700K"],
        ["Post-PMF (€200–500K ARR)", "€1.5M – €4.5M", "€3.0M"],
        ["Strategic acquisition", "€700K – €2,500K", "€1,500K"],
        ["Current state (unknown revenue)", "€350K – €900K", "€550K"],
    ]
    final_t = data_table(final_rows[0], final_rows[1:], styles,
                         col_widths=[170, 130, 130])
    n = len(final_rows)
    final_t.setStyle(TableStyle([
        ("BACKGROUND", (0, n-1), (-1, n-1), TABLE_HEADER),
        ("FONTNAME", (0, n-1), (-1, n-1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, n-1), (-1, n-1), white),
    ]))
    story.append(final_t)
    story.append(Spacer(1, 8))
    story.append(info_box(
        "<b>Central Estimate: €550,000</b> — assuming early traction, pre-growth stage, "
        "unknown revenue. A demonstrated €100K ARR trajectory would revise this to ~€700–1,000K. "
        "Strategic acquisition interest from a CEE HR tech player could push to €1–2M.",
        styles, bg=HexColor("#E0E7FF"), border=BRAND_ACCENT))
    story.append(PageBreak())

    # ── 10. Assumptions ───────────────────────────────────────────────────────
    story.append(Paragraph("10. Assumptions and Limitations", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Hard Evidence (Known)", styles["h2"]))
    known = [
        "Full source code: 170 files, 31,435 lines of TypeScript/TSX",
        "53 database migration files with complete schema history",
        "Complete changelog from v2.0.0 to v2.6.0+ with Jira ticket references",
        "17 Supabase edge functions with full implementation",
        "All npm dependencies with versions (60+ packages)",
        "Development timeline: 2026-03-07 to 2026-05-11 (~2 months)",
        "Governance documentation and versioning artifacts",
        "Architecture patterns: Supabase + React + TypeScript + Deno",
    ]
    for k in known:
        story.append(Paragraph(f"✓  {k}", styles["bullet"]))

    story.append(Paragraph("Inferred (Not Directly Observed)", styles["h2"]))
    inferred = [
        "Development effort (estimated from code volume, complexity signals, comparables)",
        "Rate assumptions (CEE market research, industry norms)",
        "Market comparables (public pricing pages, press releases)",
        "Revenue potential (pricing model based on comparable SaaS)",
        "Team composition (inferred from codebase breadth and complexity)",
    ]
    for i in inferred:
        story.append(Paragraph(f"~  {i}", styles["bullet"]))

    story.append(Paragraph("Unknown / Missing", styles["h2"]))
    missing = [
        "Revenue / ARR — no monetisation data; most dominant valuation variable",
        "User/tenant count — no telemetry or analytics integration visible",
        "Customer data — no CRM, support tickets, or user feedback data",
        "Payroll integration — absent; limits enterprise HR-suite evaluations",
        "SLA / uptime history — no monitoring or incident data",
        "Mobile app store status — Capacitor configured but no evidence of published apps",
    ]
    for m in missing:
        story.append(Paragraph(f"✗  {m}", styles["bullet"]))
    story.append(PageBreak())

    # ── 11. Next Steps ────────────────────────────────────────────────────────
    story.append(Paragraph("11. Recommended Next Steps", styles["h1"]))
    story.append(section_rule())

    next_steps = [
        ("For Cost Optimisation",
         ["Add automated test coverage (target 70%+ on conflictEngine, capacityEngine, smartSchedule)",
          "Replace 4-second DB polling with Supabase Realtime subscriptions",
          "Implement audit log as queue-backed system (not fire-and-forget)",
          "Introduce i18next for proper internationalisation (enables non-Hungarian markets)",
          "Resolve (supabase as any) type casts in conflict engine"]),
        ("For Product Sale / Acquisition / Fundraising",
         ["Establish measurable ARR (even €5–20K early revenue dramatically increases valuation credibility)",
          "Publish English-language version of product and landing page",
          "Obtain at least one referenceable enterprise customer (50+ employees)",
          "Commission security audit of RLS policies and edge function authentication",
          "Prepare data room: financials, technical architecture doc, customer list, IP ownership chain"]),
        ("For Roadmap Prioritisation",
         ["Payroll integration (Nexon/HR365 for CEE) — largest enterprise sales barrier",
          "Microsoft Teams notification connector — expands addressable market significantly",
          "SCIM/SSO — required for large enterprise procurement",
          "Protect Jira/ADO agile integration moat — no direct competitor at this price tier"]),
        ("For Technical Debt Reduction",
         ["Priority 1: Automated test suite (vitest configured but unused)",
          "Priority 2: Audit log reliability (fire-and-forget is a compliance risk)",
          "Priority 3: Replace polling with Realtime subscriptions",
          "Priority 4: i18n refactor for internationalisation",
          "Priority 5: Type-safe Supabase queries (remove (as any) casts)"]),
    ]
    for ns_title, ns_items in next_steps:
        story.append(Paragraph(ns_title, styles["h2"]))
        for item in ns_items:
            story.append(Paragraph(f"→  {item}", styles["bullet"]))
        story.append(Spacer(1, 6))
    story.append(PageBreak())

    # ── 12. Appendix ─────────────────────────────────────────────────────────
    story.append(Paragraph("12. Appendix", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("A. Database Table Inventory (Selected)", styles["h2"]))
    db_rows = [
        ["Table", "Module", "Purpose"],
        ["enterprise_workspaces", "Workspace", "Tenant workspace records"],
        ["enterprise_memberships", "Workspace", "User-workspace relations + base_working_hours"],
        ["enterprise_invitations", "Workspace", "Email-based invitations with token expiry"],
        ["leave_requests", "Leave", "6-status leave request records"],
        ["approval_decisions", "Leave", "Approval/rejection decisions per step"],
        ["leave_request_substitutes", "Leave", "Ordered substitute assignments"],
        ["enterprise_leave_types", "Config", "Custom leave type definitions"],
        ["enterprise_holidays", "Config", "Workspace holiday calendar"],
        ["enterprise_office_coverage_rules", "Config", "Multi-position/skill staffing rules"],
        ["enterprise_approval_chains", "Config", "Multi-step approval definitions"],
        ["enterprise_audit_events", "Audit", "Immutable audit trail (prev/new state JSON)"],
        ["enterprise_agile_issues", "Agile", "Cached Jira/ADO issue records"],
        ["enterprise_feature_catalog", "Permissions", "Recursive permission tree (parent_key)"],
        ["enterprise_quota_transactions", "Quota", "Leave quota debit/credit ledger"],
        ["tenant_calendar_settings", "Calendar", "Per-workspace filter config (JSONB)"],
    ]
    story.append(data_table(db_rows[0], db_rows[1:], styles,
                            col_widths=[150, 85, 215]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("B. Confidence Assessment", styles["h2"]))
    conf_rows = [
        ["Dimension", "Confidence", "Rationale"],
        ["Build effort estimate", "High (±20%)", "Full codebase available; changelog evidence"],
        ["Cost estimate (CEE)", "High (±25%)", "Market rate data available"],
        ["Cost estimate (WEU)", "Medium (±35%)", "Indirect evidence only"],
        ["Market value (pre-revenue)", "Medium (±40%)", "No revenue; comparable-based"],
        ["Market value (with revenue)", "Medium-High (±25%)", "Standard ARR multiples applicable"],
    ]
    story.append(data_table(conf_rows[0], conf_rows[1:], styles,
                            col_widths=[160, 110, 180]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("C. Comparable Acquisitions", styles["h2"]))
    acq_rows = [
        ["Target", "Acquirer", "Year", "Price", "Notes"],
        ["ReedGroup", "Alight Inc.", "2022", "$87M", "Absence mgmt, 50% Fortune 100"],
        ["AbsenceSoft", "Luminate Capital", "2024", "Undisclosed", "VC-backed leave mgmt"],
        ["Timetastic", "Citation Group", "2023", "Undisclosed", "$1.7M ARR; bootstrapped"],
        ["WorkForce Software", "ADP", "2024", "Undisclosed", "Major workforce platform"],
    ]
    story.append(data_table(acq_rows[0], acq_rows[1:], styles,
                            col_widths=[95, 100, 45, 85, 125]))
    story.append(Spacer(1, 10))

    story.append(light_rule())
    story.append(Paragraph(
        "<i>This report was produced by AI-assisted technical due-diligence combining direct "
        "repository inspection and external market research. It is for informational purposes "
        "and does not constitute financial advice. Report Version 1.0 — 2026-05-11.</i>",
        styles["caption"]))

    # ── Build with header/footer callbacks ────────────────────────────────────
    def first_page(canvas, doc):
        cover_page(doc, canvas,
                   "Software Valuation & Technical Due-Diligence Report",
                   "Szoftver Értékelési és Technikai Átvilágítási Jelentés",
                   "en", styles)

    def later_pages(canvas, doc):
        on_page(canvas, doc, "en")

    doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
    print(f"✓  Written: {filename}")

# ─── Hungarian report ─────────────────────────────────────────────────────────

def build_hu_report(filename):
    styles = make_styles()
    lang = "hu"

    doc = SimpleDocTemplate(
        filename, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=22*mm, bottomMargin=18*mm,
        title="Effectime Enterprise — Szoftver Értékelési Jelentés",
        author="MI-segített Technikai Átvilágítás",
        subject="Szoftver Értékelés és Piacelemzés",
    )

    story = []
    story.append(PageBreak())

    # ── TOC ───────────────────────────────────────────────────────────────────
    toc_items = [
        "1.  Vezetői összefoglaló",
        "2.  Termékrekonstrukció",
        "3.  Hatókör-lebontás",
        "4.  Módszertan",
        "5.  Csapatösszetétel",
        "6.  Ráfordítás-becslés",
        "7.  Költségbecslés",
        "8.  Piaci összehasonlítás",
        "9.  Piaci értékbecslés",
        "10. Feltételezések és korlátok",
        "11. Ajánlott következő lépések",
        "12. Függelék",
    ]
    story.append(Paragraph("Tartalomjegyzék", styles["h1"]))
    story.append(section_rule())
    for item in toc_items:
        story.append(Paragraph(item, styles["toc_item"]))
    story.append(PageBreak())

    # ── 1. Vezető összefoglaló ────────────────────────────────────────────────
    story.append(Paragraph("1. Vezető összefoglaló", styles["h1"]))
    story.append(section_rule())
    story.append(Paragraph(
        "Az Effectime Enterprise egy <b>multi-tenant, vállalati szintű HR szabadságkezelő és "
        "munkaerő-tervező SaaS platform</b>, amelyet a magyarországi/KKE-régiós KKV és közepes "
        "vállalati szegmensnek fejlesztettek. Teljes körű szabadsági kérelem életciklus-kezelést, "
        "többnézetes naptárat valós idejű idővonallal, erőforrás- és projekttervezést, agilis "
        "integrációt (Jira + Azure DevOps), egyéni riport-szerkesztőt SQL-móddal és mobilos "
        "támogatást nyújt Capacitoron keresztül.",
        styles["body"]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Kulcsmutatók", styles["h2"]))
    story.append(kpi_table([
        ("Forrásfájlok (.ts/.tsx)", "170"),
        ("Kódsorok", "31 435"),
        ("DB Migrációk", "53"),
        ("Edge Functions", "17"),
        ("Vállalati Komponensek", "77"),
        ("Fejlesztési időszak", "2 hónap"),
    ], styles))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Fejlesztési ráfordítás összefoglaló", styles["h2"]))
    story.append(data_table(
        ["Mérőszám", "Alacsony", "Legvalószínűbb", "Magas"],
        [
            ["Személyórák", "2 041", "3 051", "4 485"],
            ["Személyhónapok (160 ó/hó)", "12,8", "19,1", "28,0"],
            ["Naptári hónapok (3 fős csapat)", "5,5 hó", "7,5 hó", "11 hó"],
        ],
        styles,
        col_widths=[150, 90, 110, 90]
    ))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Fejlesztési költség összefoglaló", styles["h2"]))
    story.append(data_table(
        ["Forgatókönyv", "Alacsony", "Legvalószínűbb", "Magas"],
        [
            ["KKE / Magyarország (helyi csapat)", "118 000 €", "178 000 €", "245 000 €"],
            ["Nyugat-EU ügynökség", "265 000 €", "380 000 €", "520 000 €"],
            ["Vegyes KKE + WEU vezető", "165 000 €", "235 000 €", "330 000 €"],
        ],
        styles,
        col_widths=[160, 85, 110, 85]
    ))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Piaci értékbecslés összefoglaló", styles["h2"]))
    story.append(data_table(
        ["Forgatókönyv", "Tartomány", "Középponti becslés"],
        [
            ["Előbevételes IP eladás", "200 000 – 600 000 €", "380 000 €"],
            ["Korai ügyfelek (50–100 ezer € ÉBF)", "400 000 – 1 200 000 €", "700 000 €"],
            ["Növekedési szakasz (300–500 ezer € ÉBF)", "1,8M – 4,5M €", "3,0M €"],
            ["Stratégiai felvásárlás", "700 000 – 2 500 000 €", "1 500 000 €"],
            ["Jelenlegi állapot (ismeretlen bevétel)", "350 000 – 900 000 €", "550 000 €"],
        ],
        styles,
        col_widths=[175, 135, 120]
    ))
    story.append(Spacer(1, 8))
    story.append(info_box(
        "⚠  <b>Legnagyobb bizonytalansági tényező:</b> A bevételi/ÉBF adat nem elérhető a "
        "tárházban. Ez az egyetlen tényező dominálja leginkább a piaci értékelést. "
        "Egy 100 000 € ÉBF pályán a középponti becslés 550 000 €-ról ~700 000–1 000 000 €-ra "
        "emelkedne.",
        styles))
    story.append(PageBreak())

    # ── 2. Termékrekonstrukció ────────────────────────────────────────────────
    story.append(Paragraph("2. Termékrekonstrukció", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Technikai architektúra", styles["h2"]))
    arch_rows = [
        ["Réteg", "Technológia", "Verzió"],
        ["Frontend keretrendszer", "React + TypeScript + Vite", "18.3 / 5.8 / 5.4"],
        ["UI komponensek", "shadcn/ui (Radix UI) + Tailwind CSS", "3.4.17"],
        ["Animáció", "Framer Motion", "12.35"],
        ["Állapot / Adatlekérés", "TanStack Query", "v5.83"],
        ["Grafikonok", "Recharts", "2.15"],
        ["Virtualizáció", "@tanstack/react-virtual", "3.13"],
        ["Drag & Drop", "@dnd-kit", "6.3"],
        ["Mobil", "Capacitor (iOS + Android)", "8.2"],
        ["Űrlapok / Validáció", "React Hook Form + Zod", "7.6 / 3.25"],
        ["Backend / DB", "Supabase (PostgreSQL)", "2.98"],
        ["Edge Functions", "Deno (TypeScript)", "17 függvény"],
        ["Hitelesítés", "Supabase Auth + Google OAuth", "Egyéni aktiválás"],
        ["Agilis integráció", "Jira REST API v3 + Azure DevOps WIQL", "Kétirányú"],
        ["E-mail", "Lovable Email API (Mailgun)", "Tranzakciós"],
        ["Ütemezés", "pg_cron", "2 feladat"],
    ]
    story.append(data_table(arch_rows[0], arch_rows[1:], styles,
                            col_widths=[150, 190, 110]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Modulonkénti funkciórkép", styles["h2"]))
    modules = [
        ("Hitelesítés és személyazonosság", "Google OAuth + egyéni aktiválási kapu, OTP e-mail, fiók törlése (GDPR), admin panel"),
        ("Munkaterület és bérlés", "Multi-workspace, meghívó rendszer, azonnali tagok, szerepkör-kezelés, márkajelzés"),
        ("Szabadsági kérelem életciklus", "6 állapotú állapotgép, 2 lépéses benyújtás, helyettesítő-választó, melléklet feltöltés, kvóta nyomon követés"),
        ("Ütközés-motor", "Párhuzamos validálás: ünnepnapok, tiltott napok, napi szabályok, irodai lefedettség, önátfedés"),
        ("Kapacitás-motor", "Óra-alapú: base_working_hours × allokáció%, szabadság-levonás, projekt allokáció"),
        ("Naptár és idővonal", "3 nézet: havi / Absentify-idővonal (TanStack Virtual) / éves rács; dinamikus szűrő sáv drag&drop-pal"),
        ("Lefedettség-tervező", "Heti/havi igény vs. kínálat; smart batch ütemező algoritmus; képesség/szerepkör egyezés"),
        ("Jóváhagyási lánc", "Többlépéses konfigurálható láncok, eszkalációs szabályok, tömeges jóváhagyás/elutasítás"),
        ("Erőforrás-kezelés", "Projektek + Gantt + kapacitáshiány + kihasználtsági hőtérkép + forgatókönyv-tervező + pénzügyi panel"),
        ("Agilis integráció", "Jira + ADO: backlog böngésző, issue visszaírás, kapacitás illeszkedés, what-if szimuláció"),
        ("Riport-szerkesztő", "Vizuális konfig + SQL mód + élő előnézet + ütemezett kézbesítés; irányítópultra rögzített widgetek"),
        ("E-mail infrastruktúra", "Auth hook, tranzakciós sablonok, e-mail sor, visszapattanó/leiratkozás kezelés, ütemezett riportok"),
        ("Értesítések", "Alkalmazáson belüli értesítések, olvasott/olvasatlan, eseményenkénti preferenciák, iCal feliratkozás"),
        ("Audit és megfelelőség", "Megváltoztathatatlan audit napló, GDPR fiók törlése, CSV export, export feladatok nyomon követése"),
    ]
    feat_rows = [[Paragraph(m, styles["table_cell"]), Paragraph(d, styles["table_cell"])] for m, d in modules]
    feat_headers = [Paragraph("Modul", styles["table_header"]), Paragraph("Főbb képességek", styles["table_header"])]
    feat_table = Table([feat_headers] + feat_rows, colWidths=[130, 320], repeatRows=1)
    feat_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TABLE_HEADER),
        ("TEXTCOLOR", (0, 0), (-1, 0), white),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, BORDER_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        *[("BACKGROUND", (0, i+1), (-1, i+1), TABLE_ROW2 if i % 2 == 0 else TABLE_ROW1) for i in range(len(feat_rows))],
    ]))
    story.append(feat_table)
    story.append(PageBreak())

    # ── 3. Hatókör-lebontás ───────────────────────────────────────────────────
    story.append(Paragraph("3. Hatókör-lebontás", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Komplexitási értékelések területenként", styles["h2"]))
    comp_rows = [
        ["Funkcióterület", "Komplexitás", "Rejtett költség mozgatók"],
        ["Hitelesítés", "Közepes", "Egyéni Google OAuth aktiválási kapu (300+ sor backend logika); legacy bypass szabályok"],
        ["Multi-Tenant Architektúra", "Magas", "RLS szabályok 30+ táblán; séma felosztás (syncfolk/plannermaster); dinamikus jogosultsági fa"],
        ["Szabadsági kérelem életciklus", "Magas", "6 állapotú gép; kvóta tranzakció hatókör-hiba (v2.6-ban javítva); helyettesítő rendezés"],
        ["Ütközés-motor", "Közepes-Magas", "6 tábla párhuzamos lekérés; multi-pozíció VAGY szemantika; skaláris/tömb oszlop tartalék"],
        ["Kapacitás-motor", "Közepes", "Óra-matematika; allokáció %; szabadság-levonás; csendes hiba kockázat (javítva)"],
        ["Naptár és idővonal", "Magas", "TanStack Virtual (200+ sor); lefedettség-tervező versenyhelyzetek; szűrő-perzisztencia"],
        ["Jóváhagyási lánc", "Közepes", "Többlépéses konfig; eszkalációs időzítők; szerepkör-alapú útvonalválasztás"],
        ["Erőforrás-kezelés", "Magas", "Gantt drag-resize; forgatókönyv-tervező; pénzügyek; kihasználtsági hőtérkép"],
        ["Agilis integráció", "Nagyon Magas", "Jira REST v3 + ADO WIQL egy proxy-ban; üres patch védelem; alap-URL normalizálás"],
        ["Riport-szerkesztő", "Magas", "SQL mód munkaterület-hatókörű hozzáférés-ellenőrzéssel; élő előnézet; ütemezett kron kézbesítés"],
        ["E-mail infrastruktúra", "Magas", "Auth hook elfogás; visszapattanó/tiltólistás; React Email sablonok; sor újrapróbálkozás logika"],
    ]
    story.append(data_table(comp_rows[0], comp_rows[1:], styles,
                            col_widths=[130, 80, 240]))
    story.append(PageBreak())

    # ── 4. Módszertan ─────────────────────────────────────────────────────────
    story.append(Paragraph("4. Módszertan", styles["h1"]))
    story.append(section_rule())
    methods = [
        ("Alulról felfelé becslés", "A 10 fő funkcióterületet összetevőkre bontottuk. Ráfordítás becsülve: kódsorok száma, DB táblák, API végpontok, UI komplexitás, changelog-ban szereplő edge case-ek."),
        ("Analóg becslés", "Összehasonlítható termékek (Calamari, Timetastic, Sloneek) referenciapontként. Hasonló HR SaaS startupok nyilvános bejegyzései szerint MVP szabadságkezelők 6–18 hónapot igényelnek."),
        ("Hárompontos PERT", "Optimista/Legvalószínűbb/Pesszimista becsülések területenként. Képlet: E = (O + 4M + P) / 6."),
        ("Kód-volumen alap", "31 435 sor ÷ 120 sor/nap = ~262 fejlesztői nap. × 2,2 terhelési szorzó = ~576 nap = ~2 880 személyóra. Megegyezik az alulról felfelé épített becsléssel."),
    ]
    for title, desc in methods:
        story.append(Paragraph(title, styles["h3"]))
        story.append(Paragraph(desc, styles["body"]))
        story.append(light_rule())
    story.append(PageBreak())

    # ── 5. Csapatösszetétel ───────────────────────────────────────────────────
    story.append(Paragraph("5. Csapatösszetétel", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Szükséges szerepkörök", styles["h2"]))
    role_rows = [
        ["Szerepkör", "Miért szükséges", "Fázis", "Arány"],
        ["Senior Full-Stack Mérnök", "Architektúra, Supabase séma, RLS, edge functions, üzleti logika", "Mind", "35%"],
        ["Közép Frontend Mérnök", "React komponensek, Recharts, DnD Kit, Framer Motion, reszponzív UI", "2–8", "30%"],
        ["Backend / DB Mérnök", "PostgreSQL séma, RLS szabályok, SECURITY DEFINER, migrációk", "1–3, 6–8", "15%"],
        ["UX/UI Tervező", "Információarchitektúra, komponenskönyvtár, mobil elrendezések", "1–2, 4–5", "10%"],
        ["Termékmenedzser", "Követelmények, sprint-tervezés, backlog-priorizálás", "Mind", "7%"],
        ["QA Mérnök", "Manuális tesztelés, regressziós tesztelés, böngésző/eszköz tesztelés", "3–8", "3%"],
    ]
    story.append(data_table(role_rows[0], role_rows[1:], styles,
                            col_widths=[130, 170, 70, 60]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Szállítási csapatlehetőségek", styles["h2"]))
    teams = [
        ("Karcsú csapat (3 fő, 7–10 hónap)",
         "1× Senior Full-Stack (vezető, 100%) · 1× Közép Frontend (100%) · 0,5× UX/UI Tervező (50%)",
         "Legalacsonyabb költség; PM/QA a vezető + érdekelt fél végzi. Bootstrappelt termékhez ideális."),
        ("Kiegyensúlyozott csapat (5 fő, 5–7 hónap)",
         "1× Senior Full-Stack · 1× Közép Frontend · 1× Backend/DB · 0,5× UX/UI · 0,5× PM",
         "Ajánlott seed-szakaszos startupnak. Párhuzamos frontend/backend pályák. Ésszerű sebesség."),
        ("Vállalati szállítási csapat (8 fő, 4–5 hónap)",
         "2× Senior · 2× Közép Frontend · 1× Backend/DB · 1× UX/UI · 1× PM · 1× QA",
         "Maximum sebesség. Ügynökségi szállításhoz vagy jól finanszírozott sprinthez alkalmas."),
    ]
    for t_name, t_comp, t_notes in teams:
        story.append(info_box(f"<b>{t_name}</b><br/>{t_comp}<br/><i>{t_notes}</i>", styles))
    story.append(PageBreak())

    # ── 6. Ráfordítás-becslés ─────────────────────────────────────────────────
    story.append(Paragraph("6. Ráfordítás-becslés", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Területenkénti bontás (PERT)", styles["h2"]))
    effort_rows = [
        ["Funkcióterület", "Opt. (ó)", "Legv. (ó)", "Pesz. (ó)", "PERT (ó)"],
        ["Hitelesítés és személyazonosság", "80", "120", "180", "122"],
        ["Munkaterület és bérlés", "120", "180", "260", "183"],
        ["Szabadsági kérelem életciklus", "180", "260", "380", "263"],
        ["Ütközés-motor", "60", "90", "140", "92"],
        ["Kapacitás-motor", "50", "75", "120", "77"],
        ["Naptár és idővonal nézetek", "200", "290", "420", "293"],
        ["Jóváhagyási lánc és eszkaláció", "60", "90", "140", "92"],
        ["Erőforrás-kezelés", "180", "260", "380", "263"],
        ["Agilis integráció", "140", "200", "300", "203"],
        ["Riport-szerkesztő és riportálás", "120", "180", "270", "183"],
        ["E-mail infrastruktúra", "90", "130", "200", "133"],
        ["Admin, profil, landing", "60", "90", "140", "92"],
        ["Mobil (Capacitor) + csiszolás", "60", "90", "130", "90"],
        ["DB séma + RLS + migrációk", "80", "120", "180", "122"],
        ["Smart Schedule algoritmus", "40", "60", "90", "61"],
        ["Jogosultsági rendszer (dinamikus fa)", "50", "75", "120", "77"],
        ["Részösszeg (kódolás)", "1 570", "2 310", "3 450", "2 347"],
        ["+ 30% terhelés (QA, PM, design, deploy)", "471", "693", "1 035", "704"],
        ["ÖSSZESEN", "2 041", "3 003", "4 485", "3 051"],
    ]
    t = data_table(effort_rows[0], effort_rows[1:], styles,
                   col_widths=[165, 62, 68, 72, 62])
    n = len(effort_rows)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, n-2), (-1, n-2), HexColor("#E0E7FF")),
        ("FONTNAME", (0, n-2), (-1, n-2), "Helvetica-Bold"),
        ("BACKGROUND", (0, n-1), (-1, n-1), TABLE_HEADER),
        ("FONTNAME", (0, n-1), (-1, n-1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, n-1), (-1, n-1), white),
    ]))
    story.append(t)
    story.append(PageBreak())

    # ── 7. Költségbecslés ─────────────────────────────────────────────────────
    story.append(Paragraph("7. Költségbecslés", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("KKE / Magyarország díjszabási feltételezések (2025–2026)", styles["h2"]))
    rate_rows = [
        ["Szerepkör", "Junior (€/ó)", "Közép (€/ó)", "Senior (€/ó)"],
        ["Full-Stack Mérnök", "15–22 €", "28–40 €", "42–65 €"],
        ["Frontend Mérnök", "14–20 €", "25–38 €", "38–60 €"],
        ["Backend / DB Mérnök", "15–22 €", "28–42 €", "42–65 €"],
        ["UX/UI Tervező", "14–20 €", "24–36 €", "36–55 €"],
        ["Termékmenedzser", "18–25 €", "32–45 €", "45–70 €"],
        ["QA Mérnök", "12–18 €", "22–32 €", "32–48 €"],
    ]
    story.append(data_table(rate_rows[0], rate_rows[1:], styles,
                            col_widths=[150, 90, 90, 90]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Részletes költségmodell — Legvalószínűbb (KKE-árak)", styles["h2"]))
    cost_rows = [
        ["Szerepkör", "Arány", "Órák", "Díj", "Költség"],
        ["Senior Full-Stack Mérnök", "35%", "1 068", "52 €/ó", "55 536 €"],
        ["Közép-szintű Frontend Mérnök", "30%", "915", "33 €/ó", "30 195 €"],
        ["Backend / DB Mérnök", "15%", "458", "48 €/ó", "21 984 €"],
        ["UX/UI Tervező", "10%", "305", "30 €/ó", "9 150 €"],
        ["Termékmenedzser", "7%", "214", "38 €/ó", "8 132 €"],
        ["QA Mérnök", "3%", "91", "28 €/ó", "2 548 €"],
        ["Közvetlen munkaerő", "", "3 051", "", "127 545 €"],
        ["Terhelés (25%)", "", "", "", "31 886 €"],
        ["Tartalék (15%)", "", "", "", "19 132 €"],
        ["ÖSSZESEN", "", "", "", "178 563 €"],
    ]
    ct = data_table(cost_rows[0], cost_rows[1:], styles,
                    col_widths=[160, 55, 65, 65, 85])
    n = len(cost_rows)
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0, n-4), (-1, n-4), HexColor("#E0E7FF")),
        ("FONTNAME", (0, n-4), (-1, n-4), "Helvetica-Bold"),
        ("BACKGROUND", (0, n-1), (-1, n-1), TABLE_HEADER),
        ("FONTNAME", (0, n-1), (-1, n-1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, n-1), (-1, n-1), white),
    ]))
    story.append(ct)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Költségtartományok forgatókönyvenként", styles["h2"]))
    scenario_rows = [
        ["Forgatókönyv", "Alacsony", "Legvalószínűbb", "Magas"],
        ["KKE / Magyarország (karcsú csapat)", "118 000 €", "178 000 €", "245 000 €"],
        ["Nyugat-EU ügynökség", "265 000 €", "380 000 €", "520 000 €"],
        ["Vegyes KKE + WEU vezető", "165 000 €", "235 000 €", "330 000 €"],
    ]
    story.append(data_table(scenario_rows[0], scenario_rows[1:], styles,
                            col_widths=[165, 85, 110, 85]))
    story.append(PageBreak())

    # ── 8. Piaci összehasonlítás ──────────────────────────────────────────────
    story.append(Paragraph("8. Piaci összehasonlítás", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Összehasonlítható termékek", styles["h2"]))
    comp_prod_rows = [
        ["Termék", "Székhely", "Ár/Fő/Hó", "Fő megjegyzések az Effectime-hoz képest"],
        ["Calamari", "Lengyelország", "2,50–5,00 €", "Legközelebbi KKE kortárs; nincs Agilis integráció"],
        ["Timetastic", "UK", "1,50–2,50 $", "Sokkal egyszerűbb; 2023-ban felvásárolva; 1,7M $ ÉBF"],
        ["Absence.io", "Németország", "3,50–5,00 €", "EU-fókuszú, GDPR; hasonló hatókör"],
        ["Factorial HR", "Spanyolország", "5–8 €", "Szélesebb HR (bérszámfejtés); kevesebb agilis mélység"],
        ["Personio", "Németország", "5–25 €", "Vállalati, bérszámfejtés; 8,5 milliárd € csúcsértékelés"],
        ["Sloneek", "Cseh/KKE", "~5–10 € becslés", "Legközelebbi KKE versenytárs; magyar UI; 3,6M € bevonva 2024"],
        ["BambooHR", "USA", "10–25 $ becslés", "Észak-amerikai KKV; erős márka"],
        ["Teamdeck", "Lengyelország", "3,99 $", "Erőforrás + szabadság; összességében legközelebbi"],
    ]
    story.append(data_table(comp_prod_rows[0], comp_prod_rows[1:], styles,
                            col_widths=[75, 70, 75, 230]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("HR SaaS értékelési szorzók (2024–2026)", styles["h2"]))
    mult_data = [
        ["Növekedési ütem", "Tipikus ÉBF szorzó", "Példák"],
        [">100% ÉvÉv (korai szakasz)", "10–15× ÉBF", "Rippling: 29×; HiBob: 22×"],
        ["50–100% ÉvÉv", "7–10× ÉBF", "Personio csúcs: 24×"],
        ["20–50% ÉvÉv (érett SaaS)", "5–8× ÉBF", "Deputy: ~11× (2022)"],
        ["<20% ÉvÉv (stabil)", "3–5× ÉBF", "Bootstrappelt SaaS medián: 4,8×"],
        ["M&A medián (2024)", "4,1× ÉBF", "SaaS Capital Index"],
        ["M&A medián (2025)", "3,1–3,8× ÉBF", "Jelenlegi üzleti környezet"],
    ]
    story.append(data_table(mult_data[0], mult_data[1:], styles,
                            col_widths=[145, 115, 190]))
    story.append(PageBreak())

    # ── 9. Piaci értékbecslés ─────────────────────────────────────────────────
    story.append(Paragraph("9. Piaci értékbecslés", styles["h1"]))
    story.append(section_rule())

    lenses = [
        ("1. szempont: Csere-/IP-érték",
         "Fejlesztési költség KKE-árakon: 145 000–245 000 €. IP-eszközként 1,5–2,5× szorzó. "
         "Eredmény: <b>200 000 – 550 000 €</b> (minimumérték — nulla bevétel feltételezve)."),
        ("2. szempont: Összehasonlítható-alapú értékelés",
         "5–8× ÉBF szorzókon: 30 000 € ÉBF → 240–400 000 €; 100 000 € ÉBF → 700K–1M €; "
         "500 000 € ÉBF → 2,5–4M €. Sloneek (legközelebbi KKE kortárs) 3,6M €-t vont be 2024-ben."),
        ("3. szempont: Funkcióélység prémium",
         "Agilis integráció (Jira+ADO kétirányú), SQL riport-szerkesztő, smart ütemező, "
         "multi-séma architektúra — az árkategóriájában meghaladja a tipikus versenytársakat. "
         "Prémium: 1,3–1,8× vs. IP érték → <b>260 000 – 990 000 €</b>."),
        ("4. szempont: Kockázati kiigazítás",
         "Kockázati levonások: minimális tesztlefedettség (−15%), MI-segített minőségi "
         "variabilitás (−10%), csak magyar UI (−10%). Ellensúlyozás: modern stack (+10%), "
         "tiszta RLS (+5%), aktív karbantartás (+8%). Nettó: −12% kiigazítás."),
        ("5. szempont: Stratégiai felvásárlási prémium",
         "KKE HR tech konszolidátor vagy Jira-szomszédos gyártó 1,5–3× IP értéket fizetne. "
         "Tartomány: <b>300 000 – 1 650 000 €</b>."),
    ]
    for lens_title, lens_desc in lenses:
        story.append(Paragraph(lens_title, styles["h3"]))
        story.append(Paragraph(lens_desc, styles["body"]))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Végső piaci értéktartományok", styles["h2"]))
    final_rows = [
        ["Forgatókönyv", "Tartomány", "Középponti becslés"],
        ["Előbevételes IP eladás", "200K – 600K €", "380 000 €"],
        ["Korai ügyfelek (30–100 ezer € ÉBF)", "400K – 1 200K €", "700 000 €"],
        ["PMF után (200–500 ezer € ÉBF)", "1,5M – 4,5M €", "3 000 000 €"],
        ["Stratégiai felvásárlás", "700K – 2 500K €", "1 500 000 €"],
        ["Jelenlegi állapot (ismeretlen bevétel)", "350K – 900K €", "550 000 €"],
    ]
    final_t = data_table(final_rows[0], final_rows[1:], styles,
                         col_widths=[175, 130, 125])
    n = len(final_rows)
    final_t.setStyle(TableStyle([
        ("BACKGROUND", (0, n-1), (-1, n-1), TABLE_HEADER),
        ("FONTNAME", (0, n-1), (-1, n-1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, n-1), (-1, n-1), white),
    ]))
    story.append(final_t)
    story.append(Spacer(1, 8))
    story.append(info_box(
        "<b>Középponti becslés: 550 000 €</b> — korai trakció, növekedési szakasz előtt, "
        "ismeretlen bevétel feltételezve. Egy igazolt 100 000 € ÉBF pálya ezt ~700 000–1 000 000 €-ra "
        "módosítaná. KKE HR tech szereplő stratégiai felvásárlási érdeklődése 1–2M €-ig tolná.",
        styles, bg=HexColor("#E0E7FF"), border=BRAND_ACCENT))
    story.append(PageBreak())

    # ── 10. Feltételezések ────────────────────────────────────────────────────
    story.append(Paragraph("10. Feltételezések és korlátok", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("Kemény bizonyítékok (Ismert)", styles["h2"]))
    known = [
        "Teljes forráskód: 170 fájl, 31 435 TypeScript/TSX sor",
        "53 adatbázis-migrációs fájl teljes sémaelőzményekkel",
        "Teljes changelog v2.0.0-tól v2.6.0+-ig Jira jegy hivatkozásokkal",
        "17 Supabase edge function teljes megvalósítással",
        "Összes npm függőség verziókkal (60+ csomag)",
        "Fejlesztési időszak: 2026-03-07 – 2026-05-11 (~2 hónap)",
        "Governance dokumentáció és verziókezelési műtermékek",
    ]
    for k in known:
        story.append(Paragraph(f"✓  {k}", styles["bullet"]))

    story.append(Paragraph("Ismeretlen / Hiányzó", styles["h2"]))
    missing = [
        "Bevétel / ÉBF — nincs monetizációs adat; legtöbb hatású értékelési változó",
        "Felhasználói/bérlői szám — nincs telemetria vagy analitika integráció látható",
        "Ügyfélszám — nincs CRM, support jegyek vagy felhasználói visszajelzési adat",
        "Bérszámfejtési integráció — hiányzik; korlátozza a vállalati HR csomag értékeléseket",
        "SLA / üzemidő előzmény — nincs monitoring vagy incidensadat",
        "Mobilalkalmazás terjesztési állapota — Capacitor konfigurálva, de nincs közzétett alkalmazás bizonyíték",
    ]
    for m in missing:
        story.append(Paragraph(f"✗  {m}", styles["bullet"]))
    story.append(PageBreak())

    # ── 11. Következő lépések ─────────────────────────────────────────────────
    story.append(Paragraph("11. Ajánlott következő lépések", styles["h1"]))
    story.append(section_rule())

    next_steps = [
        ("Fejlesztési költség optimalizáláshoz",
         ["Automatizált tesztlefedettség hozzáadása (cél: 70%+ az conflictEngine, capacityEngine, smartSchedule könyvtárakon)",
          "4 másodperces DB lekérdezési intervallumok cseréje Supabase Realtime feliratkozásokra",
          "Audit log megvalósítása sor-alapú rendszerként (nem fire-and-forget)",
          "i18next bevezetése a megfelelő internacionalizációhoz",
          "(supabase as any) típusú kasztolások feloldása az ütközés-motorban"]),
        ("Termék eladáshoz / Felvásárláshoz / Tőkebevonáshoz",
         ["Mérhető ÉBF megteremtése (még 5–20 ezer € korai bevétel is drasztikusan növeli a hitelességet)",
          "Angol nyelvű verzió közzététele a termékből és landing oldalból",
          "Legalább egy referenciálható vállalati ügyfél megszerzése (50+ alkalmazott)",
          "RLS szabályok és edge function hitelesítés biztonsági auditjának megrendelése",
          "Adatszoba előkészítése: pénzügyek, technikai architektúra dokumentum, IP tulajdonjog"]),
        ("Ütemterv priorizáláshoz",
         ["Bérszámfejtési integráció (Nexon/HR365 a KKE-nak) — legnagyobb vállalati értékesítési akadály",
          "Microsoft Teams értesítési összekötő — bővíti a megcímezhető piacot",
          "SCIM/SSO — nagy vállalati közbeszerzéshez szükséges",
          "Jira/ADO agilis integráció versenyelőny védelme — egyetlen közvetlen versenytárs sem kínálja ezen az áron"]),
    ]
    for ns_title, ns_items in next_steps:
        story.append(Paragraph(ns_title, styles["h2"]))
        for item in ns_items:
            story.append(Paragraph(f"→  {item}", styles["bullet"]))
        story.append(Spacer(1, 6))
    story.append(PageBreak())

    # ── 12. Függelék ──────────────────────────────────────────────────────────
    story.append(Paragraph("12. Függelék", styles["h1"]))
    story.append(section_rule())

    story.append(Paragraph("A. Összehasonlítható termékek mátrixa", styles["h2"]))
    comp_full = [
        ["Termék", "Székhely", "Fókusz", "Ár/Fő/Hó", "Functiók az Effectime-hoz képest"],
        ["Calamari", "Lengyelország", "Szabadság + Jelenléti", "2,50–5 €", "Hasonló hatókör, nincs Agilis"],
        ["Timetastic", "UK", "Csak szabadság", "1,50–2,50 $", "Sokkal egyszerűbb, felvásárolva"],
        ["Absence.io", "Németország", "Szabadság + Szervezet", "3,50–5 €", "EU pozicionálás"],
        ["Factorial", "Spanyolország", "Teljes HR", "5–8 €", "Bérszámfejtés; kevesebb agilis"],
        ["Personio", "Németország", "Teljes HR/Bérszámfejtés", "5–25 €", "Vállalati; bérszámfejtés"],
        ["Float", "Ausztrália", "Csak erőforrás", "6–12 $", "Nincs szabadságkezelés"],
        ["Teamdeck", "Lengyelország", "Erőforrás + szabadság", "3,99 $", "Legközelebbi összehasonlítható"],
        ["Sloneek", "Cseh/KKE", "Teljes HR", "~5–10 € becslés", "Legközelebbi KKE; 3,6M € 2024-ben"],
    ]
    story.append(data_table(comp_full[0], comp_full[1:], styles,
                            col_widths=[65, 68, 85, 60, 162]))
    story.append(Spacer(1, 10))

    story.append(Paragraph("B. Megbízhatóság értékelése", styles["h2"]))
    conf_rows = [
        ["Dimenzió", "Megbízhatóság", "Indoklás"],
        ["Fejlesztési ráfordítás becslés", "Magas (±20%)", "Teljes kódbázis elérhető; changelog bizonyítékok"],
        ["Költségbecslés (KKE)", "Magas (±25%)", "Piaci díjadatok elérhetők"],
        ["Költségbecslés (Nyugat-EU)", "Közepes (±35%)", "Csak közvetett bizonyíték"],
        ["Piaci érték (előbevételes)", "Közepes (±40%)", "Nincs bevételi adat; összehasonlítható-alapú"],
        ["Piaci érték (bevétellel)", "Közepes-Magas (±25%)", "Szabványos ÉBF szorzók alkalmazhatók"],
    ]
    story.append(data_table(conf_rows[0], conf_rows[1:], styles,
                            col_widths=[155, 115, 180]))
    story.append(Spacer(1, 10))

    story.append(light_rule())
    story.append(Paragraph(
        "<i>Ezt a jelentést MI-segített technikai átvilágítási elemzéssel készítettük, "
        "közvetlen tárházinspekció és külső piackutatás kombinálásával. Tájékoztató célra "
        "készült, nem minősül pénzügyi tanácsadásnak. Jelentés verzió 1.0 — 2026-05-11.</i>",
        styles["caption"]))

    # ── Build ─────────────────────────────────────────────────────────────────
    def first_page(canvas, doc):
        cover_page(doc, canvas,
                   "Software Valuation & Technical Due-Diligence Report",
                   "Szoftver Értékelési és Technikai Átvilágítási Jelentés",
                   "hu", styles)

    def later_pages(canvas, doc):
        on_page(canvas, doc, "hu")

    doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
    print(f"✓  Written: {filename}")


if __name__ == "__main__":
    base = "/home/user/effectime-app-enterprise-a95029a1"
    build_en_report(f"{base}/valuation-report-en.pdf")
    build_hu_report(f"{base}/valuation-report-hu.pdf")
    print("\nAll reports generated successfully.")
