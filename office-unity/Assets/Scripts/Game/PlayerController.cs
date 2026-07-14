using UnityEngine;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Jogador local — Incremento 1: só WASD/setas com colisão física real
    /// (Rigidbody2D dinâmico + TilemapCollider2D nas paredes). Sem rede, sem HUD.
    /// Ordenação por Y para o top-down (quem está mais embaixo desenha na frente).
    /// </summary>
    [RequireComponent(typeof(Rigidbody2D))]
    [RequireComponent(typeof(CharacterAnimator))]
    public class PlayerController : MonoBehaviour
    {
        public float speed = 4.5f;

        Rigidbody2D _rb;
        CharacterAnimator _anim;
        SpriteRenderer _sr;

        void Awake()
        {
            _rb = GetComponent<Rigidbody2D>();
            _anim = GetComponent<CharacterAnimator>();
            _sr = GetComponent<SpriteRenderer>();
        }

        void Update()
        {
            var input = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
            if (input.sqrMagnitude > 1f) input.Normalize();
            _anim.SetVelocity(input * speed);
            _rb.linearVelocity = input * speed;

            // sorting por Y: pés mais embaixo => ordem maior => na frente
            if (_sr != null) _sr.sortingOrder = 1000 - Mathf.RoundToInt(transform.position.y * 16f);
        }
    }
}
