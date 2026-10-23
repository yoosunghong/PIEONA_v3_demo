"""Neutral Blender review views; editable source is not modified."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]);bpy.ops.wm.open_mainfile(filepath=str(root/'ArtSource/Characters/Piona/Piona_Modular.blend'))
for o in bpy.context.scene.objects:
    if o.type=='MESH':o.hide_render=o.name in ['Hair_Bob','Top_Sweater','CoveredTorso','UpperArms']
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=16
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world.color=(.6,.6,.6);scene.view_settings.view_transform='AgX'
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
for position,energy,size in [((2,-3,4),450,4),((-2,-1,2),250,3),((0,2,3),350,3)]:
    bpy.ops.object.light_add(type='AREA',location=position);o=bpy.context.object;o.data.energy=energy;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,1))
bpy.ops.object.camera_add(location=(0,-4,1));camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=1.95
out=root/'Docs/Validation/Refinement';out.mkdir(parents=True,exist_ok=True)
for name,p in [('front',(0,-4,1)),('side',(4,0,1)),('back',(0,4,1))]:
    camera.location=p;aim(camera,(0,0,.82));scene.render.filepath=str(out/('blender-'+name+'.png'));bpy.ops.render.render(write_still=True)
