using UnityEngine;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Anima um personagem LimeZu a partir de sprites JÁ FATIADOS pelo editor
    /// (nada de carregar PNG em runtime). Cada folha tem 24 quadros = 6 por direção,
    /// na ordem real da LimeZu: down (0–5), up (6–11), left (12–17), right (18–23).
    /// Os arrays são preenchidos pelo OfficeBuilder ao montar o prefab.
    /// </summary>
    [RequireComponent(typeof(SpriteRenderer))]
    public class CharacterAnimator : MonoBehaviour
    {
        public enum Dir { Down = 0, Up = 1, Left = 2, Right = 3 }

        // Ordem REAL das folhas LimeZu (verificado nos pixels ampliados, não no HANDOFF):
        // right(0-5), up(6-11), left(12-17), down(18-23).
        // Mapa por Dir → grupo na folha: Down→3, Up→1, Left→2, Right→0.
        static readonly int[] DirGroup = { 3, 1, 2, 0 };

        [Header("6 quadros por direção (24 no total), ordem down/up/left/right")]
        public Sprite[] idle = new Sprite[0];
        public Sprite[] run = new Sprite[0];
        public Sprite[] sit = new Sprite[0];

        [Header("Timing")]
        public float runFps = 10f;
        public float idleFps = 4.5f;

        SpriteRenderer _sr;
        Dir _dir = Dir.Down;
        bool _moving;
        bool _sitting;
        float _t;

        void Awake() => _sr = GetComponent<SpriteRenderer>();

        /// <summary>Chamado pelo controlador a cada frame com a velocidade atual (unidades/s).</summary>
        public void SetVelocity(Vector2 v)
        {
            if (_sitting) return;
            if (v.sqrMagnitude > 0.0004f)
            {
                _moving = true;
                if (Mathf.Abs(v.x) >= Mathf.Abs(v.y)) _dir = v.x > 0 ? Dir.Right : Dir.Left;
                else _dir = v.y > 0 ? Dir.Up : Dir.Down;
            }
            else _moving = false;
        }

        public void SetSitting(bool sitting, Dir facing)
        {
            _sitting = sitting;
            if (sitting) { _dir = facing; _moving = false; }
        }

        void Update()
        {
            Sprite[] arr = _sitting ? sit : (_moving ? run : idle);
            if (arr == null || arr.Length < 24) return;

            float fps = _sitting ? 0f : (_moving ? runFps : idleFps);
            if (fps <= 0f) _t = 0f;
            else _t += Time.deltaTime * fps;

            int frame = ((int)_t) % 6;
            int i = DirGroup[(int)_dir] * 6 + frame;
            if (i >= 0 && i < arr.Length && arr[i] != null) _sr.sprite = arr[i];
        }
    }
}
