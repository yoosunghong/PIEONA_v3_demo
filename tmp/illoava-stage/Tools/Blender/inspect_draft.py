import bpy,json,sys
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'ArtSource/Characters/Piona/Meshy/model.glb'))
parts=[]
for o in bpy.context.scene.objects:
    if o.type=='MESH':
        edges={tuple(sorted(e.vertices)) for e in o.data.edges}
        parts.append({'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'materials':[m.name for m in o.data.materials], 'armature':any(m.type=='ARMATURE' for m in o.modifiers),'shapeKeys':len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0})
report={'taskId':'01a1650f-996d-75f4-90dd-1f808363077c','parts':parts,'decision':'reference-only; reconstruct common modular engineering base','reason':'Generated draft is not delivered with the canonical rig, authored hair/top slots or expression shapes. Preserve it for silhouette reference; use explicit Blender mesh parts and fixed rig for the swap proof.','visualReview':'Meshy thumbnail inspected; compare original side/back views during art review. A single front-derived draft does not prove multi-view fidelity.'}
(root/'Docs/Validation/meshy-draft-inspection.json').write_text(json.dumps(report,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(root/'ArtSource/Characters/Piona/Meshy/Draft_Inspection.blend'))
print(json.dumps(report,indent=2))
