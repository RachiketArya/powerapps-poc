from pathlib import Path
import html, re

root=Path(__file__).resolve().parent
def inline(s):
    s=html.escape(s)
    s=re.sub(r'\*\*(.*?)\*\*',r'<strong>\1</strong>',s)
    s=re.sub(r'`(.*?)`',r'<code>\1</code>',s)
    s=re.sub(r'(https://[^\s<]+)',r'<a href="\1">\1</a>',s)
    return s

def diagram(number):
    labels=[
      [('Ops / Entra identity','Authenticated user'),('Custom React apps','No privileged data credentials'),('Domain API + authorization','Actor, action, team and resource'),('Business command + transaction','State rules, idempotency, audit'),('Outbox / approved adapters','External systems + restricted audit')],
      [('Ops brief → Devin PR','Synthetic data; no production secrets'),('Required tests + review','App UAT and engineering approval'),('Test environment','Immutable release artifact'),('Production gate','Separate deployment identity'),('Monitor / rollback','Named owner and backup')],
      [('Devin + GitHub review','Reusable React / typed contracts'),('Power Platform solutions','Dev → Test → Prod'),('Microsoft managed platform','Hosting, Entra, configured policies'),('Dataverse or approved connector','Verify actual execution identity'),('Authoritative data / domain API','Business rules and decision evidence')]
    ][number]
    out=['<svg class="diagram" viewBox="0 0 920 350" role="img" aria-label="Target architecture, not deployed"><defs><marker id="arrow'+str(number)+'" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#56736a"/></marker></defs>']
    for i,(title,sub) in enumerate(labels):
        y=10+i*66
        out.append(f'<rect x="140" y="{y}" width="640" height="51" rx="5" fill="#edf4f0" stroke="#c4d5cd"/><text x="460" y="{y+21}" text-anchor="middle" font-size="16" font-weight="600">{html.escape(title)}</text><text x="460" y="{y+40}" text-anchor="middle" font-size="13" fill="#4f655c">{html.escape(sub)}</text>')
        if i<4: out.append(f'<path d="M460 {y+51} L460 {y+65}" stroke="#56736a" marker-end="url(#arrow{number})"/>')
    return ''.join(out)+'</svg><p class="caption">Target production design. The local demo does not implement all these services.</p>'

def md(text):
    blocks=text.strip().split('\n\n'); out=[]; d=0
    for b in blocks:
        if b.startswith('```mermaid'):
            out.append(diagram(d)); d+=1
        elif b.startswith('# '):out.append('<h2>'+inline(b[2:])+'</h2>')
        elif b.startswith('## '):out.append('<h3>'+inline(b[3:])+'</h3>')
        elif b.startswith('|'):
            rows=b.splitlines();out.append('<div class="table-wrap"><table>')
            for j,row in enumerate(rows):
                if re.match(r'^\|[\s:|\-]+$',row):continue
                tag='th' if j==0 else 'td';out.append('<tr>'+''.join(f'<{tag}>{inline(x.strip())}</{tag}>' for x in row.strip('|').split('|'))+'</tr>')
            out.append('</table></div>')
        elif b.startswith('- '):out.append('<ul>'+''.join('<li>'+inline(x[2:])+'</li>' for x in b.splitlines())+'</ul>')
        elif re.match(r'^\d\. ',b):out.append('<ol>'+''.join('<li>'+inline(re.sub(r'^\d\. ','',x))+'</li>' for x in b.splitlines())+'</ol>')
        else:out.append('<p>'+inline(b).replace('\n',' ')+'</p>')
    return '\n'.join(out)

files=[('story','STORY-AND-DECISION.md','Recommendation'),('design','SYSTEM-DESIGN.md','System design'),('economics','ECONOMICS.md','Economics'),('demo','LOOM-BEAT-SHEET.md','Demo'),('decisions','KEY-DECISIONS.md','One-pager'),('evidence','BUILD-REVIEW.md','Build review')]
body=''.join(f'<section id="{slug}">{md((root/name).read_text())}</section>' for slug,name,_ in files)
calculator='''<aside class="calculator"><h3>Test the ownership hypothesis</h3><p>Annual steady state only. Every input is an assumption, not a quote or measured result.</p><div class="inputs"><label>Removable licence spend (USD/year)<input id="removable" type="number" min="0" max="250000" step="10000" value="200000"></label><label>Custom ownership (FTE)<input id="fte" type="number" min="0" max="10" step="0.1" value="0.5"></label><label>Code-app ownership (FTE)<input id="hybrid" type="number" min="0" max="10" step="0.1" value="0.3"></label></div><p id="result" aria-live="polite"></p><p class="caption">Fixed assumptions: $250K licence, $200K/FTE, $31K custom operating allowance, $15K code-app allowance, $300K current baseline. Setup, migration and differential Ops effort excluded.</p></aside>'''
body=body.replace('<section id="economics">','<section id="economics">'+calculator)
body=body.replace('<section id="decisions">','<section id="decisions"><p><a href="Key%20Decisions%20-%20Paved%20Road.pdf">Open the one-page PDF</a></p>')
nav=''.join(f'<a href="#{slug}">{label}</a>' for slug,_,label in files)
page='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cognition take-home | Combined briefing</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f7f8f5;color:#20352d;font:16px/1.65 system-ui,sans-serif}header{background:#173c30;color:white;padding:42px max(24px,calc((100% - 1040px)/2));}header h1{font-size:38px;line-height:1.15;max-width:850px;margin:12px 0}header p{color:#d2e4d9;max-width:820px}nav{position:sticky;top:0;background:#fff;border-bottom:1px solid #d7e0d9;padding:14px 24px;display:flex;gap:24px;justify-content:center;flex-wrap:wrap;z-index:2}a{color:#17684d}nav a{text-decoration:none;font-weight:600}main{max-width:1088px;padding:0 24px;margin:auto}section{padding:32px 0 40px;border-bottom:1px solid #cad9cf;scroll-margin-top:65px}h2{font-size:29px;margin:0 0 24px}h3{font-size:21px;margin:30px 0 10px}p,li{max-width:930px}table{border-collapse:collapse;width:100%;font-size:14px;background:white}th,td{text-align:left;padding:12px;border-bottom:1px solid #d7e0d9;vertical-align:top}th{background:#e6eee8}.table-wrap{overflow:auto}.diagram{width:100%;max-height:420px;background:white;border:1px solid #d7e0d9}.caption{font-size:13px;color:#607067;margin-top:4px}.notice{padding:16px 20px;border-left:4px solid #a37021;background:#fff6e5;margin:30px 0}code{font-size:14px}footer{padding:30px;color:#607067} @media(max-width:650px){header h1{font-size:29px}nav{gap:12px;font-size:13px}main{padding:0 18px}.diagram{min-width:600px}section{overflow:auto}}@media print{nav{position:static}header{padding:24px}section{break-before:page}.notice{break-inside:avoid}}
</style></head><body><header><small>COGNITION TAKE-HOME · WORKING SYNTHESIS · 29 SEPTEMBER 2026</small><h1>Build, phased and gated.</h1><p>Devin builds and maintains the apps. Domain teams own their workflows. Platform Engineering owns production. Power Apps code apps is the fallback if ownership fails the pilot.</p></header><nav>'''+nav+'''</nav><main><div class="notice"><strong>Evidence boundary:</strong> two app modules are implemented and reviewed; eleven portfolio entries are planned. Architecture diagrams describe the target and economics are assumptions. Microsoft integration and production infrastructure have not been validated. See Build review for failures, repairs and final checks.</div>'''+body+'''</main><footer>Discussion: Codex, recorded model gpt-6-astra / medium. Claude materials reviewed with permission; Devin is the application builder. This is a preparation artifact, not a submitted assignment.</footer></body></html>'''
page=page.replace('</style>','.calculator{background:#eaf1ec;padding:20px 24px;margin:0 0 32px}.calculator h3{margin-top:0}.inputs{display:flex;gap:20px;flex-wrap:wrap}.inputs label{display:flex;flex-direction:column;font-size:14px;flex:1;min-width:190px}.inputs input{padding:9px;font:inherit;border:1px solid #8fa698;border-radius:3px;margin:6px 0;background:white;color:#20352d}#result{font-weight:600;font-size:18px}</style>')
page=page.replace('</body>', '''<script>
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
function recalc(){const inputs=['removable','fte','hybrid'].map(id=>document.getElementById(id));if(inputs.some(x=>x.value===''||!x.checkValidity())){document.getElementById('result').textContent='Enter valid values within the indicated bounds.';return;}const [l,f,h]=inputs.map(x=>Number(x.value));const c=250000-l+200000*f+31000;const b=250000+200000*h+15000;const t=h+(l+15000-31000)/200000;document.getElementById('result').textContent=`Custom: ${money(c)}/year. Code apps: ${money(b)}/year. Custom saving versus code apps: ${money(b-c)}/year. Break-even custom ownership: ${t.toFixed(2)} FTE.`;}document.querySelectorAll('input').forEach(x=>x.addEventListener('input',recalc));recalc();
</script></body>''')
(root/'index.html').write_text(page)
print(root/'index.html')
