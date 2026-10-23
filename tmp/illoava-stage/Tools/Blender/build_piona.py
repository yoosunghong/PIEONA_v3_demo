"""Deterministic modular engineering base; retains Meshy draft as reference.
Run: blender --background --python Tools/Blender/build_piona.py -- PROJECT_ROOT
"""
import bpy, math, json, sys
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
skin=material('Piona_Skin',(1,.76,.66)); hair=material('Piona_Hair',(.95,.86,.75)); cream=material('Piona_Cream',(.93,.87,.72))
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
ellipsoid('Face',skin,(0,0,1.23),(.36,.285,.35),48,32)
for side in [-1,1]:
    ellipsoid('Face',skin,(side*.345,-.005,1.17),(.068,.063,.096))
    ellipsoid('Face',skin,(side*.347,-.055,1.17),(.036,.012,.06))
ellipsoid('Face',skin,(0,-.284,1.18),(.036,.03,.032))
tube('CoveredTorso',skin,[(0,0,.48),(0,0,.59),(0,0,.74),(0,0,.86)],[(.17,.105),(.21,.12),(.20,.12),(.16,.10)],24)
ellipsoid('BaseBody',skin,(0,0,.91),(.08,.075,.09))
for side in [-1,1]:
    tube('UpperArms',skin,[(side*.20,0,.86),(side*.27,0,.79),(side*.32,-.008,.74)],[.077,.07,.064])
    tube('Forearms',skin,[(side*.30,-.005,.76),(side*.34,-.01,.72),(side*.40,-.02,.65),(side*.46,-.025,.60)],[.065,.061,.053,.045])
    ellipsoid('BaseBody',skin,(side*.48,-.025,.585),(.069,.046,.046))
    # Small thumb, shared hand bone, never separate decorative accessories.
    ellipsoid('BaseBody',skin,(side*.47,-.067,.59),(.026,.025,.035))
    tube('BaseBody',skin,[(side*.105,0,.51),(side*.11,0,.40),(side*.115,-.015,.28),(side*.115,0,.17),(side*.115,0,.08)],[.086,.08,.067,.06,.052])
    ellipsoid('BaseBody',skin,(side*.115,-.052,.06),(.076,.118,.06))
    tube('Bottom',olive,[(side*.10,0,.56),(side*.105,0,.48),(side*.11,0,.37)],[(.115,.14),(.113,.135),(.10,.12)])

# Separate cloth silhouettes share the same rig/weights. Torso body is occluded.
for slot,mat,hem in [('Top_Tee',cream,.56),('Top_Sweater',blue,.54)]:
    tube(slot,mat,[(0,0,hem),(0,0,.62),(0,0,.76),(0,0,.86),(0,0,.91)],[(.22,.14),(.225,.145),(.215,.14),(.19,.12),(.083,.08)],32)
    for side in [-1,1]:
        if slot=='Top_Tee':points=[(side*.18,0,.86),(side*.27,0,.79),(side*.31,-.005,.75)];radii=[.11,.10,.09]
        else:points=[(side*.18,0,.86),(side*.27,0,.79),(side*.34,-.01,.72),(side*.40,-.02,.65),(side*.46,-.025,.60)];radii=[.11,.10,.09,.08,.067]
        tube(slot,mat,points,radii)

# Curved facial patches follow the head surface instead of protruding eyeballs.
def eye_patch(mat,cx,cz,rx,rz,offset):
    verts=[];faces=[];rings=6;segments=32
    for i in range(rings+1):
        radius=max(.001,i/rings)
        for j in range(segments):
            a=j*math.pi*2/segments;x=cx+rx*radius*math.cos(a);z=min(1.286,cz+rz*radius*math.sin(a))
            y=-.285*math.sqrt(max(.01,1-(x/.36)**2-((z-1.23)/.35)**2))-offset
            verts.append((x,y,z))
    for i in range(rings):
        for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,a+segments,b+segments,b))
    mesh=bpy.data.meshes.new('EyePatch');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Eyes',mesh);bpy.context.collection.objects.link(o);record(o,'Eyes',mat)
    # Ensure the visible side faces outward toward -Y.
    for p in mesh.polygons:
        if p.normal.y>0:p.flip()
for side in [-1,1]:
    eye_patch(white,side*.13,1.255,.092,.047,.004)
    eye_patch(iris,side*.13,1.25,.039,.041,.007)
    eye_patch(pupil,side*.13,1.251,.021,.028,.009)
    eye_patch(white,side*.115,1.271,.009,.008,.011)
    tube('Eyes',pupil,[(side*.13-.085+i*.017,-.285*math.sqrt(max(.01,1-((side*.13-.085+i*.017)/.36)**2-((1.286-1.23)/.35)**2))-.009,1.286) for i in range(11)],[.004]*11,8)
    tube('Brows',hair,[(side*.13-.075+i*.015,-.259,1.368+.014*math.sin(i*math.pi/10)) for i in range(11)],[.006]*11,8)
    ellipsoid('Cheeks',blush,(side*.22,-.224,1.16),(.035,.004,.014),20,12)
mouth=tube('Mouth',lip,[(-.042+i*.0084,-.272,1.105+.008*math.sin(i*math.pi/10)) for i in range(11)],[.004]*11,8)

def haircap(slot,bob):
    verts=[];faces=[];cols=48;rows=16
    for i in range(rows+1):
        for j in range(cols):
            a=2*math.pi*j/cols
            # Front is -Y: shorter forehead edge, longer side/back silhouette.
            front=max(0,-math.sin(a));limit=2.10-front*.96+(0.14 if bob else 0)
            t=.015+(limit-.015)*i/rows
            verts.append((.386*math.sin(t)*math.cos(a),.315*math.sin(t)*math.sin(a)+.025,1.255+.357*math.cos(t)))
    for i in range(rows):
        for j in range(cols):a=i*cols+j;b=i*cols+(j+1)%cols;faces.append((a,a+cols,b+cols,b))
    mesh=bpy.data.meshes.new(slot);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(slot,mesh);bpy.context.collection.objects.link(o);record(o,slot,hair)
    for side in [-1,1]:
        for i in range(4):
            x=side*(.07+i*.075)
            tube(slot,hair,[(x*.6,-.16,1.57),(x,-.29,1.49),(x+side*.025,-.31,1.37),(x+side*.04,-.292,1.31+i*.018)],[.05,.064,.045,.004],12)
        for i in range(4):
            z=1.25-i*.07;length=.14 if bob else .07
            tube(slot,hair,[(side*.32,.04,z+.1),(side*.37,-.02,z),(side*(.35+(.01 if bob else .035)),-.035,z-length)],[.07,.07,.004],12)
haircap('Hair_Short',False);haircap('Hair_Bob',True)

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
    if slot.startswith('Hair') or slot in ['Face','Eyes','Mouth','Brows','Cheeks']:return {'Head':1}
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
    if slot.startswith('Hair_') or slot.startswith('Top_'):
        soft=o.modifiers.new('Soft authoring surfaces','SUBSURF');soft.levels=1
        bpy.ops.object.modifier_apply(modifier=soft.name)
    for name,_,_,_ in spec:o.vertex_groups.new(name=name)
    for v in o.data.vertices:
        for name,w in weights(slot,v.co).items():
            if w>0:o.vertex_groups[name].add([v.index],w,'REPLACE')
    mod=o.modifiers.new('Piona shared rig','ARMATURE');mod.object=rig;o.parent=rig
    if slot in ['Face','Eyes','Mouth']:
        o.shape_key_add(name='Basis')
        for key in ['Blink','Smile','Surprise']:
            k=o.shape_key_add(name=key)
            for v in k.data:
                x,y,z=v.co
                if slot=='Eyes':
                    if key=='Blink':v.co.z=1.255+(z-1.255)*.08
                    if key=='Surprise':v.co.z=1.255+(z-1.255)*1.20
                    if key=='Smile':v.co.z=1.255+(z-1.255)*.65
                if slot=='Mouth':
                    if key=='Smile':v.co.z=z-.013+.025*(abs(x)/.045)**2
                    if key=='Surprise':
                        angle=(x+.042)/.084*math.pi*2;v.co.x=math.cos(angle)*.022;v.co.z=1.105+math.sin(angle)*.026
    objects.append(o)

rig['contract']='Piona_v1';rig['status']='ENGINEERING_PROTOTYPE_REQUIRES_ART_REVIEW';rig['source']='Meshy reference -> deterministic Blender reconstruction'
# Export only the intended authored content; cameras/reference drafts stay outside FBX.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True)
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.fbx(filepath=str(UNITY/'Piona_Modular.fbx'),use_selection=True,object_types={'ARMATURE','MESH'},add_leaf_bones=False,bake_anim=False,axis_forward='-Z',axis_up='Y',apply_unit_scale=True,mesh_smooth_type='FACE',use_mesh_modifiers=False)
for o in objects:o.hide_render=o.name in ['Hair_Bob','Top_Sweater']
# Save the editable file after export, with one visible outfit.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Piona_Modular.blend'))
report={'status':'engineering-prototype-art-review-required','contract':'Piona_v1','heightMeters':1.60,'bones':[s[0] for s in spec],'parts':[{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'shapeKeys':[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else []} for o in objects],'limitations':['Parametric reconstruction preserves fixed proportions but needs artistic silhouette review against original views.','Disconnected body components and simple hand geometry need production retopology review.','Skinning and garment intersections require walk/sit visual validation.']}
(ROOT/'Docs/Validation/blender-character.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
