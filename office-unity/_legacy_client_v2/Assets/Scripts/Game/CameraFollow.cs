using UnityEngine;

namespace OfficeQuest.Game
{
    /// <summary>Câmera que segue o alvo suavemente, mantendo Z. Combina com Pixel Perfect Camera.</summary>
    public class CameraFollow : MonoBehaviour
    {
        public Transform target;
        public float smooth = 10f;

        void LateUpdate()
        {
            if (target == null) return;
            var p = transform.position;
            var goal = new Vector3(target.position.x, target.position.y + 0.5f, p.z);
            transform.position = Vector3.Lerp(p, goal, 1f - Mathf.Exp(-smooth * Time.deltaTime));
        }
    }
}
