using System.Collections.Generic;
using UnityEngine;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Superfície de desenho vetorial com anti-aliasing por SDF (círculo, cápsula,
    /// retângulo arredondado, sombra difusa). Coordenadas com y para baixo (linha 0 = topo).
    /// Usada só para acessórios do personagem (sombra, fone), emotes e formas da UI —
    /// o cenário e os personagens são arte LimeZu (ver LimeArt).
    /// </summary>
    public class Soft
    {
        public readonly int W;
        public readonly int H;
        private readonly Color[] _px;

        public Soft(int w, int h)
        {
            W = w; H = h;
            _px = new Color[w * h];
            var clear = new Color(0, 0, 0, 0);
            for (var i = 0; i < _px.Length; i++) _px[i] = clear;
        }

        private void Blend(int x, int yDown, Color c, float a)
        {
            if (x < 0 || yDown < 0 || x >= W || yDown >= H || a <= 0f) return;
            var i = (H - 1 - yDown) * W + x; // flip para o layout do Texture2D
            var dst = _px[i];
            var sa = c.a * a;
            var outA = sa + dst.a * (1 - sa);
            if (outA <= 0f) { _px[i] = new Color(0, 0, 0, 0); return; }
            _px[i] = new Color(
                (c.r * sa + dst.r * dst.a * (1 - sa)) / outA,
                (c.g * sa + dst.g * dst.a * (1 - sa)) / outA,
                (c.b * sa + dst.b * dst.a * (1 - sa)) / outA,
                outA);
        }

        private static float Aa(float d) => Mathf.Clamp01(.5f - d / 1.5f);

        public void Circle(float cx, float cy, float r, Color c)
        {
            for (var y = (int)(cy - r - 2); y <= cy + r + 2; y++)
                for (var x = (int)(cx - r - 2); x <= cx + r + 2; x++)
                {
                    var d = Mathf.Sqrt((x + .5f - cx) * (x + .5f - cx) + (y + .5f - cy) * (y + .5f - cy)) - r;
                    Blend(x, y, c, Aa(d));
                }
        }

        public void Ellipse(float cx, float cy, float rx, float ry, Color c)
        {
            for (var y = (int)(cy - ry - 2); y <= cy + ry + 2; y++)
                for (var x = (int)(cx - rx - 2); x <= cx + rx + 2; x++)
                {
                    var nx = (x + .5f - cx) / rx;
                    var ny = (y + .5f - cy) / ry;
                    var d = (Mathf.Sqrt(nx * nx + ny * ny) - 1f) * Mathf.Min(rx, ry);
                    Blend(x, y, c, Aa(d));
                }
        }

        public void RRect(float x, float y, float w, float h, float r, Color c) => RRectV(x, y, w, h, r, c, c);

        /// <summary>Retângulo arredondado com gradiente vertical (top → bottom).</summary>
        public void RRectV(float x, float y, float w, float h, float r, Color top, Color bottom)
        {
            r = Mathf.Min(r, Mathf.Min(w, h) / 2f);
            var cx = x + w / 2f;
            var cy = y + h / 2f;
            var hx = w / 2f - r;
            var hy = h / 2f - r;
            for (var py = (int)(y - 2); py <= y + h + 2; py++)
            {
                var t = Mathf.Clamp01((py - y) / Mathf.Max(1f, h));
                var col = Color.Lerp(top, bottom, t);
                for (var px2 = (int)(x - 2); px2 <= x + w + 2; px2++)
                {
                    var qx = Mathf.Abs(px2 + .5f - cx) - hx;
                    var qy = Mathf.Abs(py + .5f - cy) - hy;
                    var d = Mathf.Sqrt(Mathf.Max(qx, 0) * Mathf.Max(qx, 0) + Mathf.Max(qy, 0) * Mathf.Max(qy, 0))
                            + Mathf.Min(Mathf.Max(qx, qy), 0) - r;
                    Blend(px2, py, col, Aa(d));
                }
            }
        }

        public void Capsule(float x1, float y1, float x2, float y2, float r, Color c)
        {
            var minX = Mathf.Min(x1, x2) - r - 2;
            var maxX = Mathf.Max(x1, x2) + r + 2;
            var minY = Mathf.Min(y1, y2) - r - 2;
            var maxY = Mathf.Max(y1, y2) + r + 2;
            var ab = new Vector2(x2 - x1, y2 - y1);
            var abLen2 = Mathf.Max(ab.sqrMagnitude, .0001f);
            for (var y = (int)minY; y <= maxY; y++)
                for (var x = (int)minX; x <= maxX; x++)
                {
                    var ap = new Vector2(x + .5f - x1, y + .5f - y1);
                    var t = Mathf.Clamp01(Vector2.Dot(ap, ab) / abLen2);
                    var d = (ap - ab * t).magnitude - r;
                    Blend(x, y, c, Aa(d));
                }
        }

        /// <summary>Sombra elíptica com borda bem difusa.</summary>
        public void SoftShadow(float cx, float cy, float rx, float ry, float alpha, float soft)
        {
            for (var y = (int)(cy - ry - soft - 2); y <= cy + ry + soft + 2; y++)
                for (var x = (int)(cx - rx - soft - 2); x <= cx + rx + soft + 2; x++)
                {
                    var nx = (x + .5f - cx) / rx;
                    var ny = (y + .5f - cy) / ry;
                    var d = (Mathf.Sqrt(nx * nx + ny * ny) - 1f) * Mathf.Min(rx, ry);
                    var a = Mathf.Clamp01(1f - d / soft) * alpha;
                    if (d < 0) a = alpha;
                    Blend(x, y, Color.black, a * a); // quadrático = centro mais denso
                }
        }

        public Sprite Bake(string name, float ppu, Vector2 pivot, Vector4? border = null)
        {
            var t = new Texture2D(W, H, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp,
            };
            t.SetPixels(_px);
            t.Apply();
            var s = border.HasValue
                ? Sprite.Create(t, new Rect(0, 0, W, H), pivot, ppu, 0, SpriteMeshType.FullRect, border.Value)
                : Sprite.Create(t, new Rect(0, 0, W, H), pivot, ppu);
            s.name = name;
            return s;
        }
    }

    /// <summary>
    /// Poucos sprites vetoriais que sobrevivem à arte LimeZu: acessórios do avatar
    /// (sombra, fone de reunião), ícones de emote e as formas arredondadas da UI.
    /// </summary>
    public static class SoftArt
    {
        public const float Ppu = 64f;
        private static readonly Color ScreenGlow = Hex("#57e0cd");
        private static readonly Dictionary<string, Sprite> Cache = new Dictionary<string, Sprite>();

        public static Color Hex(string hex) =>
            ColorUtility.TryParseHtmlString(hex, out var c) ? c : Color.magenta;

        private static Sprite Cached(string key) => Cache.TryGetValue(key, out var s) && s != null ? s : null;
        private static Sprite Store(string key, Sprite s) { Cache[key] = s; return s; }

        // ---------- acessórios do personagem ----------
        public static Sprite CharShadow()
        {
            var hit = Cached("cshadow");
            if (hit != null) return hit;
            var s = new Soft(56, 20);
            s.SoftShadow(28, 10, 20, 6, .3f, 7);
            return Store("cshadow", s.Bake("cshadow", Ppu, new Vector2(.5f, .5f)));
        }

        /// <summary>Sombra de contato elíptica sob móveis (escala por largura do item).</summary>
        public static Sprite GroundShadow()
        {
            var hit = Cached("gshadow");
            if (hit != null) return hit;
            var s = new Soft(64, 24);
            s.SoftShadow(32, 12, 24, 7, .32f, 9);
            return Store("gshadow", s.Bake("gshadow", Ppu, new Vector2(.5f, .5f)));
        }

        /// <summary>Fone de reunião sobre a cabeça.</summary>
        public static Sprite CharHeadset()
        {
            var hit = Cached("cheadset");
            if (hit != null) return hit;
            var s = new Soft(54, 48);
            s.Capsule(8, 14, 46, 14, 4, Hex("#3a4157"));                 // arco
            s.RRectV(2, 14, 10, 15, 5, Hex("#4c5570"), Hex("#3a4157")); // conchas
            s.RRectV(42, 14, 10, 15, 5, Hex("#4c5570"), Hex("#3a4157"));
            s.Circle(7, 26, 1.8f, ScreenGlow);
            s.Circle(47, 26, 1.8f, ScreenGlow);
            return Store("cheadset", s.Bake("cheadset", Ppu, new Vector2(.5f, .06f)));
        }

        // ---------- emotes ----------
        public static Sprite Emote(string name)
        {
            var key = $"semote-{name}";
            var hit = Cached(key);
            if (hit != null) return hit;
            var s = new Soft(40, 40);
            switch (name)
            {
                case "like":
                    s.RRect(8, 18, 9, 16, 3, Hex("#f5c95c"));
                    s.RRectV(15, 14, 18, 20, 6, Hex("#ffd975"), Hex("#f0b93f"));
                    s.Capsule(20, 14, 20, 6, 4.5f, Hex("#ffd975"));
                    break;
                case "heart":
                    s.Circle(14, 15, 8.5f, Hex("#e56767"));
                    s.Circle(26, 15, 8.5f, Hex("#e56767"));
                    s.RRect(7, 15, 26, 10, 4, Hex("#e56767"));
                    s.Capsule(12, 24, 20, 32, 5.5f, Hex("#e56767"));
                    s.Capsule(28, 24, 20, 32, 5.5f, Hex("#e56767"));
                    s.Circle(13, 12, 2.6f, new Color(1, 1, 1, .5f));
                    break;
                case "laugh":
                    s.Circle(20, 20, 15, Hex("#ffd257"));
                    s.Ellipse(14, 16, 2.6f, 3.4f, Hex("#3a3430"));
                    s.Ellipse(26, 16, 2.6f, 3.4f, Hex("#3a3430"));
                    s.Ellipse(20, 26, 8, 5.5f, Hex("#7a3d2e"));
                    s.Ellipse(20, 24.4f, 7, 2.6f, new Color(1, 1, 1, .95f));
                    break;
                default: // coffee
                    s.RRectV(8, 12, 22, 20, 6, Hex("#fcf9f0"), Hex("#e2dac6"));
                    s.Capsule(30, 16, 34, 24, 3.4f, Hex("#e2dac6"));
                    s.Ellipse(19, 15, 8, 3.4f, Hex("#7a4a2a"));
                    s.Capsule(15, 8, 16, 4, 1.6f, new Color(.6f, .55f, .5f, .6f));
                    s.Capsule(22, 7, 23, 3, 1.6f, new Color(.6f, .55f, .5f, .6f));
                    break;
            }
            return Store(key, s.Bake(key, Ppu, new Vector2(.5f, .5f)));
        }

        // ---------- formas da UI (9-slice) ----------
        public static Sprite Rounded()
        {
            var hit = Cached("srounded");
            if (hit != null) return hit;
            var s = new Soft(48, 48);
            s.RRect(0, 0, 48, 48, 14, Color.white);
            return Store("srounded", s.Bake("srounded", Ppu, new Vector2(.5f, .5f), new Vector4(20, 20, 20, 20)));
        }

        /// <summary>Pílula (cantos totalmente arredondados) para botões/chips.</summary>
        public static Sprite Pill()
        {
            var hit = Cached("spill");
            if (hit != null) return hit;
            var s = new Soft(48, 48);
            s.RRect(0, 0, 48, 48, 24, Color.white);
            return Store("spill", s.Bake("spill", Ppu, new Vector2(.5f, .5f), new Vector4(24, 24, 24, 24)));
        }

        /// <summary>Sombra suave arredondada para dar profundidade aos cards (9-slice).</summary>
        public static Sprite Shadow()
        {
            var hit = Cached("sshadow");
            if (hit != null) return hit;
            var s = new Soft(64, 64);
            for (var i = 0; i < 12; i++)
                s.RRect(i, i + 1, 64 - 2 * i, 64 - 2 * i, 18, new Color(0, 0, 0, .05f));
            return Store("sshadow", s.Bake("sshadow", Ppu, new Vector2(.5f, .5f), new Vector4(26, 26, 26, 26)));
        }
    }
}
