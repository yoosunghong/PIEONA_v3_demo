import sys,json
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]);source=(root/'Tools/Blender/check_unity_clipping.py').read_text()
exec(source.split('frames=[];failures=[]')[0])
report=json.loads((root/'Docs/Validation/Refinement/clipping-report.json').read_text());seen=set()
for failed in report['failures']:
    kind=failed['pair']
    if kind in seen:continue
    seen.add(kind);parts=load(folder/(failed['frame']+'.bin'));top=next(k for k in parts if k.startswith('Top_'))
    an,bn=(top,'Bottom') if kind=='Top/Bottom' else ('Bottom','BaseBody')
    a,b=parts[an],parts[bn];hits=[(i,j) for i,j in a['bvh'].overlap(b['bvh']) if not seam(kind,a['center'][i],b['center'][j])]
    print(json.dumps({'frame':failed['frame'],'pair':kind,'restA':[a['center'][i].tolist() for i,j in hits[:6]],'restB':[b['center'][j].tolist() for i,j in hits[:6]]}))
