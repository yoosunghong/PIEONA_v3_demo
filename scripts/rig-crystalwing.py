"""Rebuild Crystalwing's armature, spatial skin weights, and web assets from the supplied FBX.
Run: blender --background --factory-startup --python scripts/rig-crystalwing.py -- <source-folder>
"""
import bpy, sys, json, math, shutil
from pathlib import Path
from mathutils import Vector, Quaternion
base=Path(__file__).resolve().parents[1]
import tempfile
(base/'tmp/blender-crystalwing').mkdir(parents=True,exist_ok=True)
tempfile.tempdir=str(base/'tmp/blender-crystalwing')
source=Path(sys.argv[sys.argv.index('--')+1])
fbx=next(source.rglob('*.fbx'))
out=base/'public/models/crystalwing';out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(fbx))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();obj=bpy.context.object;obj.name='Crystalwing_Wyrmling'
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
# Ground the source, retaining its original proportions. Blender Z up, front -Y.
low=min(v.co.z for v in obj.data.vertices)
for v in obj.data.vertices:v.co.z-=low
# Anatomical pivots in normalized source coordinates.
spec=[('body',None,(0,.02,.34),(0,-.04,.47)),('head','body',(0,-.18,.36),(0,-.32,.42)),('tail','body',(0,.15,.25),(-.12,.28,.13)),('tail_tip','tail',(-.12,.28,.13),(-.25,.33,.04))]
for s,label in [(-1,'L'),(1,'R')]:
 spec.extend([(f'wing_{label}','body',(s*.10,.06,.43),(s*.25,.14,.59)),(f'wing_tip_{label}',f'wing_{label}',(s*.25,.14,.59),(s*.43,.25,.77)),(f'front_{label}','body',(s*.12,-.13,.28),(s*.14,-.21,.18)),(f'front_paw_{label}',f'front_{label}',(s*.14,-.21,.18),(s*.17,-.25,.13)),(f'hind_{label}','body',(s*.13,.12,.26),(s*.19,.17,.17)),(f'hind_paw_{label}',f'hind_{label}',(s*.19,.17,.17),(s*.21,.22,.12))])
armdata=bpy.data.armatures.new('Crystalwing_Skeleton');arm=bpy.data.objects.new('Crystalwing_Rig',armdata);bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);obj.select_set(False);bpy.ops.object.mode_set(mode='EDIT')
for name,parent,head,tail in spec:
 b=armdata.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=armdata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
groups={name:obj.vertex_groups.new(name=name) for name,*_ in spec}
def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
allweights=[]
for v in obj.data.vertices:
 x,y,z=v.co;s='L' if x<0 else 'R';ax=abs(x)
 head=(1-smooth(-.20,-.07,y))*(1-smooth(.53,.64,z))
 wing=smooth(.14,.24,ax)*smooth(.41,.55,z)*smooth(-.20,-.09,y)*(1-head)
 tail=smooth(.16,.29,y)*(1-smooth(.17,.30,z))*(1-wing)*(1-head)
 leg=(1-smooth(.21,.31,z))*smooth(.065,.13,ax)*(1-tail)*(1-head)*(1-wing)
 front=1-smooth(-.05,.07,y);paw=1-smooth(.15,.22,z);tip=smooth(.23,.34,y);wt=smooth(.23,.39,ax)
 w={'head':head,f'wing_{s}':wing*(1-wt),f'wing_tip_{s}':wing*wt,'tail':tail*(1-tip),'tail_tip':tail*tip,f'front_{s}':leg*front*(1-paw),f'front_paw_{s}':leg*front*paw,f'hind_{s}':leg*(1-front)*(1-paw),f'hind_paw_{s}':leg*(1-front)*paw}
 w['body']=max(0,1-sum(w.values()));top=sorted(w.items(),key=lambda a:a[1],reverse=True)[:4];total=sum(n for _,n in top);top=[(name,n/total) for name,n in top]
 for name,n in top:
  if n>0:groups[name].add([v.index],n,'REPLACE')
 allweights.append(top)
mod=obj.modifiers.new('Crystalwing skin','ARMATURE');mod.object=arm;obj.parent=arm
# Relink portable PBR textures explicitly.
mat=bpy.data.materials.new('Crystalwing PBR');mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=nodes.get('Principled BSDF')
for suffix,socket in [('', 'Base Color'),('_roughness','Roughness'),('_metallic','Metallic'),('_normal','Normal')]:
 path=fbx.with_name(fbx.stem+suffix+'.png');dest=out/('crystalwing'+suffix+'.png');shutil.copyfile(path,dest)
 tex=nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(dest))
 if suffix:tex.image.colorspace_settings.name='Non-Color'
 if suffix=='_normal':
  normal=nodes.new('ShaderNodeNormalMap');links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],bs.inputs['Normal'])
 else:links.new(tex.outputs['Color'],bs.inputs[socket])
obj.data.materials.clear();obj.data.materials.append(mat)
# Split on UV seams, preserving the same four skin influences in the web geometry.
obj.data.calc_loop_triangles();pos=[];norm=[];uv=[];indices=[];weights=[];skin=[];lookup={};names=[s[0] for s in spec]
def vec(v):return [round(v.x,7),round(v.z,7),round(-v.y,7)]
for tri in obj.data.loop_triangles:
 for li in tri.loops:
  loop=obj.data.loops[li];vi=loop.vertex_index;t=obj.data.uv_layers.active.data[li].uv;key=(vi,round(t.x,7),round(t.y,7))
  if key not in lookup:
   lookup[key]=len(pos)//3;pos.extend(vec(obj.data.vertices[vi].co));norm.extend(vec(loop.normal));uv.extend([round(t.x,7),round(t.y,7)])
   pairs=allweights[vi];skin.extend([names.index(n) for n,w in pairs]);weights.extend([round(w,7) for n,w in pairs])
  indices.append(lookup[key])
bones=[{'name':n,'parent':names.index(p) if p else -1,'position':vec(Vector(h))} for n,p,h,t in spec]
(base/'src/crystalwingSkin.json').write_text(json.dumps({'position':pos,'normal':norm,'uv':uv,'index':indices,'skinIndex':skin,'skinWeight':weights,'bones':bones},separators=(',',':')))
# A portable looping flight action accompanies the procedural browser animation.
bpy.context.scene.render.fps=25
bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=29
for frame in range(1,30):
 phase=(frame-1)/28*math.tau
 for pb in arm.pose.bones:
  axis=Vector((1,0,0));angle=0
  if pb.name.startswith('wing_'):
   sign=1 if pb.name.endswith('_L') else -1
   angle=sign*((.10+math.sin(phase-.6)*.14) if 'tip' in pb.name else (.48+math.sin(phase)*.32));axis=Vector((0,-1,0))
  elif pb.name.startswith('front_') and 'paw' not in pb.name:angle=-.22
  elif pb.name.startswith('hind_') and 'paw' not in pb.name:angle=.28
  elif pb.name.startswith('tail'):
   angle=math.sin(phase-(.7 if 'tip' in pb.name else 0))*(.18 if 'tip' in pb.name else .12);axis=Vector((0,0,1))
  basis=pb.bone.matrix_local.to_quaternion();pb.rotation_mode='QUATERNION'
  pb.rotation_quaternion=basis.inverted() @ Quaternion(axis,angle) @ basis
  pb.keyframe_insert(data_path='rotation_quaternion',frame=frame,group=pb.name)
arm.animation_data.action.name='Crystalwing_Flight'
bpy.context.scene.frame_set(1)
(base/'resource/crystalwing').mkdir(parents=True,exist_ok=True)
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(base/'resource/crystalwing/crystalwing-rigged.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'crystalwing-rigged.glb'),export_format='GLB',export_animations=True)
print('CRYSTALWING_RIG',len(pos)//3,'vertices',len(indices)//3,'triangles',len(bones),'bones')



