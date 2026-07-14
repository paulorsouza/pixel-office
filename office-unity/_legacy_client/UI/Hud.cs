using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using OfficeQuest.Game;
using UnityEngine;
using UnityEngine.UIElements;

namespace OfficeQuest.Ui
{
    /// <summary>
    /// HUD do jogo em UI Toolkit (USS = CSS do Unity). Tema claro moderno estilo-web.
    /// Mantém a API pública usada por OfficeGame/LocalPlayer/AvManager.
    /// </summary>
    public class Hud : MonoBehaviour
    {
        private static Font _font;
        public static Font UiFont
        {
            get
            {
                if (_font != null) return _font;
                _font = Resources.Load<Font>("Fonts/Nunito");
                if (_font == null) { try { _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); } catch { _font = Resources.GetBuiltinResource<Font>("Arial.ttf"); } }
                return _font;
            }
        }

        public Action<string> OnChatSubmit;
        public Action OnHeadsetClick;
        public Action OnAvMic, OnAvCam, OnAvScreen, OnTimerStop;

        private VisualElement _root;
        public VisualElement UiRoot => _root;

        // player card
        private VisualElement _avatarDot, _xpFill, _timerRow;
        private Label _nameLbl, _lvlLbl, _xpLbl, _statusLbl, _activeTaskLbl, _activeTaskSub, _timerLbl;
        private DateTime? _timerStartUtc; private string _timerLabel = "";

        private VisualElement _login, _banner, _headsetBtn;
        private Label _bannerLbl; private Label _headsetLbl;

        // AV
        private VisualElement _avBar, _avTiles;
        private Label _avTitle; private Button _avMicBtn, _avCamBtn, _avScreenBtn;
        private readonly Dictionary<string, VisualElement> _avTileMap = new Dictionary<string, VisualElement>();

        private VisualElement _chatLog, _online;
        private TextField _chatInput;
        private VisualElement _toasts;
        private bool _typing;

        public bool IsTyping => _typing;

        private void Awake()
        {
            var doc = gameObject.AddComponent<UIDocument>();
            var ps = ScriptableObject.CreateInstance<PanelSettings>();
            ps.themeStyleSheet = Resources.Load<ThemeStyleSheet>("UI/AppTheme");
            ps.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            ps.referenceResolution = new Vector2Int(1280, 720);
            ps.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            ps.match = .5f;
            ps.sortingOrder = 100;
            doc.panelSettings = ps;

            _root = doc.rootVisualElement;
            _root.AddToClassList("root");
            _root.pickingMode = PickingMode.Ignore;
            var uss = Resources.Load<StyleSheet>("UI/app");
            if (uss != null) _root.styleSheets.Add(uss);
            _root.style.unityFont = new StyleFont(UiFont);
        }

        private void Add(VisualElement v) => _root.Add(v);

        // ---------- login ----------
        public void ShowLogin(JArray users, Action<int> onChosen)
        {
            _login = UiKit.Ve("login");
            _login.pickingMode = PickingMode.Position;
            _login.Add(new Label("◆") { }.WithClass("logo"));
            _login.Add(UiKit.Lbl("Office Quest", "title"));
            _login.Add(UiKit.Lbl("Escolha quem você é para entrar", "sub"));
            var cards = UiKit.Ve("cards");
            foreach (var u in users)
            {
                var id = (int)u["id"];
                var card = UiKit.Ve("ucard");
                card.Add(UiKit.Avatar((string)u["name"], (string)u["color"], "avatar-lg"));
                card.Add(UiKit.Lbl((string)u["name"], "uname"));
                card.Add(UiKit.Lbl((string)u["role"], "urole"));
                card.Add(UiKit.Lbl($"⭐ {(int)u["xp"]} XP", "uxp"));
                card.RegisterCallback<ClickEvent>(_ => { _login.RemoveFromHierarchy(); onChosen(id); });
                cards.Add(card);
            }
            _login.Add(cards);
            Add(_login);
        }

        // ---------- HUD ----------
        public void BuildGameUi()
        {
            BuildPlayerCard();
            BuildBanner();
            BuildHeadsetBtn();
            BuildAvBar();
            BuildChat();
            BuildOnline();
            _toasts = UiKit.Ve("toasts"); Add(_toasts);
            var hint = UiKit.Lbl("WASD/clique mover · clique/E cadeira ou quadro · F fone · T tasks · H horas · 1-4 emotes · Enter chat · Tab pessoas", "hint");
            Add(hint);
        }

        private void BuildPlayerCard()
        {
            var card = UiKit.Ve("card", "pcard"); card.pickingMode = PickingMode.Position;
            var top = UiKit.Row();
            _avatarDot = UiKit.Avatar("?", "#7c5cff");
            var namecol = UiKit.Ve("col"); namecol.style.marginLeft = 10; namecol.style.flexGrow = 1;
            _nameLbl = UiKit.Lbl("...", "name");
            namecol.Add(_nameLbl);
            var lvl = UiKit.Badge("Nv 1", "lvl-chip"); _lvlLbl = lvl.Q<Label>();
            top.Add(_avatarDot); top.Add(namecol); top.Add(lvl);
            card.Add(top);

            var xprow = UiKit.Row(); xprow.style.marginTop = 10;
            _xpFill = UiKit.Ve("fill");
            var track = UiKit.Ve("track"); track.style.flexGrow = 1; track.Add(_xpFill);
            xprow.Add(track);
            card.Add(xprow);
            _xpLbl = UiKit.Lbl("", "tiny", "faint"); _xpLbl.style.marginTop = 4;
            card.Add(_xpLbl);

            _statusLbl = UiKit.Lbl("● disponível", "small", "muted"); _statusLbl.style.marginTop = 6;
            card.Add(_statusLbl);

            card.Add(UiKit.Ve("divider"));

            _activeTaskLbl = UiKit.Lbl("Task ativa: nenhuma", "small"); card.Add(_activeTaskLbl);
            _activeTaskSub = UiKit.Lbl("escolha no seu kanban (E)", "tiny", "faint"); card.Add(_activeTaskSub);

            _timerRow = UiKit.Row(); _timerRow.style.marginTop = 10;
            _timerLbl = UiKit.Lbl("", "small", "bold"); _timerLbl.style.color = SoftArt.Hex("#16a34a"); _timerLbl.style.flexGrow = 1;
            var stop = UiKit.Btn("Parar", () => OnTimerStop?.Invoke(), "btn-danger", "btn-sm");
            _timerRow.Add(_timerLbl); _timerRow.Add(stop);
            _timerRow.style.display = DisplayStyle.None;
            card.Add(_timerRow);

            Add(card);
        }

        private void BuildBanner()
        {
            _banner = UiKit.Ve("banner"); _bannerLbl = UiKit.Lbl(""); _banner.Add(_bannerLbl);
            _banner.style.display = DisplayStyle.None; Add(_banner);
        }

        private void BuildHeadsetBtn()
        {
            _headsetBtn = UiKit.Btn("PEGAR FONE (F)", () => OnHeadsetClick?.Invoke(), "btn-primary");
            _headsetBtn.style.position = Position.Absolute; _headsetBtn.style.top = 60;
            _headsetBtn.style.left = Length.Percent(50); _headsetBtn.style.translate = new Translate(Length.Percent(-50), 0);
            _headsetBtn.style.width = 260;
            _headsetLbl = ((Button)_headsetBtn).Q<Label>() ?? null;
            _headsetBtn.style.display = DisplayStyle.None; Add(_headsetBtn);
        }

        // ---------- chat ----------
        private VisualElement _chatWrap;

        private void BuildChat()
        {
            // container transparente: NÃO bloqueia cliques no mapa (só as últimas msgs + input)
            _chatWrap = UiKit.Ve("chat", "col"); _chatWrap.pickingMode = PickingMode.Ignore;
            _chatLog = UiKit.Ve("chatlog", "col"); _chatLog.pickingMode = PickingMode.Ignore;
            _chatWrap.Add(_chatLog);

            _chatInput = new TextField(); _chatInput.AddToClassList("chatinput");
            var tf = _chatInput.Q("unity-text-input"); if (tf != null) tf.style.backgroundColor = Color.clear;
            _chatInput.style.display = DisplayStyle.None; // aparece só ao digitar (Enter)
            _chatInput.RegisterCallback<FocusInEvent>(_ => _typing = true);
            _chatInput.RegisterCallback<FocusOutEvent>(_ => CloseChat()); // clicar fora fecha e some
            // TrickleDown: capturamos Enter/Esc ANTES do TextField para garantir o blur/liberação
            _chatInput.RegisterCallback<KeyDownEvent>(e =>
            {
                if (e.keyCode == KeyCode.Return || e.keyCode == KeyCode.KeypadEnter)
                {
                    var t = _chatInput.value?.Trim();
                    if (!string.IsNullOrEmpty(t)) OnChatSubmit?.Invoke(t);
                    CloseChat();
                    e.StopPropagation();
                }
                else if (e.keyCode == KeyCode.Escape) { CloseChat(); e.StopPropagation(); }
            }, TrickleDown.TrickleDown);
            var placeholder = new Label("digite e Enter para enviar…  (Esc cancela)");
            _chatInput.Add(placeholder);
            placeholder.style.position = Position.Absolute; placeholder.style.left = 13; placeholder.style.top = 10;
            placeholder.style.color = SoftArt.Hex("#8b929d"); placeholder.pickingMode = PickingMode.Ignore;
            placeholder.style.fontSize = 12;
            _chatInput.RegisterValueChangedCallback(ev => placeholder.style.display = string.IsNullOrEmpty(ev.newValue) ? DisplayStyle.Flex : DisplayStyle.None);
            _chatWrap.Add(_chatInput);
            Add(_chatWrap);
            _typing = false;
        }

        /// <summary>Abre o chat para digitar (mostra o input, bloqueia o movimento).</summary>
        private void OpenChat()
        {
            _typing = true;                              // determinístico, sem depender do evento
            _chatInput.style.display = DisplayStyle.Flex;
            _chatInput.Focus();
        }

        /// <summary>Fecha o chat, esconde o input e devolve o teclado ao jogo.</summary>
        private void CloseChat()
        {
            _chatInput.value = "";
            _typing = false;                             // libera o movimento já neste frame
            _chatInput.style.display = DisplayStyle.None;
            _chatInput.Blur();
        }

        public void AddChatLine(string author, string text)
        {
            var t = AvatarView.Sanitize(text); if (string.IsNullOrEmpty(t)) t = "(emote)";
            var line = UiKit.Ve("chatline"); line.pickingMode = PickingMode.Ignore;
            line.Add(UiKit.Lbl(author, "author"));
            line.Add(UiKit.Lbl(t, "text"));
            _chatLog.Add(line);
            while (_chatLog.childCount > 5) _chatLog.RemoveAt(0);   // só as últimas 5
            // some sozinha após alguns segundos (fade via transição de opacity)
            line.schedule.Execute(() => line.style.opacity = 0f).ExecuteLater(9000);
            line.RegisterCallback<TransitionEndEvent>(_ => { if (line.resolvedStyle.opacity < 0.05f) line.RemoveFromHierarchy(); });
        }

        /// <summary>Há algum elemento interativo da HUD sob o ponteiro? (para o mouse do jogo ignorar).</summary>
        public bool PointerOverUi(Vector2 screenPos)
        {
            var panel = _root?.panel;
            if (panel == null) return false;
            // ScreenToPanel espera coords no mesmo espaço de Input.mousePosition (faz o flip por dentro)
            var p = RuntimePanelUtils.ScreenToPanel(panel, screenPos);
            var hit = panel.Pick(p);
            return hit != null && hit != _root; // _root é pickingMode Ignore, mas por garantia
        }

        // ---------- online ----------
        private void BuildOnline()
        {
            _online = UiKit.Ve("card", "online", "col"); _online.pickingMode = PickingMode.Position;
            _online.Add(UiKit.Lbl("NO ESCRITÓRIO", "label-caps"));
            var list = UiKit.Ve("col"); list.name = "olist"; _online.Add(list);
            _online.style.display = DisplayStyle.None; Add(_online);
        }

        public void SetOnlineVisible(bool v) { if (_online != null) _online.style.display = v ? DisplayStyle.Flex : DisplayStyle.None; }

        public void SetOnline(IEnumerable<string> lines)
        {
            var list = _online?.Q("olist"); if (list == null) return;
            list.Clear();
            foreach (var s in lines) list.Add(UiKit.Lbl(s, "small"));
        }

        // ---------- setters ----------
        public void SetMe(string name, string colorHex, int level, int xp, int floor, int next)
        {
            if (_nameLbl != null) _nameLbl.text = name;
            if (_lvlLbl != null) _lvlLbl.text = $"Nv {level}";
            if (_avatarDot != null) { _avatarDot.style.backgroundColor = SoftArt.Hex(colorHex); var l = _avatarDot.Q<Label>(); if (l != null) l.text = UiKit.Initials(name); }
            if (_xpLbl != null) _xpLbl.text = $"{xp} / {next} XP";
            if (_xpFill != null) _xpFill.style.width = Length.Percent(next > floor ? Mathf.Clamp01((float)(xp - floor) / (next - floor)) * 100f : 0);
        }

        public void SetActiveTask(string code, string title)
        {
            if (_activeTaskLbl == null) return;
            if (string.IsNullOrEmpty(code)) { _activeTaskLbl.text = "Task ativa: nenhuma"; _activeTaskSub.text = "escolha no seu kanban (E)"; }
            else { _activeTaskLbl.text = $"Task ativa: {code}"; _activeTaskSub.text = AvatarView.Sanitize(title); }
        }

        public void SetMyStatus(string status)
        {
            if (_statusLbl != null) _statusLbl.text = string.IsNullOrEmpty(status) ? "● disponível" : AvatarView.Sanitize(status);
        }

        public void SetActiveTimer(string label, DateTime? startUtc)
        {
            _timerLabel = label ?? ""; _timerStartUtc = startUtc;
            if (_timerRow != null) _timerRow.style.display = startUtc.HasValue ? DisplayStyle.Flex : DisplayStyle.None;
        }

        private void Update()
        {
            if (_online != null) _online.style.display = Input.GetKey(KeyCode.Tab) ? DisplayStyle.Flex : DisplayStyle.None;
            // Enter abre o chat (quando não está digitando) — teclado volta ao jogo ao enviar/Esc
            if (_chatInput != null && !_typing && (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter)))
                OpenChat();
        }

        private void LateUpdate()
        {
            if (_timerLbl == null || !_timerStartUtc.HasValue) return;
            var e = DateTime.UtcNow - _timerStartUtc.Value; if (e.TotalSeconds < 0) e = TimeSpan.Zero;
            _timerLbl.text = $"● {_timerLabel}  {(int)e.TotalHours:00}:{e.Minutes:00}:{e.Seconds:00}";
        }

        public void ShowZoneBanner(string zone)
        {
            if (_banner == null) return;
            string txt = zone switch
            {
                "meeting" => "EM REUNIÃO · horas sendo registradas",
                "headset" => "EM REUNIÃO (fone) · circule à vontade",
                "coffee" => "NO CAFÉ · pausa merecida",
                _ => null,
            };
            _bannerLbl.text = txt ?? "";
            _banner.style.display = txt != null ? DisplayStyle.Flex : DisplayStyle.None;
        }

        public void UpdateHeadsetButton(bool carrying, bool canPick)
        {
            if (_headsetBtn == null) return;
            _headsetBtn.style.display = (carrying || canPick) ? DisplayStyle.Flex : DisplayStyle.None;
            ((Button)_headsetBtn).text = carrying ? "SOLTAR FONE (F)" : "PEGAR FONE (F)";
            _headsetBtn.EnableInClassList("btn-danger", carrying);
            _headsetBtn.EnableInClassList("btn-primary", !carrying);
        }

        // ---------- AV ----------
        private void BuildAvBar()
        {
            _avBar = UiKit.Ve("card", "avbar"); _avBar.pickingMode = PickingMode.Position;
            _avTitle = UiKit.Lbl("Call da reunião", "small", "bold"); _avTitle.style.marginRight = 12;
            _avBar.Add(_avTitle);
            _avMicBtn = UiKit.Btn("Mic", () => OnAvMic?.Invoke(), "btn-sm"); _avMicBtn.style.marginRight = 6;
            _avCamBtn = UiKit.Btn("Câmera", () => OnAvCam?.Invoke(), "btn-sm"); _avCamBtn.style.marginRight = 6;
            _avScreenBtn = UiKit.Btn("Tela", () => OnAvScreen?.Invoke(), "btn-sm");
            _avBar.Add(_avMicBtn); _avBar.Add(_avCamBtn); _avBar.Add(_avScreenBtn);
            _avBar.style.display = DisplayStyle.None; Add(_avBar);

            _avTiles = UiKit.Ve("avtiles"); _avTiles.style.display = DisplayStyle.None; Add(_avTiles);
        }

        public void UpdateAvBar(bool visible, bool connecting, bool mic, bool cam, bool screen)
        {
            if (_avBar == null) return;
            _avBar.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            _avTiles.style.display = visible ? DisplayStyle.Flex : DisplayStyle.None;
            if (!visible) return;
            _avTitle.text = connecting ? "Conectando…" : "Call da reunião";
            SetAv(_avMicBtn, mic, mic ? "Mic ON" : "Mic");
            SetAv(_avCamBtn, cam, cam ? "Câmera ON" : "Câmera");
            SetAv(_avScreenBtn, screen, screen ? "Parar tela" : "Tela");
        }
        private static void SetAv(Button b, bool on, string label) { b.text = label; b.EnableInClassList("btn-on", on); }

        public void SetAvTile(string id, string label, Texture tex)
        {
            if (_avTiles == null) return;
            if (!_avTileMap.TryGetValue(id, out var tile) || tile == null)
            {
                tile = UiKit.Ve("avtile");
                var cap = UiKit.Lbl(label, "tiny"); cap.style.position = Position.Absolute; cap.style.left = 6; cap.style.bottom = 4;
                cap.style.color = Color.white; cap.style.backgroundColor = new Color(0, 0, 0, .5f);
                cap.style.paddingLeft = 6; cap.style.paddingRight = 6; cap.style.borderTopLeftRadius = 6; cap.style.borderTopRightRadius = 6;
                tile.Add(cap);
                _avTileMap[id] = tile; _avTiles.Add(tile);
            }
            if (tex is RenderTexture rt) tile.style.backgroundImage = Background.FromRenderTexture(rt);
            else if (tex is Texture2D t2) tile.style.backgroundImage = Background.FromTexture2D(t2);
        }
        public void RemoveAvTile(string id) { if (_avTileMap.TryGetValue(id, out var t) && t != null) t.RemoveFromHierarchy(); _avTileMap.Remove(id); }
        public void RemoveAvTilesByPrefix(string prefix)
        {
            var keys = new List<string>(); foreach (var k in _avTileMap.Keys) if (k.StartsWith(prefix)) keys.Add(k);
            foreach (var k in keys) RemoveAvTile(k);
        }
        public void ClearAvTiles() { foreach (var t in _avTileMap.Values) t?.RemoveFromHierarchy(); _avTileMap.Clear(); }

        // ---------- toast ----------
        public void Toast(string message, Color? accent = null)
        {
            if (_toasts == null) return;
            var t = UiKit.Ve("toast");
            var bar = UiKit.Ve("bar"); if (accent.HasValue) bar.style.backgroundColor = accent.Value;
            t.Add(bar); t.Add(UiKit.Lbl(AvatarView.Sanitize(message)));
            _toasts.Add(t);
            _root.schedule.Execute(() => t.RemoveFromHierarchy()).ExecuteLater(5000);
        }
    }

    internal static class VeExt
    {
        public static T WithClass<T>(this T v, string cls) where T : VisualElement { v.AddToClassList(cls); return v; }
    }
}
