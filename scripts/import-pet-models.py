"""Import supplied Meshy rigs without replacing their bones or skin weights.
Run with Blender --background --python scripts/import-pet-models.py -- <downloads>
Then run node scripts/prepare-pet-models.mjs.
"""
import bpy, sys, math, tempfile
from pathlib import Path
from mathutils import Quaternion, Vector

base = Path(__file__).resolve().parents[1]
(base / 'tmp/blender-pets').mkdir(parents=True, exist_ok=True)
tempfile.tempdir = str(base / 'tmp/blender-pets')
source = Path(sys.argv[sys.argv.index('--') + 1])
for species, folder in [('dog', 'Meshy_AI_Blossom_Pup_quadruped'), ('cat', 'Meshy_AI_Blossom_Kitty_quadruped'), ('babyDragon', 'Meshy_AI_Character_output.glb')]:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    path = source / folder
    if species == 'babyDragon':
        bpy.ops.import_scene.gltf(filepath=str(path))
    else:
        path = next(path.rglob('*.fbx'))
        bpy.ops.import_scene.fbx(filepath=str(path))
    for obj in list(bpy.context.scene.objects):
        if obj.type == 'MESH' and obj.name == 'Icosphere':
            bpy.data.objects.remove(obj, do_unlink=True)
    arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
    if species != 'babyDragon':
        material = bpy.data.materials.new(species + ' PBR')
        material.use_nodes = True
        nodes, links = material.node_tree.nodes, material.node_tree.links
        bsdf = nodes.get('Principled BSDF')
        for suffix, socket in [('', 'Base Color'), ('_normal', 'Normal'), ('_roughness', 'Roughness'), ('_metallic', 'Metallic')]:
            tex = nodes.new('ShaderNodeTexImage')
            tex.image = bpy.data.images.load(str(next(path.parent.glob('*_texture_0' + suffix + '.png'))))
            if suffix:
                tex.image.colorspace_settings.name = 'Non-Color'
            if suffix == '_normal':
                normal = nodes.new('ShaderNodeNormalMap')
                links.new(tex.outputs['Color'], normal.inputs['Color'])
                links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
            else:
                links.new(tex.outputs['Color'], bsdf.inputs[socket])
        for obj in bpy.context.scene.objects:
            if obj.type == 'MESH':
                obj.data.materials.clear()
                obj.data.materials.append(material)
        arm.animation_data.action.name = 'Walk'
        # Export the supplied full looping action, including its original timing.
        start, end = arm.animation_data.action.frame_range
        bpy.context.scene.frame_start, bpy.context.scene.frame_end = int(start), int(end)
    else:
        # The supplied SmartRig has no action. Animate the existing anatomical
        # wing, tail, head and leg chains in their own local coordinate systems.
        bpy.context.scene.render.fps = 30
        bpy.context.scene.frame_start, bpy.context.scene.frame_end = 1, 61
        axes = {}
        for bone in arm.data.bones:
            axes[bone.name] = bone.matrix_local.to_quaternion().inverted() @ Vector((0, 1, 0))
        for frame in range(1, 62):
            phase = (frame - 1) / 60 * math.tau
            for pb in arm.pose.bones:
                angle = 0
                if pb.name in ['Bone_025', 'Bone_028']:
                    angle = (1 if pb.name == 'Bone_025' else -1) * (.12 + math.sin(phase * 2) * .28)
                elif pb.name in ['Bone_024', 'Bone_027']:
                    angle = (1 if pb.name == 'Bone_024' else -1) * math.sin(phase * 2 - .5) * .12
                elif pb.name in ['Bone_020', 'Bone_019', 'Bone_018']:
                    angle = math.sin(phase - int(pb.name[-1]) * .3) * .07
                elif pb.name == 'Bone_013':
                    angle = math.sin(phase) * .025
                elif pb.name in ['Bone_005', 'Bone_009']:
                    angle = -.10
                else:
                    continue
                pb.rotation_mode = 'QUATERNION'
                pb.rotation_quaternion = Quaternion(axes[pb.name], angle)
                pb.keyframe_insert(data_path='rotation_quaternion', frame=frame)
        arm.animation_data.action.name = 'Fly'
    bpy.context.scene.frame_set(bpy.context.scene.frame_start)
    out = base / 'public/models/pets' / species
    out.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(out / 'model.glb'), export_format='GLB', export_animations=True, export_animation_mode='ACTIVE_ACTIONS', export_force_sampling=True)
    print('IMPORTED', species, len(arm.data.bones), 'original bones', out)
