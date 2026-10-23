import bpy,sys,json,bmesh
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'ArtSource/Characters/Piona/Meshy-SmartTopology/model.glb'))
report=[]
for o in list(bpy.context.scene.objects):
    if o.type!='MESH':continue
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.to_mesh(o.data);bm.free()
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
for i,o in enumerate(sorted([o for o in bpy.context.scene.objects if o.type=='MESH'],key=lambda o:len(o.data.vertices),reverse=True)):
    o.name='SmartPart_'+str(i)
    bounds=[o.matrix_world@Vector(c) for c in o.bound_box]
    report.append({'name':o.name,'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'min':[min(v[k] for v in bounds) for k in range(3)],'max':[max(v[k] for v in bounds) for k in range(3)],'materials':[m.name for m in o.data.materials]})
bpy.ops.wm.save_as_mainfile(filepath=str(root/'ArtSource/Characters/Piona/Meshy-SmartTopology/Inspected.blend'))
(root/'Docs/Validation/Refinement/smart-components.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'components':len(report),'triangles':sum(p['triangles'] for p in report),'largest':report[:8]},indent=2))
