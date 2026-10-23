using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Illoava
{
    [Serializable] public class Appearance
    {
        public int version = 1;
        public string hair = "Short", top = "Tee", expression = "Neutral";
        public int color;
        public void Normalize()
        {
            if (version != 1) { version = 1; hair = "Short"; top = "Tee"; expression = "Neutral"; color = 0; }
            if (hair != "Short" && hair != "Bob") hair = "Short";
            if (top != "Tee" && top != "Sweater") top = "Tee";
            if (expression != "Neutral" && expression != "Blink" && expression != "Smile" && expression != "Surprise") expression = "Neutral";
            color = Mathf.Clamp(color, 0, 3);
        }
    }

    public class ModularCharacter : MonoBehaviour
    {
        public const string Contract = "Piona_v1";
        public static readonly string[] RequiredBones = { "Root", "Hips", "Spine", "Chest", "Neck", "Head", "LeftUpperArm", "LeftLowerArm", "LeftHand", "RightUpperArm", "RightLowerArm", "RightHand", "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "RightUpperLeg", "RightLowerLeg", "RightFoot" };
        public static readonly Color[] Palette = { new Color(.93f,.87f,.72f),new Color(.39f,.66f,.74f),new Color(.74f,.43f,.53f),new Color(.50f,.63f,.39f) };
        public Appearance appearance = new Appearance();
        readonly Dictionary<string,Transform> bones = new Dictionary<string,Transform>();
        readonly Dictionary<Transform,Quaternion> bindRotations = new Dictionary<Transform,Quaternion>();
        readonly Dictionary<Transform,Vector3> bindPositions = new Dictionary<Transform,Vector3>();
        SkinnedMeshRenderer[] renderers;
        MaterialPropertyBlock properties;
        public string Pose { get; private set; } = "Idle";
        public IReadOnlyDictionary<string,Transform> Bones => bones;
        public bool Initialized => renderers != null;

        void Awake() { Initialize(); Apply(appearance); }
        public void Initialize()
        {
            if (Initialized) return;
            properties = new MaterialPropertyBlock();
            foreach (var t in GetComponentsInChildren<Transform>(true))
            {
                if (!RequiredBones.Contains(t.name)) continue;
                if (bones.ContainsKey(t.name)) throw new InvalidOperationException("Duplicate canonical bone " + t.name);
                bones[t.name] = t; bindRotations[t] = t.localRotation; bindPositions[t] = t.localPosition;
            }
            foreach (string name in RequiredBones) if (!bones.ContainsKey(name)) throw new InvalidOperationException("Missing canonical bone " + name);
            renderers = GetComponentsInChildren<SkinnedMeshRenderer>(true);
            if (renderers.Length == 0) throw new InvalidOperationException("No skinned meshes on Piona");
            foreach (var r in renderers) { ValidateRenderer(r); r.updateWhenOffscreen = true; }
        }

        public static void ValidateRenderer(SkinnedMeshRenderer renderer)
        {
            var mesh = renderer.sharedMesh;
            if (!mesh || mesh.vertexCount == 0) throw new InvalidOperationException("Empty part " + renderer.name);
            if (renderer.bones.Length != mesh.bindposes.Length || renderer.bones.Any(b => !b)) throw new InvalidOperationException("Invalid bones/bind poses: " + renderer.name);
            if (mesh.boneWeights.Length != mesh.vertexCount) throw new InvalidOperationException("Missing vertex skin weights: " + renderer.name);
            foreach (var w in mesh.boneWeights)
            {
                float sum = w.weight0 + w.weight1 + w.weight2 + w.weight3;
                if (Mathf.Abs(sum-1) > .002f) throw new InvalidOperationException("Unnormalized skin weights: " + renderer.name);
                if ((w.weight0 > 0 && w.boneIndex0 >= renderer.bones.Length) || (w.weight1 > 0 && w.boneIndex1 >= renderer.bones.Length) || (w.weight2 > 0 && w.boneIndex2 >= renderer.bones.Length) || (w.weight3 > 0 && w.boneIndex3 >= renderer.bones.Length)) throw new InvalidOperationException("Skin index out of range");
            }
        }

        public void Apply(Appearance value)
        {
            Initialize(); value.Normalize(); appearance = value;
            foreach (var r in renderers)
            {
                if (r.name == "CoveredTorso" || r.name == "UpperArms") r.gameObject.SetActive(false);
                if (r.name == "Forearms") r.gameObject.SetActive(value.top == "Tee");
                if (r.name.StartsWith("Hair_",StringComparison.Ordinal)) r.gameObject.SetActive(r.name == "Hair_" + value.hair);
                if (r.name.StartsWith("Top_",StringComparison.Ordinal))
                {
                    r.gameObject.SetActive(r.name == "Top_" + value.top);
                    properties.Clear(); properties.SetColor("_BaseColor",Palette[value.color]); r.SetPropertyBlock(properties);
                }
                for (int i=0;i<r.sharedMesh.blendShapeCount;i++)
                {
                    string shape=r.sharedMesh.GetBlendShapeName(i);
                    r.SetBlendShapeWeight(i,value.expression != "Neutral" && (shape == value.expression || shape.EndsWith("."+value.expression,StringComparison.Ordinal)) ? 100 : 0);
                }
            }
        }

        // Extension point for future authored parts. Validate before modifying the visible character.
        public SkinnedMeshRenderer AttachCompatiblePart(SkinnedMeshRenderer source, string contract)
        {
            Initialize(); ValidateRenderer(source);
            if (contract != Contract) throw new InvalidOperationException("Part uses an incompatible rig contract");
            var mapped = source.bones.Select(b => bones.TryGetValue(b.name,out var found) ? found : throw new InvalidOperationException("Unknown part bone "+b.name)).ToArray();
            // The mesh-to-root rest matrix must match; do not compensate silently for arbitrary transforms.
            for (int i=0;i<mapped.Length;i++)
            {
                var reference=renderers.SelectMany(r=>r.bones.Select((b,j)=>(bone:b,matrix:r.sharedMesh.bindposes[j]))).FirstOrDefault(p=>p.bone.name==mapped[i].name);
                for (int k=0;k<16;k++) if (Mathf.Abs(reference.matrix[k]-source.sharedMesh.bindposes[i][k])>.001f) throw new InvalidOperationException("Bind pose mismatch on "+mapped[i].name);
            }
            var go=new GameObject(source.name);go.transform.SetParent(renderers[0].transform.parent,false);
            go.transform.localPosition=source.transform.localPosition;go.transform.localRotation=source.transform.localRotation;go.transform.localScale=source.transform.localScale;
            var added=go.AddComponent<SkinnedMeshRenderer>();added.sharedMesh=source.sharedMesh;added.sharedMaterials=source.sharedMaterials;added.bones=mapped;added.rootBone=bones["Root"];added.localBounds=source.localBounds;added.updateWhenOffscreen=true;
            renderers=GetComponentsInChildren<SkinnedMeshRenderer>(true);return added;
        }

        public void SetPose(string pose) { Pose = pose == "Walk" || pose == "Sit" ? pose : "Idle"; SamplePose(0); }
        void LateUpdate() { SamplePose(Time.time); }
        public void SamplePose(float time, float sitBlend = 1)
        {
            Initialize();
            sitBlend=Mathf.Clamp01(sitBlend);
            foreach(var r in renderers)
                for(int i=0;i<r.sharedMesh.blendShapeCount;i++)
                    if(r.sharedMesh.GetBlendShapeName(i).EndsWith("SitClearance",StringComparison.Ordinal))r.SetBlendShapeWeight(i,Pose=="Sit"?100*sitBlend:0);
            foreach(var pair in bindRotations) { pair.Key.localRotation=pair.Value; pair.Key.localPosition=bindPositions[pair.Key]; }
            if(Pose=="Walk")
            {
                float swing=Mathf.Sin(time*5)*24;
                Rotate("LeftUpperLeg",swing);Rotate("RightUpperLeg",-swing);
                Rotate("LeftLowerLeg",Mathf.Max(0,-Mathf.Sin(time*5))*32);Rotate("RightLowerLeg",Mathf.Max(0,Mathf.Sin(time*5))*32);
                Rotate("LeftUpperArm",-swing*.7f);Rotate("RightUpperArm",swing*.7f);
            }
            else if(Pose=="Sit")
            {
                var hips=bones["Hips"]; hips.position-=transform.up*(.22f*sitBlend);
                Rotate("LeftUpperLeg",-85*sitBlend);Rotate("RightUpperLeg",-85*sitBlend);Rotate("LeftLowerLeg",85*sitBlend);Rotate("RightLowerLeg",85*sitBlend);
                Rotate("LeftUpperArm",-30*sitBlend);Rotate("RightUpperArm",-30*sitBlend);
            }
        }
        void Rotate(string name,float angle)
        {
            var t=bones[name];var axis=t.parent.InverseTransformDirection(transform.right);
            t.localRotation=Quaternion.AngleAxis(angle,axis)*t.localRotation;
        }
    }
}
