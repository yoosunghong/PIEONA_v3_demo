using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Illoava.Editor
{
    public static class MigrationBuilder
    {
        const string Root="Assets/ILLOAVA";
        const string Report="Docs/Validation";
        [MenuItem("ILLOAVA/Rebuild Migration Demo")]
        public static void Build()
        {
            Directory.CreateDirectory(Report);Directory.CreateDirectory(Root+"/Scenes");Directory.CreateDirectory(Root+"/Characters/Piona/Materials");
            AssetDatabase.Refresh();
            EnvironmentImporter.Import();
            var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            RenderSettings.ambientMode=AmbientMode.Flat;RenderSettings.ambientLight=new Color(.72f,.77f,.81f);RenderSettings.ambientIntensity=1;
            var sunGo=new GameObject("Soft daylight");var sun=sunGo.AddComponent<Light>();sun.type=LightType.Directional;sun.intensity=2;sun.color=new Color(1,.94f,.85f);sun.shadows=LightShadows.Soft;sunGo.transform.rotation=Quaternion.Euler(38,-35,0);
            var fillGo=new GameObject("Fill light");var fill=fillGo.AddComponent<Light>();fill.type=LightType.Directional;fill.intensity=.7f;fill.color=new Color(.8f,.88f,1);fillGo.transform.rotation=Quaternion.Euler(18,135,0);
            var cameraGo=new GameObject("Main Camera");cameraGo.tag="MainCamera";var camera=cameraGo.AddComponent<Camera>();cameraGo.AddComponent<AudioListener>();camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.80f,.87f,.86f);camera.fieldOfView=33;camera.nearClipPlane=.05f;camera.farClipPlane=100;
            cameraGo.AddComponent<UniversalAdditionalCameraData>().renderPostProcessing=true;
            string profilePath=Root+"/Environment/Presentation.asset";
            var profile=AssetDatabase.LoadAssetAtPath<VolumeProfile>(profilePath);
            if(!profile){profile=ScriptableObject.CreateInstance<VolumeProfile>();AssetDatabase.CreateAsset(profile,profilePath);}
            if(!profile.TryGet<Tonemapping>(out var tone)){tone=profile.Add<Tonemapping>();AssetDatabase.AddObjectToAsset(tone,profile);}
            tone.mode.Override(TonemappingMode.ACES);EditorUtility.SetDirty(profile);
            var volume=new GameObject("Pastel color grading").AddComponent<Volume>();volume.isGlobal=true;volume.sharedProfile=profile;
            var village=(GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(Root+"/Environment/Prefabs/village.prefab"));
            var actor=new GameObject("Piona — Modular Base v1");actor.transform.position=new Vector3(0,.39f,0);
            var model=AssetDatabase.LoadAssetAtPath<GameObject>(Root+"/Characters/Piona/Piona_Modular.fbx");
            if(!model)throw new InvalidOperationException("Blender FBX has not been generated");
            var instance=(GameObject)PrefabUtility.InstantiatePrefab(model);instance.transform.SetParent(actor.transform,false);
            var mats=new Dictionary<string,Material>();
            foreach(var renderer in instance.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            {
                var converted=renderer.sharedMaterials.Select(source=>
                {
                    if(!source)throw new InvalidOperationException("Missing imported material");
                    if(mats.TryGetValue(source.name,out var found))return found;
                    string path=Root+"/Characters/Piona/Materials/"+source.name+".mat";
                    var mat=AssetDatabase.LoadAssetAtPath<Material>(path);bool fresh=!mat;if(fresh)mat=new Material(Shader.Find("Universal Render Pipeline/Lit"));
                    mat.name=source.name;mat.SetColor("_BaseColor",source.HasProperty("_Color")?source.color:Color.white);mat.SetFloat("_Smoothness",.22f);
                    if(fresh)AssetDatabase.CreateAsset(mat,path);else EditorUtility.SetDirty(mat);mats[source.name]=mat;return mat;
                }).ToArray();renderer.sharedMaterials=converted;
            }
            var character=actor.AddComponent<ModularCharacter>();character.Initialize();character.Apply(new Appearance());
            PrefabUtility.SaveAsPrefabAsset(actor,Root+"/Characters/Piona/Piona.prefab");
            var platform=GameObject.CreatePrimitive(PrimitiveType.Cylinder);platform.name="Atelier plinth";platform.transform.position=new Vector3(0,.33f,0);platform.transform.localScale=new Vector3(1.7f,.05f,1.7f);platform.GetComponent<Renderer>().sharedMaterial=MakeMaterial("Plinth",new Color(.88f,.88f,.78f));
            var seat=GameObject.CreatePrimitive(PrimitiveType.Cube);seat.name="Pose review seat";seat.transform.position=new Vector3(0,.49f,-.08f);seat.transform.localScale=new Vector3(.48f,.2f,.36f);seat.GetComponent<Renderer>().sharedMaterial=MakeMaterial("Seat",new Color(.57f,.67f,.58f));seat.SetActive(false);
            var demo=new GameObject("Customization UI").AddComponent<CustomizationDemo>();demo.character=character;demo.viewCamera=camera;demo.village=village;demo.poseSeat=seat;
            demo.decorationPrefabs=Directory.GetFiles(Root+"/Environment/Prefabs","*.prefab").Where(p=>!new[]{"village","life-area","guestbook"}.Contains(Path.GetFileNameWithoutExtension(p))).OrderBy(p=>p).Select(p=>AssetDatabase.LoadAssetAtPath<GameObject>(p.Replace('\\','/'))).ToArray();
            if(demo.decorationPrefabs.Length!=21)throw new InvalidOperationException("Decoration count differs from original catalogue");
            village.SetActive(false);camera.transform.position=new Vector3(0,1.45f,3.5f);camera.transform.LookAt(actor.transform.position+Vector3.up*.83f);
            Validate(character,demo.decorationPrefabs);
            Capture(camera,"piona-front.png");
            camera.transform.position=new Vector3(3.5f,1.45f,0);camera.transform.LookAt(actor.transform.position+Vector3.up*.83f);Capture(camera,"piona-side.png");
            camera.transform.position=new Vector3(0,1.45f,-3.5f);camera.transform.LookAt(actor.transform.position+Vector3.up*.83f);Capture(camera,"piona-back.png");
            camera.transform.position=new Vector3(2.4f,1.6f,3);camera.transform.LookAt(actor.transform.position+Vector3.up*.75f);
            foreach(var hair in new[]{"Short","Bob"})foreach(var top in new[]{"Tee","Sweater"})foreach(var pose in new[]{"Walk","Sit"})
            {
                character.Apply(new Appearance{hair=hair,top=top});character.SetPose(pose);character.SamplePose(.30f);seat.SetActive(pose=="Sit");Capture(camera,$"{hair}-{top}-{pose}.png");
            }
            character.Apply(new Appearance());character.SetPose("Idle");seat.SetActive(false);
            village.SetActive(true);camera.transform.position=new Vector3(16,18,-20);camera.transform.LookAt(Vector3.zero);Capture(camera,"village.png");
            village.SetActive(false);camera.transform.position=new Vector3(0,1.45f,3.5f);camera.transform.LookAt(actor.transform.position+Vector3.up*.83f);
            string scenePath=Root+"/Scenes/ILLOAVA_Demo.unity";EditorSceneManager.SaveScene(scene,scenePath);
            var scenes=EditorBuildSettings.scenes.ToList();if(!scenes.Any(s=>s.path==scenePath))scenes.Insert(0,new EditorBuildSettingsScene(scenePath,true));EditorBuildSettings.scenes=scenes.ToArray();
            AssetDatabase.SaveAssets();Debug.Log("ILLOAVA migration build and technical validation completed.");
        }

        static Material MakeMaterial(string name,Color color)
        {
            string path=Root+"/Characters/Piona/Materials/"+name+".mat";var mat=AssetDatabase.LoadAssetAtPath<Material>(path);
            if(!mat){mat=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(mat,path);}mat.SetColor("_BaseColor",color);EditorUtility.SetDirty(mat);return mat;
        }

        static void Validate(ModularCharacter character,GameObject[] catalogue)
        {
            var results=new List<string>();int samples=0;int expressions=0;
            foreach(var hair in new[]{"Short","Bob"})foreach(var top in new[]{"Tee","Sweater"})
            {
                var look=new Appearance{hair=hair,top=top};character.Apply(look);
                var visible=character.GetComponentsInChildren<SkinnedMeshRenderer>().Where(r=>r.enabled).ToArray();
                if(visible.Count(r=>r.name.StartsWith("Hair_"))!=1||visible.Count(r=>r.name.StartsWith("Top_"))!=1)throw new InvalidOperationException("Part swap left duplicate or missing parts");
                foreach(string expression in new[]{"Neutral","Blink","Smile","Surprise"})
                {
                    look.expression=expression;character.Apply(look);
                    if(expression!="Neutral"&&!visible.Any(r=>Enumerable.Range(0,r.sharedMesh.blendShapeCount).Any(i=>r.GetBlendShapeWeight(i)>99)))throw new InvalidOperationException("Expression missing: "+expression);
                    expressions++;
                }
                look.expression="Neutral";character.Apply(look);
                foreach(string pose in new[]{"Idle","Walk","Sit"})
                {
                    character.SetPose(pose);
                    for(int sample=0;sample<16;sample++)
                    {
                        character.SamplePose(sample*Mathf.PI*2/5/16);
                        foreach(var r in visible)
                        {
                            var baked=new Mesh();r.BakeMesh(baked);
                            if(baked.vertexCount==0||baked.vertices.Any(v=>!float.IsFinite(v.x)||!float.IsFinite(v.y)||!float.IsFinite(v.z)))throw new InvalidOperationException("Invalid deformed geometry "+r.name);
                            if(baked.bounds.size.magnitude>10)throw new InvalidOperationException("Exploding skin bounds "+r.name);
                            UnityEngine.Object.DestroyImmediate(baked);
                        }
                        samples++;
                    }
                }
                results.Add(hair+" / "+top+": one hair and top, expressions and sampled poses passed");
            }
            var invalid=new Appearance{version=1,hair="unknown",top="unknown",expression="unknown",color=100};invalid.Normalize();
            if(invalid.hair!="Short"||invalid.top!="Tee"||invalid.expression!="Neutral"||invalid.color!=3)throw new InvalidOperationException("Appearance fallback failed");
            character.Apply(new Appearance());character.SetPose("Idle");
            var bounds=new Bounds();bool first=true;foreach(var r in character.GetComponentsInChildren<SkinnedMeshRenderer>()){if(first){bounds=r.bounds;first=false;}else bounds.Encapsulate(r.bounds);}
            File.WriteAllText(Report+"/unity-validation.txt","ILLOAVA technical validation\nUnity: "+Application.unityVersion+"\nCanonical bones: "+character.Bones.Count+"\nDecoration prefabs: "+catalogue.Length+"\nPose samples: "+samples+"\nExpression selections: "+expressions+"\nApproximate imported bounds: "+bounds.size+"\n"+string.Join("\n",results)+"\nUnknown appearance IDs fall back safely.\nPASS: finite baked geometry and valid skin data.\nREVIEW REQUIRED: silhouette fidelity, topology, garment clipping, seated contact and production animation quality. These checks do not certify collision-free meshes.\n");
        }

        static void Capture(Camera camera,string name)
        {
            var rt=new RenderTexture(1024,1024,24);var previous=RenderTexture.active;var target=camera.targetTexture;
            var snapshots=new List<(SkinnedMeshRenderer source,GameObject snapshot,Mesh mesh)>();
            bool asyncShaders=ShaderUtil.allowAsyncCompilation;ShaderUtil.allowAsyncCompilation=false;
            try
            {
                // Synchronous editor renders can reuse an old GPU skinning frame. Bake the sampled pose explicitly.
                foreach(var source in UnityEngine.Object.FindObjectsByType<SkinnedMeshRenderer>().Where(r=>r.enabled))
                {
                    var mesh=new Mesh();source.BakeMesh(mesh,true);
                    var go=new GameObject("Pose snapshot");go.transform.SetParent(source.transform,false);go.AddComponent<MeshFilter>().sharedMesh=mesh;
                    var renderer=go.AddComponent<MeshRenderer>();renderer.sharedMaterials=source.sharedMaterials;
                    var block=new MaterialPropertyBlock();source.GetPropertyBlock(block);renderer.SetPropertyBlock(block);
                    source.enabled=false;snapshots.Add((source,go,mesh));
                }
                if(snapshots.Count>0)
                {
                    var bounds=snapshots[0].snapshot.GetComponent<Renderer>().bounds;
                    foreach(var s in snapshots.Skip(1))bounds.Encapsulate(s.snapshot.GetComponent<Renderer>().bounds);
                    if(bounds.size.y<.8f||bounds.size.y>2.5f)throw new InvalidOperationException("Pose capture has incorrect world scale: "+bounds.size);
                }
                camera.targetTexture=rt;camera.Render();camera.Render();RenderTexture.active=rt;
                var image=new Texture2D(1024,1024,TextureFormat.RGB24,false);image.ReadPixels(new Rect(0,0,1024,1024),0,0);image.Apply();File.WriteAllBytes(Report+"/"+name,image.EncodeToPNG());UnityEngine.Object.DestroyImmediate(image);
            }
            finally
            {
                foreach(var s in snapshots){s.source.enabled=true;UnityEngine.Object.DestroyImmediate(s.snapshot);UnityEngine.Object.DestroyImmediate(s.mesh);}
                ShaderUtil.allowAsyncCompilation=asyncShaders;camera.targetTexture=target;RenderTexture.active=previous;rt.Release();UnityEngine.Object.DestroyImmediate(rt);
            }
        }

        public static void BuildPlayer()
        {
            Directory.CreateDirectory("Builds/Windows");
            var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{Root+"/Scenes/ILLOAVA_Demo.unity"},locationPathName="Builds/Windows/ILLOAVA.exe",target=BuildTarget.StandaloneWindows64,options=BuildOptions.Development});
            if(report.summary.result!=UnityEditor.Build.Reporting.BuildResult.Succeeded)throw new Exception("Player build failed: "+report.summary.result);
            File.WriteAllText(Report+"/player-build.txt",$"PASS: {report.summary.result}\nSize: {report.summary.totalSize}\nErrors: {report.summary.totalErrors}\nWarnings: {report.summary.totalWarnings}\n");
        }

        public static void RenderExisting()
        {
            EditorSceneManager.OpenScene(Root+"/Scenes/ILLOAVA_Demo.unity");
            var demo=UnityEngine.Object.FindAnyObjectByType<CustomizationDemo>();var character=demo.character;character.Initialize();
            var camera=demo.viewCamera;demo.SetView(false);character.Apply(new Appearance());character.SetPose("Idle");
            File.WriteAllText(Report+"/skin-transforms.txt",string.Join("\n",character.GetComponentsInChildren<SkinnedMeshRenderer>().Select(r=>{var m=new Mesh();r.BakeMesh(m,true);string line=$"{r.name}: scale={r.transform.lossyScale} rotation={r.transform.rotation.eulerAngles} position={r.transform.position} baked={m.bounds}";UnityEngine.Object.DestroyImmediate(m);return line;})));
            camera.transform.position=new Vector3(0,1.45f,3.5f);camera.transform.LookAt(character.transform.position+Vector3.up*.83f);Capture(camera,"piona-front.png");
            camera.transform.position=new Vector3(3.5f,1.45f,0);camera.transform.LookAt(character.transform.position+Vector3.up*.83f);Capture(camera,"piona-side.png");
            camera.transform.position=new Vector3(0,1.45f,-3.5f);camera.transform.LookAt(character.transform.position+Vector3.up*.83f);Capture(camera,"piona-back.png");
            camera.transform.position=new Vector3(2.4f,1.6f,3);camera.transform.LookAt(character.transform.position+Vector3.up*.75f);
            foreach(var hair in new[]{"Short","Bob"})foreach(var top in new[]{"Tee","Sweater"})foreach(var pose in new[]{"Walk","Sit"})
            {
                character.Apply(new Appearance{hair=hair,top=top});character.SetPose(pose);character.SamplePose(.30f);demo.poseSeat.SetActive(pose=="Sit");Capture(camera,$"{hair}-{top}-{pose}.png");
            }
            character.Apply(new Appearance());character.SetPose("Idle");demo.poseSeat.SetActive(false);demo.SetView(true);Capture(camera,"village.png");
        }
    }
}
