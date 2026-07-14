using UnityEngine;
using UnityEngine.Rendering;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Personagem LimeZu animado por spritesheet: andar (run), parado (idle_anim)
    /// e sentar (sit), todos com 6 frames por direção na ordem real das folhas:
    /// down (0-5), up (6-11), left (12-17), right (18-23).
    /// Cada usuário recebe um dos 4 personagens do pack (Adam/Alex/Amelia/Bob).
    /// </summary>
    public class LimeCharacter : MonoBehaviour
    {
        private static readonly string[] Names = { "Adam", "Alex", "Amelia", "Bob" };

        private SpriteRenderer _sr;
        private SpriteRenderer _shadow;
        private SpriteRenderer _headset;
        private SortingGroup _sorting;
        private string _char = "Adam";
        private float _animT;
        private string _lastAnim = "";

        public static LimeCharacter Create(Transform parent)
        {
            var go = new GameObject("lime-char");
            go.transform.SetParent(parent, false);
            var c = go.AddComponent<LimeCharacter>();
            c.Build();
            return c;
        }

        private void Build()
        {
            _sorting = gameObject.AddComponent<SortingGroup>();

            var shadowGo = new GameObject("shadow");
            shadowGo.transform.SetParent(transform, false);
            shadowGo.transform.localPosition = new Vector3(0, .04f, 0);
            shadowGo.transform.localScale = new Vector3(.62f, .6f, 1);
            _shadow = shadowGo.AddComponent<SpriteRenderer>();
            _shadow.sprite = SoftArt.CharShadow();
            _shadow.sortingOrder = 0;
            GameLit.Apply(_shadow);

            var bodyGo = new GameObject("body");
            bodyGo.transform.SetParent(transform, false);
            _sr = bodyGo.AddComponent<SpriteRenderer>();
            _sr.sortingOrder = 1;
            GameLit.Apply(_sr);

            var hsGo = new GameObject("headset");
            hsGo.transform.SetParent(transform, false);
            hsGo.transform.localPosition = new Vector3(0, 1.06f, 0);
            hsGo.transform.localScale = new Vector3(.42f, .42f, 1);
            _headset = hsGo.AddComponent<SpriteRenderer>();
            _headset.sprite = SoftArt.CharHeadset();
            _headset.sortingOrder = 2;
            _headset.enabled = false;
        }

        public void SetCharacter(int index)
        {
            _char = Names[((index % Names.Length) + Names.Length) % Names.Length];
        }

        public void SetHeadset(bool on) => _headset.enabled = on;

        public void SetSortingOrder(int order) => _sorting.sortingOrder = order;

        public void Tick(float dt, bool moving, bool sitting, string dir)
        {
            var anim = sitting ? "sit" : moving ? "run" : "idle_anim";
            if (anim != _lastAnim) { _animT = 0; _lastAnim = anim; }
            // andar mais vivo, parado bem lento (respiração); acumulador limitado a [0,6)
            var fps = moving ? 10f : 4.5f;
            _animT = (_animT + dt * fps) % 6f;
            var frame = (int)_animT;

            // ordem real das folhas LimeZu: down(0-5), up(6-11), left(12-17), right(18-23)
            var dirIndex = dir == "up" ? 1 : dir == "left" ? 2 : dir == "right" ? 3 : 0;
            _sr.sprite = LimeArt.CharFrame(_char, anim, dirIndex * 6 + frame);

            _shadow.enabled = !sitting;
        }
    }
}
