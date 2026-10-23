using UnityEditor;

namespace Illoava.Editor
{
    public class PionaImportSettings : AssetPostprocessor
    {
        void OnPreprocessModel()
        {
            if (assetPath != "Assets/ILLOAVA/Characters/Piona/Piona_Modular.fbx") return;
            var model=(ModelImporter)assetImporter;
            model.animationType=ModelImporterAnimationType.Generic;
            model.importAnimation=false;
            model.importBlendShapes=true;
            model.isReadable=true;
            model.optimizeGameObjects=false;
            model.meshCompression=ModelImporterMeshCompression.Off;
            model.importNormals=ModelImporterNormals.Import;
            model.materialImportMode=ModelImporterMaterialImportMode.ImportStandard;
        }
    }
}
