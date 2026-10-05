"""Builds "Pehli Job with AI: 30 din ka roadmap", the PDF sent to people who
comment JOB on a Pehli Job reel (ManyChat). Run: python build_roadmap.py

Content rules match the reels: no job or salary guarantees, no faking
experience, no prices. PilaniLabs facts only from api/config/brand.js.
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, CondPageBreak, Frame, Image, KeepTogether, NextPageTemplate, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
LOGO = ROOT / "api" / "assets" / "logo-source.jpg"
OUT = HERE / "Pehli-Job-with-AI-Roadmap-PilaniLabs.pdf"

# Arial covers the quotes and dashes a Hinglish text needs; the built-in
# Helvetica does not have every glyph.
FONTS = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("Body", str(FONTS / "arial.ttf")))
pdfmetrics.registerFont(TTFont("Body-Bold", str(FONTS / "arialbd.ttf")))
pdfmetrics.registerFont(TTFont("Body-Italic", str(FONTS / "ariali.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-Bold", italic="Body-Italic", boldItalic="Body-Bold")

NAVY = colors.HexColor("#1B2A4A")
BLUE = colors.HexColor("#3E6FA8")
GOLD = colors.HexColor("#C49A45")
GOLD_SOFT = colors.HexColor("#F6EEDC")
BLUE_SOFT = colors.HexColor("#EAF1F8")
GREY = colors.HexColor("#5B6170")
LINE = colors.HexColor("#D9DCE3")
RED = colors.HexColor("#B3261E")
RED_SOFT = colors.HexColor("#FBEAEA")
PAGE_W, PAGE_H = A4
MARGIN = 18 * mm

S = {
    "cover_kicker": ParagraphStyle("ck", fontName="Body-Bold", fontSize=11, textColor=GOLD, alignment=TA_CENTER, leading=14, spaceAfter=6),
    "cover_title": ParagraphStyle("ct", fontName="Body-Bold", fontSize=34, textColor=NAVY, alignment=TA_CENTER, leading=40),
    "cover_sub": ParagraphStyle("cs", fontName="Body-Bold", fontSize=18, textColor=BLUE, alignment=TA_CENTER, leading=24, spaceBefore=4),
    "cover_text": ParagraphStyle("cx", fontName="Body", fontSize=11.5, textColor=GREY, alignment=TA_CENTER, leading=17),
    "h1": ParagraphStyle("h1", fontName="Body-Bold", fontSize=22, textColor=NAVY, leading=27, spaceAfter=4, keepWithNext=1),
    "h1_kicker": ParagraphStyle("h1k", fontName="Body-Bold", fontSize=9.5, textColor=GOLD, leading=12, spaceAfter=2, keepWithNext=1),
    "h2": ParagraphStyle("h2", fontName="Body-Bold", fontSize=13.5, textColor=NAVY, leading=18, spaceBefore=10, spaceAfter=4, keepWithNext=1),
    "day": ParagraphStyle("day", fontName="Body-Bold", fontSize=11.5, textColor=BLUE, leading=15, spaceBefore=8, spaceAfter=2, keepWithNext=1),
    "body": ParagraphStyle("b", fontName="Body", fontSize=10, textColor=colors.black, leading=14.5, spaceAfter=4),
    "muted": ParagraphStyle("m", fontName="Body", fontSize=9, textColor=GREY, leading=13),
    "bullet": ParagraphStyle("bl", fontName="Body", fontSize=10, leading=14.5, leftIndent=12, bulletIndent=2, spaceAfter=2),
    "prompt_label": ParagraphStyle("pl", fontName="Body-Bold", fontSize=8, textColor=BLUE, leading=10),
    "prompt": ParagraphStyle("p", fontName="Body", fontSize=9.3, textColor=NAVY, leading=13.3),
    "tip_title": ParagraphStyle("tt", fontName="Body-Bold", fontSize=10.5, textColor=NAVY, leading=14),
    "tip": ParagraphStyle("tp", fontName="Body", fontSize=9.6, textColor=colors.black, leading=13.8),
    "cell": ParagraphStyle("c", fontName="Body", fontSize=9, leading=12),
    "cell_b": ParagraphStyle("cb", fontName="Body-Bold", fontSize=9, leading=12, textColor=colors.white),
}


def p(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items):
    return [Paragraph(i, S["bullet"], bulletText="•") for i in items]


def box(flowables, bg, border, pad=8):
    t = Table([[flowables]], colWidths=[PAGE_W - 2 * MARGIN])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.8, border),
        ("LEFTPADDING", (0, 0), (-1, -1), pad + 2),
        ("RIGHTPADDING", (0, 0), (-1, -1), pad + 2),
        ("TOPPADDING", (0, 0), (-1, -1), pad),
        ("BOTTOMPADDING", (0, 0), (-1, -1), pad),
    ]))
    return t


def prompt(text, label="PROMPT (copy karke ChatGPT / Gemini / Claude mein paste karo)"):
    return [box([p(label, "prompt_label"), Spacer(1, 2), p(text, "prompt")], BLUE_SOFT, BLUE), Spacer(1, 7)]


def pilani_tip(title, text):
    return KeepTogether([Spacer(1, 8), box([p(title, "tip_title"), Spacer(1, 2), p(text, "tip")], GOLD_SOFT, GOLD, pad=10)])


def day(title, *flow):
    # The "day" style has keepWithNext, so a title never ends a page alone.
    out = [p(title, "day")]
    for f in flow:
        out.extend(f if isinstance(f, list) else [f])
    return out


def week_header(n, title, goal):
    return [
        Spacer(1, 14),
        p(f"WEEK {n}", "h1_kicker"),
        p(title, "h1"),
        p(f"<b>Is hafte ka result:</b> {goal}", "muted"),
        Spacer(1, 6),
    ]


def table(rows, widths, header=True):
    data = [[Paragraph(str(c), S["cell_b"] if header and r == 0 else S["cell"]) for c in row] for r, row in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.5, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), NAVY)]
    style += [("BACKGROUND", (0, r), (-1, r), colors.HexColor("#F7F8FA")) for r in range(2, len(rows), 2)]
    t.setStyle(TableStyle(style))
    return t


# ---------------------------------------------------------------- pages

def on_page(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1.2)
    canvas.line(MARGIN, PAGE_H - 12 * mm, PAGE_W - MARGIN, PAGE_H - 12 * mm)
    canvas.setFont("Body-Bold", 8)
    canvas.setFillColor(NAVY)
    canvas.drawString(MARGIN, PAGE_H - 10 * mm, "PEHLI JOB WITH AI  ·  30 DIN KA ROADMAP")
    canvas.setFillColor(GOLD)
    canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 10 * mm, "PilaniLabs")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
    canvas.setFont("Body", 7.5)
    canvas.setFillColor(GREY)
    canvas.drawString(MARGIN, 10 * mm, "pilanilabs.com")
    canvas.drawRightString(PAGE_W - MARGIN, 10 * mm, f"{doc.page}")
    canvas.drawCentredString(PAGE_W / 2, 10 * mm, "Guidance hai, job ki guarantee nahi. Mehnat aapki, speed AI ki.")
    canvas.restoreState()


def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#EEEEEE"))
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(GOLD)
    canvas.rect(0, 0, PAGE_W, 9 * mm, stroke=0, fill=1)
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_H - 6 * mm, PAGE_W, 6 * mm, stroke=0, fill=1)
    canvas.restoreState()


def build():
    doc = BaseDocTemplate(str(OUT), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=18 * mm, bottomMargin=20 * mm,
                          title="Pehli Job with AI: 30 din ka roadmap", author="PilaniLabs", subject="AI job roadmap for freshers")
    # No inner padding: boxes are drawn at exactly the frame width.
    frame = Frame(MARGIN, 20 * mm, PAGE_W - 2 * MARGIN, PAGE_H - 38 * mm, id="f", leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    cover_frame = Frame(MARGIN, 15 * mm, PAGE_W - 2 * MARGIN, PAGE_H - 30 * mm, id="c", leftPadding=0, rightPadding=0)
    doc.addPageTemplates([PageTemplate("cover", [cover_frame], onPage=on_cover), PageTemplate("page", [frame], onPage=on_page)])

    st = []

    # Cover ------------------------------------------------------------------
    st += [Spacer(1, 18 * mm), Image(str(LOGO), width=62 * mm, height=62 * mm * 581 / 450), Spacer(1, 12 * mm)]
    st += [p("FREE GUIDE", "cover_kicker"), p("Pehli Job with AI", "cover_title"), p("30 din ka roadmap", "cover_sub"), Spacer(1, 8 * mm)]
    st += [p("Freshers, final-year students aur job seekers ke liye.<br/>Sirf free AI tools. Roz 45 se 60 minute. Har din ek clear kaam.", "cover_text")]
    st += [Spacer(1, 10 * mm), p("<b>by PilaniLabs</b> · AI Training &amp; Consulting · pilanilabs.com", "cover_text")]
    st += [NextPageTemplate("page"), PageBreak()]

    # Before you start -------------------------------------------------------
    st += [p("SHURU KARNE SE PEHLE", "h1_kicker"), p("Ye roadmap kaise kaam karta hai", "h1")]
    st += [p("Ek seedhi baat pehle: ye roadmap aapko job nahi dilayega. <b>Aapki mehnat dilayegi.</b> Ye roadmap us mehnat ko sahi direction aur AI ki speed deta hai, taaki 30 din mein aap woh kar lo jo log 3 mahine mein karte hain.")]
    st += [Spacer(1, 4), table([
        ["Week", "Focus", "Hafte ke end tak aapke paas"],
        ["1", "Sahi role aur strong resume", "1 master resume + 2 job-specific resume"],
        ["2", "LinkedIn aur ek project", "Complete LinkedIn profile + 1 portfolio project online"],
        ["3", "Applications aur outreach", "Tracker sheet, 20+ achhi applications, 15+ personal messages"],
        ["4", "Interview practice", "Ready answers, 5 STAR stories, 6+ mock interviews"],
    ], [16 * mm, 62 * mm, None])]
    st += [p("Free tools jo aap use karoge", "h2")]
    st += bullets([
        "<b>ChatGPT, Gemini ya Claude</b> (free versions): writing, practice, feedback. Koi bhi ek kaafi hai.",
        "<b>Perplexity</b>: company aur industry research, sources ke saath.",
        "<b>Canva</b>: LinkedIn banner, simple portfolio page.",
        "<b>Google Sheets</b>: application tracker.",
        "<b>LinkedIn, Naukri, Internshala</b> aur companies ke career pages: jobs dhundhne ke liye.",
    ])
    st += [p("3 rules jo kabhi mat todna", "h2")]
    st += bullets([
        "<b>AI draft dega, final aapke words.</b> AI ka text seedha copy-paste karoge toh recruiter pakad lega, kyunki sabka same lagta hai.",
        "<b>Jhooth zero.</b> Jo skill ya experience nahi hai, woh resume par nahi. Interview mein ek sawaal mein sab khul jaata hai.",
        "<b>Roz thoda, har din.</b> Ek din 8 ghante se behtar hai 30 din tak roz 45 minute.",
    ])
    st += [pilani_tip("PilaniLabs kaun hai?",
                      "PilaniLabs cohort-based aur personalised AI training deta hai, business leaders ko bhi aur everyday logon ko bhi. "
                      "Hum generative AI concepts aur applied AI sikhate hain, matlab AI tools ko apne real kaam mein use karna. "
                      "Is roadmap mein aap wahi karoge: AI ko apni job search ka assistant banana.")]
    st += [PageBreak()]

    # Week 1 -----------------------------------------------------------------
    st += week_header(1, "Sahi role, strong resume", "1 master resume aur 2 resume jo specific jobs ke liye tailor kiye hue hain.")
    st += day("Day 1: Apna target role clear karo",
              p("\"Koi bhi job chalegi\" sabse kamzor strategy hai. 1 ya 2 role choose karo jo aapki degree, interest aur skills se match karte hain."),
              prompt("I am a [degree, e.g. B.Com final year] from [city]. My interests: [interests]. Skills I actually have: [skills]. "
                     "Suggest 5 entry-level job roles in India that fit me. For each, give: what the job involves day to day, 5 skills it needs, "
                     "which of my skills already match, and what I should learn first. Be realistic; do not suggest roles that need years of experience."))
    st += day("Day 2: 10 job descriptions collect karo",
              p("LinkedIn ya Naukri par apne role ke 10 fresher job posts kholo aur unka text ek document mein copy karo. Phir:"),
              prompt("Here are 10 job descriptions for [role] roles for freshers in India: [paste all]. List the 15 skills and keywords that appear most often, "
                     "grouped as technical skills, tools and soft skills. Mark which ones appear in at least half the postings."))
    st += day("Day 3: Master resume banao",
              p("Apni saari information ek jagah likho: education, projects, internships, college clubs, certificates, part-time kaam. Phir AI se strong bullet points banwao:"),
              prompt("Turn my raw notes into resume bullet points for a [role] fresher. Use strong action verbs, show what I did and the result, keep each bullet under 2 lines. "
                     "Do not add anything I did not mention and do not invent numbers; if a result is missing, write the bullet without it and tell me what to measure. My notes: [paste]."),
              *bullets(["Format: 1 page, simple layout, normal font, bina photo aur tables (software isse theek se padh nahi paata). PDF mein save karo."]))
    st += day("Day 4: Hidden achievements nikalo",
              prompt("Ask me 10 questions, one at a time, to uncover achievements from my college years that I might be forgetting: projects, events, "
                     "competitions, teaching or helping others, freelance or family business work. After my answers, turn the useful ones into resume bullets."))
    st += day("Day 5: Resume ko ek job ke liye tailor karo",
              prompt("Here is my master resume: [paste]. Here is the job description: [paste]. Rewrite my summary and reorder my bullets so the most relevant ones come first. "
                     "Then list the important keywords from the job that are missing from my resume, and for each say honestly whether I can add it (I have the skill) or should learn it."))
    st += day("Day 6: Recruiter ki nazar se check",
              prompt("Act as a recruiter in India screening fresher resumes for [role]. You spend 6 seconds on each. Review my resume: [paste]. "
                     "Tell me what you notice first, 3 reasons you might reject it, and the 5 most important fixes, in order."))
    st += day("Day 7: Feedback aur rest",
              p("Ek senior, teacher ya dost ko resume bhejo jo us field mein kaam karta ho. Unke 2 suggestions apply karo. Baaki din rest."))
    st += [pilani_tip("Pilani tip: AI ko assistant banao, writer nahi",
                      "Sabse achha result tab aata hai jab aap AI ko context dete ho (aapka background, job, goal) aur phir uske draft ko edit karte ho. "
                      "Context + edit, yahi applied AI hai, aur PilaniLabs ki training ka core bhi yahi hai.")]
    st += [CondPageBreak(95 * mm)]

    # Week 2 -----------------------------------------------------------------
    st += week_header(2, "LinkedIn aur ek real project", "Complete LinkedIn profile aur 1 project jo aap interview mein dikha sako.")
    st += day("Day 8: Headline, photo aur banner",
              p("Clear face wali simple photo. Canva mein banner jisme aapka target role likha ho."),
              prompt("Write 5 LinkedIn headline options for a fresher targeting [role], skills: [top 3 skills], currently: [final year student / graduate looking for opportunities]. "
                     "Each under 200 characters, specific, no buzzwords like 'passionate' or 'hardworking'."))
    st += day("Day 9: About section",
              prompt("Write a LinkedIn About section (120-180 words, first person) for me: [background, skills, 1-2 projects, the role I want]. "
                     "Start with what I can do for an employer, mention one project with what I learned, end with the kind of role I am looking for. Simple, honest, no exaggeration."))
    st += day("Day 10: Baaki profile complete",
              *bullets([
                  "Education, projects, certificates aur skills sections bharo (top 5 skills woh jo job descriptions mein bar bar aaye the).",
                  "3 logon se recommendation maango: teacher, internship manager, project partner.",
                  "Apne target role ke 20 logon se connect karo: alumni, recruiters, us role mein 1-3 saal wale log.",
              ]))
    st += day("Day 11-13: Ek portfolio project banao (AI ki help se)",
              p("Experience nahi hai? Project woh proof hai. 3 din, ek project, jo aap 2 minute mein explain kar sako. Apne field ke hisaab se idea:"),
              table([
                  ["Field", "Project idea"],
                  ["Marketing", "Ek local business ke liye 30 din ka social media plan + 5 sample posts"],
                  ["Data / Analyst", "Ek public dataset (Kaggle ya data.gov.in) analyse karke Google Sheets dashboard + 5 insights"],
                  ["HR", "Ek startup ke liye job description, interview questions aur onboarding checklist"],
                  ["Sales / BD", "Ek product ke liye 30 prospects ki list aur 3-step outreach sequence"],
                  ["Software", "Ek chhota web app (AI coding help ke saath), free hosting par live"],
                  ["Design", "Ek local brand ka Instagram ya landing page redesign, before/after"],
                  ["Commerce / Finance", "3 listed companies ke annual results ka simple comparison aur summary"],
              ], [38 * mm, None]),
              prompt("I want to build a portfolio project in 3 days for a [role] fresher role. My idea: [idea]. Break it into a 3-day plan with daily tasks, "
                     "tell me what the final output should look like, and give me 5 questions an interviewer might ask about it so I build it properly."))
    st += day("Day 14: Project publish karo",
              p("Project ko Google Drive, GitHub ya Canva link par daalo, resume aur LinkedIn mein add karo, aur ek post likho:"),
              prompt("Help me write a short LinkedIn post about a project I just finished: [what, why, tools used, what I learned, link]. "
                     "Keep it under 150 words, in my voice, honest about what I learned, with one question at the end to invite comments."))
    st += [pilani_tip("Pilani tip: project mein AI ka use khul ke batao",
                      "Interview mein bolo ki aapne AI kaise use kiya: research, first draft, analysis. Companies aaj freshers mein yahi dekhti hain ki kaun AI tools ko "
                      "samajhdaari se use kar sakta hai. PilaniLabs mein hum yahi applied AI skills hands-on sikhate hain.")]
    st += [CondPageBreak(95 * mm)]

    # Week 3 -----------------------------------------------------------------
    st += week_header(3, "Smart applications aur outreach", "Ek tracker, 20+ tailored applications aur 15+ personal messages.")
    st += day("Day 15: Tracker sheet banao",
              p("Google Sheets mein ye columns: <b>Company · Role · Link · Apply date · Contact person · Status · Follow-up date</b>. Har application yahan jaayegi."),
              p("<b>Kahan dhundho:</b> LinkedIn Jobs (filter: Entry level, Past week), Naukri, Internshala, companies ke career pages, college placement cell aur alumni."))
    st += day("Day 16-20: Roz ka routine (5 din)",
              *bullets([
                  "<b>3-5 achhi applications</b> roz, har ek ke liye resume tailor karke (Day 5 ka prompt). 100 random applications se 20 achhi behtar hain.",
                  "<b>3 personal messages</b> roz: recruiter, hiring manager ya alumni ko.",
                  "Har application tracker mein daalo.",
              ]),
              prompt("Research [company] for a [role] application. Give me: what they do in 3 lines, their recent news from the last 6 months, who their customers are, "
                     "and 3 specific things I can mention in my application or interview. Include sources.",
                     "PROMPT (Perplexity mein best kaam karta hai)"),
              prompt("Write a short LinkedIn message (under 300 characters) to [name], [their role] at [company], about the [role] opening. Mention one specific thing about them or the company: [detail]. "
                     "Say who I am in one line and ask one clear question. Polite, confident, no begging, no 'please give me a job'."),
              prompt("Write a short message to a senior from my college, [name], now at [company], asking if they would be open to referring me for [role] or giving 10 minutes of advice. "
                     "Mention our college and one relevant thing about my profile. Make it easy to say no."))
    st += day("Day 21: Follow-up aur review",
              prompt("Write a polite follow-up email for a [role] application I sent to [company] on [date]. 4-5 lines, restate my interest and one relevant strength, no pressure."),
              p("Tracker dekho: kaunsi applications ka reply aaya? Un mein kya common tha (role, company size, message ka style)? Agle hafte wahi zyada karo."))
    st += [pilani_tip("Pilani tip: quality ka formula",
                      "Har application mein ek company-specific line (Perplexity research se) aur ek proof (aapka project). Yahi do cheezein aapko 100 copy-paste "
                      "applications se alag karti hain.")]
    st += [CondPageBreak(95 * mm)]

    # Week 4 -----------------------------------------------------------------
    st += week_header(4, "Interview ki taiyari", "Ready intro, 5 stories, aur 6+ mock interviews ka confidence.")
    st += day("Day 22: \"Tell me about yourself\"",
              prompt("Help me write a 60-second answer to 'Tell me about yourself' for a [role] interview. My background: [paste]. Structure: who I am now, "
                     "1-2 things I have done that matter for this role, why this role and company. Natural spoken English, not a memorised essay. Then give a Hindi-English version I can practise."))
    st += day("Day 23: 5 STAR stories ready karo",
              p("STAR matlab Situation, Task, Action, Result. 5 stories: ek project, ek team problem, ek galti jisse seekha, ek baar leadership, ek baar jab kuch naya jaldi seekha."),
              prompt("Help me turn this experience into a STAR answer under 90 seconds: [describe what happened]. Ask me follow-up questions if the result or my exact role is unclear. Do not invent details."))
    st += day("Day 24-25: Mock HR interview",
              p("ChatGPT ya Gemini ka voice mode use karo toh real interview jaisa lagega."),
              prompt("Be an HR interviewer at [company] interviewing me for a fresher [role] position. Ask one question at a time and wait for my answer. "
                     "After each answer, give a score out of 10, one thing I did well and one specific improvement. Ask 8 questions, including 2 tricky ones."))
    st += day("Day 26-27: Role-specific mock",
              prompt("Be a [role] hiring manager. Ask me 8 role-specific questions for a fresher, from basic to harder, one at a time, including one practical case or task. "
                     "Give feedback after each answer and, at the end, the 3 topics I should revise."))
    st += day("Day 28: GD aur aptitude",
              prompt("Give me a group discussion topic common in Indian fresher hiring, then act as 3 other participants with different views. I will add my points; "
                     "after 3 rounds, judge my contribution on content, clarity and how I handled others."))
    st += day("Day 29: Interviewer se sawaal aur salary ka sawaal",
              prompt("Give me 5 smart questions a fresher can ask at the end of a [role] interview at [company]. Then tell me how to answer 'What are your salary expectations?' "
                     "politely as a fresher, by researching the typical range for the role and city first, without quoting a number I cannot justify."))
    st += day("Day 30: Review aur agle 30 din",
              prompt("Here is my tracker and what happened this month: [paste or summarise]. Analyse what worked, where I am getting stuck (no replies, no interviews, or no offers) "
                     "and give me a focused plan for the next 30 days."),
              p("Rejection mila? Normal hai. Har rejection ke baad likho kya poocha gaya aur kya improve karna hai. Wahi list agla mock interview banegi."))
    st += [pilani_tip("Pilani tip: practice hi confidence hai",
                      "AI ke saath mock interview ka fayda ye hai ki aap bina darr ke 20 baar galti kar sakte ho. Jo log interview room mein confident lagte hain, unhone bas "
                      "pehle zyada practice ki hoti hai.")]
    st += [CondPageBreak(95 * mm)]

    # Job scam safety --------------------------------------------------------
    st += [p("ZAROORI", "h1_kicker"), p("Job scams se bacho", "h1")]
    st += [p("Freshers sabse zyada scam ka target hote hain. <b>Ek rule yaad rakho: asli company job dene ke paise nahi leti.</b>")]
    st += [box([
        p("Red flags: inmein se ek bhi dikhe toh ruk jao", "tip_title"), Spacer(1, 3),
        *bullets([
            "Registration fee, training fee, \"security deposit\" ya laptop ke liye paise maangna.",
            "Bina interview ke seedha offer letter.",
            "Sirf WhatsApp ya Telegram par baat, company ki official email ya website nahi.",
            "Recruiter ki email Gmail ya Yahoo par, company domain par nahi.",
            "\"Ghar baithe roz hazaaron kamao\" jaise promises, ya simple task ke liye bahut zyada paisa.",
            "Shuru mein hi OTP, bank details ya Aadhaar maangna.",
        ]),
        Spacer(1, 3),
        p("Check karne ka tarika: company ki official website ke Careers page par woh job hai ya nahi, LinkedIn par recruiter ki profile aur company page, aur Google par company ka naam + \"scam\" search karo.", "tip"),
    ], RED_SOFT, RED, pad=10)]
    st += [p("Common galtiyan jo freshers karte hain", "h2")]
    st += bullets([
        "Ek hi resume har job par bhejna.",
        "AI ka likha text bina edit kiye use karna.",
        "Roz 50 applications, zero follow-up.",
        "Sirf job portals, koi networking nahi (bahut si jobs referral se bharti hain).",
        "10 rejections ke baad ruk jaana. Ye number game bhi hai: process ko improve karte raho.",
    ])
    st += [PageBreak()]

    # Tracker ----------------------------------------------------------------
    st += [p("TRACKER", "h1_kicker"), p("30 din ka checklist", "h1"), p("Har din ka kaam ho jaaye toh tick karo. Is page ka screenshot ya printout rakh lo.", "muted"), Spacer(1, 4)]
    tasks = [
        "Target role choose kiya", "10 job descriptions, keywords nikale", "Master resume", "Hidden achievements", "Resume tailor kiya (job 1)",
        "Recruiter-view check", "Feedback + rest", "Headline, photo, banner", "About section", "Profile complete + 20 connections",
        "Project: plan", "Project: build", "Project: finish", "Project publish + LinkedIn post", "Tracker sheet ready",
        "3-5 applications + 3 messages", "3-5 applications + 3 messages", "3-5 applications + 3 messages", "3-5 applications + 3 messages", "3-5 applications + 3 messages",
        "Follow-ups + review", "Tell me about yourself", "5 STAR stories", "Mock HR interview 1", "Mock HR interview 2",
        "Role mock interview 1", "Role mock interview 2", "GD + aptitude", "Questions + salary answer", "Review + next 30 days plan",
    ]
    half = 15
    rows = [["Day", "Kaam", "Done", "Day", "Kaam", "Done"]]
    for i in range(half):
        rows.append([str(i + 1), tasks[i], "", str(i + 1 + half), tasks[i + half], ""])
    t = table(rows, [12 * mm, 59 * mm, 16 * mm, 12 * mm, 59 * mm, 16 * mm])
    st += [t]
    st += [PageBreak()]

    # Why PilaniLabs + next steps -------------------------------------------
    st += [p("AAGE KYA?", "h1_kicker"), p("Kyun PilaniLabs", "h1")]
    st += [p("Ye roadmap ek shuruaat hai. Agar aap AI ko seriously seekhna chahte ho, sirf job search ke liye nahi balki apne poore career ke liye, toh PilaniLabs isi ke liye bana hai.")]
    st += bullets([
        "<b>Cohort-based training:</b> aap ek group ke saath seekhte ho, akele nahi.",
        "<b>Personalised:</b> aapke goals aur aapke kaam ke hisaab se.",
        "<b>Generative AI concepts + applied AI:</b> samajh bhi, aur AI tools ko real kaam mein use karna bhi.",
        "<b>Founded by Ajay Goyal</b>, 30+ saal ke business leadership experience ke saath.",
        "<b>Curriculum har quarter update</b> hota hai, taaki aap latest AI tools aur trends seekho.",
    ])
    st += [Spacer(1, 6), box([
        p("Next steps", "tip_title"), Spacer(1, 3),
        *bullets([
            "<b>PilaniLabs WhatsApp community join karo:</b> link aapke DM mein hai. Wahan AI tips aur updates milte rahenge.",
            "<b>Instagram par PilaniLabs ko follow karo</b> \"Pehli Job with AI\" ki nayi reels ke liye.",
            "<b>Next cohort ki details:</b> pilanilabs.com par.",
        ]),
    ], GOLD_SOFT, GOLD, pad=12)]
    st += [Spacer(1, 10), box([
        p("Kisi dost ko job chahiye?", "tip_title"),
        p("Ye roadmap usse bhejo. Ya usse bolo ki PilaniLabs ki kisi \"Pehli Job with AI\" reel par JOB comment kare, roadmap seedha DM mein aa jayega.", "tip"),
    ], BLUE_SOFT, BLUE, pad=12)]
    st += [Spacer(1, 14), p("Ye roadmap guidance hai, job ya salary ki guarantee nahi. AI tools ke free plans aur features time ke saath badal sakte hain. "
                             "AI ka diya hua har jawab khud check karo, khaas kar facts aur numbers.", "muted")]
    st += [Spacer(1, 8), p("© PilaniLabs, a brand of Aray Consulting LLP · pilanilabs.com", "muted")]

    doc.build(st)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    build()
