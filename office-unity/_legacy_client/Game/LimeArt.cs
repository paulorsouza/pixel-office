using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Carrega os assets LimeZu (Modern Office / Interiors) em runtime, direto de
    /// StreamingAssets — sem pipeline de import do editor, sem .meta, sem slicing manual.
    /// Tudo em 16px nativo (a única resolução dos personagens do pack), então cenário e
    /// personagem batem: 1 tile = 16px = 1 unidade de mundo (PPU 16).
    ///   Room Builder: atlas de tiles 16px (grid 16col x 14lin, igual em todas as resoluções)
    ///   Singles: móveis avulsos em quadros 32x48 (2x3 tiles), pivô no tile de baixo
    ///   Personagens: frames 16x32, 24 frames por anim = 6 por direção (down,up,left,right)
    /// </summary>
    public static class LimeArt
    {
        public const int TilePx = 16;
        public const float Ppu = 16f;

        private static readonly Dictionary<string, Texture2D> Textures = new Dictionary<string, Texture2D>();
        private static readonly Dictionary<string, Sprite> Cache = new Dictionary<string, Sprite>();

        private static string Root => Path.Combine(Application.streamingAssetsPath, "LimeZu");

        private static Texture2D Tex(string relPath)
        {
            if (Textures.TryGetValue(relPath, out var t) && t != null) return t;
            // mipChain=true: com mipmaps o URP 2D não "esfarela" os sprites de 16px quando o mapa
            // é reduzido (zoom-out). Point filter mantém a nitidez no zoom normal (mip 0).
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, true)
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
            };
            var full = Path.Combine(Root, relPath);
            if (File.Exists(full))
            {
                tex.LoadImage(File.ReadAllBytes(full)); // ajusta tamanho/formato sozinho
                tex.filterMode = FilterMode.Point;
            }
            else Debug.LogError($"LimeArt: asset não encontrado: {full}");
            Textures[relPath] = tex;
            return tex;
        }

        /// <summary>Tile 16px do Room Builder (pisos/paredes), por coluna/linha do atlas.</summary>
        public static Sprite RbTile(int col, int row)
        {
            var key = $"rb-{col}-{row}";
            if (Cache.TryGetValue(key, out var hit) && hit != null) return hit;
            var tex = Tex("room_builder.png");
            var rect = new Rect(col * TilePx, tex.height - (row + 1) * TilePx, TilePx, TilePx);
            var s = Sprite.Create(tex, rect, new Vector2(.5f, .5f), Ppu);
            s.name = key;
            Cache[key] = s;
            return s;
        }

        // largura em tiles do conteúdo de cada móvel (calculada no recorte); usada pelo mapa
        private static readonly Dictionary<int, int> SingleWidthTiles = new Dictionary<int, int>();

        /// <summary>Largura em tiles do conteúdo do móvel (após recorte). Chama Single antes.</summary>
        public static int SingleWidth(int number)
        {
            Single(number);
            return SingleWidthTiles.TryGetValue(number, out var w) ? w : 1;
        }

        /// <summary>
        /// Móvel avulso (Modern_Office_Singles_N). O quadro é 32x48 mas o objeto ocupa só
        /// parte dele — recortamos ao conteúdo opaco e ancoramos o pivô na base-centro, para
        /// que posicionar por tile funcione igual para itens de 1 ou 2 tiles.
        /// </summary>
        public static Sprite Single(int number)
        {
            var key = $"single-{number}";
            if (Cache.TryGetValue(key, out var hit) && hit != null) return hit;
            var tex = Tex($"singles/Modern_Office_Singles_{number}.png");

            var px = tex.GetPixels32();
            int minX = tex.width, minY = tex.height, maxX = -1, maxY = -1;
            for (var y = 0; y < tex.height; y++)
                for (var x = 0; x < tex.width; x++)
                    if (px[y * tex.width + x].a > 12)
                    {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
            Rect rect;
            if (maxX < 0) rect = new Rect(0, 0, tex.width, tex.height);
            else rect = new Rect(minX, minY, maxX - minX + 1, maxY - minY + 1);

            SingleWidthTiles[number] = Mathf.Max(1, Mathf.RoundToInt(rect.width / TilePx));
            var s = Sprite.Create(tex, rect, new Vector2(.5f, 0f), Ppu); // pivô na base-centro
            s.name = key;
            Cache[key] = s;
            return s;
        }

        /// <summary>
        /// Frame de personagem (16x32 → 1x2 tiles). Sheets run/idle_anim/sit têm 24 frames
        /// (6 por direção na ordem down, up, left, right).
        /// </summary>
        public static Sprite CharFrame(string charName, string anim, int frameIndex)
        {
            var key = $"ch-{charName}-{anim}-{frameIndex}";
            if (Cache.TryGetValue(key, out var hit) && hit != null) return hit;
            var tex = Tex($"chars/{charName}_{anim}.png");
            var cols = tex.width / 16;
            frameIndex = Mathf.Clamp(frameIndex, 0, cols - 1);
            var rect = new Rect(frameIndex * 16, 0, 16, 32);
            var s = Sprite.Create(tex, rect, new Vector2(.5f, (TilePx * .25f) / 32f), 16f);
            s.name = key;
            Cache[key] = s;
            return s;
        }
    }
}
