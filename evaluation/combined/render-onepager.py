from pathlib import Path
from html import escape
import re
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph
from pypdf import PdfReader

root=Path(__file__).resolve().parent
source=root/'KEY-DECISIONS.md'
out=root/'Key Decisions - Paved Road.pdf'
styles={
 'title':ParagraphStyle('title',fontName='Helvetica-Bold',fontSize=22,leading=26,spaceAfter=9,textColor=colors.HexColor('#173c30')),
 'meta':ParagraphStyle('meta',fontName='Helvetica',fontSize=8,leading=11,spaceAfter=18,textColor=colors.HexColor('#647368')),
 'body':ParagraphStyle('body',fontName='Helvetica',fontSize=10,leading=14,spaceAfter=12,textColor=colors.HexColor('#20352d'))
}
def inline(s):
 s=s.replace('—','-').replace('–','-').replace('’',"'").replace('“','"').replace('”','"')
 return re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',escape(s))
story=[]
for para in source.read_text().strip().split('\n\n'):
 if para.startswith('# '):
  story.extend([Paragraph(inline(para[2:]),styles['title']),Paragraph('RACHIKET ARYA / COGNITION TAKE-HOME / 29 SEPTEMBER 2026',styles['meta'])])
 else:story.append(Paragraph(inline(para.replace('\n',' ')),styles['body']))
def footer(c,doc):
 c.setStrokeColor(colors.HexColor('#c4d5cd'));c.line(44,40,A4[0]-44,40)
 c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#647368'))
 c.drawString(44,27,'Build, phased and gated | 29 September 2026');c.drawRightString(A4[0]-44,27,str(doc.page))
SimpleDocTemplate(str(out),pagesize=A4,leftMargin=44,rightMargin=44,topMargin=38,bottomMargin=52,title='Key Decisions - Paved Road',author='Rachiket Arya').build(story,onFirstPage=footer,onLaterPages=footer)
reader=PdfReader(out)
assert len(reader.pages)==1, f'Expected one page, got {len(reader.pages)}'
assert 'economic gate' in reader.pages[0].extract_text()
print(str(out));print('Page count: 1. Words:',len(source.read_text().split()))
