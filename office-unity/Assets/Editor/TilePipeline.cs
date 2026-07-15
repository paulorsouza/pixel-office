using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using UnityEngine.Tilemaps;

namespace OfficeQuest.EditorTools
{
    /// <summary>
    /// F1b — Tiles de piso + RuleTile de parede autoconectável + cômodo de teste + render.
    ///
    /// Depende da F1 (arte importada em Assets/Art). Usa os sprites já fatiados do
    /// room_builder (rb_col_rowTop). O room_builder é o do pack Office (paredes brancas,
    /// pisos cinza/tan). As paredes são finas (linha) → RuleTile tipo "linha" (H, V, 4
    /// cantos, junções T, cruz).
    ///
    /// A ordem das TilingRules importa: regras MAIS específicas (mais vizinhos exigidos)
    /// vêm ANTES. A RuleTile casa de cima p/ baixo, primeira que bate vence.
    /// </summary>
    public static class TilePipeline
    {
        const string RoomPng = "Assets/Art/Rooms/room_builder.png";
        const string TilesRoot = "Assets/Tiles";
        const string FloorDir = TilesRoot + "/Floors";
        const string WallDir = TilesRoot + "/Walls";
        const string TestScene = "Assets/Scenes/F1b_Test.unity";
        const string ShotPath = "Logs/f1b_test.png";
        const string LitMatPath = "Assets/Art/SpriteLit.mat";

        // ---- mapa de células (rb_col_rowTop). AJUSTÁVEL na verificação. ----
        // Piso
        const string FLOOR_WOOD = "rb_13_9";   // open space (escolha do usuário)
        const string FLOOR_GRAYTILE = "rb_10_9";
        const string FLOOR_LIGHTGRAY = "rb_10_7";
        const string FLOOR_TERRACOTTA = "rb_13_11";
        // Parede fina — conjunto cols 7-9 do room_builder (branco contínuo, cantos limpos,
        // verificado por render). Topo≠base e esq≠dir (peças distintas) — por isso a sala é
        // pintada por POSIÇÃO (WallCell), não por RuleTile automática.
        const string W_FILL = "rb_8_2";   // corpo sólido
        const string W_TOP = "rb_8_1";    // borda superior (horizontal sem emenda)
        const string W_BOT = "rb_8_3";    // borda inferior
        const string W_L = "rb_7_2";      // borda esquerda (vertical)
        const string W_R = "rb_9_2";      // borda direita
        const string W_TL = "rb_7_1";     // canto sup-esq
        const string W_TR = "rb_9_1";     // canto sup-dir
        const string W_BL = "rb_7_3";     // canto inf-esq
        const string W_BR = "rb_9_3";     // canto inf-dir

        static readonly Vector3Int N = new Vector3Int(0, 1, 0);
        static readonly Vector3Int S = new Vector3Int(0, -1, 0);
        static readonly Vector3Int E = new Vector3Int(1, 0, 0);
        static readonly Vector3Int W = new Vector3Int(-1, 0, 0);
        const int THIS = 1;      // RuleTile.TilingRuleOutput.Neighbor.This
        const int NOT = 2;       // RuleTile.TilingRuleOutput.Neighbor.NotThis

        static Dictionary<string, Sprite> _rb;

        [MenuItem("Office Quest/2 · Build Tiles (F1b)")]
        public static void BuildTiles()
        {
            if (!LoadRoomSprites()) return;
            Directory.CreateDirectory(FloorDir);
            Directory.CreateDirectory(WallDir);

            MakeFloor("floor_wood", FLOOR_WOOD);
            MakeFloor("floor_graytile", FLOOR_GRAYTILE);
            MakeFloor("floor_lightgray", FLOOR_LIGHTGRAY);
            MakeFloor("floor_terracotta", FLOOR_TERRACOTTA);

            BuildWallRule();

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("[F1b] Tiles OK — 4 pisos + RuleTile de parede em Assets/Tiles. " +
                      "Rode 'Office Quest ▸ 2b · Test Room + Render' pra ver a parede fechar.");
        }

        // Preview com SpriteRenderers (à prova de bala) em vez de Tilemap-via-script
        // (que não persiste tiles nesta versão). Objetivo: VER o estilo com segurança.
        [MenuItem("Office Quest/2b · Preview Room (F1b)")]
        public static void TestRoomAndRender()
        {
            if (!LoadRoomSprites()) return;
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            Material mat = null;   // material padrão (unlit) — visível sem depender de luz
            var root = new GameObject("PreviewRoom");

            int w = 12, h = 8;
            // piso (todas as células)
            for (int x = 0; x < w; x++)
                for (int y = 0; y < h; y++)
                    Place(root, Rb(FLOOR_WOOD), x, y, 0, mat);
            // paredes (borda) — retas certas + cantos aproximados (afinamos depois)
            for (int x = 0; x < w; x++)
                for (int y = 0; y < h; y++)
                {
                    var cell = WallCell(x, y, w, h);
                    if (cell != null) Place(root, Rb(cell), x, y, 2, mat);
                }

            // Luz global quente
            var lightGo = new GameObject("Global Light 2D");
            var light = lightGo.AddComponent<Light2D>();
            light.lightType = Light2D.LightType.Global;
            light.color = new Color(1f, 0.97f, 0.9f);
            light.intensity = 1.1f;

            // Câmera ortográfica enquadrando a sala
            var camGo = new GameObject("Main Camera");
            var cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.orthographicSize = 5.5f;
            cam.transform.position = new Vector3(w / 2f - 0.5f, h / 2f - 0.5f, -10);
            cam.backgroundColor = new Color(0.15f, 0.15f, 0.18f);
            cam.clearFlags = CameraClearFlags.SolidColor;
            camGo.tag = "MainCamera";

            EditorSceneManager.MarkSceneDirty(scene);
            Directory.CreateDirectory("Assets/Scenes");
            EditorSceneManager.SaveScene(scene, TestScene);

            RenderToPng(cam, 720, 480);
            Debug.Log($"[F1b] Preview (SpriteRenderers) montado: {w}x{h}. Render em {ShotPath}. " +
                      "Olhe a Scene view (2D + F no PreviewRoom).");
        }

        // Mapa de parede por posição na borda (retas corretas; cantos são 1ª versão).
        static string WallCell(int x, int y, int w, int h)
        {
            bool top = y == h - 1, bot = y == 0, left = x == 0, right = x == w - 1;
            if (left && top) return W_TL;
            if (right && top) return W_TR;
            if (left && bot) return W_BL;
            if (right && bot) return W_BR;
            if (top) return W_TOP;
            if (bot) return W_BOT;
            if (left) return W_L;
            if (right) return W_R;
            return null;
        }

        static void Place(GameObject parent, Sprite s, int x, int y, int order, Material mat)
        {
            if (s == null) return;
            var go = new GameObject($"t_{x}_{y}_{order}");
            go.transform.SetParent(parent.transform);
            go.transform.position = new Vector3(x, y, 0);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = s;
            sr.sortingOrder = order;
            if (mat != null) sr.sharedMaterial = mat;
        }

        // ---------- helpers ----------

        static bool LoadRoomSprites()
        {
            if (_rb != null && _rb.Count > 0) return true;
            var all = AssetDatabase.LoadAllAssetsAtPath(RoomPng).OfType<Sprite>().ToList();
            if (all.Count == 0) { Debug.LogError($"[F1b] sem sprites fatiados em {RoomPng} — rodou a F1?"); return false; }
            _rb = all.ToDictionary(s => s.name, s => s);
            return true;
        }

        static Sprite Rb(string name)
        {
            if (_rb.TryGetValue(name, out var s)) return s;
            Debug.LogWarning($"[F1b] sprite '{name}' não encontrado no room_builder.");
            return null;
        }

        static void MakeFloor(string assetName, string rbCell)
        {
            var tile = ScriptableObject.CreateInstance<Tile>();
            tile.sprite = Rb(rbCell);
            tile.colliderType = Tile.ColliderType.None;
            tile.name = assetName;
            AssetDatabase.CreateAsset(tile, $"{FloorDir}/{assetName}.asset");
        }

        static void BuildWallRule()
        {
            var rt = ScriptableObject.CreateInstance<RuleTile>();
            rt.m_DefaultSprite = Rb(W_FILL);
            rt.m_DefaultColliderType = Tile.ColliderType.Grid;
            rt.m_TilingRules = new List<RuleTile.TilingRule>();

            // cantos primeiro (2 vizinhos perpendiculares)
            AddRule(rt, W_TL, (E, THIS), (S, THIS), (N, NOT), (W, NOT));
            AddRule(rt, W_TR, (W, THIS), (S, THIS), (N, NOT), (E, NOT));
            AddRule(rt, W_BL, (N, THIS), (E, THIS), (S, NOT), (W, NOT));
            AddRule(rt, W_BR, (N, THIS), (W, THIS), (S, NOT), (E, NOT));
            // retas (topo/base e esq/dir são ambíguos p/ RuleTile — aproximação;
            // salas de verdade são pintadas por POSIÇÃO via WallCell, que fica perfeito)
            AddRule(rt, W_TOP, (E, THIS), (W, THIS));
            AddRule(rt, W_L, (N, THIS), (S, THIS));
            // pontas (1 vizinho)
            AddRule(rt, W_TOP, (E, THIS));
            AddRule(rt, W_TOP, (W, THIS));
            AddRule(rt, W_L, (N, THIS));
            AddRule(rt, W_L, (S, THIS));

            AssetDatabase.CreateAsset(rt, $"{WallDir}/wall_rule.asset");
        }

        static void AddRule(RuleTile rt, string sprite, params (Vector3Int pos, int cond)[] neigh)
        {
            var rule = new RuleTile.TilingRule
            {
                m_Sprites = new[] { Rb(sprite) },
                m_ColliderType = Tile.ColliderType.Grid,
                m_Output = RuleTile.TilingRuleOutput.OutputSprite.Single,
                m_Neighbors = new List<int>(),
                m_NeighborPositions = new List<Vector3Int>()
            };
            foreach (var (pos, cond) in neigh)
            {
                rule.m_NeighborPositions.Add(pos);
                rule.m_Neighbors.Add(cond);
            }
            rt.m_TilingRules.Add(rule);
        }

        static Tilemap MakeTilemapLayer(GameObject grid, string name, int order)
        {
            var go = new GameObject(name);
            go.transform.SetParent(grid.transform);
            var tm = go.AddComponent<Tilemap>();
            var r = go.AddComponent<TilemapRenderer>();
            r.sortingOrder = order;
            r.material = AssetDatabase.LoadAssetAtPath<Material>("Assets/Art/SpriteLit.mat");
            return tm;
        }

        static void RenderToPng(Camera cam, int w, int h)
        {
            var rt = new RenderTexture(w, h, 16) { antiAliasing = 1 };
            cam.targetTexture = rt;
            bool rendered = false;
            if (RenderPipelineManager.currentPipeline != null)
            {
                try
                {
                    var req = new RenderPipeline.StandardRequest { destination = rt };
                    cam.SubmitRenderRequest(req);   // URP/SRP: cam.Render() é no-op
                    rendered = true;
                }
                catch (System.Exception e) { Debug.LogWarning($"[F1b] SubmitRenderRequest falhou ({e.Message}); tentando Render()."); }
            }
            if (!rendered) cam.Render();

            RenderTexture.active = rt;
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
            tex.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            tex.Apply();
            RenderTexture.active = null;
            cam.targetTexture = null;

            Directory.CreateDirectory("Logs");
            File.WriteAllBytes(ShotPath, tex.EncodeToPNG());
            Object.DestroyImmediate(tex);
            Object.DestroyImmediate(rt);
        }
    }
}
