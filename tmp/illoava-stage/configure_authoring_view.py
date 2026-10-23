"""Configure editable Blender presentation without changing the exported FBX geometry."""
import bpy,sys,math
from pathlib import Path
root=Path(sys.argv[sys.argv.index('--')+1]);path=root/'ArtSource/Characters/Piona/Piona_Modular.blend'
bpy.ops.wm.open_mainfile(filepath=str(path))
hidden={'Hair_Bob','Top_Tee','CoveredTorso','UpperArms','Forearms'}
for o in bpy.context.scene.objects:
    if o.type=='MESH':o.hide_render=o.name in hidden;o.hide_set(o.name in hidden)
if not bpy.data.objects.get('Piona original character sheet'):
    reference=bpy.data.objects.new('Piona original character sheet',None);bpy.context.collection.objects.link(reference)
    reference.empty_display_type='IMAGE';reference.data=bpy.data.images.load(str(root/'ArtSource/CharacterSheet.png'),check_existing=True)
    reference.empty_display_size=2.6;reference.location=(-2,1,1);reference.rotation_euler=(math.pi/2,0,0);reference.hide_render=True
    reference['reference']='First pale-haired column is Piona; front/side/back sheet is the art authority.'
bpy.ops.wm.save_as_mainfile(filepath=str(path))
