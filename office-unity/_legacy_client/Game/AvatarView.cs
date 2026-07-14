using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace OfficeQuest.Game
{
    /// <summary>Representação visual de um jogador — rig articulado + nome/status/balões.</summary>
    public class AvatarView : MonoBehaviour
    {
        public string Key;
        public int UserId;
        public string PlayerName;
        public string ColorHex = "#7c5cff";
        public int Style;                     // estilo de cabelo, derivado do userId
        public bool HasHeadset;               // fone de reunião: na call mesmo fora da sala
        public bool IsBot;
        public bool IsMe;
        public string Dir = "down";
        public bool Moving;
        public bool Sitting => Dir == "sit";
        public Vector2 CurrentSu;
        public Vector2 TargetSu;
        public string Zone = "";

        private string _shirtHex;
        private string _hairHex;
        private string _status = "";

        private LimeCharacter _rig;
        private TextMesh _nameText;
        private TextMesh _statusText;
        private GameObject _bubble;
        private SpriteRenderer _bubbleBg;
        private TextMesh _bubbleText;
        private SpriteRenderer _bubbleIcon;
        private float _bubbleUntil;

        public static AvatarView Create(Transform parent, JObject p, bool isMe)
        {
            var go = new GameObject($"avatar-{(string)p["name"]}");
            go.transform.SetParent(parent, false);
            var v = go.AddComponent<AvatarView>();
            v.Key = (string)p["key"];
            v.UserId = (int)p["userId"];
            v.PlayerName = (string)p["name"];
            v.IsBot = (bool?)p["isBot"] ?? false;
            v.IsMe = isMe;
            v.Dir = (string)p["dir"] ?? "down";
            v.Zone = (string)p["zone"] ?? "";
            v.CurrentSu = v.TargetSu = new Vector2((float)p["x"], (float)p["y"]);
            v.HasHeadset = (bool?)p["hasHeadset"] ?? false;
            v.ColorHex = (string)p["color"] ?? "#7c5cff";
            v.Style = ((v.UserId % 4) + 4) % 4;
            v.BuildVisual();
            v.ApplySkin(v.ColorHex, (string)p["skinData"]);
            v.SetStatus((string)p["status"] ?? "");
            return v;
        }

        private void BuildVisual()
        {
            _rig = LimeCharacter.Create(transform);
            _rig.SetCharacter(UserId);

            var label = (IsBot ? "[bot] " : "") + PlayerName;
            // sobre o cenário LimeZu (escuro nas bordas) o nome claro com sombra escura lê melhor
            var nameShadow = NewChildText("name-shadow", new Vector3(.03f, 2.17f, 0), .5f,
                new Color(0f, 0f, 0f, .7f));
            nameShadow.text = label;
            nameShadow.GetComponent<MeshRenderer>().sortingOrder = 14999;
            _nameText = NewChildText("name", new Vector3(0, 2.2f, 0), .5f,
                IsMe ? SoftArt.Hex("#ffd166") : SoftArt.Hex("#f4efe2"));
            _nameText.text = label;

            _statusText = NewChildText("status", new Vector3(0, 2.5f, 0), .4f, SoftArt.Hex("#c9c2b0"));

            _bubble = new GameObject("bubble");
            _bubble.transform.SetParent(transform, false);
            _bubble.transform.localPosition = new Vector3(0, 2.95f, 0);
            _bubbleBg = _bubble.AddComponent<SpriteRenderer>();
            _bubbleBg.sprite = SoftArt.Rounded();
            _bubbleBg.drawMode = SpriteDrawMode.Sliced;
            _bubbleBg.color = new Color(1, 1, 1, .97f);
            _bubbleBg.sortingOrder = 20000;
            _bubbleText = NewChildText("bubble-text", Vector3.zero, .42f, SoftArt.Hex("#3a3430"));
            _bubbleText.transform.SetParent(_bubble.transform, false);
            _bubbleText.GetComponent<MeshRenderer>().sortingOrder = 20001;
            var iconGo = new GameObject("bubble-icon");
            iconGo.transform.SetParent(_bubble.transform, false);
            _bubbleIcon = iconGo.AddComponent<SpriteRenderer>();
            _bubbleIcon.sortingOrder = 20001;
            _bubble.SetActive(false);
        }

        private TextMesh NewChildText(string name, Vector3 offset, float size, Color color)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            go.transform.localPosition = offset;
            var tm = go.AddComponent<TextMesh>();
            tm.anchor = TextAnchor.MiddleCenter;
            tm.alignment = TextAlignment.Center;
            tm.characterSize = size * .1f;
            tm.fontSize = 48;
            tm.color = color;
            tm.font = Ui.Hud.UiFont;
            go.GetComponent<MeshRenderer>().material = tm.font.material;
            go.GetComponent<MeshRenderer>().sortingOrder = 15000;
            return tm;
        }

        public void ApplySkin(string colorHex, string skinJson)
        {
            _shirtHex = colorHex ?? "#7c5cff";
            _hairHex = "#4a3b2c";
            if (!string.IsNullOrEmpty(skinJson))
            {
                try
                {
                    var skin = JObject.Parse(skinJson);
                    _shirtHex = (string)skin["shirt"] ?? _shirtHex;
                    _hairHex = (string)skin["hair"] ?? _hairHex;
                }
                catch { /* skin inválida: mantém cor do usuário */ }
            }
            // com os personagens LimeZu a skin não muda cores; fica para mapear
            // skins → variações de personagem quando houver mais characters no pack
            _ = _shirtHex; _ = _hairHex;
        }

        public void SetStatus(string status)
        {
            _status = Sanitize(status);
            if (_statusText != null) _statusText.text = _status;
        }

        public string StatusLabel => _status;

        public void Say(string text)
        {
            _bubble.SetActive(true);
            _bubbleUntil = Time.time + 6f;
            var emote = text == ":like:" || text == ":heart:" || text == ":laugh:" || text == ":coffee:";
            _bubbleIcon.gameObject.SetActive(emote);
            _bubbleText.gameObject.SetActive(!emote);
            if (emote)
            {
                _bubbleIcon.sprite = SoftArt.Emote(text.Trim(':'));
                _bubbleBg.size = new Vector2(1.1f, 1.1f);
            }
            else
            {
                var clean = Sanitize(text);
                if (clean.Length > 30) clean = clean.Substring(0, 30) + "...";
                _bubbleText.text = clean;
                _bubbleBg.size = new Vector2(Mathf.Clamp(clean.Length * .26f + .6f, 1.3f, 8.6f), .85f);
            }
        }

        /// <summary>Remove emojis (a fonte não os tem) e mapeia status conhecidos.</summary>
        public static string Sanitize(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            s = s.Replace("🔴", "[REC]").Replace("📅", "[REUNIAO]")
                 .Replace("⏱️", "[TIMER]").Replace("⏱", "[TIMER]").Replace("☕", "[CAFE]");
            var sb = new StringBuilder(s.Length);
            foreach (var c in s)
                if (!char.IsSurrogate(c) && c < 0x2500) sb.Append(c);
            return sb.ToString().Trim();
        }

        public void Tick(float dt)
        {
            if (!IsMe)
            {
                var dist = Vector2.Distance(CurrentSu, TargetSu);
                Moving = dist > 2f && !Sitting;
                CurrentSu = Vector2.Lerp(CurrentSu, TargetSu, Mathf.Clamp01(14f * dt));
            }

            transform.position = OfficeMap.SuToWorld(CurrentSu.x, CurrentSu.y);
            _rig.SetSortingOrder(OfficeMap.Order(transform.position.y));
            _rig.SetHeadset(HasHeadset);
            _rig.Tick(dt, Moving, Sitting, Sitting ? "down" : Dir);

            if (_bubble.activeSelf && Time.time > _bubbleUntil) _bubble.SetActive(false);
        }
    }
}
