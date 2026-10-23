using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace Illoava.Editor
{
    public static class EnvironmentImporter
    {
        [Serializable] public class Export { public int version; public Geometry[] meshes; public Surface[] materials; public Asset[] assets; }
        [Serializable] public class Geometry { public string name; public float[] positions, normals, uv; public int[] indices; }
        [Serializable] public class Surface { public float[] color, emission; public float roughness, metallic; public bool doubleSided, unlit; }
        [Serializable] public class Asset { public string id, category; public Node[] nodes; public Lamp[] lights; }
        [Serializable] public class Node { public string name; public int mesh, material; public float[] position, rotation, scale; public bool visible; }
        [Serializable] public class Lamp { public float[] position, color; public float intensity, range; }
        const string Root = "Assets/ILLOAVA/Environment";

        public static void Import()
        {
            var data = JsonUtility.FromJson<Export>(File.ReadAllText("Assets/ILLOAVA/SourceData/environment.json"));
            if (data.version != 1 || data.assets.Length != 24) throw new InvalidDataException("Unsupported or incomplete environment export");
            Directory.CreateDirectory(Root + "/Meshes"); Directory.CreateDirectory(Root + "/Materials"); Directory.CreateDirectory(Root + "/Prefabs");
            AssetDatabase.Refresh();
            Mesh[] meshes;
            Material[] materials;
            AssetDatabase.StartAssetEditing();
            try
            {
                meshes = data.meshes.Select((g, i) => SaveMesh(g, i)).ToArray();
                materials = data.materials.Select((m, i) => SaveMaterial(m, i)).ToArray();
            }
            finally { AssetDatabase.StopAssetEditing(); }
            foreach (var a in data.assets)
            {
                var root = new GameObject(a.id);
                foreach (var n in a.nodes)
                {
                    var go = new GameObject(n.name); go.transform.SetParent(root.transform, false);
                    go.transform.localPosition = new Vector3(n.position[0], n.position[1], -n.position[2]);
                    go.transform.localRotation = new Quaternion(-n.rotation[0], -n.rotation[1], n.rotation[2], n.rotation[3]);
                    go.transform.localScale = new Vector3(n.scale[0], n.scale[1], n.scale[2]);
                    go.AddComponent<MeshFilter>().sharedMesh = meshes[n.mesh];
                    var renderer = go.AddComponent<MeshRenderer>(); renderer.sharedMaterial = materials[n.material];
                    renderer.shadowCastingMode = ShadowCastingMode.On; go.SetActive(n.visible);
                }
                foreach (var l in a.lights)
                {
                    var go = new GameObject("Point light"); go.transform.SetParent(root.transform, false);
                    go.transform.localPosition = new Vector3(l.position[0], l.position[1], -l.position[2]);
                    var light = go.AddComponent<Light>(); light.type = LightType.Point; light.color = new Color(l.color[0], l.color[1], l.color[2]); light.intensity = l.intensity; light.range = l.range;
                }
                PrefabUtility.SaveAsPrefabAsset(root, Root + "/Prefabs/" + a.id + ".prefab");
                UnityEngine.Object.DestroyImmediate(root);
            }
            AssetDatabase.SaveAssets();
        }

        static Mesh SaveMesh(Geometry g, int index)
        {
            string path = Root + "/Meshes/mesh_" + index + ".asset";
            var mesh = AssetDatabase.LoadAssetAtPath<Mesh>(path);
            bool fresh = !mesh; if (fresh) mesh = new Mesh(); else mesh.Clear();
            mesh.name = g.name; mesh.indexFormat = IndexFormat.UInt32;
            var vertices = new Vector3[g.positions.Length / 3]; var normals = new Vector3[vertices.Length];
            for (int i = 0; i < vertices.Length; i++) { vertices[i] = new Vector3(g.positions[i*3], g.positions[i*3+1], -g.positions[i*3+2]); normals[i] = new Vector3(g.normals[i*3], g.normals[i*3+1], -g.normals[i*3+2]); }
            mesh.vertices = vertices; mesh.normals = normals;
            if (g.uv.Length == vertices.Length * 2) mesh.uv = Enumerable.Range(0, vertices.Length).Select(i => new Vector2(g.uv[i*2], g.uv[i*2+1])).ToArray();
            var triangles = (int[])g.indices.Clone(); for (int i = 0; i < triangles.Length; i += 3) (triangles[i+1], triangles[i+2]) = (triangles[i+2], triangles[i+1]);
            mesh.triangles = triangles; mesh.RecalculateBounds();
            if (fresh) AssetDatabase.CreateAsset(mesh, path); else EditorUtility.SetDirty(mesh);
            return mesh;
        }

        static Material SaveMaterial(Surface m, int index)
        {
            string path = Root + "/Materials/material_" + index + ".mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            var shader = Shader.Find(m.unlit ? "Universal Render Pipeline/Unlit" : "Universal Render Pipeline/Lit");
            if (!shader) throw new InvalidOperationException("URP shader missing");
            bool fresh = !mat; if (fresh) mat = new Material(shader); else mat.shader = shader;
            mat.name = "Environment " + index;
            // Export colors are Three.js linear values. Unity material color properties accept linear values.
            mat.SetColor("_BaseColor", new Color(m.color[0], m.color[1], m.color[2], m.color[3]));
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 1 - m.roughness);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", m.metallic);
            if (mat.HasProperty("_EmissionColor")) { mat.SetColor("_EmissionColor", new Color(m.emission[0],m.emission[1],m.emission[2])); if (m.emission.Any(v => v > 0)) mat.EnableKeyword("_EMISSION"); }
            if (m.doubleSided) mat.SetFloat("_Cull", 0);
            if (m.color[3] < .999f)
            {
                mat.SetFloat("_Surface", 1); mat.SetFloat("_ZWrite", 0); mat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); mat.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT"); mat.SetOverrideTag("RenderType", "Transparent"); mat.renderQueue = (int)RenderQueue.Transparent;
            }
            if (fresh) AssetDatabase.CreateAsset(mat,path); else EditorUtility.SetDirty(mat); return mat;
        }
    }
}
