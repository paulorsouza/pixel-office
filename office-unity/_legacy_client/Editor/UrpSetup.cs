using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace OfficeQuest.EditorTools
{
    /// <summary>
    /// Cria um URP Asset com 2D Renderer e o define como render pipeline padrão do projeto.
    /// Passo 1 da migração pro pipeline 2D (habilita Light2D / Pixel Perfect / Sprite-Lit).
    /// Uso: -batchmode -executeMethod OfficeQuest.EditorTools.UrpSetup.SetupUrp2D -quit
    /// </summary>
    public static class UrpSetup
    {
        public static void SetupUrp2D()
        {
            try
            {
                const string dir = "Assets/Settings";
                if (!AssetDatabase.IsValidFolder(dir)) AssetDatabase.CreateFolder("Assets", "Settings");

                var rendererPath = dir + "/Renderer2D.asset";
                var urpPath = dir + "/URP2D.asset";

                // 2D Renderer (traz suporte a Light2D)
                var renderer2D = ScriptableObject.CreateInstance<Renderer2DData>();
                AssetDatabase.CreateAsset(renderer2D, rendererPath);

                // URP Asset apontando pro 2D Renderer
                var urp = UniversalRenderPipelineAsset.Create(renderer2D);
                AssetDatabase.CreateAsset(urp, urpPath);
                AssetDatabase.SaveAssets();

                // define como pipeline padrão (global) e em todos os níveis de qualidade
                GraphicsSettings.defaultRenderPipeline = urp;
                var current = QualitySettings.GetQualityLevel();
                for (var i = 0; i < QualitySettings.names.Length; i++)
                {
                    QualitySettings.SetQualityLevel(i, false);
                    QualitySettings.renderPipeline = urp;
                }
                QualitySettings.SetQualityLevel(current, false);

                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
                Debug.Log("[UrpSetup] URP 2D criado e atribuído: " + urpPath);
            }
            catch (System.Exception e)
            {
                Debug.LogError("[UrpSetup] falhou: " + e);
            }
        }
    }
}
