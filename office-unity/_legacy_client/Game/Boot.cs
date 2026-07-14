using UnityEngine;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Ponto de entrada sem cena: qualquer cena aberta (inclusive uma vazia)
    /// funciona — ao dar Play, o jogo inteiro é montado em código.
    /// </summary>
    public static class Boot
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Init()
        {
            if (UnityEngine.Object.FindAnyObjectByType<OfficeGame>() != null) return;
            var go = new GameObject("OfficeQuest");
            go.AddComponent<OfficeGame>();
            UnityEngine.Object.DontDestroyOnLoad(go);
        }
    }
}
