using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace OfficeQuest.EditorTools
{
    /// <summary>
    /// F1 — Pipeline de import (recomeço do zero).
    /// Copia a arte-fonte de StreamingAssets/LimeZu para Assets/Art e configura
    /// CADA importer pelo pipeline REAL do Unity (PPU16, Point, sem compressão,
    /// mipmaps, fatiamento correto). Nada é carregado em runtime.
    ///
    /// StreamingAssets é copiado cru para builds e NÃO é importado como Sprite —
    /// por isso a arte precisa viver em Assets/Art. Este menu faz essa ponte.
    ///
    /// Entradas (preservadas na Fase 0):
    ///   Assets/StreamingAssets/LimeZu/chars/*.png        (12 folhas 384x32 = 24 quadros 16x32)
    ///   Assets/StreamingAssets/LimeZu/room_builder.png   (256x224 = grade 16x14 @16px)
    ///   Assets/StreamingAssets/LimeZu/singles/*.png      (339 móveis 32x48 @16px)
    /// </summary>
    public static class AssetPipeline
    {
        const string SrcRoot = "Assets/StreamingAssets/LimeZu";
        const string ArtChars = "Assets/Art/Chars";
        const string ArtRooms = "Assets/Art/Rooms";
        const string ArtSingles = "Assets/Art/Singles";
        const string RoomAsset = ArtRooms + "/room_builder.png";
        const string LitMatPath = "Assets/Art/SpriteLit.mat";

        const int PPU = 16;
        const int ROOM_COLS = 16, ROOM_ROWS = 14;

        static readonly string[] CharNames = { "Adam", "Alex", "Amelia", "Bob" };
        static readonly string[] CharKinds = { "idle_anim", "run", "sit" };

        [MenuItem("Office Quest/1 · Import Art (F1)")]
        public static void ImportArt()
        {
            try
            {
                EditorUtility.DisplayProgressBar("Office Quest F1", "Copiando arte-fonte para Assets/Art…", 0.05f);
                Directory.CreateDirectory(ArtChars);
                Directory.CreateDirectory(ArtRooms);
                Directory.CreateDirectory(ArtSingles);

                int chars = CopyChars();
                int room = CopyRoom();
                int singles = CopySingles();
                AssetDatabase.Refresh();

                EditorUtility.DisplayProgressBar("Office Quest F1", "Configurando importers dos personagens…", 0.35f);
                foreach (var p in CharDestPaths()) ConfigureCharSheet(p);

                EditorUtility.DisplayProgressBar("Office Quest F1", "Configurando o room_builder…", 0.55f);
                ConfigureRoomSheet(RoomAsset);

                EditorUtility.DisplayProgressBar("Office Quest F1", $"Configurando {singles} móveis…", 0.7f);
                int i = 0;
                foreach (var p in Directory.GetFiles(ArtSingles, "single_*.png"))
                {
                    ConfigureSingle(p.Replace('\\', '/'));
                    if ((++i % 40) == 0)
                        EditorUtility.DisplayProgressBar("Office Quest F1", $"Móveis {i}/{singles}…", 0.7f + 0.25f * i / Mathf.Max(1, singles));
                }

                EditorUtility.DisplayProgressBar("Office Quest F1", "Criando material Sprite-Lit…", 0.97f);
                GetOrCreateLitMaterial();

                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
                Debug.Log($"[F1] Import OK — {chars} folhas de personagem, {room} room_builder, {singles} móveis. " +
                          "Próximo: '2 · Build Tiles' e '3 · Build Furniture'.");
            }
            finally { EditorUtility.ClearProgressBar(); }
        }

        // ---------- cópia StreamingAssets -> Assets/Art ----------

        static int CopyChars()
        {
            int n = 0;
            foreach (var c in CharNames)
                foreach (var k in CharKinds)
                {
                    var src = $"{SrcRoot}/chars/{c}_{k}.png";
                    if (File.Exists(src)) { File.Copy(src, $"{ArtChars}/{c}_{k}.png", true); n++; }
                    else Debug.LogWarning($"[F1] fonte ausente: {src}");
                }
            return n;
        }

        static int CopyRoom()
        {
            var src = $"{SrcRoot}/room_builder.png";
            if (!File.Exists(src)) { Debug.LogError($"[F1] room_builder ausente: {src}"); return 0; }
            File.Copy(src, RoomAsset, true);
            return 1;
        }

        // Renomeia Modern_Office_Singles_N.png -> single_N.png (referência curta).
        static int CopySingles()
        {
            int n = 0;
            foreach (var src in Directory.GetFiles($"{SrcRoot}/singles", "Modern_Office_Singles_*.png"))
            {
                var name = Path.GetFileNameWithoutExtension(src);
                var num = name.Substring("Modern_Office_Singles_".Length);
                File.Copy(src, $"{ArtSingles}/single_{num}.png", true);
                n++;
            }
            return n;
        }

        static IEnumerable<string> CharDestPaths()
        {
            foreach (var c in CharNames)
                foreach (var k in CharKinds)
                {
                    var p = $"{ArtChars}/{c}_{k}.png";
                    if (File.Exists(p)) yield return p;
                }
        }

        // ---------- config de importer ----------

        static void BaseImport(TextureImporter imp)
        {
            imp.textureType = TextureImporterType.Sprite;
            imp.spritePixelsPerUnit = PPU;
            imp.filterMode = FilterMode.Point;
            imp.mipmapEnabled = true;      // sem mipmap o URP 2D esfarela sprites 16px no zoom-out
            imp.wrapMode = TextureWrapMode.Clamp;
            var s = imp.GetDefaultPlatformTextureSettings();
            s.textureCompression = TextureImporterCompression.Uncompressed;
            imp.SetPlatformTextureSettings(s);
        }

        // Personagem: 24 quadros de 16x32, pivô base-centro. Ordem real LimeZu
        // (right 0-5, up 6-11, left 12-17, down 18-23) é tratada no CharacterAnimator.
        static void ConfigureCharSheet(string path)
        {
            var imp = AssetImporter.GetAtPath(path) as TextureImporter;
            if (imp == null) { Debug.LogWarning($"[F1] importer ausente: {path}"); return; }
            BaseImport(imp);
            imp.spriteImportMode = SpriteImportMode.Multiple;
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

        // room_builder: 16 col x 14 linhas, nomeado rb_{col}_{rowTop} (rowTop 0 = topo).
        static void ConfigureRoomSheet(string path)
        {
            var imp = AssetImporter.GetAtPath(path) as TextureImporter;
            if (imp == null) { Debug.LogError($"[F1] room_builder importer ausente: {path}"); return; }
            BaseImport(imp);
            imp.spriteImportMode = SpriteImportMode.Multiple;
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

        // Móvel: sprite único, pivô base-centro (assenta no tile da base).
        static void ConfigureSingle(string path)
        {
            var imp = AssetImporter.GetAtPath(path) as TextureImporter;
            if (imp == null) return;
            BaseImport(imp);
            imp.spriteImportMode = SpriteImportMode.Single;
            var s = new TextureImporterSettings();
            imp.ReadTextureSettings(s);
            s.spriteMode = (int)SpriteImportMode.Single;
            s.spritePixelsPerUnit = PPU;
            s.spriteAlignment = (int)SpriteAlignment.Custom;
            s.spritePivot = new Vector2(0.5f, 0f);
            imp.SetTextureSettings(s);
            EditorUtility.SetDirty(imp);
            imp.SaveAndReimport();
        }

        static Material GetOrCreateLitMaterial()
        {
            var mat = AssetDatabase.LoadAssetAtPath<Material>(LitMatPath);
            if (mat != null) return mat;
            var shader = Shader.Find("Universal Render Pipeline/2D/Sprite-Lit-Default");
            if (shader == null)
            {
                Debug.LogError("[F1] shader 'Sprite-Lit-Default' não achado — URP 2D instalado/atribuído?");
                shader = Shader.Find("Sprites/Default");
            }
            mat = new Material(shader) { name = "SpriteLit" };
            AssetDatabase.CreateAsset(mat, LitMatPath);
            return mat;
        }
    }
}
