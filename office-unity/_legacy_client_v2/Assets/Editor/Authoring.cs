using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;
using UnityEngine.Tilemaps;
using UnityEngine.SceneManagement;
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
            if (Application.isPlaying) { Debug.LogWarning("[Authoring] Saia do Play (aperte ■) antes de rodar isto."); return; }
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
            Debug.Log($"[Authoring v2-reparo] OK — {n} prefabs; cena reparada (jogador/câmera/luz garantidos), tiles preservados. Veja AUTORIA.md.");
        }

        [MenuItem("Office Quest/Paint Starter Room")]
        public static void PaintStarterRoom()
        {
            if (Application.isPlaying) { Debug.LogWarning("[Authoring] Saia do Play (aperte ■) antes de rodar isto."); return; }
            var lit = AssetDatabase.LoadAssetAtPath<Material>(LitMatPath);
            var floorTile = AssetDatabase.LoadAssetAtPath<TileBase>("Assets/Tiles/floor_gray.asset");
            var wallTile = AssetDatabase.LoadAssetAtPath<TileBase>("Assets/Tiles/wall.asset");
            if (lit == null || floorTile == null || wallTile == null)
            { Debug.LogError("[Authoring] Rode 'Office Quest ▸ Rebuild' e depois 'Prepare Manual Authoring' primeiro."); return; }

            var scene = File.Exists(ScenePath)
                ? EditorSceneManager.OpenScene(ScenePath, OpenSceneMode.Single)
                : EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var gridGo = GameObject.Find("Grid");
            if (gridGo == null) { gridGo = new GameObject("Grid"); gridGo.AddComponent<Grid>(); }
            var floorTm = EnsureTilemap("Floor", gridGo.transform, lit, 0, false);
            var wallTm = EnsureTilemap("Walls", gridGo.transform, lit, 10, true);
            EnsureCamera(); EnsureLight();

            // cômodo simples 4..16 x 1..11, com uma porta embaixo (x=10)
            int x0 = 4, x1 = 16, y0 = 1, y1 = 11;
            for (int x = x0; x <= x1; x++)
                for (int y = y0; y <= y1; y++)
                    floorTm.SetTile(new Vector3Int(x, y, 0), floorTile);
            for (int x = x0; x <= x1; x++) { if (x != 10) wallTm.SetTile(new Vector3Int(x, y0, 0), wallTile); wallTm.SetTile(new Vector3Int(x, y1, 0), wallTile); }
            for (int y = y0; y <= y1; y++) { wallTm.SetTile(new Vector3Int(x0, y, 0), wallTile); wallTm.SetTile(new Vector3Int(x1, y, 0), wallTile); }

            floorTm.CompressBounds(); wallTm.CompressBounds();
            floorTm.RefreshAllTiles(); wallTm.RefreshAllTiles();

            // uns móveis de exemplo pra você ver e mexer
            PlacePrefab("desktop", 7, 8, scene);
            PlacePrefab("chair_up", 7, 7, scene);
            PlacePrefab("plant_a", 14, 3, scene);
            PlacePrefab("coffee", 12, 9, scene);

            var player = EnsurePlayer(scene);
            if (player != null) player.transform.position = new Vector3(10f, 4f, 0f);

            EditorUtility.SetDirty(floorTm);
            EditorUtility.SetDirty(wallTm);
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
            Debug.Log("[Authoring] Cômodo inicial pintado em MyOffice. Dê Play pra andar, e modifique com o Tile Palette!");
        }

        static void PlacePrefab(string name, float x, float y, Scene scene)
        {
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>($"Assets/Prefabs/Furniture/{name}.prefab");
            if (prefab == null) return;
            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
            go.transform.position = new Vector3(x, y, 0f);
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

            // REPARO não-destrutivo: repõe câmera/luz/jogador que faltarem (não mexe nos tiles pintados)
            var cam = EnsureCamera();
            EnsureLight();
            var player = EnsurePlayer(scene);
            if (cam != null && player != null)
            {
                var follow = cam.GetComponent<CameraFollow>() ?? cam.gameObject.AddComponent<CameraFollow>();
                follow.target = player.transform;
            }

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
                (camGo.GetComponent<CameraFollow>() ?? camGo.AddComponent<CameraFollow>()).target = p.transform;
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

        static Camera EnsureCamera()
        {
            var camGo = GameObject.Find("Main Camera");
            if (camGo == null) camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = camGo.GetComponent<Camera>() ?? camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.10f, 0.10f, 0.12f);
            if (camGo.GetComponent<PixelPerfectCamera>() == null)
            {
                var ppc = camGo.AddComponent<PixelPerfectCamera>();
                ppc.assetsPPU = 16; ppc.refResolutionX = 320; ppc.refResolutionY = 180;
            }
            var p = camGo.transform.position;
            if (p.z >= 0f) camGo.transform.position = new Vector3(p.x, p.y, -10f);
            return cam;
        }

        static void EnsureLight()
        {
            if (GameObject.Find("Global Light") != null) return;
            var gl = new GameObject("Global Light").AddComponent<Light2D>();
            gl.lightType = Light2D.LightType.Global;
            gl.color = new Color(1f, 0.97f, 0.92f);
            gl.intensity = 0.95f;
        }

        static GameObject EnsurePlayer(Scene scene)
        {
            var existing = GameObject.Find("Player");
            if (existing != null)
            {
                if (existing.transform.position.sqrMagnitude < 1f) // perdido na origem -> recentraliza p/ ficar visível
                {
                    existing.transform.position = new Vector3(10f, 6f, 0f);
                    Debug.Log("[Authoring] Player estava em (0,0) — recentralizado em (10, 6).");
                }
                else Debug.Log("[Authoring] Player já estava na cena.");
                return existing;
            }
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/Player.prefab");
            if (prefab == null) { Debug.LogError("[Authoring] Player.prefab NÃO achado — rode 'Office Quest ▸ Rebuild' primeiro."); return null; }
            var go = (GameObject)PrefabUtility.InstantiatePrefab(prefab, scene);
            go.transform.position = new Vector3(10f, 6f, 0f);
            Debug.Log("[Authoring] Player REPOSTO na cena em (10, 6).");
            return go;
        }
    }
}
