"""Deterministic modular engineering base; retains Meshy draft as reference.
Run: blender --background --python Tools/Blender/build_piona.py -- PROJECT_ROOT
"""
import bpy, math, json, sys, bmesh
from pathlib import Path
from mathutils import Vector

ROOT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
OUT = ROOT / 'ArtSource/Characters/Piona'
UNITY = ROOT / 'Assets/ILLOAVA/Characters/Piona'
OUT.mkdir(parents=True, exist_ok=True); UNITY.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def material(name, color):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bsdf=m.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value=(*color,1); bsdf.inputs['Roughness'].default_value=.78
    return m
skin=material('Piona_Skin',(1,.80,.72)); hair=material('Piona_Hair',(1,.87,.72)); cream=material('Piona_Cream',(.96,.92,.83))
blue=material('Piona_Sky',(.39,.66,.74)); olive=material('Piona_Olive',(.29,.35,.16)); white=material('Piona_EyeWhite',(1,.97,.91))
iris=material('Piona_Iris',(.21,.095,.045)); pupil=material('Piona_Pupil',(.035,.016,.012)); lip=material('Piona_Mouth',(.41,.13,.10)); blush=material('Piona_Blush',(1,.42,.36))
parts={}
def record(o,slot,mat):
    o.data.materials.append(mat); parts.setdefault(slot,[]).append(o)
    for p in o.data.polygons:p.use_smooth=True
    return o
def ellipsoid(slot,mat,center,scale,segments=24,rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=center)
    o=bpy.context.object; o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return record(o,slot,mat)
def tube(slot,mat,points,radii,segments=16):
    verts=[]; faces=[]
    for i,p in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize(); side=tangent.cross(Vector((0,1,0))).normalized(); other=tangent.cross(side).normalized()
        radius=radii[i]; rx,ry=radius if isinstance(radius,tuple) else (radius,radius)
        for j in range(segments):
            a=2*math.pi*j/segments; verts.append(Vector(p)+side*(math.cos(a)*rx)+other*(math.sin(a)*ry))
    for i in range(len(points)-1):
        for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,b,b+segments,a+segments))
    faces.extend([tuple(reversed(range(segments))),tuple((len(points)-1)*segments+j for j in range(segments))])
    mesh=bpy.data.meshes.new(slot);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(slot,mesh);bpy.context.collection.objects.link(o)
    return record(o,slot,mat)

# Fixed contract: all positions in meters, Z up, -Y facing.
ellipsoid('Face',skin,(0,0,1.23),(.36,.275,.285),64,40)
for side in [-1,1]:
    ellipsoid('Face',skin,(side*.335,-.015,1.12),(.061,.045,.071))
    ellipsoid('Face',skin,(side*.338,-.055,1.12),(.031,.009,.044))
ellipsoid('Face',skin,(0,-.270,1.125),(.014,.014,.012))
tube('CoveredTorso',skin,[(0,0,.48),(0,0,.59),(0,0,.74),(0,0,.86)],[(.17,.105),(.21,.12),(.20,.12),(.16,.10)],24)
tube('BaseBody',skin,[(0,0,.89),(0,0,.92),(0,0,.965),(0,0,.995)],[.075,.066,.061,.055],24)
for side in [-1,1]:
    tube('UpperArms',skin,[(side*.20,0,.86),(side*.27,0,.79),(side*.32,-.008,.74)],[.077,.07,.064])
    tube('Forearms',skin,[(side*.30,-.005,.76),(side*.34,-.01,.72),(side*.40,-.02,.65),(side*.46,-.025,.60)],[.065,.061,.053,.045])
    ellipsoid('BaseBody',skin,(side*.485,-.025,.585),(.060,.041,.027))
    for finger in range(4):
        y=-.053+finger*.019
        tube('BaseBody',skin,[(side*.505,y,.581),(side*(.551-abs(finger-1.5)*.006),y,.563)],[.012,.009],10)
    tube('BaseBody',skin,[(side*.470,-.047,.590),(side*.485,-.082,.565)],[.019,.012],12)
    # Covered upper thigh is omitted; the cut is 25 mm inside the shorts cuff.
    tube('BaseBody',skin,[(side*.11,0,.425),(side*.112,-.008,.35),(side*.115,-.015,.30),(side*.115,-.015,.28),(side*.115,-.010,.25),(side*.115,0,.17),(side*.115,0,.08)],[.077,.072,.069,.068,.066,.060,.052])
    ellipsoid('BaseBody',skin,(side*.115,-.052,.06),(.076,.118,.06))
    tube('Bottom',olive,[(side*.10,0,.55),(side*.105,0,.48),(side*.11,0,.42),(side*.11,0,.385)],[(.115,.14),(.116,.138),(.117,.14),(.118,.142)],24)
ellipsoid('Bottom',olive,(0,.005,.52),(.213,.137,.083),32,20)

# Separate cloth silhouettes share the same rig/weights. Torso body is occluded.
for slot,mat,hem in [('Top_Tee',cream,.56),('Top_Sweater',blue,.54)]:
    tube(slot,mat,[(0,0,hem),(0,0,.59),(0,0,.66),(0,0,.76),(0,0,.84),(0,0,.88),(0,0,.915)],[(.222,.149),(.226,.151),(.214,.145),(.204,.135),(.188,.119),(.151,.097),(.076,.073)],32)
    for side in [-1,1]:
        if slot=='Top_Tee':points=[(side*.135,0,.845),(side*.20,0,.835),(side*.27,0,.78),(side*.31,-.005,.75)];radii=[.115,.11,.093,.080]
        else:points=[(side*.135,0,.845),(side*.20,0,.835),(side*.27,0,.78),(side*.34,-.01,.72),(side*.40,-.02,.65),(side*.455,-.025,.605)];radii=[.115,.11,.093,.083,.075,.058]
        tube(slot,mat,points,radii)

# Curved facial patches follow the head surface instead of protruding eyeballs.
def continuous_top(slot,mat):
    """One quad surface with shared armhole vertices; no sleeve/torso intersection seam."""
    for o in parts.pop(slot,[]):bpy.data.objects.remove(o,do_unlink=True)
    short=slot=='Top_Tee';hem=.555 if short else .545
    levels=[(hem,.250,.180),(hem+.012,.252,.180),(.65,.224,.153),(.755,.209,.134),(.825,.203,.125),(.875,.173,.105),(.905,.090,.076),(.915,.080,.071)]
    n=32;verts=[];faces=[];authored={}
    for z,rx,ry in levels:
        for j in range(n):
            a=j*math.pi*2/n;authored[len(verts)]={('Hips' if z<.65 else 'Spine' if z<.76 else 'Chest'):1};verts.append((rx*math.cos(a),ry*math.sin(a),z))
    for ring in range(len(levels)-1):
        for j in range(n):
            if ring in [3,4] and (j in list(range(28,32))+list(range(4))+list(range(12,20))):continue
            a=ring*n+j;b=ring*n+(j+1)%n;faces.append((a,b,b+n,a+n))
    for side,center in [(1,0),(-1,16)]:
        js=[(center+k)%n for k in range(-4,5)]
        loop=[5*n+j for j in js]+[4*n+js[-1],3*n+js[-1]]+[3*n+j for j in reversed(js[:-1])]+[4*n+js[0]]
        bone='Left' if side>0 else 'Right'
        for i in loop:authored[i]={'Chest':.5,bone+'UpperArm':.5}
        centerpoint=Vector((side*.198,0,.815));axis=Vector((side*.707,0,-.707));u=Vector((0,1,0));v=axis.cross(u).normalized()
        angles=[math.atan2((Vector(verts[i])-centerpoint).dot(v),(Vector(verts[i])-centerpoint).dot(u)) for i in loop]
        rings=[((side*.265,-.003,.788),.094),((side*.295,-.005,.757),.083),((side*.305,-.006,.747),.081)] if short else [((side*.265,-.003,.788),.094),((side*.34,-.01,.72),.085),((side*.40,-.02,.65),.074),((side*.445,-.025,.61),.059),((side*.454,-.025,.602),.058)]
        for point,radius in rings:
            new=[]
            elbow=max(0,min(1,(abs(point[0])-.30)/.08))
            for a in angles:
                authored[len(verts)]={bone+'UpperArm':1-elbow,bone+'LowerArm':elbow};new.append(len(verts));verts.append(Vector(point)+u*math.cos(a)*radius+v*math.sin(a)*radius)
            for j in range(len(loop)):k=(j+1)%len(loop);faces.append((loop[j],loop[k],new[k],new[j]))
            loop=new
    mesh=bpy.data.meshes.new(slot);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(slot,mesh);bpy.context.collection.objects.link(o);record(o,slot,mat)
    for bone in sorted({bone for value in authored.values() for bone in value}):o.vertex_groups.new(name=bone)
    for i,value in authored.items():
        for bone,w in value.items():
            if w>0:o.vertex_groups[bone].add([i],w,'REPLACE')
    bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(mesh);bm.free()
continuous_top('Top_Tee',cream);continuous_top('Top_Sweater',blue)

def eye_patch(mat,cx,cz,rx,rz,offset):
    verts=[];faces=[];rings=6;segments=32
    for i in range(rings+1):
        radius=max(.001,i/rings)
        for j in range(segments):
            a=j*math.pi*2/segments;x=cx+rx*radius*math.cos(a);z=min(1.223,cz+rz*radius*math.sin(a))
            y=-.275*math.sqrt(max(.01,1-(x/.36)**2-((z-1.23)/.285)**2))-offset
            verts.append((x,y,z))
    for i in range(rings):
        for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,a+segments,b+segments,b))
    mesh=bpy.data.meshes.new('EyePatch');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Eyes',mesh);bpy.context.collection.objects.link(o);record(o,'Eyes',mat)
    # Ensure the visible side faces outward toward -Y.
    for p in mesh.polygons:
        if p.normal.y>0:p.flip()
for side in [-1,1]:
    eye_patch(white,side*.145,1.209,.090,.048,.003)
    eye_patch(iris,side*.145,1.213,.038,.039,.005)
    eye_patch(pupil,side*.145,1.216,.022,.027,.007)
    eye_patch(white,side*.134,1.219,.008,.005,.009)
    tube('Eyes',pupil,[(side*.145-.089+i*.0178,-.275*math.sqrt(max(.01,1-((side*.145-.089+i*.0178)/.36)**2-((1.223-1.23)/.285)**2))-.007,1.223) for i in range(11)],[.0035]*11,8)
    tube('Brows',hair,[(side*.145-.065+i*.013,-.260,1.326+.008*math.sin(i*math.pi/10)) for i in range(11)],[.0045]*11,8)
    ellipsoid('Cheeks',blush,(side*.22,-.205,1.105),(.035,.002,.010),20,12)
mouth=tube('Mouth',lip,[(-.023+i*.0046,-.228,1.055+.004*math.sin(i*math.pi/10)) for i in range(11)],[.0025]*11,8)

def hair_lock(slot,points,widths,depths,outward):
    verts=[];faces=[];segments=12
    for i,p in enumerate(points):
        tangent=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized()
        side=tangent.cross(Vector(outward)).normalized();normal=side.cross(tangent).normalized()
        for j in range(segments):
            a=j*math.pi*2/segments;verts.append(Vector(p)+side*math.cos(a)*widths[i]+normal*math.sin(a)*depths[i])
    for i in range(len(points)-1):
        for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,b,b+segments,a+segments))
    faces.extend([tuple(reversed(range(segments))),tuple((len(points)-1)*segments+j for j in range(segments))])
    mesh=bpy.data.meshes.new('Tapered hair lock');mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(slot,mesh);bpy.context.collection.objects.link(o);record(o,slot,hair)

def haircap(slot,bob):
    verts=[];faces=[];cols=48;rows=16
    for i in range(rows+1):
        for j in range(cols):
            a=2*math.pi*j/cols
            # Front is -Y: shorter forehead edge, longer side/back silhouette.
            front=max(0,-math.sin(a));limit=2.23-front*1.04+(0.12 if bob else 0)
            t=.015+(limit-.015)*i/rows
            verts.append((.385*math.sin(t)*math.cos(a),.307*math.sin(t)*math.sin(a)+.025,1.275+.325*math.cos(t)))
    for i in range(rows):
        for j in range(cols):a=i*cols+j;b=i*cols+(j+1)%cols;faces.append((a,a+cols,b+cols,b))
    mesh=bpy.data.meshes.new(slot);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(slot,mesh);bpy.context.collection.objects.link(o);record(o,slot,hair)
    # Broad, shallow swept locks; taper to fine tips rather than spherical clumps.
    for side in [-1,1]:
        for i in range(3):
            x=side*(.045+i*.105);z=1.258+i*.006
            points=[(side*.015,-.045,1.595),(x*.65,-.20,1.54),(x,-.292,1.41),(x-side*.025,-.298,z+.065),(x-side*.065,-.284,z)]
            hair_lock(slot,points,[.014,.073,.082,.050,.001],[.008,.019,.020,.012,.001],(0,-1,0))
    for j in range(17):
        a=-.38+j*(math.pi+.76)/16;radial=Vector((math.cos(a),math.sin(a),0))
        for layer in range(2):
            t0=.50+layer*.56;t1=1.43+layer*.38;t2=2.12+layer*.12+(.16 if bob else 0)
            points=[]
            for t,r,twist in [(t0,1,0),(t1,1.01,0),(t2-.16,1.015,.03),(t2,1.04,.05)]:
                angle=a+twist;points.append((.388*r*math.sin(t)*math.cos(angle),.315*r*math.sin(t)*math.sin(angle)+.025,1.275+.33*math.cos(t)))
            hair_lock(slot,points,[.025,.080,.064,.001],[.009,.021,.014,.001],radial)
haircap('Hair_Short',False);haircap('Hair_Bob',True)

# Retain the Smart Topology draft's authored silhouette and UVs for the head.
# Welding UV-boundary duplicates in inspect_smart.py preserves UV loop data.
smart_source=OUT/'Meshy-SmartTopology/Inspected.blend'
if not smart_source.exists():raise RuntimeError('Run inspect_smart.py on the saved Smart Topology GLB first.')
for slot in ['Face','Eyes','Brows','Mouth','Cheeks','Hair_Short','Hair_Bob']:
    for o in parts.pop(slot,[]):bpy.data.objects.remove(o,do_unlink=True)
mapping={'SmartPart_0':'Hair_Short','SmartPart_2':'Face','SmartPart_7':'Eyes','SmartPart_8':'Eyes','SmartPart_9':'Eyes','SmartPart_10':'Brows','SmartPart_11':'Brows'}
with bpy.data.libraries.load(str(smart_source),link=False) as (source,target):
    target.objects=list(mapping)
for o in target.objects:
    original=o.name;bpy.context.collection.objects.link(o);slot=mapping[original];o.name=slot
    for v in o.data.vertices:v.co=(v.co.x*1.50,v.co.y*1.20+.07,v.co.z*1.55+.864)
    if slot=='Hair_Short':
        for v in o.data.vertices:
            x,y,z=v.co;front=max(0,min(1,(-y-.09)/.06));tip=max(0,min(1,(1.36-z)/.10))
            v.co.y-=.018*front*tip
    if slot=='Face':
        # The generated head includes a fragment of its original neckline; remove it.
        bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z<.91],context='VERTS');bm.to_mesh(o.data);bm.free()
    for mat in o.data.materials:mat.name='Piona_SmartSurface'
    for p in o.data.polygons:p.use_smooth=True
    parts.setdefault(slot,[]).append(o)
    if slot=='Hair_Short':
        bob=o.copy();bob.data=o.data.copy();bpy.context.collection.objects.link(bob);bob.name='Hair_Bob'
        for v in bob.data.vertices:
            x,y,z=v.co
            # Extend only side/back tips; preserve forehead, face clearance and the rig.
            rear=max(0,min(1,(y+.15)/.20));lower=max(0,min(1,(1.30-z)/.30))
            v.co.z-=.055*rear*lower;v.co.x*=1+.035*rear*lower
        parts['Hair_Bob']=[bob]

# A closed eyelid surface covers the generated eye sockets during a blink.
# Collapsing the textured eyeballs alone would expose the hollow socket.
for side in [-1,1]:
    verts=[];faces=[];nr=8;ns=32
    for r in range(nr+1):
        for j in range(ns):
            a=j*math.pi*2/ns;radius=max(.0001,r/nr);x=side*.14+.111*radius*math.cos(a);z=1.148+.067*radius*math.sin(a)
            y=-.205+.095*(x/.35)**2+.08*((z-1.17)/.35)**2;verts.append((x,y,z))
    for r in range(nr):
        for j in range(ns):a=r*ns+j;b=r*ns+(j+1)%ns;faces.append((a,a+ns,b+ns,b))
    mesh=bpy.data.meshes.new('Closed eyelid');mesh.from_pydata(verts,[],faces);mesh.update()
    for f in mesh.polygons:
        if f.normal.y>0:f.flip()
    o=bpy.data.objects.new('Eyelids',mesh);bpy.context.collection.objects.link(o);record(o,'Eyelids',skin)
    line=[]
    for i in range(17):
        x=side*.14-.095+i*.011875;z=1.148-.008*math.sin(i*math.pi/16);y=-.210+.095*(x/.35)**2+.08*((z-1.17)/.35)**2;line.append((x,y,z))
    tube('Eyelids',pupil,line,[.0025]*17,8)

# Canonical A-pose skeleton. No auto-rig inference enters the shared contract.
bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0));rig=bpy.context.object;rig.name='PionaRig';rig.data.name='Piona_v1';rig.data.edit_bones.remove(rig.data.edit_bones[0])
spec=[('Root',(0,0,0),(0,0,.12),None),('Hips',(0,0,.51),(0,0,.64),'Root'),('Spine',(0,0,.64),(0,0,.77),'Hips'),('Chest',(0,0,.77),(0,0,.88),'Spine'),('Neck',(0,0,.88),(0,0,.98),'Chest'),('Head',(0,0,.98),(0,0,1.5),'Neck')]
for side,name in [(1,'Left'),(-1,'Right')]:
    spec.extend([(name+'UpperArm',(side*.20,0,.86),(side*.34,-.01,.72),'Chest'),(name+'LowerArm',(side*.34,-.01,.72),(side*.46,-.025,.60),name+'UpperArm'),(name+'Hand',(side*.46,-.025,.60),(side*.52,-.025,.58),name+'LowerArm'),(name+'UpperLeg',(side*.105,0,.51),(side*.115,-.015,.28),'Hips'),(name+'LowerLeg',(side*.115,-.015,.28),(side*.115,0,.08),name+'UpperLeg'),(name+'Foot',(side*.115,0,.08),(side*.115,-.13,.045),name+'LowerLeg')])
for name,head,tail,parent in spec:
    b=rig.data.edit_bones.new(name);b.head=head;b.tail=tail
    if parent:b.parent=rig.data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True

def weights(slot,p):
    x,y,z=p;side='Left' if x>=0 else 'Right';ax=abs(x)
    if slot.startswith('Hair') or slot in ['Face','Eyes','Mouth','Brows','Cheeks','Eyelids']:return {'Head':1}
    if slot.startswith('Top_'):
        arm=max(0,min(1,(ax-.145)/.14));arm=arm*arm*(3-2*arm)
        shoulder=max(0,min(1,(ax+z-.97)/.08));arm*=shoulder*shoulder*(3-2*shoulder)
        elbow=max(0,min(1,(ax-.30)/.08));elbow=elbow*elbow*(3-2*elbow)
        chest=max(0,min(1,(z-.70)/.10));hip=max(0,min(1,(.67-z)/.07))
        return {'Chest':(1-arm)*chest,'Spine':(1-arm)*(1-chest)*(1-hip),'Hips':(1-arm)*(1-chest)*hip,side+'UpperArm':arm*(1-elbow),side+'LowerArm':arm*elbow}
    if slot=='Bottom':
        # Match the thigh along the cuff, blend smoothly into a stationary waistband.
        t=max(0,min(1,(z-.425)/.115));t=t*t*(3-2*t)
        return {'Hips':t,side+'UpperLeg':1-t}
    if z<.58 and (slot=='Bottom' or z<.53):
        if z>.47:
            t=max(0,min(1,(z-.47)/.10));return {'Hips':t,side+'UpperLeg':1-t}
        if z>.32:return {side+'UpperLeg':1}
        if z>.22:
            t=(z-.22)/.10;return {side+'UpperLeg':t,side+'LowerLeg':1-t}
        if z>.115:return {side+'LowerLeg':1}
        t=max(0,min(1,(z-.065)/.05));return {side+'LowerLeg':t,side+'Foot':1-t}
    if ax>.23 and z>.52:
        if ax<.30:return {side+'UpperArm':1}
        if ax<.38:
            t=(ax-.30)/.08;return {side+'UpperArm':1-t,side+'LowerArm':t}
        if ax<.43:return {side+'LowerArm':1}
        t=max(0,min(1,(ax-.43)/.05));return {side+'LowerArm':1-t,side+'Hand':t}
    if z>.90:return {'Neck':1}
    if z>.75:return {'Chest':1}
    if z>.62:return {'Spine':1}
    return {'Hips':1}

objects=[]
for slot,items in parts.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in items:o.select_set(True)
    bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join();o=bpy.context.object;o.name=slot
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    if slot.startswith('Top_'):
        smooth=o.modifiers.new('Continuous quad garment smoothing','SUBSURF');smooth.levels=2;bpy.ops.object.modifier_apply(modifier=smooth.name)
    if slot in ['Bottom','BaseBody']:
        # Voxel union removes internal caps and welds sleeve/torso or crotch junctions.
        remesh=o.modifiers.new('Continuous garment and joint surfaces','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.007 if slot=='BaseBody' else .009
        remesh.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=remesh.name)
        smooth=o.modifiers.new('Relax union','SMOOTH');smooth.factor=.65;smooth.iterations=4;bpy.ops.object.modifier_apply(modifier=smooth.name)
        if slot!='BaseBody':
            bm=bmesh.new();bm.from_mesh(o.data);remove=[]
            for face in bm.faces:
                p=face.calc_center_median();ax=abs(p.x)
                if slot=='Bottom':cut=p.z<.395
                else:
                    end=Vector((.31,-.005,.75)) if slot=='Top_Tee' else Vector((.455,-.025,.605))
                    local=Vector((ax,p.y,p.z));direction=Vector((.707,-.06,-.707))
                    cut=(ax>(.255 if slot=='Top_Tee' else .405) and (local-end).dot(direction)>-.014) or p.z<(.575 if slot=='Top_Tee' else .555) or (p.z>.903 and ax<.078)
                if cut:remove.append(face)
            bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(o.data);bm.free()
        for p in o.data.polygons:p.use_smooth=True
        if slot=='BaseBody':
            # Remove the skin cap and hidden thigh segment above the shorts opening.
            # This is an explicit visibility mask, not an intersection-test exemption.
            bm=bmesh.new();bm.from_mesh(o.data)
            bmesh.ops.delete(bm,geom=[f for f in bm.faces if .396<f.calc_center_median().z<.55 and abs(f.calc_center_median().x)<.23],context='FACES')
            bm.to_mesh(o.data);bm.free()
    # Preserve Smart Topology hair and UVs instead of subdividing the generated draft.
    for name,_,_,_ in spec:
        if not o.vertex_groups.get(name):o.vertex_groups.new(name=name)
    if not slot.startswith('Top_'):
        for v in o.data.vertices:
            for name,w in weights(slot,v.co).items():
                if w>0:o.vertex_groups[name].add([v.index],w,'REPLACE')
    mod=o.modifiers.new('Piona shared rig','ARMATURE');mod.object=rig;o.parent=rig
    if slot.startswith('Top_'):
        o.shape_key_add(name='Basis');k=o.shape_key_add(name='SitClearance')
        for v in k.data:
            x,y,z=v.co;hem=max(0,min(1,(.69-z)/.12))*max(0,min(1,(.27-abs(x))/.06));front=max(0,min(1,(-y+.03)/.14))
            v.co.z+=hem*(.030+.040*front);v.co.y-=.020*hem*front
    if slot=='Eyelids':
        basis=o.shape_key_add(name='Basis');closed=o.shape_key_add(name='Blink',from_mix=False)
        for v in basis.data:v.co.y+=.14
    if slot in ['Face','Eyes','Mouth']:
        o.shape_key_add(name='Basis')
        for key in ['Blink','Smile','Surprise']:
            k=o.shape_key_add(name=key)
            for v in k.data:
                x,y,z=v.co
                if slot=='Eyes':
                    if key=='Blink':v.co.y+=.035
                if slot=='Face':
                    eye=max(0,1-abs(abs(x)-.14)/.12)*max(0,1-abs(z-1.16)/.12)*max(0,min(1,(-y-.09)/.05))
                    if key=='Smile':
                        mouth=max(0,1-abs(z-1.005)/.045)*max(0,1-abs(x)/.08)*max(0,min(1,(-y-.07)/.06))
                        v.co.z+=mouth*(.018*min(1,abs(x)/.04)-.006)
                    if key=='Surprise':
                        mouth=max(0,1-abs(z-1.005)/.045)*max(0,1-abs(x)/.06)*max(0,min(1,(-y-.07)/.06))
                        v.co.z+=(z-1.005)*mouth*.65
                if slot=='Mouth':
                    if key=='Smile':v.co.z=z-.008+.016*(abs(x)/.025)**2
                    if key=='Surprise':
                        angle=(x+.023)/.046*math.pi*2;v.co.x=math.cos(angle)*.015;v.co.z=1.055+math.sin(angle)*.018
    if o.data.shape_keys:
        for key in o.data.shape_keys.key_blocks:key.value=0
        o.active_shape_key_index=0
    objects.append(o)

rig['contract']='Piona_v1';rig['status']='REFINEMENT_REQUIRES_VISUAL_GATE';rig['source']='Meshy Smart Topology head/hair -> Blender canonical rig, modular clothing and expression refinement'
# Export only the intended authored content; cameras/reference drafts stay outside FBX.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.fbx(filepath=str(UNITY/'Piona_Modular.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',apply_unit_scale=True,mesh_smooth_type='FACE',use_mesh_modifiers=False)
for o in objects:o.hide_render=o.name in ['Hair_Bob','Top_Sweater']
# Save the editable file after export, with one visible outfit.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Piona_Modular.blend'))
def topology(o):
    bm=bmesh.new();bm.from_mesh(o.data);unseen=set(bm.verts);components=0
    while unseen:
        components+=1;stack=[unseen.pop()]
        while stack:
            v=stack.pop()
            for e in v.link_edges:
                other=e.other_vert(v)
                if other in unseen:unseen.remove(other);stack.append(other)
    boundary={e for e in bm.edges if e.is_boundary};loops=0
    while boundary:
        loops+=1;stack=[boundary.pop()]
        while stack:
            e=stack.pop()
            for v in e.verts:
                for adjacent in v.link_edges:
                    if adjacent in boundary:boundary.remove(adjacent);stack.append(adjacent)
    result={'connectedComponents':components,'boundaryLoops':loops,'nonManifoldInteriorEdges':sum(1 for e in bm.edges if not e.is_manifold and not e.is_boundary)};bm.free();return result
report={'status':'smart-topology-refinement-visual-gate-required','contract':'Piona_v1','heightMeters':1.60,'smartTopologyTask':'01a16539-5017-742a-911e-e2b5f8e286f5','bones':[s[0] for s in spec],'parts':[{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'shapeKeys':[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else [],**topology(o)} for o in objects],'limitations':['Smart Topology head and hair preserve the draft likeness; original side/back sheet remains the art authority.','Simple body and limb geometry remain appropriate for a customization prototype rather than final production anatomy.','Use the separate Unity-deformed triangle intersection report and review views for sampled clipping acceptance.']}
for p in report['parts']:
    if p['name'].startswith('Top_') and (p['connectedComponents']!=1 or p['boundaryLoops']!=4 or p['nonManifoldInteriorEdges']!=0):raise RuntimeError('Garment topology contract failed: '+str(p))
(ROOT/'Docs/Validation/blender-character.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
