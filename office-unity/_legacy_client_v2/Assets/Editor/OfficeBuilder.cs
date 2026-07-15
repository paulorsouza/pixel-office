using System.Collections.Generic;
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
    /// Importa e prepara a arte pelo pipeline real do Unity.
    /// Este comando NÃO cria nem substitui cenas: MyOffice.unity é a fonte de verdade
    /// e deve permanecer totalmente editável pelo usuário.
    /// </summary>
    public static class OfficeBuilder
    {
        const string ArtRooms = "Assets/Art/Rooms/room_builder.png";
        const string CharsDir = "Assets/Art/Chars";
        const string FurnDir = "Assets/Art/Furniture";
        const string LitMatPath = "Assets/Art/SpriteLit.mat";
        const string ScenePath = "Assets/Scenes/Office.unity";
        const string ManualScenePath = "Assets/Scenes/MyOffice.unity";
        const int ROOM_COLS = 16, ROOM_ROWS = 14;
        const int W = 30, H = 18; // mapa em tiles (y para cima)

        // ---------- layout de móveis (sprite, tileX, tileY = linha da base, largura em tiles, sólido) ----------
        struct Furn
        {
            public string sprite; public int x, y, w; public bool solid;
            public Furn(string s, int x, int y, int w, bool solid) { sprite = s; this.x = x; this.y = y; this.w = w; this.solid = solid; }
        }

        // mesas = tampo (desktop) + monitor por cima; a cadeira fica logo abaixo, virada p/ o monitor.
        static readonly Vector2Int[] Desks = { new Vector2Int(13, 8), new Vector2Int(17, 8), new Vector2Int(21, 8) };

        static readonly Furn[] Furniture =
        {
            // open space: cadeiras das mesas (o tampo+monitor entra via Desks)
            new Furn("chair_up", 13, 7, 1, true),
            new Furn("chair_up", 17, 7, 1, true),
            new Furn("chair_up", 21, 7, 1, true),
            new Furn("plant_b", 5, 6, 1, true),
            new Furn("plant_a", 24, 10, 1, true),
            new Furn("cooler", 14, 15, 1, true),
            new Furn("plant_c", 26, 13, 1, true),

            // café (canto inferior-direito, piso terracota)
            new Furn("coffee", 21, 3, 2, true),
            new Furn("vending", 25, 3, 1, true),
            new Furn("bench", 23, 1, 2, true),
            new Furn("plant_c", 27, 1, 1, true),

            // sala de reunião (interior x3..9, y11..15) — cadeiras viradas p/ a mesa
            new Furn("table", 5, 13, 2, true),
            new Furn("chair_right", 4, 13, 1, true), // à esquerda da mesa, olhando p/ a direita
            new Furn("chair_left", 7, 13, 1, true),  // à direita da mesa, olhando p/ a esquerda
            new Furn("chair", 5, 14, 1, true), new Furn("chair", 6, 14, 1, true), // atrás da mesa, virada p/ baixo, longe da porta
            new Furn("board", 5, 15, 2, false), // quadro na parede norte (não colide)
        };

        static readonly string[] FurnNames = { "desk", "desktop", "chair", "chair_up", "chair_left", "chair_right", "table", "plant_a", "plant_b", "plant_c", "coffee", "vending", "bench", "cooler", "board" };

        [MenuItem("Office Quest/Prepare Imported Assets")]
        public static void Rebuild()
        {
            try
            {
                EditorUtility.DisplayProgressBar("Office Quest", "Configurando import da arte…", 0.1f);
                ConfigureRoomImporter(ArtRooms);
                foreach (var p in CharSheetPaths()) ConfigureCharImporter(p);
                foreach (var n in FurnNames) ConfigureFurnitureImporter($"{FurnDir}/{n}.png");
                AssetDatabase.Refresh();

                EditorUtility.DisplayProgressBar("Office Quest", "Criando material e tiles…", 0.4f);
                var lit = GetOrCreateLitMaterial();
                // pack de office: piso de tile cinza (11,9) + parede branca limpa (11,3)
                var floorOpen = MakeTile("Assets/Tiles/floor_open.asset", Sub(ArtRooms, "rb_11_9"), Tile.ColliderType.None);
                var floorMeet = MakeTile("Assets/Tiles/floor_meet.asset", Sub(ArtRooms, "rb_11_10"), Tile.ColliderType.None);
                var floorCoffee = MakeTile("Assets/Tiles/floor_coffee.asset", Sub(ArtRooms, "rb_11_9"), Tile.ColliderType.None);
                var wallTop = MakeTile("Assets/Tiles/wall.asset", Sub(ArtRooms, "rb_11_3"), Tile.ColliderType.Grid);
                var wallFace = MakeTile("Assets/Tiles/wall_face.asset", Sub(ArtRooms, "rb_11_6"), Tile.ColliderType.Grid);

                EditorUtility.DisplayProgressBar("Office Quest", "Montando o prefab do personagem…", 0.6f);
                var playerPrefab = BuildPlayerPrefab(lit);

                AssetDatabase.SaveAssets();
                if (File.Exists(ManualScenePath))
                    EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ManualScenePath, true) };

                Debug.Log("[OfficeBuilder] Assets preparados. Nenhuma cena foi recriada. Continue editando Assets/Scenes/MyOffice.unity.");
            }
            finally { EditorUtility.ClearProgressBar(); }
        }

        // ---------- import ----------

        static IEnumerable<string> CharSheetPaths()
        {
            foreach (var c in new[] { "Adam", "Alex", "Amelia", "Bob" })
                foreach (var k in new[] { "idle_anim", "run", "sit" })
                    yield return $"{CharsDir}/{c}_{k}.png";
        }

        static void BaseSpriteImport(TextureImporter imp)
        {
            imp.textureType = TextureImporterType.Sprite;
            imp.spriteImportMode = SpriteImportMode.Multiple;
            imp.spritePixelsPerUnit = 16;
            imp.filterMode = FilterMode.Point;
            imp.mipmapEnabled = true;
            imp.wrapMode = TextureWrapMode.Clamp;
            var s = imp.GetDefaultPlatformTextureSettings();
            s.textureCompression = TextureImporterCompression.Uncompressed;
            imp.SetPlatformTextureSettings(s);
        }

        static void ConfigureCharImporter(string path)
        {
            var imp = (TextureImporter)AssetImporter.GetAtPath(path);
            if (imp == null) { Debug.LogWarning($"[OfficeBuilder] importer não encontrado: {path}"); return; }
            BaseSpriteImport(imp);
            var name = Path.GetFileNameWithoutExtension(path);
            var metas = new List<SpriteMetaData>();
            for (int i = 0; i < 24; i++)
                metas.Add(new SpriteMetaData
                {
                    name = $"{name}_{i:D2}",
                    rect = new Rect(i * 16, 0, 16, 32),
                    alignment = (int)SpriteAlignment.Custom,
                    pivot = new Vector2(0.5f, 0f)
                });
            imp.spritesheet = metas.ToArray();
            EditorUtility.SetDirty(imp);
            imp.SaveAndReimport();
        }

        static void ConfigureRoomImporter(string path)
        {
            var imp = (TextureImporter)AssetImporter.GetAtPath(path);
            if (imp == null) { Debug.LogWarning($"[OfficeBuilder] importer não encontrado: {path}"); return; }
            BaseSpriteImport(imp);
            var metas = new List<SpriteMetaData>();
            for (int rowTop = 0; rowTop < ROOM_ROWS; rowTop++)
                for (int col = 0; col < ROOM_COLS; col++)
                    metas.Add(new SpriteMetaData
                    {
                        name = $"rb_{col}_{rowTop}",
                        rect = new Rect(col * 16, (ROOM_ROWS - 1 - rowTop) * 16, 16, 16),
                        alignment = (int)SpriteAlignment.Center,
                        pivot = new Vector2(0.5f, 0.5f)
                    });
            imp.spritesheet = metas.ToArray();
            EditorUtility.SetDirty(imp);
            imp.SaveAndReimport();
        }

        // Móveis: sprite único, pivô na base-centro (pra assentar no tile).
        static void ConfigureFurnitureImporter(string path)
        {
            var imp = (TextureImporter)AssetImporter.GetAtPath(path);
            if (imp == null) { Debug.LogWarning($"[OfficeBuilder] móvel não encontrado: {path}"); return; }
            imp.textureType = TextureImporterType.Sprite;
            imp.filterMode = FilterMode.Point;
            imp.mipmapEnabled = true;
            imp.wrapMode = TextureWrapMode.Clamp;
            var comp = imp.GetDefaultPlatformTextureSettings();
            comp.textureCompression = TextureImporterCompression.Uncompressed;
            imp.SetPlatformTextureSettings(comp);
            var s = new TextureImporterSettings();
            imp.ReadTextureSettings(s);
            s.spriteMode = (int)SpriteImportMode.Single;
            s.spritePixelsPerUnit = 16;
            s.spriteAlignment = (int)SpriteAlignment.Custom;
            s.spritePivot = new Vector2(0.5f, 0f);
            imp.SetTextureSettings(s);
            EditorUtility.SetDirty(imp);
            imp.SaveAndReimport();
        }

        // ---------- helpers de asset ----------

        static Sprite Sub(string path, string spriteName)
        {
            var s = AssetDatabase.LoadAllAssetsAtPath(path).OfType<Sprite>().FirstOrDefault(x => x.name == spriteName);
            if (s == null) Debug.LogWarning($"[OfficeBuilder] sprite '{spriteName}' não encontrado em {path}");
            return s;
        }

        static Sprite[] SubsOrdered(string path) =>
            AssetDatabase.LoadAllAssetsAtPath(path).OfType<Sprite>().OrderBy(x => x.name).ToArray();

        static Tile MakeTile(string assetPath, Sprite sprite, Tile.ColliderType collider)
        {
            var tile = AssetDatabase.LoadAssetAtPath<Tile>(assetPath);
            bool isNew = tile == null;
            if (isNew) tile = ScriptableObject.CreateInstance<Tile>();
            tile.sprite = sprite;
            tile.colliderType = collider;
            if (isNew) AssetDatabase.CreateAsset(tile, assetPath);
            else EditorUtility.SetDirty(tile);
            return tile;
        }

        static Material GetOrCreateLitMaterial()
        {
            var mat = AssetDatabase.LoadAssetAtPath<Material>(LitMatPath);
            if (mat != null) return mat;
            var shader = Shader.Find("Universal Render Pipeline/2D/Sprite-Lit-Default");
            if (shader == null) { Debug.LogError("[OfficeBuilder] shader Sprite-Lit-Default não achado — URP 2D instalado?"); shader = Shader.Find("Sprites/Default"); }
            mat = new Material(shader) { name = "SpriteLit" };
            AssetDatabase.CreateAsset(mat, LitMatPath);
            return mat;
        }

        // ---------- prefab do personagem ----------

        static GameObject BuildPlayerPrefab(Material lit)
        {
            var go = new GameObject("Player");
            var sr = go.AddComponent<SpriteRenderer>();
            sr.material = lit;
            sr.sortingOrder = 100;

            var idle = SubsOrdered($"{CharsDir}/Adam_idle_anim.png");
            var run = SubsOrdered($"{CharsDir}/Adam_run.png");
            var sit = SubsOrdered($"{CharsDir}/Adam_sit.png");
            if (idle.Length > 0) sr.sprite = idle[0];

            var anim = go.AddComponent<CharacterAnimator>();
            anim.idle = idle; anim.run = run; anim.sit = sit;

            var rb = go.AddComponent<Rigidbody2D>();
            rb.gravityScale = 0f;
            rb.freezeRotation = true;
            rb.collisionDetectionMode = CollisionDetectionMode2D.Continuous;
            rb.interpolation = RigidbodyInterpolation2D.Interpolate;

            var col = go.AddComponent<CapsuleCollider2D>();
            col.size = new Vector2(0.6f, 0.35f);
            col.offset = new Vector2(0f, 0.2f);

            go.AddComponent<PlayerController>();

            Directory.CreateDirectory("Assets/Prefabs");
            var prefab = PrefabUtility.SaveAsPrefabAsset(go, "Assets/Prefabs/Player.prefab");
            Object.DestroyImmediate(go);
            return prefab;
        }

        // ---------- cena ----------

        static void BuildScene(Material lit, Tile floorOpen, Tile floorMeet, Tile floorCoffee, Tile wallTop, Tile wallFace, GameObject playerPrefab)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var gridGo = new GameObject("Grid");
            gridGo.AddComponent<Grid>();

            var floorTm = NewTilemap("Floor", gridGo.transform, lit, 0);
            var wallTm = NewTilemap("Walls", gridGo.transform, lit, 1);
            wallTm.gameObject.AddComponent<TilemapCollider2D>();
            wallTm.gameObject.AddComponent<Rigidbody2D>().bodyType = RigidbodyType2D.Static;

            // piso por zona
            for (int x = 0; x < W; x++)
                for (int y = 0; y < H; y++)
                {
                    Tile t = floorOpen;
                    if (x >= 3 && x <= 9 && y >= 11 && y <= 15) t = floorMeet;      // reunião
                    else if (x >= 20 && x <= 28 && y >= 1 && y <= 5) t = floorCoffee; // café
                    floorTm.SetTile(new Vector3Int(x, y, 0), t);
                }

            // paredes (topo): borda externa + sala de reunião (porta em 6,10). Coletadas num set.
            var walls = new HashSet<Vector3Int>();
            void Wall(int x, int y) => walls.Add(new Vector3Int(x, y, 0));
            for (int x = 0; x < W; x++) { Wall(x, 0); Wall(x, H - 1); }
            for (int y = 0; y < H; y++) { Wall(0, y); Wall(W - 1, y); }
            for (int x = 2; x <= 10; x++) { if (x != 6) Wall(x, 10); Wall(x, 16); }
            for (int y = 10; y <= 16; y++) { Wall(2, y); Wall(10, y); }
            foreach (var w in walls) wallTm.SetTile(w, wallTop);

            // FACE da parede: onde o vizinho ao SUL é chão, desenha a frente da parede (dá altura).
            var faces = new HashSet<Vector3Int>();
            foreach (var w in walls)
            {
                var f = new Vector3Int(w.x, w.y - 1, 0);
                if (f.x >= 0 && f.x < W && f.y >= 0 && f.y < H && !walls.Contains(f)) faces.Add(f);
            }
            foreach (var f in faces) wallTm.SetTile(f, wallFace);

            floorTm.CompressBounds(); wallTm.CompressBounds();
            floorTm.RefreshAllTiles(); wallTm.RefreshAllTiles();

            // móveis
            var furnRoot = new GameObject("Furniture").transform;
            var sprites = FurnNames.ToDictionary(n => n, n => AssetDatabase.LoadAssetAtPath<Sprite>($"{FurnDir}/{n}.png"));
            foreach (var f in Furniture) PlaceFurniture(furnRoot, sprites, lit, f);
            foreach (var d in Desks) PlaceDesk(furnRoot, sprites, lit, d.x, d.y);

            // jogador
            var player = (GameObject)PrefabUtility.InstantiatePrefab(playerPrefab, scene);
            player.transform.position = new Vector3(15f, 6f, 0f);

            // câmera pixel-perfect
            var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
            var cam = camGo.AddComponent<Camera>();
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.09f, 0.08f, 0.11f);
            cam.transform.position = new Vector3(15f, 6f, -10f);
            var ppc = camGo.AddComponent<PixelPerfectCamera>();
            ppc.assetsPPU = 16; ppc.refResolutionX = 320; ppc.refResolutionY = 180;
            camGo.AddComponent<CameraFollow>().target = player.transform;

            // luz 2D quente
            var gl = new GameObject("Global Light").AddComponent<Light2D>();
            gl.lightType = Light2D.LightType.Global;
            gl.color = new Color(1f, 0.97f, 0.92f);
            gl.intensity = 0.92f; // luz natural (1.45 estourava as paredes p/ branco)
            AddPoint(new Vector3(18f, 8f, 0f), new Color(1f, 0.88f, 0.68f), 9f, 0.55f);  // mesas
            AddPoint(new Vector3(6f, 13f, 0f), new Color(1f, 0.88f, 0.68f), 8f, 0.55f);  // reunião
            AddPoint(new Vector3(23f, 3f, 0f), new Color(1f, 0.85f, 0.62f), 8f, 0.5f);   // café

            Directory.CreateDirectory("Assets/Scenes");
            // ESSENCIAL: sem SetDirty nos tilemaps o SaveScene não persiste os tiles (some piso/parede).
            EditorUtility.SetDirty(floorTm);
            EditorUtility.SetDirty(wallTm);
            EditorUtility.SetDirty(floorTm.gameObject);
            EditorUtility.SetDirty(wallTm.gameObject);
            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        static void PlaceFurniture(Transform parent, Dictionary<string, Sprite> sprites, Material lit, Furn f)
        {
            if (!sprites.TryGetValue(f.sprite, out var sprite) || sprite == null)
            {
                Debug.LogWarning($"[OfficeBuilder] sprite de móvel ausente: {f.sprite}");
                return;
            }
            var go = new GameObject(f.sprite);
            go.transform.SetParent(parent, false);
            // pivô é base-centro; centraliza no footprint e assenta na base da linha y
            go.transform.position = new Vector3(f.x + f.w / 2f, f.y, 0f);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.material = lit;
            sr.sortingOrder = 1000 - Mathf.RoundToInt(f.y * 16f); // ordena por Y junto com o player
            if (f.solid)
            {
                var col = go.AddComponent<BoxCollider2D>();
                col.size = new Vector2(f.w * 0.85f, 0.72f);
                col.offset = new Vector2(0f, 0.42f); // cobre mais o corpo (colisão coerente frente/trás)
            }
        }

        // Mesa = tampo (sólido, 2 tiles) + monitor por cima (1 tile acima, desenhado à frente do tampo).
        static void PlaceDesk(Transform parent, Dictionary<string, Sprite> sprites, Material lit, int x, int y)
        {
            PlaceFurniture(parent, sprites, lit, new Furn("desktop", x, y, 2, true));
            if (sprites.TryGetValue("desk", out var mon) && mon != null)
            {
                var go = new GameObject("monitor");
                go.transform.SetParent(parent, false);
                go.transform.position = new Vector3(x + 1f, y + 1f, 0f); // sobre o tampo
                var sr = go.AddComponent<SpriteRenderer>();
                sr.sprite = mon;
                sr.material = lit;
                sr.sortingOrder = 1000 - Mathf.RoundToInt(y * 16f) + 2; // à frente do tampo
            }
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

        static void AddPoint(Vector3 pos, Color color, float radius, float intensity)
        {
            var l = new GameObject("Point Light").AddComponent<Light2D>();
            l.transform.position = pos;
            l.lightType = Light2D.LightType.Point;
            l.color = color;
            l.pointLightOuterRadius = radius;
            l.pointLightInnerRadius = radius * 0.3f;
            l.intensity = intensity;
        }
    }
}
