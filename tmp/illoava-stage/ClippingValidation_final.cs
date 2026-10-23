using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Illoava.Editor
{
    // Export Unity's actual baked deformation, in character-local meters, for independent BVH checks.
    public static class ClippingValidation
    {
        [MenuItem("ILLOAVA/Validate Piona Clipping")]
        public static void Run()
        {
            EditorSceneManager.OpenScene("Assets/ILLOAVA/Scenes/ILLOAVA_Demo.unity");
            var demo=UnityEngine.Object.FindAnyObjectByType<CustomizationDemo>();
            var actor=demo.character;actor.Initialize();demo.SetView(false);
            Directory.CreateDirectory("Logs/ClippingMeshes");Directory.CreateDirectory("Docs/Validation/Refinement");
            int frames=0;
            foreach(string hair in new[]{"Short","Bob"})foreach(string top in new[]{"Tee","Sweater"})
            {
                actor.Apply(new Appearance{hair=hair,top=top});
                foreach(string pose in new[]{"Walk","Sit"})
                {
                    actor.SetPose(pose);int count=pose=="Walk"?24:13;
                    for(int i=0;i<count;i++)
                    {
                        float t=i*Mathf.PI*2/5/24;float sit=i/12f;
                        actor.SamplePose(t,pose=="Sit"?sit:0);
                        string id=$"{hair}-{top}-{pose}-{i:D2}";
                        Export(actor,"Logs/ClippingMeshes/"+id+".bin");frames++;
                        // Review both walking extrema and the standing/mid/full sit transition from every side.
                        if((pose=="Walk"&&(i==6||i==18))||(pose=="Sit"&&(i==0||i==6||i==12)))
                        {
                            demo.poseSeat.SetActive(pose=="Sit"&&i==12);
                            foreach(var view in new[]{("Front",new Vector3(0,.95f,3.5f)),("Side",new Vector3(3.5f,.95f,0)),("Back",new Vector3(0,.95f,-3.5f))})
                            {
                                demo.viewCamera.transform.position=actor.transform.position+view.Item2;
                                demo.viewCamera.transform.LookAt(actor.transform.position+Vector3.up*.8f);
                                MigrationBuilder.Capture(demo.viewCamera,"Refinement/"+id+"-"+view.Item1+".png");
                            }
                        }
                    }
                }
            }
            actor.SetPose("Idle");demo.poseSeat.SetActive(false);
            demo.viewCamera.transform.position=actor.transform.position+new Vector3(0,.95f,3.5f);
            demo.viewCamera.transform.LookAt(actor.transform.position+Vector3.up*.8f);
            foreach(string expression in new[]{"Neutral","Blink","Smile","Surprise"}){
                actor.Apply(new Appearance{expression=expression});
                MigrationBuilder.Capture(demo.viewCamera,"Refinement/expression-"+expression+".png");
            }
            File.WriteAllText("Docs/Validation/Refinement/unity-exports.txt",$"Unity {Application.unityVersion}\nExported {frames} actual skinned poses: four combinations, 24 walk-cycle samples and 13 sit-transition samples each.\nCoordinates: character-local meters, Y up, +Z forward.\nAll 60 review images baked from the same sampled geometry.\nIntersection results are produced separately by Tools/Blender/check_unity_clipping.py.\n");
            Debug.Log("Piona clipping geometry and 60 review views exported.");
        }
        static void Export(ModularCharacter actor,string path)
        {
            var parts=actor.GetComponentsInChildren<SkinnedMeshRenderer>().Where(r=>r.enabled).ToArray();
            using(var stream=new BinaryWriter(File.Create(path)))
            {
                stream.Write(0x50494f32);stream.Write(parts.Length);
                foreach(var part in parts)
                {
                    stream.Write(part.name);var mesh=new Mesh();part.BakeMesh(mesh,true);
                    var matrix=actor.transform.worldToLocalMatrix*part.transform.localToWorldMatrix;
                    stream.Write(mesh.vertexCount);var triangles=mesh.triangles;stream.Write(triangles.Length);
                    foreach(var vertex in mesh.vertices){var v=matrix.MultiplyPoint3x4(vertex);stream.Write(v.x);stream.Write(v.y);stream.Write(v.z);}
                    // Renderer transforms stay in the bind frame; sharedMesh provides rest positions for seam classification.
                    foreach(var vertex in part.sharedMesh.vertices){var v=matrix.MultiplyPoint3x4(vertex);stream.Write(v.x);stream.Write(v.y);stream.Write(v.z);}
                    foreach(int index in triangles)stream.Write(index);
                    UnityEngine.Object.DestroyImmediate(mesh);
                }
            }
        }
    }
}
