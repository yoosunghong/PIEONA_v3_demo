using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;

namespace Illoava
{
    // Opt-in player verification. Normal launches never run this path.
    public class RuntimeSmoke : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Install()
        {
            if(Environment.GetCommandLineArgs().Contains("--illoava-smoke"))new GameObject("ILLOAVA runtime verification").AddComponent<RuntimeSmoke>();
        }
        IEnumerator Start()
        {
            Application.runInBackground=true;
            var errors=new List<string>();
            Application.LogCallback collect=(message,stack,type)=>{if(type==LogType.Error||type==LogType.Exception||type==LogType.Assert)errors.Add(message);};
            Application.logMessageReceived+=collect;
            var args=Environment.GetCommandLineArgs();int index=Array.IndexOf(args,"--evidence-dir");
            string directory=index>=0&&index+1<args.Length?args[index+1]:Application.persistentDataPath;
            Directory.CreateDirectory(directory);
            while(!UnityEngine.Rendering.SplashScreen.isFinished)yield return null;
            yield return new WaitForSeconds(1);
            yield return null;yield return null;
            var demo=FindAnyObjectByType<CustomizationDemo>();
            if(!demo){File.WriteAllText(Path.Combine(directory,"runtime-smoke.txt"),"FAIL: demo missing");Application.Quit(1);yield break;}
            var character=demo.character;var original=JsonUtility.ToJson(character.appearance);
            foreach(var hair in new[]{"Short","Bob"})foreach(var top in new[]{"Tee","Sweater"})
            {
                character.Apply(new Appearance{hair=hair,top=top,expression="Smile"});character.SetPose("Walk");yield return null;
                var active=character.GetComponentsInChildren<SkinnedMeshRenderer>();
                if(active.Count(r=>r.name.StartsWith("Hair_"))!=1||active.Count(r=>r.name.StartsWith("Top_"))!=1){File.WriteAllText(Path.Combine(directory,"runtime-smoke.txt"),"FAIL: part selection");Application.Quit(1);yield break;}
            }
            character.Apply(new Appearance{hair="Bob",top="Sweater",expression="Surprise",color=2});
            if(File.Exists(demo.AppearanceSavePath))File.Delete(demo.AppearanceSavePath);
            demo.Save();
            if(!File.Exists(demo.AppearanceSavePath)){File.WriteAllText(Path.Combine(directory,"runtime-smoke.txt"),"FAIL: appearance save missing");Application.Quit(1);yield break;}
            var restored=JsonUtility.FromJson<Appearance>(File.ReadAllText(demo.AppearanceSavePath));restored.Normalize();
            if(restored.hair!="Bob"||restored.top!="Sweater"||restored.expression!="Surprise"||restored.color!=2){File.WriteAllText(Path.Combine(directory,"runtime-smoke.txt"),"FAIL: appearance round-trip");Application.Quit(1);yield break;}
            character.Apply(new Appearance());character.SetPose("Idle");demo.SetView(false);
            yield return new WaitForSeconds(.4f);
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"player-atelier.png"));
            yield return new WaitForSeconds(.6f);
            character.Apply(new Appearance{hair="Bob",top="Sweater",expression="Smile",color=1});character.SetPose("Sit");
            yield return new WaitForSeconds(.3f);
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"player-sit.png"));
            yield return new WaitForSeconds(.6f);
            demo.SetView(true);character.SetPose("Idle");
            yield return new WaitForSeconds(.3f);
            ScreenCapture.CaptureScreenshot(Path.Combine(directory,"player-village.png"));
            yield return new WaitForSeconds(.6f);
            character.Apply(JsonUtility.FromJson<Appearance>(original));
            foreach(var image in new[]{"player-atelier.png","player-sit.png","player-village.png"})
            {
                string path=Path.Combine(directory,image);
                if(!File.Exists(path)){errors.Add("Missing screenshot: "+image);continue;}
                var texture=new Texture2D(2,2);ImageConversion.LoadImage(texture,File.ReadAllBytes(path));
                var pixels=texture.GetPixels32();int low=765,high=0;
                for(int i=0;i<pixels.Length;i+=127){int brightness=pixels[i].r+pixels[i].g+pixels[i].b;low=Math.Min(low,brightness);high=Math.Max(high,brightness);}
                Destroy(texture);if(high<90||high-low<60)errors.Add("Blank screenshot: "+image);
            }
            Application.logMessageReceived-=collect;
            if(errors.Count>0){File.WriteAllText(Path.Combine(directory,"runtime-smoke.txt"),"FAIL:\n"+string.Join("\n",errors));Application.Quit(1);yield break;}
            File.WriteAllText(Path.Combine(directory,"runtime-smoke.txt"),"PASS: player scene startup, four modular combinations, expression selection, appearance persistence round-trip, pose switching and scene switching.\nScreenshots requested for atelier, sit and village.\nSmoke tests use a dedicated save file; no existing user appearance save was modified.\nArt and intersection review remain separate.\n");
            Application.Quit(0);
        }
    }
}
