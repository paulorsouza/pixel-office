using UnityEngine;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Ordena o sprite por Y (top-down): quem está mais embaixo desenha na frente.
    /// Vai em cada móvel colocável, pra que a ordenação funcione onde quer que você o posicione.
    /// </summary>
    [RequireComponent(typeof(SpriteRenderer))]
    public class YSort : MonoBehaviour
    {
        SpriteRenderer _sr;
        void Awake() => _sr = GetComponent<SpriteRenderer>();
        void LateUpdate()
        {
            if (_sr == null) _sr = GetComponent<SpriteRenderer>();
            _sr.sortingOrder = 1000 - Mathf.RoundToInt(transform.position.y * 16f);
        }
    }
}
