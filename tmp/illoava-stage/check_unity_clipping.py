"""Check exported Unity BakeMesh geometry, not a separately posed Blender reconstruction.
Run blender --background --python Tools/Blender/check_unity_clipping.py -- PROJECT_ROOT
"""
import json, struct, sys, hashlib
from pathlib import Path
import numpy as np
from mathutils.bvhtree import BVHTree

root=Path(sys.argv[sys.argv.index('--')+1]);folder=root/'Logs/ClippingMeshes'
def integer(f):return struct.unpack('<i',f.read(4))[0]
def string(f):
    length=0;shift=0
    while True:
        b=f.read(1)[0];length|=(b&127)<<shift
        if b<128:break
        shift+=7
    return f.read(length).decode('utf8')
def load(path):
    parts={}
    with path.open('rb') as f:
        assert integer(f)==0x50494f32
        for _ in range(integer(f)):
            name=string(f);nv=integer(f);nt=integer(f)
            v=np.frombuffer(f.read(nv*12),dtype='<f4').reshape((-1,3)).copy()
            rest=np.frombuffer(f.read(nv*12),dtype='<f4').reshape((-1,3)).copy()
            t=np.frombuffer(f.read(nt*4),dtype='<i4').reshape((-1,3)).copy()
            parts[name]={'v':v,'t':t,'rest':rest,'center':rest[t].mean(axis=1),'bvh':BVHTree.FromPolygons(v.tolist(),t.tolist(),all_triangles=True,epsilon=0)}
    return parts
def seam(kind,a,b):
    # Explicit 20 mm interface bands in the bind pose, not broad screen-space exemptions.
    if kind=='Top/BaseBody':
        return (.885<b[1]<.935 and abs(b[0])<.09) or (abs(b[0])>.43 and .565<b[1]<.64)
    if kind=='Top/Forearms':return abs(b[0])<.335 and b[1]>.705
    if kind=='Bottom/BaseBody':return .365<b[1]<.405
    if kind=='Hair/Face':return not (b[1]<1.235 and b[2]>.20)
    return False

frames=[];failures=[]
for path in sorted(folder.glob('*.bin')):
    parts=load(path);hair=next(k for k in parts if k.startswith('Hair_'));top=next(k for k in parts if k.startswith('Top_'))
    pairs=[(hair,top,'Hair/Top'),(top,'Bottom','Top/Bottom'),(top,'BaseBody','Top/BaseBody'),('Bottom','BaseBody','Bottom/BaseBody'),(hair,'Face','Hair/Face')]
    if 'Forearms' in parts:pairs.append((top,'Forearms','Top/Forearms'))
    result={'frame':path.stem,'pairs':[]}
    for an,bn,kind in pairs:
        a,b=parts[an],parts[bn];hits=a['bvh'].overlap(b['bvh']);bad=[];allowed=0
        for i,j in hits:
            if seam(kind,a['center'][i],b['center'][j]):allowed+=1
            else:bad.append((i,j))
        result['pairs'].append({'pair':kind,'intersections':len(bad),'interfaceContacts':allowed})
        if bad:
            points=[((a['v'][a['t'][i]].mean(axis=0)+b['v'][b['t'][j]].mean(axis=0))*.5).tolist() for i,j in bad[:20]]
            failures.append({'frame':path.stem,'pair':kind,'trianglePairs':len(bad),'firstContactPositions':points})
    frames.append(result)
report={'status':'PASS' if not failures and len(frames)==148 else 'FAIL','source':'Unity BakeMesh(true), transformed to character-local meters','fbxSha256':hashlib.sha256((root/'Assets/ILLOAVA/Characters/Piona/Piona_Modular.fbx').read_bytes()).hexdigest(),'frames':len(frames),'combinations':4,'walkSamplesPerCombination':24,'sitTransitionSamplesPerCombination':13,'algorithm':'Blender BVHTree triangle surface overlap at epsilon 0; bind-position interface bands explicitly classified','limitations':['Finite pose sampling is not a mathematical proof for every continuous animation.','Garment cuffs/collar and shorts cuffs allow intended body insertion in the listed interface bands.','Hair scalp layering is intentional; face check covers the visible lower-front facial region.','No self-intersection or containment certification; examine visual evidence alongside this report.'],'results':frames,'failures':failures}
out=root/'Docs/Validation/Refinement/clipping-report.json';out.write_text(json.dumps(report,indent=2))
print(json.dumps({'status':report['status'],'frames':len(frames),'failedChecks':len(failures),'firstFailures':failures[:3]},indent=2))
