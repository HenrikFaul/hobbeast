from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Flowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(r"C:\Work\Expericentre")
OUTPUT = ROOT / "versioning" / "19082502_v1.12.0_community_evidence_and_social_graph_business_request_summary.pdf"

INK = colors.HexColor("#123528")
DEEP = colors.HexColor("#08261B")
LIME = colors.HexColor("#D6FF43")
CORAL = colors.HexColor("#FF8870")
LAVENDER = colors.HexColor("#C8B5FF")
CREAM = colors.HexColor("#F8F5ED")
MUTED = colors.HexColor("#5E6B63")
LINE = colors.HexColor("#D7DDD6")
WHITE = colors.white


def register_fonts():
    regular_candidates = [
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path(r"C:\Windows\Fonts\calibri.ttf"),
    ]
    bold_candidates = [
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
        Path(r"C:\Windows\Fonts\calibrib.ttf"),
    ]
    regular = next(path for path in regular_candidates if path.exists())
    bold = next(path for path in bold_candidates if path.exists())
    pdfmetrics.registerFont(TTFont("HobbeastSans", str(regular)))
    pdfmetrics.registerFont(TTFont("HobbeastSansBold", str(bold)))


register_fonts()


class CommunityMark(Flowable):
    def __init__(self, width=38 * mm, height=23 * mm):
        super().__init__()
        self.width = width
        self.height = height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(INK)
        c.roundRect(0, 0, self.width, self.height, 6 * mm, fill=1, stroke=0)
        center_x = self.width / 2
        base_y = 6 * mm
        positions = [center_x - 9 * mm, center_x, center_x + 9 * mm]
        fills = [LIME, CORAL, LAVENDER]
        for index, (x, fill) in enumerate(zip(positions, fills)):
            c.setFillColor(fill)
            c.circle(x, base_y + (7 if index == 1 else 5) * mm, 2.5 * mm, fill=1, stroke=0)
            c.roundRect(x - 3.5 * mm, base_y, 7 * mm, (6.5 if index == 1 else 5) * mm, 2.2 * mm, fill=1, stroke=0)
        c.setStrokeColor(WHITE)
        c.setLineWidth(1.4 * mm)
        c.arc(center_x - 15 * mm, base_y - 2 * mm, center_x + 15 * mm, base_y + 17 * mm, 15, 150)
        c.restoreState()


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverKicker",
    fontName="HobbeastSansBold",
    fontSize=9,
    leading=11,
    textColor=LIME,
    uppercase=True,
    spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="CoverTitle",
    fontName="HobbeastSansBold",
    fontSize=27,
    leading=28.5,
    textColor=WHITE,
    spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="CoverLead",
    fontName="HobbeastSans",
    fontSize=12,
    leading=17,
    textColor=colors.HexColor("#E9F0EA"),
    spaceAfter=14,
))
styles.add(ParagraphStyle(
    name="H1x",
    fontName="HobbeastSansBold",
    fontSize=21,
    leading=24,
    textColor=INK,
    spaceAfter=11,
))
styles.add(ParagraphStyle(
    name="H2x",
    fontName="HobbeastSansBold",
    fontSize=13,
    leading=16,
    textColor=INK,
    spaceBefore=7,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="Bodyx",
    fontName="HobbeastSans",
    fontSize=9.3,
    leading=13.3,
    textColor=INK,
    spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="Smallx",
    fontName="HobbeastSans",
    fontSize=7.8,
    leading=10.5,
    textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="Metric",
    fontName="HobbeastSansBold",
    fontSize=20,
    leading=22,
    textColor=INK,
    alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    name="MetricLabel",
    fontName="HobbeastSans",
    fontSize=7.5,
    leading=9.5,
    textColor=MUTED,
    alignment=TA_CENTER,
))
styles.add(ParagraphStyle(
    name="CardTitle",
    fontName="HobbeastSansBold",
    fontSize=10.2,
    leading=13,
    textColor=INK,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="CardBody",
    fontName="HobbeastSans",
    fontSize=8.3,
    leading=11.6,
    textColor=INK,
))
styles.add(ParagraphStyle(
    name="Footer",
    fontName="HobbeastSans",
    fontSize=7.2,
    leading=9,
    textColor=MUTED,
))


def p(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"<font color='#FF8870'>•</font>&nbsp;&nbsp;{text}", styles["Bodyx"])


def section_label(text):
    table = Table([[p(text.upper(), "Smallx")]], colWidths=[42 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIME),
        ("TEXTCOLOR", (0, 0), (-1, -1), INK),
        ("BOX", (0, 0), (-1, -1), 0, LIME),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def metric(value, label, fill):
    table = Table([[p(value, "Metric")], [p(label, "MetricLabel")]], colWidths=[31 * mm], rowHeights=[12 * mm, 12 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.Color(fill.red * .8, fill.green * .8, fill.blue * .8)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def card(title, body, fill=CREAM):
    table = Table([[p(title, "CardTitle")], [p(body, "CardBody")]], colWidths=[77 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fill),
        ("BOX", (0, 0), (-1, -1), 0.65, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    if doc.page > 1:
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(18 * mm, height - 14 * mm, width - 18 * mm, height - 14 * mm)
        canvas.setFont("HobbeastSansBold", 7.4)
        canvas.setFillColor(INK)
        canvas.drawString(18 * mm, height - 10.8 * mm, "HOBBEAST · v1.12.0")
        canvas.setFont("HobbeastSans", 7.2)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(width - 18 * mm, height - 10.8 * mm, "Community Evidence & Social Graph")
    canvas.setFont("HobbeastSans", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, "Change ID 19082502 · 2026-08-25")
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"{doc.page}")
    canvas.restoreState()


doc = SimpleDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    leftMargin=18 * mm,
    rightMargin=18 * mm,
    topMargin=20 * mm,
    bottomMargin=16 * mm,
    title="Hobbeast v1.12.0 Community Evidence and Social Graph",
    author="Hobbeast",
    subject="Business request and release summary",
)

story = []

# Cover
cover = Table([
    [CommunityMark()],
    [p("KÖZÖSSÉG · BIZONYÍTÉK · FOLYTONOSSÁG", "CoverKicker")],
    [p("Hobbeast v1.12.0", "CoverTitle")],
    [p("Amit szeretsz,<br/><font color='#D6FF43'>hozd közénk.</font>", "CoverTitle")],
    [p(
        "Három emberből közösségi jel. Megosztható hobbikból közös élmény. "
        "Lektorált szakirodalomból biztonságosan forgatható, elmenthető gondolatok.",
        "CoverLead",
    )],
    [Table([
        [p("30", "Metric"), p("96", "Metric"), p("447", "Metric")],
        [p("reviewed starter claim", "MetricLabel"), p("exact topic relation", "MetricLabel"), p("passing unit test", "MetricLabel")],
    ], colWidths=[45 * mm] * 3, style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F2F5E8")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#A7B3A9")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CAD2CB")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))],
    [Spacer(1, 5 * mm)],
    [p("BUSINESS REQUEST SUMMARY · CHANGE ID 19082502", "Smallx")],
], colWidths=[160 * mm])
cover.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, -1), DEEP),
    ("LEFTPADDING", (0, 0), (-1, -1), 13 * mm),
    ("RIGHTPADDING", (0, 0), (-1, -1), 13 * mm),
    ("TOPPADDING", (0, 0), (-1, 0), 12 * mm),
    ("BOTTOMPADDING", (0, -1), (-1, -1), 12 * mm),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
]))
story.extend([Spacer(1, 18 * mm), cover, PageBreak()])

# Request and reconciliation
story.extend([
    section_label("01 · Kérés és értelmezés"),
    Spacer(1, 5 * mm),
    p("A feladat", "H1x"),
    p(
        "A meglévő alkalmazás szerkezetének megtartása mellett a márkának világosan nagyobb "
        "társaságot, közös élményt, folytonos közösséget és kölcsönös támogatást kell sugároznia. "
        "A hobbikat nem önismereti tesztként, hanem megosztható belépési pontként kezeljük: hozd, "
        "amit szeretsz, vagy próbáld ki valaki mellett.",
    ),
    bullet("A logó két ember helyett három emberből és közös összekötő ívből áll."),
    bullet("A Circle és Hub felület általánosan elérhető, de a biztonsági és kill-switch kapuk megmaradnak."),
    bullet("A könyvklub, asztali szerepjáték és csendesebb klubélet is láthatóvá válik."),
    bullet("A szakirodalmi állításokat nem írjuk át; csak deduplikáljuk, lektoráljuk és státuszt adunk nekik."),
    bullet("Az idézet menthető, privát, lokalizálható és teljes forrásmegjelölést kap."),
    Spacer(1, 5 * mm),
    p("Forrásállomány egyeztetése", "H2x"),
    Table([[metric("565", "forrássor", CREAM), metric("80", "egyező ismétlés", colors.HexColor("#FFE3DD")), metric("485", "egyedi állítás", colors.HexColor("#EEE9FF")), metric("30", "publikus starter", colors.HexColor("#ECFFAD")), metric("455", "emberi review", CREAM)]], colWidths=[32 * mm] * 5, style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2),
    ])),
    Spacer(1, 5 * mm),
    p(
        "Az eredeti Excel és Markdown változatlan maradt. A 30 induló állítás 12 ellenőrzött "
        "forrásból származik; az állítás–forrás–szerző–év négyes változtatás nélkül került át. "
        "Az egyeztetés teljes: <b>565 = 30 + 455 + 80</b>.",
    ),
    PageBreak(),
])

# Design and product
story.extend([
    section_label("02 · Termék és design"),
    Spacer(1, 5 * mm),
    p("Saját márkakép, nagyobb társaság", "H1x"),
    Table([[card(
        "Háromfős közösségi jel",
        "Az absztrakt hálózat helyett a kompakt méretben is azonnal olvasható csoportjel győzött. "
        "A szólogó, arányok, hozzáférhető főoldal-link és márkaszínek megmaradtak.",
        colors.HexColor("#ECFFAD"),
    ), card(
        "Megosztás-first üzenet",
        "Az Explore címe: „Amit szeretsz, hozd közénk.” A korábbi jó szöveg nem veszett el: "
        "eligible változatként a copy registryben marad.",
        colors.HexColor("#FFE3DD"),
    )]], colWidths=[80 * mm, 80 * mm], style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ])),
    Spacer(1, 5 * mm),
    Table([[card(
        "Sokféle közös élmény",
        "A vizuális történetben a mozgás és buli mellett megjelenik a könyvklub, a társasjáték, "
        "az RPG, a tanulás és a támogatás. A 17 kategória és teljes drill-down érintetlen.",
        colors.HexColor("#EEE9FF"),
    ), card(
        "Biztonságos random jelenlét",
        "Nem dobunk idézetet bárhová. Több előre jóváhagyott slotból választunk egyet, egyenlő "
        "eséllyel és session-stabilan, így nincs űrlapzavarás vagy layout-ugrás.",
        CREAM,
    )]], colWidths=[80 * mm, 80 * mm], style=TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ])),
    Spacer(1, 7 * mm),
    p("Circle és Hub", "H2x"),
    p(
        "A release csak a meglévő <b>circles</b> és <b>hub2</b> capabilityt kapcsolja 100%-ra. "
        "A globális és funkciószintű kill switch, RLS, tagság, moderáció, lifecycle és audit "
        "továbbra is kötelező. A külön <b>connections</b> funkciót ez a változás nem kapcsolja be.",
    ),
    PageBreak(),
])

# Data safety
story.extend([
    section_label("03 · Adatmodell és védelem"),
    Spacer(1, 5 * mm),
    p("Fordítható, mégis forráshű", "H1x"),
    p(
        "A stabil kutatási rekord és a locale-specifikus megjelenítés külön táblában él. Egy "
        "állítás csak akkor lehet publikus, ha a parent és a locale egyaránt approved/published, "
        "az eredeti fordítás SHA-256 értéke egyezik, a claim aktív, és az adott elhelyezés engedett.",
    ),
    Table([
        [p("Réteg", "CardTitle"), p("Felelősség", "CardTitle"), p("Kapuk", "CardTitle")],
        [p("Claim", "CardBody"), p("Forrásazonosság, év, URL/DOI, original hash, lifecycle, placement", "CardBody"), p("approved · published · active", "CardBody")],
        [p("Translation", "CardBody"), p("Állítás, publikáció, szerző, locale, saját hash és review", "CardBody"), p("szerkesztés → draft + pending", "CardBody")],
        [p("Topics", "CardBody"), p("22 stabil kulcs, lokalizálható címke, 96 exact kapcsolat", "CardBody"), p("manifest-contract", "CardBody")],
        [p("Saves", "CardBody"), p("Privát user/claim kapcsolat és mentési idő", "CardBody"), p("auth.uid() · RLS/RPC", "CardBody")],
    ], colWidths=[31 * mm, 91 * mm, 42 * mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LAVENDER),
        ("GRID", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ])),
    Spacer(1, 6 * mm),
    p("Mentés és visszavonás", "H2x"),
    bullet("A szív-plusz csak a bejelentkezett tag saját mentését módosítja."),
    bullet("Menteni kizárólag aktuálisan publikálható állítást lehet."),
    bullet("Visszavonni később lekerült állítást is lehet; nincs törölhetetlen privát hivatkozás."),
    bullet("A Profil-lista 1–25 sorra korlátozott és nem kérhet le másik felhasználót."),
    bullet("Identity-váltáskor külön cache él; későn beérő régi válasz nem szivárog át."),
    PageBreak(),
])

# Verification
story.extend([
    section_label("04 · Bizonyíték és kiadási határ"),
    Spacer(1, 5 * mm),
    p("Regresszió nélkül ellenőrizve", "H1x"),
    Table([
        [p("Kapcsolódó kapu", "CardTitle"), p("Eredmény", "CardTitle")],
        [p("Friss adatbázis", "CardBody"), p("PASS · 103 migráció · 20/20 SQL fixture", "CardBody")],
        [p("Security-definer audit", "CardBody"), p("PASS · 238 definíció · 50 migráció", "CardBody")],
        [p("TypeScript / ESLint", "CardBody"), p("PASS · 0 hiba · 14 korábbi warning", "CardBody")],
        [p("Vitest", "CardBody"), p("PASS · 78 fájl · 447/447 teszt", "CardBody")],
        [p("Manifest contract", "CardBody"), p("PASS · 30 exact claim tuple · 96 exact topic tuple", "CardBody")],
        [p("Performance", "CardBody"), p("PASS · CSS 122 635 / 20 477 gzip · JS 162 050 / 50 546 gzip", "CardBody")],
        [p("Responsive browser / E2E", "CardBody"), p("PASS · 1440×1000 + 390×844 · 14 E2E pass / 1 auth NOT_RUN", "CardBody")],
        [p("Excel QA", "CardBody"), p("PASS · 565 exact reconciliation · 0 formula-error match", "CardBody")],
        [p("Release review", "CardBody"), p("PASS · nincs maradó P0/P1/P2 finding", "CardBody")],
        [p("Hosted Supabase", "CardBody"), p("PASS · 6 migration · flags + 30 claim + 96 topic relation", "CardBody")],
        [p("CI / Vercel", "CardBody"), p("PASS · Actions 32795360604 · 2 sikeres deployment context", "CardBody")],
        [p("Custom domain smoke", "CardBody"), p("NOT_RUN / HOLD · HTTPS timeout ebből a verifier környezetből", "CardBody")],
    ], colWidths=[61 * mm, 103 * mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), LIME),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, CREAM]),
        ("GRID", (0, 0), (-1, -1), 0.55, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ])),
    Spacer(1, 6 * mm),
    KeepTogether([
        p("Mi számít még külön bizonyítéknak?", "H2x"),
        p(
            "A Supabase migráció, a 30 rekordos remote seed, a Circle/Hub flag, a GitHub Actions "
            "és mindkét Vercel context PASS. A custom domain HTTPS elérése ebből a verifier "
            "környezetből timeoutolt, ezért a live smoke <b>NOT_RUN / HOLD</b>. Authenticated "
            "Profile mentés/listázás reviewer credential nélkül szintén <b>NOT_RUN</b> marad.",
        ),
    ]),
    PageBreak(),
])

# Rollback / handoff
story.extend([
    section_label("05 · Rollback és folytatás"),
    Spacer(1, 5 * mm),
    p("Biztonságosan visszafordítható", "H1x"),
    bullet("Circle vagy Hub visszakapcsolható a meglévő feature-flag/kill-switch úton, adatvesztés nélkül."),
    bullet("Hibás állítást withdraw/deactivate státuszba kell tenni; az audit és a privát unsave maradjon."),
    bullet("Hibás locale legyen draft/pending; egy fordítás miatt az eredeti magyar tuple nem írható át."),
    bullet("Sémakorrekció forward migrationnel történjen; bizonyíték- és mentéstáblát ne dobjunk el."),
    bullet("Frontend rollback csak a v1.12.0 release slice-ot érintheti, a v1.10/v1.11 munkát nem."),
    Spacer(1, 7 * mm),
    p("Következő fejlesztői alapmondat", "H2x"),
    card(
        "Őrizd meg, ami már jó — és tedd közösségibbé.",
        "Ne írj át forrásállítást, ne törölj jó copyt, ne változtass category ID-t. Új locale csak "
        "saját review/publikáció/hash kapuval jelenhet meg. A random idézet csak jóváhagyott, "
        "session-stabil slotba kerülhet. A save mindig auth.uid()-hoz kötött. Circle/Hub változásnál "
        "maradjon kill switch, RLS, tagság, moderáció és audit. Minden kör végén fresh DB, security, "
        "teszt, build, változatlan budget és desktop/mobil smoke.",
        colors.HexColor("#ECFFAD"),
    ),
    Spacer(1, 8 * mm),
    p("Átadott fájlok", "H2x"),
    p("• Elfogadott állítások v1.12.0.xlsx<br/>• Emberi felülvizsgálat v1.12.0.xlsx<br/>• AI/dev prompt v1.12.0.md<br/>• Ez a business request summary PDF", "Bodyx"),
])

doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
print(OUTPUT)
