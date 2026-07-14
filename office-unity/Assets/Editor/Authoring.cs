using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using UnityEngine.Tilemaps;
using OfficeQuest.Game;

namespace OfficeQuest.EditorTools
{
    /// <summary>
    /// Prepara as FERRAMENTAS DE AUTORIA (fazer o mapa à mão):
    /// - Tiles de piso/parede a partir do room_builder já fatiado.
    /// - Um prefab por móvel (arrastar pra cena; já com colisão e ordenação por Y).
    /// - MyOffice com Grid + Tilemaps prontos para pintar no Tile Palette.
    ///
    /// Pré-requisito: rode "Office Quest ▸ Rebuild" ao menos uma vez antes (importa/fatia a arte).
    /// O processo é incremental e nunca substitui uma MyOffice existente.
    /// </summary>
    public static class Authoring
    {
        const string RoomPng = "Assets/Art/Rooms/room_builder.png";
        const string FurnDir = "Assets/Art/Furniture";
        const string LitMatPath = "Assets/Art/SpriteLit.mat";
        const string ScenePath = "Assets/Scenes/MyOffice.unity";

        [MenuItem("Office Quest/Prepare Manual Authoring")]
        public static void Setup()
        {
            var lit = AssetDatabase.LoadAssetAtPath<Material>(LitMatPath);
            if (lit == null) { Debug.LogError("[Authoring] SpriteLit.mat não achado — rode 'Office Quest ▸ Rebuild' primeiro."); return; }
            if (Sub("rb_11_9") == null) { Debug.LogError("[Authoring] room_builder não fatiado — rode 'Office Quest ▸ Rebuild' primeiro."); return; }

            Directory.CreateDirectory("Assets/Tiles");
            MakeTile("Assets/Tiles/floor_gray.asset", Sub("rb_11_9"), Tile.ColliderType.None);
            MakeTile("Assets/Tiles/floor_wood.asset", Sub("rb_14_7"), Tile.ColliderType.None);
            MakeTile("Assets/Tiles/floor_carpet.asset", Sub("rb_11_10"), Tile.ColliderType.None);
            MakeTile("Assets/Tiles/wall.asset", Sub("rb_11_3"), Tile.ColliderType.Grid);
            MakeTile("Assets/Tiles/wall_face.asset", Sub("rb_11_6"), Tile.ColliderType.Grid);

            int n = BuildFurniturePrefabs(lit);
            EnsureScene(lit);

            AssetDatabase.SaveAssets();
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            Debug.Log($"[Authoring] OK — {n} prefabs atualizados e MyOffice preservada. Camadas ausentes foram adicionadas sem apagar conteúdo. Veja AUTORIA.md.");
        }

        static int BuildFurniturePrefabs(Material lit)
        {
            Directory.CreateDirectory("Assets/Prefabs/Furniture");
            int count = 0;
            foreach (var png in Directory.GetFiles(FurnDir, "*.png"))
            {
                var name = Path.GetFileNameWithoutExtension(png);
                var sprite = AssetDatabase.LoadAssetAtPath<Sprite>($"{FurnDir}/{name}.png");
                if (sprite == null) continue;

                var go = new GameObject(name);
                var sr = go.AddComponent<SpriteRenderer>();
                sr.sprite = sprite;
                sr.material = lit;
                go.AddComponent<YSort>();

                // colisão na base, largura ~ do móvel (pivô é base-centro)
                var col = go.AddComponent<BoxCollider2D>();
                float w = Mathf.Max(0.6f, sprite.bounds.size.x * 0.8f);
                col.size = new Vector2(w, 0.55f);
                col.offset = new Vector2(0f, 0.32f);

                PrefabUtility.SaveAsPrefabAsset(go, $"Assets/Prefabs/Furniture/{name}.prefab");
                Object.DestroyImmediate(go);
                count++;
            }
            return count;
        }

        static void EnsureScene(Material lit)
        {
            if (!File.Exists(ScenePath))
            {
                BuildNewScene(lit);
                return;
            }

            var scene = EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single);
            var grid = GameObject.Find("Grid");
            if (grid == null)
            {
                grid = new GameObject("Grid");
                grid.AddComponent<Grid>();
            }
            else if (grid.GetComponent<Grid>() == null) grid.AddComponent<Grid>();

            EnsureTilemap("Floor", grid.transform, lit, 0, false);
            EnsureTilemap("Walls", grid.transform, lit, 10, true);
            EnsureTilemap("WallFaces", grid.transform, lit, 20, false);
            EnsureTilemap("Decoration", grid.transform, lit, 30, false);
            EnsureTilemap("Collision", grid.transform, lit, 40, true);

            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        static void BuildNewScene(Material lit)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var grid = new GameObject("Grid");
            grid.AddComponent<Grid>();

            EnsureTilemap("Floor", grid.transform, lit, 0, false);
            EnsureTilemap("Walls", grid.transform, lit, 10, true);
            EnsureTilemap("WallFaces", grid.transform, lit, 20, false);
            EnsureTilemap("Decoration", grid.transform, lit, 30, false);
            EnsureTilemap("Collision", grid.transform, lit, 40, true);

            // câmera pixel-perfect (olhando o centro; sem seguir ninguém — é cena de autoria)
            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.10f, 0.10f, 0.12f);
            cam.transform.position = new Vector3(10f, 6f, -10f);
            cam.orthographicSize = 6f;
            var ppc = camGo.AddComponent<PixelPerfectCamera>();
            ppc.assetsPPU = 16; ppc.refResolutionX = 320; ppc.refResolutionY = 180;

            var gl = new GameObject("Global Light").AddComponent<Light2D>();
            gl.lightType = Light2D.LightType.Global;
            gl.color = new Color(1f, 0.97f, 0.92f);
            gl.intensity = 0.95f;

            // jogador, se já existir o prefab (pra dar Play e andar)
            var player = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/Player.prefab");
            if (player != null)
            {
                var p = (GameObject)PrefabUtility.InstantiatePrefab(player, scene);
                p.transform.position = new Vector3(10f, 6f, 0f);
            }

            Directory.CreateDirectory("Assets/Scenes");
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
        }

        // ---------- helpers ----------

        static Sprite Sub(string spriteName) =>
            AssetDatabase.LoadAllAssetsAtPath(RoomPng).OfType<Sprite>().FirstOrDefault(s => s.name == spriteName);

        static void MakeTile(string path, Sprite sprite, Tile.ColliderType collider)
        {
            var tile = AssetDatabase.LoadAssetAtPath<Tile>(path);
            bool isNew = tile == null;
            if (isNew) tile = ScriptableObject.CreateInstance<Tile>();
            tile.sprite = sprite;
            tile.colliderType = collider;
            if (isNew) AssetDatabase.CreateAsset(tile, path);
            else EditorUtility.SetDirty(tile);
        }

        static Tilemap NewTilemap(string name, Transform parent, Material lit, int order)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent);
            var tm = go.AddComponent<Tilemap>();
            var tr = go.AddComponent<TilemapRenderer>();
            tr.material = lit;
            tr.sortingOrder = order;
            return tm;
        }

        static Tilemap EnsureTilemap(string name, Transform parent, Material lit, int order, bool collision)
        {
            var child = parent.Find(name);
            Tilemap tm;
            if (child == null) tm = NewTilemap(name, parent, lit, order);
            else
            {
                tm = child.GetComponent<Tilemap>();
                if (tm == null) tm = child.gameObject.AddComponent<Tilemap>();
                var renderer = child.GetComponent<TilemapRenderer>();
                if (renderer == null) renderer = child.gameObject.AddComponent<TilemapRenderer>();
                renderer.material = lit;
                renderer.sortingOrder = order;
            }

            if (collision)
            {
                if (tm.GetComponent<TilemapCollider2D>() == null) tm.gameObject.AddComponent<TilemapCollider2D>();
                var body = tm.GetComponent<Rigidbody2D>();
                if (body == null) body = tm.gameObject.AddComponent<Rigidbody2D>();
                body.bodyType = RigidbodyType2D.Static;
            }
            return tm;
        }
    }
}
