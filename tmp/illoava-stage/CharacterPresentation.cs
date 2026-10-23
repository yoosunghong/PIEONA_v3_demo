using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Illoava.Editor
{
    public static class CharacterPresentation
    {
        [MenuItem("ILLOVA/Show all Piona combinations")]
        public static void Open()
        {
            if(EditorApplication.isPlaying) { Object.FindAnyObjectByType<CustomizationDemo>()?.BeginReview();return; }
            EditorSceneManager.OpenScene("Assets/ILLOAVA/Scenes/ILLOAVA_Demo.unity");
            EditorApplication.playModeStateChanged+=StartTour;
            EditorApplication.isPlaying=true;
        }
        static void StartTour(PlayModeStateChange state)
        {
            if(state!=PlayModeStateChange.EnteredPlayMode)return;
            EditorApplication.playModeStateChanged-=StartTour;
            // Start methods must finish before the review changes camera/appearance.
            EditorApplication.delayCall+=()=>{Object.FindAnyObjectByType<CustomizationDemo>()?.BeginReview();};
        }
    }
}
