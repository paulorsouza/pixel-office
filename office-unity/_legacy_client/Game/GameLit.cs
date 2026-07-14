using UnityEngine;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Material Sprite-Lit compartilhado (URP 2D). Sprites com este material recebem Light2D;
    /// com o material padrão (unlit) a luz é ignorada. Um material só para permitir batching.
    /// </summary>
    public static class GameLit
    {
        private static Material _lit;

        public static Material Lit()
        {
            if (_lit != null) return _lit;
            var sh = Shader.Find("Universal Render Pipeline/2D/Sprite-Lit-Default");
            if (sh == null) return null; // fora do URP: fica no material padrão (unlit)
            _lit = new Material(sh) { name = "OfficeSpriteLit" };
            return _lit;
        }

        /// <summary>Aplica o material lit se disponível (no-op sem URP).</summary>
        public static void Apply(SpriteRenderer sr)
        {
            var m = Lit();
            if (m != null) sr.sharedMaterial = m;
        }
    }
}
