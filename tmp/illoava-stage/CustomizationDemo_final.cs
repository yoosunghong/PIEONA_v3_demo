using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Illoava
{
    public class CustomizationDemo : MonoBehaviour
    {
        public ModularCharacter character;
        public Camera viewCamera;
        public GameObject village;
        public GameObject poseSeat;
        public GameObject[] decorationPrefabs;
        string status="Local appearance saved automatically";
        float yaw=0, pitch=8, zoom=3.5f;
        bool villageView;
        int catalogueIndex;
        GameObject decorationPreview;
        GUIStyle title, body, label, button, selected;
        Texture2D panel, accent;
        Coroutine review;
        string reviewStatus;
        public string CameraViewName { get; private set; } = "Front";
        public string AppearanceSavePath => Path.Combine(Application.persistentDataPath,Environment.GetCommandLineArgs().Contains("--illoava-smoke")?"illoava-smoke-appearance-v1.json":"illoava-appearance-v1.json");
        string SavePath => AppearanceSavePath;

        void Start()
        {
            try {
                string legacy=Path.Combine(Directory.GetParent(Application.persistentDataPath)?.FullName??Application.persistentDataPath,"ILLOAVA",Path.GetFileName(SavePath));
                if(File.Exists(SavePath))character.Apply(JsonUtility.FromJson<Appearance>(File.ReadAllText(SavePath))??new Appearance());
                else if(!Environment.GetCommandLineArgs().Contains("--illoava-smoke")&&File.Exists(legacy)){
                    character.Apply(JsonUtility.FromJson<Appearance>(File.ReadAllText(legacy))??new Appearance());Save();
                }
            }
            catch(Exception e) { status="Saved appearance could not be read; defaults loaded."; Debug.LogWarning(e.Message); character.Apply(new Appearance()); }
            SetView(false);
            if(Environment.GetCommandLineArgs().Contains("--illova-review-tour"))BeginReview();
        }
        void Update()
        {
            var mouse=Mouse.current;
            if(mouse!=null && mouse.position.ReadValue().x>330*Screen.width/1280f)
            {
                if(mouse.rightButton.isPressed) { StopReview();yaw+=mouse.delta.ReadValue().x*.2f; pitch=Mathf.Clamp(pitch-mouse.delta.ReadValue().y*.15f,-5,55);CameraViewName="Orbit"; }
                zoom=Mathf.Clamp(zoom-mouse.scroll.ReadValue().y*.002f,2.2f,5.5f);
            }
            if(!villageView && viewCamera)
            {
                var target=character.transform.position+Vector3.up*.83f;
                viewCamera.transform.position=target+Quaternion.Euler(pitch,yaw,0)*new Vector3(0,0,zoom);
                viewCamera.transform.LookAt(target);
            }
            if(poseSeat) poseSeat.SetActive(character.Pose=="Sit");
        }
        public void SetView(bool overview)
        {
            villageView=overview;
            if(village) village.SetActive(overview);
            if(overview) { viewCamera.transform.position=new Vector3(16,18,-20);viewCamera.transform.LookAt(new Vector3(0,0,0)); }
            if(decorationPreview) decorationPreview.SetActive(overview);
        }
        public void SetCameraView(string view)
        {
            CameraViewName=view;SetView(false);yaw=view=="Side"?90:view=="Back"?180:0;pitch=0;
        }
        public void BeginReview()
        {
            StopReview();review=StartCoroutine(ReviewCombinations());
        }
        public void StopReview()
        {
            if(review!=null)StopCoroutine(review);review=null;reviewStatus=null;
        }
        IEnumerator ReviewCombinations()
        {
            int step=0;
            foreach(string hair in new[]{"Short","Bob"})foreach(string top in new[]{"Tee","Sweater"})
                foreach(string pose in new[]{"Idle","Walk","Sit"})foreach(string view in new[]{"Front","Side","Back"})
                {
                    character.Apply(new Appearance{hair=hair,top=top});character.SetPose(pose);SetCameraView(view);
                    reviewStatus=$"Review {++step}/36: {hair} + {top} / {pose} / {view}";
                    yield return new WaitForSeconds(pose=="Idle"?1.5f:2.25f);
                }
            character.Apply(new Appearance());character.SetPose("Idle");SetCameraView("Front");
            review=null;reviewStatus=null;
        }
        public void Save()
        {
            try
            {
                Directory.CreateDirectory(Application.persistentDataPath);
                string temp=SavePath+".tmp";File.WriteAllText(temp,JsonUtility.ToJson(character.appearance,true));
                if(File.Exists(SavePath)) File.Replace(temp,SavePath,null); else File.Move(temp,SavePath);
                status="Appearance saved on this device";
            }
            catch(Exception e) {status="Save failed: "+e.Message;Debug.LogWarning(status);}
        }
        void Select(string kind,string value)
        {
            StopReview();
            if(kind=="hair")character.appearance.hair=value;
            if(kind=="top")character.appearance.top=value;
            if(kind=="expression")character.appearance.expression=value;
            character.Apply(character.appearance);Save();
        }
        void ShowDecoration(int direction)
        {
            if(decorationPrefabs==null||decorationPrefabs.Length==0)return;
            catalogueIndex=(catalogueIndex+direction+decorationPrefabs.Length)%decorationPrefabs.Length;
            if(decorationPreview)Destroy(decorationPreview);
            decorationPreview=Instantiate(decorationPrefabs[catalogueIndex],new Vector3(-2.8f,.4f,0),Quaternion.identity);
        }
        void Styles()
        {
            if(title!=null)return;
            panel=new Texture2D(1,1);panel.SetPixel(0,0,new Color(.96f,.95f,.91f,.97f));panel.Apply();
            accent=new Texture2D(1,1);accent.SetPixel(0,0,new Color(.24f,.43f,.40f));accent.Apply();
            title=new GUIStyle(GUI.skin.label){fontSize=30,fontStyle=FontStyle.Bold};title.normal.textColor=new Color(.15f,.27f,.25f);
            body=new GUIStyle(GUI.skin.label){fontSize=13,wordWrap=true};body.normal.textColor=new Color(.28f,.34f,.32f);
            label=new GUIStyle(body){fontSize=15,fontStyle=FontStyle.Bold};
            button=new GUIStyle(GUI.skin.button){fontSize=14,fixedHeight=36,margin=new RectOffset(0,7,4,4)};
            button.normal.background=panel;button.normal.textColor=new Color(.15f,.27f,.25f);
            button.hover.background=accent;button.hover.textColor=Color.white;button.active.background=accent;button.active.textColor=Color.white;
            selected=new GUIStyle(button);selected.normal.background=accent;selected.normal.textColor=Color.white;
        }
        void Choice(string kind,string current,params string[] values)
        {
            GUILayout.BeginHorizontal();foreach(string v in values)if(GUILayout.Button(v,current==v?selected:button))Select(kind,v);GUILayout.EndHorizontal();
        }
        void OnGUI()
        {
            Styles();float scale=Mathf.Min(Screen.width/1280f,Screen.height/800f);GUI.matrix=Matrix4x4.Scale(new Vector3(scale,scale,1));
            GUI.DrawTexture(new Rect(20,20,302,760),panel);
            GUILayout.BeginArea(new Rect(40,38,264,720));
            GUILayout.Label("ILLOVA",title);GUILayout.Label("PIONA / CHARACTER ATELIER",label);GUILayout.Space(14);
            GUILayout.Label("01   Hair",label);Choice("hair",character.appearance.hair,"Short","Bob");GUILayout.Space(12);
            GUILayout.Label("02   Clothing",label);Choice("top",character.appearance.top,"Tee","Sweater");GUILayout.Space(8);
            GUILayout.BeginHorizontal();for(int i=0;i<4;i++) {GUI.backgroundColor=ModularCharacter.Palette[i];if(GUILayout.Button(character.appearance.color==i?"Selected":"",button,GUILayout.Width(59))){character.appearance.color=i;character.Apply(character.appearance);Save();}}GUI.backgroundColor=Color.white;GUILayout.EndHorizontal();GUILayout.Space(12);
            GUILayout.Label("03   Expression",label);Choice("expression",character.appearance.expression,"Neutral","Smile");Choice("expression",character.appearance.expression,"Blink","Surprise");GUILayout.Space(12);
            GUILayout.Label("04   Movement study",label);GUILayout.BeginHorizontal();foreach(string p in new[]{"Idle","Walk","Sit"})if(GUILayout.Button(p,character.Pose==p?selected:button)){StopReview();character.SetPose(p);}GUILayout.EndHorizontal();GUILayout.Space(8);
            GUILayout.BeginHorizontal();foreach(string view in new[]{"Front","Side","Back"})if(GUILayout.Button(view,CameraViewName==view?selected:button)){StopReview();SetCameraView(view);}GUILayout.EndHorizontal();
            if(GUILayout.Button(review==null?"Review all 4 combinations":"Stop review",button)){if(review==null)BeginReview();else StopReview();}GUILayout.Space(8);
            GUILayout.Label("Scene",label);GUILayout.BeginHorizontal();if(GUILayout.Button("Atelier",!villageView?selected:button))SetView(false);if(GUILayout.Button("Village",villageView?selected:button))SetView(true);GUILayout.EndHorizontal();
            if(villageView){GUILayout.BeginHorizontal();if(GUILayout.Button("< Prop",button))ShowDecoration(-1);if(GUILayout.Button("Prop >",button))ShowDecoration(1);GUILayout.EndHorizontal();if(decorationPreview)GUILayout.Label(decorationPrefabs[catalogueIndex].name,body);}
            GUILayout.FlexibleSpace();GUILayout.Label(reviewStatus??status,body);GUILayout.Label("Right-drag to orbit / Scroll to zoom",body);GUILayout.EndArea();
            GUI.DrawTexture(new Rect(348,24,590,38),panel);GUI.Label(new Rect(360,31,570,28),$"ILLOVA / Piona / {character.appearance.hair} + {character.appearance.top} / {character.Pose} / {CameraViewName}",body);
            GUI.matrix=Matrix4x4.identity;
        }
        void OnDestroy(){if(panel)Destroy(panel);if(accent)Destroy(accent);if(decorationPreview)Destroy(decorationPreview);}
    }
}
