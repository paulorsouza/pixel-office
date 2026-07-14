using System.IO;
using Newtonsoft.Json.Linq;
using OfficeQuest.Game;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace OfficeQuest.EditorTools
{
    /// <summary>
    /// Automação de verificação visual. Roda em -batchmode (com gráficos): entra em Play com
    /// auto-login, teleporta o jogador, e captura renderizando a câmera para uma RenderTexture
    /// (EncodeToPNG) — não depende do Game view / janela, então funciona em sessão headless.
    /// Uso via CLI: -batchmode -executeMethod OfficeQuest.EditorTools.DevShots.Run
    /// </summary>
    public static class DevShots
    {
        [MenuItem("OfficeQuest/Capturar screenshots")]
        public static void Run()
        {
            PlayerPrefs.SetInt("oq-autologin", 1);
            PlayerPrefs.Save();
            SessionState.SetBool("oq.shots.active", true);
        }

        /// <summary>
        /// Render headless SÍNCRONO (sem Play, sem backend, sem janela): constrói o mapa em edit
        /// mode, posiciona personagens em poses diferentes e renderiza a câmera p/ PNG. Confiável
        /// em -batchmode -quit (não depende de desktop interativo). Uso:
        ///   -batchmode -executeMethod OfficeQuest.EditorTools.DevShots.RenderStatic -quit
        /// </summary>
        public static void RenderStatic()
        {
            try
            {
                var desks = new JArray();
                foreach (var n in new[] { "Ana", "Bruno", "Carla", "Diego" })
                    desks.Add(new JObject { ["name"] = n, ["color"] = "#7c5cff" });
                var mapRoot = new GameObject("Map").transform;
                OfficeMap.Build(mapRoot, desks);

                var root = new GameObject("DemoChars").transform;
                SpawnChar(root, 11 * 28 + 4, 11 * 28 + 14, "right", true, 0);
                SpawnChar(root, 13 * 28 + 14, 11 * 28 + 14, "down", false, 1);
                SpawnChar(root, 15 * 28 + 14, 10 * 28 + 14, "up", true, 2);

                var camGo = new GameObject("ShotCam");
                var cam = camGo.AddComponent<Camera>();
                cam.orthographic = true;
                cam.clearFlags = CameraClearFlags.SolidColor;
                cam.backgroundColor = OfficeQuest.Game.SoftArt.Hex("#26262e");

                // 1) visão ampla (~zoom máximo do jogo; size 12 estoura o zoom e esfarela)
                cam.transform.position = new Vector3(OfficeMap.W / 2f, OfficeMap.H / 2f, -10);
                cam.orthographicSize = 10f;
                CaptureCam(cam, "shot-map.png", 1280, 800);

                // 2) close-up no open space (piso, sombras, personagens)
                var c = OfficeMap.SuToWorld(13 * 28 + 14, 11 * 28 + 14);
                cam.transform.position = new Vector3(c.x, c.y, -10);
                cam.orthographicSize = 3.2f;
                CaptureCam(cam, "shot-close.png", 1280, 720);

                Debug.Log("[DevShots] render estático OK (shot-map.png, shot-close.png)");
            }
            catch (System.Exception e)
            {
                Debug.LogError("[DevShots] RenderStatic falhou: " + e);
            }
        }

        private static void SpawnChar(Transform parent, float sx, float sy, string dir, bool moving, int idx)
        {
            var host = new GameObject($"demo-{idx}").transform;
            host.SetParent(parent, false);
            var ch = LimeCharacter.Create(host);
            ch.SetCharacter(idx);
            ch.transform.position = OfficeMap.SuToWorld(sx, sy);
            ch.SetSortingOrder(OfficeMap.Order(ch.transform.position.y));
            for (var i = 0; i < 3; i++) ch.Tick(0.12f, moving, false, dir); // pose no meio do ciclo
        }

        private static void CaptureCam(Camera cam, string name, int w, int h)
        {
            var rt = new RenderTexture(w, h, 24);
            var prevActive = RenderTexture.active;
            cam.targetTexture = rt;
            // sob URP (SRP) cam.Render() não funciona — usar SubmitRenderRequest
            if (RenderPipelineManager.currentPipeline != null)
            {
                var req = new RenderPipeline.StandardRequest { destination = rt };
                if (RenderPipeline.SupportsRenderRequest(cam, req)) cam.SubmitRenderRequest(req);
                else cam.Render();
            }
            else cam.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(w, h, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            tex.Apply();
            cam.targetTexture = null;
            RenderTexture.active = prevActive;

            var dir = Path.Combine(Directory.GetParent(Application.dataPath).FullName, "Logs");
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir, name), tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            rt.Release();
            Object.DestroyImmediate(rt);
        }
    }

    [InitializeOnLoad]
    public static class DevShotsRunner
    {
        private const int W = 1280, H = 720;
        private static double _playStart;
        private static int _step;

        static DevShotsRunner()
        {
            EditorApplication.update += OnUpdate;
        }

        private static LocalPlayer LP() => Object.FindAnyObjectByType<LocalPlayer>();

        private static void Teleport(float su_x, float su_y, float zoom)
        {
            var lp = LP();
            if (lp != null && lp.View != null)
            {
                lp.View.CurrentSu = new Vector2(su_x, su_y);
                lp.View.TargetSu = new Vector2(su_x, su_y);
            }
            var cam = Camera.main;
            if (cam != null)
            {
                cam.orthographicSize = zoom;
                var p = OfficeMap.SuToWorld(su_x, su_y);
                cam.transform.position = new Vector3(p.x, p.y + .8f, -10);
            }
        }

        /// <summary>Congela o jogador local numa pose (direção + andando) para provar a animação.</summary>
        private static void Pose(string dir, bool moving)
        {
            var lp = LP();
            if (lp == null || lp.View == null) return;
            lp.enabled = false;          // impede o input de resetar a pose
            lp.View.Dir = dir;
            lp.View.Moving = moving;
        }

        private static void Capture(string name)
        {
            var cam = Camera.main;
            if (cam == null) return;
            var rt = new RenderTexture(W, H, 24) { antiAliasing = 1 };
            var prevTarget = cam.targetTexture;
            var prevActive = RenderTexture.active;
            cam.targetTexture = rt;
            cam.Render();
            RenderTexture.active = rt;
            var tex = new Texture2D(W, H, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, W, H), 0, 0);
            tex.Apply();
            cam.targetTexture = prevTarget;
            RenderTexture.active = prevActive;

            var dir = Path.Combine(Directory.GetParent(Application.dataPath).FullName, "Logs");
            Directory.CreateDirectory(dir);
            File.WriteAllBytes(Path.Combine(dir, name), tex.EncodeToPNG());

            Object.DestroyImmediate(tex);
            rt.Release();
            Object.DestroyImmediate(rt);
            Debug.Log($"[DevShots] capturado {name}");
        }

        // roteiro por tempo (segundos após o Play começar). Precisa de conexão (LocalPlayer).
        private static readonly (double t, System.Action act)[] Script =
        {
            (7.0,  () => Teleport(9 * 28 + 14, 11 * 28 + 14, 5.5f)), // open space: piso/sombras
            (7.6,  () => Capture("shot-1.png")),
            (8.4,  () => { Teleport(9 * 28 + 14, 11 * 28 + 14, 2.6f); Pose("right", true); }), // close-up andando p/ direita
            (9.4,  () => Capture("shot-2.png")),
            (10.0, () => { SessionState.SetBool("oq.shots.active", false); EditorApplication.Exit(0); }),
        };

        private static void OnUpdate()
        {
            if (!SessionState.GetBool("oq.shots.active", false)) return;

            // espera scripts compilarem/assets importarem antes de entrar em Play
            if (EditorApplication.isCompiling || EditorApplication.isUpdating) return;

            if (!Application.isPlaying)
            {
                if (!EditorApplication.isPlayingOrWillChangePlaymode)
                    EditorApplication.EnterPlaymode();
                return;
            }

            if (_playStart == 0) _playStart = EditorApplication.timeSinceStartup;
            var t = EditorApplication.timeSinceStartup - _playStart;

            while (_step < Script.Length && t >= Script[_step].t)
            {
                Script[_step].act();
                _step++;
            }
        }
    }
}
