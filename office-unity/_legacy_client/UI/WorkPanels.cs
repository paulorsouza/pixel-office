using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using OfficeQuest.Game;
using OfficeQuest.Net;
using UnityEngine;
using UnityEngine.UIElements;

namespace OfficeQuest.Ui
{
    /// <summary>
    /// Painel deslizante do jogo (UI Toolkit): kanban das atividades (T) com arrastar-e-soltar,
    /// filtro de sprint e escopo (minhas/todas); e a folha de horas (H).
    /// </summary>
    public class WorkPanels : MonoBehaviour
    {
        public Hud Hud;
        private VisualElement _overlay, _body;
        private int _activeTaskId = -1;
        private string _mode = "";

        // filtros
        private JArray _sprints;
        private string _sprintId = null;   // null = ainda não inicializado; "" = todos
        private string _scope = "mine";    // mine | all
        private List<JObject> _all = new();

        // drag
        private readonly List<(VisualElement col, string status)> _columns = new();
        private VisualElement _dragCard, _dragGhost, _hoverCol;
        private JObject _dragItem; private int _pointerId; private Vector2 _start; private bool _dragging;

        private static readonly string[] Flow = { "Backlog", "Todo", "InProgress", "Review", "Done" };
        private static readonly Dictionary<string, string> SL = new()
        { ["Backlog"] = "Backlog", ["Todo"] = "A fazer", ["InProgress"] = "Fazendo", ["Review"] = "Revisão", ["Done"] = "Concluído" };
        private static readonly Dictionary<string, string> SC = new()
        { ["Backlog"] = "#8b929d", ["Todo"] = "#2f6bff", ["InProgress"] = "#d98a00", ["Review"] = "#7c5cff", ["Done"] = "#16a34a" };

        private void Update()
        {
            if (Hud == null || Hud.IsTyping) return;
            if (Input.GetKeyDown(KeyCode.T)) Toggle("tasks");
            if (Input.GetKeyDown(KeyCode.H)) Toggle("hours");
            if (Input.GetKeyDown(KeyCode.Escape) && _overlay != null && _overlay.style.display == DisplayStyle.Flex) Close();
        }

        private void Toggle(string mode) { if (_overlay != null && _overlay.style.display == DisplayStyle.Flex && _mode == mode) Close(); else Open(mode); }

        public async Task OpenActiveTaskPickerAsync() { Open("tasks"); await Task.CompletedTask; }

        private void Open(string mode)
        {
            _mode = mode;
            if (_overlay == null)
            {
                _overlay = UiKit.Ve("overlay"); _overlay.pickingMode = PickingMode.Position;
                _overlay.RegisterCallback<ClickEvent>(e => { if (e.target == _overlay) Close(); });
                Hud.UiRoot.Add(_overlay);
            }
            _overlay.style.display = DisplayStyle.Flex;
            BuildSheet();
            _ = Refresh();
        }

        private void Close() { if (_overlay != null) _overlay.style.display = DisplayStyle.None; _mode = ""; }

        private void BuildSheet()
        {
            _overlay.Clear();
            var sheet = UiKit.Ve("sheet", "col");
            var head = UiKit.Ve("sheet-head");
            head.Add(UiKit.Lbl(_mode == "tasks" ? "Minhas atividades" : "Minhas horas · semana", "title"));
            head.Add(UiKit.Spacer());
            head.Add(UiKit.Btn("Fechar (esc)", Close, "btn-ghost"));
            sheet.Add(head);
            _body = UiKit.Ve("sheet-body", "col");
            _body.Add(UiKit.Lbl("Carregando…", "muted"));
            sheet.Add(_body);
            _overlay.Add(sheet);
        }

        private async Task Refresh()
        {
            if (_mode == "tasks") await RefreshTasks();
            else await RefreshHours();
        }

        // ---------- kanban ----------
        private async Task RefreshTasks()
        {
            if (_sprints == null) _sprints = await Api.GetAsync("/api/sprints") as JArray;
            if (_sprintId == null)
            {
                _sprintId = "";
                if (_sprints != null) foreach (var s in _sprints) if ((bool?)s["isActive"] == true) _sprintId = ((int)s["id"]).ToString();
            }

            var me = await Api.GetAsync("/api/me");
            _activeTaskId = me?["activeTask"]?.Type == JTokenType.Object ? (int)me["activeTask"]["id"] : -1;

            var url = "/api/workitems" + (string.IsNullOrEmpty(_sprintId) ? "" : $"?sprintId={_sprintId}");
            var items = await Api.GetAsync(url);
            if (_body == null) return;
            _body.Clear();
            if (items == null) { _body.Add(UiKit.Lbl("Não foi possível carregar.", "muted")); return; }

            _all.Clear();
            foreach (var w in (JArray)items)
            {
                var o = (JObject)w;
                if (_scope == "mine" && (int?)o["assigneeId"] != Api.UserId) continue;
                _all.Add(o);
            }

            _body.Add(BuildToolbar());
            var board = UiKit.Ve("board");
            var scroll = new ScrollView(ScrollViewMode.Horizontal); scroll.style.flexGrow = 1; scroll.Add(board);
            _body.Add(scroll);

            _columns.Clear();
            foreach (var status in Flow)
            {
                var colItems = _all.FindAll(w => (string)w["status"] == status);
                var col = UiKit.Ve("kcol", "col");
                var chead = UiKit.Ve("kcol-head");
                var dot = UiKit.Ve("dot"); dot.style.backgroundColor = SoftArt.Hex(SC[status]);
                chead.Add(dot); chead.Add(UiKit.Lbl(SL[status], "ctitle")); chead.Add(UiKit.Lbl(colItems.Count.ToString(), "count"));
                col.Add(chead);
                var cbody = new ScrollView(); cbody.AddToClassList("kcol-body"); cbody.style.flexGrow = 1;
                foreach (var w in colItems) cbody.Add(Card(w));
                col.Add(cbody);
                board.Add(col);
                _columns.Add((col, status));
            }
        }

        private VisualElement BuildToolbar()
        {
            var bar = UiKit.Ve("wtoolbar");
            // sprint dropdown
            var choices = new List<string> { "Todos os sprints", "Sem sprint (backlog)" };
            var ids = new List<string> { "", "0" };
            if (_sprints != null) foreach (var s in _sprints) { choices.Add((string)s["name"] + ((bool?)s["isActive"] == true ? " · ativo" : "")); ids.Add(((int)s["id"]).ToString()); }
            var idx = Math.Max(0, ids.IndexOf(_sprintId));
            var drop = new DropdownField(choices, idx); drop.AddToClassList("wdrop");
            drop.RegisterValueChangedCallback(e => { _sprintId = ids[drop.index]; _ = RefreshTasks(); });
            bar.Add(drop);
            // escopo
            var seg = UiKit.Ve("seg");
            seg.Add(SegBtn("Minhas", _scope == "mine", () => { _scope = "mine"; _ = RefreshTasks(); }));
            seg.Add(SegBtn("Todas", _scope == "all", () => { _scope = "all"; _ = RefreshTasks(); }));
            bar.Add(seg);
            bar.Add(UiKit.Spacer());
            bar.Add(UiKit.Lbl("arraste os cards entre as colunas · ★ define a task ativa da mesa", "small", "muted"));
            return bar;
        }

        private Button SegBtn(string text, bool on, Action onClick)
        {
            var b = UiKit.Btn(text, onClick, "segbtn"); b.RemoveFromClassList("btn");
            if (on) b.AddToClassList("segbtn-on");
            return b;
        }

        private VisualElement Card(JObject w)
        {
            var id = (int)w["id"]; var type = (string)w["type"];
            var active = id == _activeTaskId;
            var card = UiKit.Ve("kcard", "col");
            var epic = w["epic"];
            if (epic?.Type == JTokenType.Object) { var bar = UiKit.Ve("epicbar"); bar.style.backgroundColor = SoftArt.Hex((string)epic["color"]); card.Add(bar); }
            var r1 = UiKit.Row();
            r1.Add(UiKit.Badge(type, $"badge-{type}"));
            if (active) r1.Add(UiKit.Lbl(" ★", "star"));
            r1.Add(UiKit.Spacer());
            r1.Add(UiKit.Lbl((string)w["code"], "code"));
            card.Add(r1);
            card.Add(UiKit.Lbl(AvatarView.Sanitize((string)w["title"]), "ktitle"));
            var r2 = UiKit.Row();
            var assignee = w["assignee"];
            if (assignee?.Type == JTokenType.Object) r2.Add(UiKit.Avatar((string)assignee["name"], (string)assignee["color"], "avatar-sm"));
            r2.Add(UiKit.Spacer());
            r2.Add(UiKit.Btn(active ? "★ Ativa" : "★ Ativar", () => _ = SetActive(id), active ? "btn-on" : "btn-ghost", "btn-sm"));
            card.Add(r2);

            // drag por limiar (pequeno movimento inicia; clique no botão não dispara)
            card.RegisterCallback<PointerDownEvent>(e =>
            {
                if (e.button != 0) return;
                _dragCard = card; _dragItem = w; _pointerId = e.pointerId; _start = (Vector2)e.position; _dragging = false;
            });
            card.RegisterCallback<PointerMoveEvent>(e =>
            {
                if (_dragCard != card) return;
                if (!_dragging && ((Vector2)e.position - _start).magnitude > 6) BeginDrag(card, e);
                if (_dragging) UpdateDrag(e);
            });
            card.RegisterCallback<PointerUpEvent>(e => { if (_dragCard == card) EndDrag(e); });
            return card;
        }

        private void BeginDrag(VisualElement card, PointerMoveEvent e)
        {
            _dragging = true;
            card.CapturePointer(_pointerId);
            card.AddToClassList("kcard-dragging");
            _dragGhost = UiKit.Ve("drag-ghost", "col");
            _dragGhost.Add(UiKit.Lbl((string)_dragItem["code"], "code"));
            _dragGhost.Add(UiKit.Lbl(AvatarView.Sanitize((string)_dragItem["title"]), "ktitle"));
            _dragGhost.pickingMode = PickingMode.Ignore;
            _overlay.Add(_dragGhost);
            UpdateDrag(e);
        }

        private void UpdateDrag(PointerMoveEvent e)
        {
            var p = (Vector2)e.position;
            _dragGhost.style.left = p.x - 100; _dragGhost.style.top = p.y - 20;
            VisualElement hit = null;
            foreach (var (col, _) in _columns) if (col.worldBound.Contains(p)) hit = col;
            if (hit != _hoverCol)
            {
                _hoverCol?.RemoveFromClassList("kcol-drop");
                _hoverCol = hit;
                _hoverCol?.AddToClassList("kcol-drop");
            }
        }

        private void EndDrag(PointerUpEvent e)
        {
            var card = _dragCard; _dragCard = null;
            if (!_dragging) return;
            _dragging = false;
            card.ReleasePointer(_pointerId);
            card.RemoveFromClassList("kcard-dragging");
            _dragGhost?.RemoveFromHierarchy(); _dragGhost = null;

            string target = null;
            var p = (Vector2)e.position;
            foreach (var (col, status) in _columns) if (col.worldBound.Contains(p)) target = status;
            _hoverCol?.RemoveFromClassList("kcol-drop"); _hoverCol = null;

            var cur = (string)_dragItem["status"];
            if (target != null && target != cur) _ = MoveTo((int)_dragItem["id"], target, (string)_dragItem["code"]);
        }

        private async Task MoveTo(int id, string status, string code)
        {
            var r = await Api.PatchAsync($"/api/workitems/{id}", $"{{\"status\":\"{status}\"}}");
            if (r == null) { Hud.Toast("Falha ao mover"); await RefreshTasks(); return; }
            if (r["xpInfo"]?.Type == JTokenType.Object) Hud.Toast($"{code} concluída · +XP 🎉", SoftArt.Hex("#16a34a"));
            await RefreshTasks();
        }

        private async Task SetActive(int id)
        {
            try { await Api.PostAsync("/api/me/active-task", $"{{\"workItemId\":{id}}}"); Hud.Toast("Task ativa definida — sente na sua mesa", SoftArt.Hex("#7c5cff")); await RefreshTasks(); }
            catch { Hud.Toast("Não foi possível ativar essa task"); }
        }

        // ---------- horas ----------
        private async Task RefreshHours()
        {
            var today = DateTime.Now.Date;
            var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7));
            var from = monday.ToUniversalTime().ToString("o");
            var to = monday.AddDays(7).ToUniversalTime().ToString("o");
            var entries = await Api.GetAsync($"/api/timeentries?from={Uri.EscapeDataString(from)}&to={Uri.EscapeDataString(to)}");
            if (_body == null) return;
            _body.Clear();
            if (entries == null) { _body.Add(UiKit.Lbl("Não foi possível carregar.", "muted")); return; }

            var total = 0; var meetings = 0; var count = 0;
            var rows = new List<(string when, string what, int min)>();
            foreach (var e in (JArray)entries)
            {
                var minutes = (int?)e["minutes"] ?? 0; if (minutes == 0) continue;
                total += minutes; count++;
                if ((string)e["category"] == "reuniao") meetings += minutes;
                var start = DateTime.Parse((string)e["startUtc"], null, DateTimeStyles.AdjustToUniversal).ToLocalTime();
                var wi = e["workItem"];
                var what = wi?.Type == JTokenType.Object ? $"{(string)wi["code"]} {AvatarView.Sanitize((string)wi["title"])}"
                    : (string)e["category"] == "reuniao" ? "Reunião" : "Outro";
                rows.Add(($"{start:ddd dd/MM}", what, minutes));
            }

            var stats = UiKit.Row(); stats.style.marginBottom = 16;
            stats.Add(Stat("Total da semana", Hm(total)));
            stats.Add(Stat("Reuniões", Hm(meetings)));
            stats.Add(Stat("Lançamentos", count.ToString()));
            stats.Add(Stat("Média/dia útil", Hm(total / 5)));
            _body.Add(stats);

            var table = UiKit.Ve("card", "col"); table.style.paddingTop = 0; table.style.paddingBottom = 0;
            var hr = UiKit.Ve("trow", "head"); hr.Add(Cell("Dia", 130)); hr.Add(Cell("Atividade", 0, true)); hr.Add(Cell("Horas", 90, false, true));
            table.Add(hr);
            var sc = new ScrollView(); sc.style.maxHeight = 420;
            foreach (var (when, what, min) in rows)
            {
                var tr = UiKit.Ve("trow");
                tr.Add(Cell(when, 130)); tr.Add(Cell(what, 0, true));
                var m = Cell(Hm(min), 90, false, true); m.style.color = SoftArt.Hex("#16a34a"); m.style.unityFontStyleAndWeight = FontStyle.Bold;
                tr.Add(m);
                sc.Add(tr);
            }
            if (rows.Count == 0) sc.Add(UiKit.Lbl("Sem lançamentos nesta semana.", "muted"));
            table.Add(sc);
            _body.Add(table);
        }

        private static VisualElement Stat(string k, string v) { var s = UiKit.Ve("stat", "col"); s.Add(UiKit.Lbl(k, "k")); s.Add(UiKit.Lbl(v, "v")); return s; }
        private static Label Cell(string text, float w, bool grow = false, bool right = false)
        {
            var l = UiKit.Lbl(text, "small");
            if (w > 0) l.style.width = w; if (grow) l.style.flexGrow = 1;
            if (right) l.style.unityTextAlign = TextAnchor.MiddleRight;
            return l;
        }
        private static string Hm(int m) => m >= 60 ? $"{m / 60}h{m % 60:00}" : $"{m}min";
    }
}
