using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using OfficeQuest.Net;
using OfficeQuest.Ui;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace OfficeQuest.Game
{
    /// <summary>Orquestra o jogo: login, conexão com o hub, jogadores e HUD.</summary>
    public class OfficeGame : MonoBehaviour
    {
        private MiniSignalR _hub;
        private Hud _hud;
        private Camera _cam;
        private Transform _avatarRoot;
        private AvatarView _me;
        private LocalPlayer _localPlayer;
        private AvManager _av;
        private Vector2Int _myDesk = new Vector2Int(-1, -1);
        private Vector2Int _myKanban = new Vector2Int(-1, -1);
        private readonly Dictionary<string, AvatarView> _avatars = new Dictionary<string, AvatarView>();
        private float _onlineTimer;
        private volatile bool _connectionLost;

        private async void Start()
        {
            Application.runInBackground = true; // reunião não morre se a janela perder o foco
            SetupCamera();

            _hud = gameObject.AddComponent<Hud>();
            _hud.OnChatSubmit = text => { _ = _hub?.InvokeAsync("Chat", text); };

            JToken users = null;
            while (users == null)
            {
                users = await Api.GetAsync("/api/users");
                if (users == null)
                {
                    _hud.Toast($"Backend não respondeu em {Api.BaseUrl} — rode o dotnet run. Tentando de novo...", Color.red);
                    await Task.Delay(3000);
                }
            }
            // modo de captura automatizada (setado pelo script de editor DevShots)
            if (PlayerPrefs.GetInt("oq-autologin", 0) == 1)
            {
                PlayerPrefs.DeleteKey("oq-autologin");
                PlayerPrefs.Save();
                _ = StartGameAsync((int)((JArray)users)[0]["id"]);
                return;
            }

            _hud.ShowLogin((JArray)users, id => { _ = StartGameAsync(id); });
        }

        private void SetupCamera()
        {
            _cam = Camera.main;
            if (_cam == null)
            {
                var go = new GameObject("Main Camera") { tag = "MainCamera" };
                _cam = go.AddComponent<Camera>();
            }
            _cam.orthographic = true;
            _cam.orthographicSize = 5f;
            _cam.clearFlags = CameraClearFlags.SolidColor;
            _cam.backgroundColor = SoftArt.Hex("#26262e"); // combina com o contorno da arte LimeZu
            _cam.transform.position = new Vector3(OfficeMap.W / 2f, OfficeMap.H / 2f, -10);
            if (_cam.GetComponent<AudioListener>() == null)
                _cam.gameObject.AddComponent<AudioListener>(); // sem isso a call fica muda

            // Pixel Perfect: escala por inteiro para arte de 16px (corrige a proporção).
            // ref 320x180 = base 16:9 canônica pra PPU 16; o zoom mexe nessa referência (LocalPlayer).
            var ppc = _cam.gameObject.AddComponent<PixelPerfectCamera>();
            ppc.assetsPPU = 16;
            ppc.refResolutionX = 320;
            ppc.refResolutionY = 180;
            ppc.upscaleRT = false;      // sem letterbox; snapping mantém pixels alinhados
            ppc.pixelSnapping = true;
        }

        private async Task StartGameAsync(int userId)
        {
            Api.UserId = userId;

            var desks = await Api.GetAsync("/api/desks") as JArray;
            var mapRoot = new GameObject("Map").transform;
            OfficeMap.Build(mapRoot, desks);
            _avatarRoot = new GameObject("Avatars").transform;

            _av = gameObject.AddComponent<AvManager>();
            _av.Hud = _hud;
            _hud.OnAvMic = () => _av.ToggleMic();
            _hud.OnAvCam = () => _av.ToggleCam();
            _hud.OnAvScreen = () => _av.ToggleScreen();

            _hub = new MiniSignalR();
            RegisterHandlers();
            try
            {
                await _hub.ConnectAsync(Api.BaseUrl + "/hub/office");
            }
            catch (Exception e)
            {
                _hud.Toast("Falha ao conectar no hub: " + e.Message, Color.red);
                return;
            }
            await _hub.InvokeAsync("Join", userId);

            _hud.BuildGameUi();
            _panels = gameObject.AddComponent<Ui.WorkPanels>();
            _panels.Hud = _hud;
            _hud.OnTimerStop = () => _ = StopTimerAsync();
            await RefreshMeAsync();
        }

        private void RegisterHandlers()
        {
            _hub.On("Snapshot", args =>
            {
                foreach (var v in _avatars.Values) Destroy(v.gameObject);
                _avatars.Clear();
                _me = null;
                foreach (var p in (JArray)args[0]) AddPlayer((JObject)p);
            });

            _hub.On("PlayerJoined", args => AddPlayer((JObject)args[0]));

            _hub.On("PlayerMoved", args =>
            {
                var m = (JObject)args[0];
                if (_avatars.TryGetValue((string)m["key"], out var v) && v != _me)
                {
                    v.TargetSu = new Vector2((float)m["x"], (float)m["y"]);
                    v.Dir = (string)m["dir"] ?? "down";
                }
            });

            _hub.On("PlayerLeft", args =>
            {
                var key = (string)args[0];
                if (_avatars.TryGetValue(key, out var v))
                {
                    Destroy(v.gameObject);
                    _avatars.Remove(key);
                }
            });

            _hub.On("Chat", args =>
            {
                var m = (JObject)args[0];
                if (_avatars.TryGetValue((string)m["key"], out var v)) v.Say((string)m["text"]);
                _hud.AddChatLine((string)m["name"], (string)m["text"]);
            });

            _hub.On("Zone", args =>
            {
                var m = (JObject)args[0];
                if (_avatars.TryGetValue((string)m["key"], out var v)) v.Zone = (string)m["zone"] ?? "";
            });

            _hub.On("Status", args =>
            {
                var m = (JObject)args[0];
                var uid = (int)m["userId"];
                var status = (string)m["status"] ?? "";
                foreach (var v in _avatars.Values)
                    if (v.UserId == uid) v.SetStatus(status);
                if (_me != null && uid == _me.UserId)
                {
                    _hud.SetMyStatus(AvatarView.Sanitize(status));
                    _ = RefreshMeAsync();
                }
            });

            _hub.On("Skin", args =>
            {
                var m = (JObject)args[0];
                var uid = (int)m["userId"];
                foreach (var v in _avatars.Values)
                    if (v.UserId == uid) v.ApplySkin(v.ColorHex, (string)m["skinData"]);
            });

            _hub.On("Headset", args =>
            {
                var m = (JObject)args[0];
                if (_avatars.TryGetValue((string)m["key"], out var v))
                {
                    v.HasHeadset = (bool)m["hasHeadset"];
                    if (v == _me) _localPlayer?.RefreshHeadsetUi();
                }
                RefreshOnlineList();
            });

            _hub.On("ActiveTask", args => { _ = RefreshMeAsync(); });

            _hub.On("Notify", args =>
            {
                var n = (JObject)args[0];
                _hud.Toast((string)n["message"]);
                if ((bool?)n["leveledUp"] == true)
                    _hud.Toast($"LEVEL UP! Você chegou ao nível {(int)n["level"]}!", SoftArt.Hex("#f5c518"));
                var drop = n["drop"];
                if (drop != null && drop.Type != JTokenType.Null)
                    _hud.Toast($"DROP {(string)drop["rarity"]}: {(string)drop["name"]}", RarityColor((string)drop["rarity"]));
                _ = RefreshMeAsync();
            });

            // dispara em thread de fundo — só marca a flag, o toast sai no Update
            _hub.Closed += () => _connectionLost = true;
        }

        private void AddPlayer(JObject p)
        {
            var key = (string)p["key"];
            if (string.IsNullOrEmpty(key) || _avatars.ContainsKey(key)) return;
            var isMe = key == _hub.ConnectionId;
            var v = AvatarView.Create(_avatarRoot, p, isMe);
            _avatars[key] = v;
            if (isMe)
            {
                _me = v;
                _localPlayer = v.gameObject.AddComponent<LocalPlayer>();
                _localPlayer.View = v;
                _localPlayer.Hub = _hub;
                _localPlayer.Hud = _hud;
                _localPlayer.Cam = _cam;
                _localPlayer.Av = _av;
                _localPlayer.DeskTile = _myDesk;
                _localPlayer.KanbanTile = _myKanban;
                _localPlayer.OnKanban = () => _ = OpenKanbanAsync();
                _hud.OnHeadsetClick = () => _localPlayer.ToggleHeadset();
                _hud.SetMyStatus(v.StatusLabel);
                _localPlayer.RefreshHeadsetUi();
            }
        }

        private Ui.WorkPanels _panels;

        private async Task OpenKanbanAsync()
        {
            if (_panels != null) await _panels.OpenActiveTaskPickerAsync();
        }

        private async Task RefreshMeAsync()
        {
            var me = await Api.GetAsync("/api/me");
            if (me == null) return;
            var li = me["levelInfo"];
            _hud.SetMe((string)me["user"]["name"], (string)me["user"]["color"],
                (int)li["level"], (int)li["xp"], (int)li["levelFloor"], (int)li["nextLevelXp"]);

            // mesa/kanban do dev
            var desk = me["desk"];
            if (desk != null && desk.Type != JTokenType.Null)
            {
                _myDesk = new Vector2Int((int)desk["deskX"], (int)desk["deskY"]);
                _myKanban = new Vector2Int((int)desk["kanbanX"], (int)desk["kanbanY"]);
                if (_localPlayer != null) { _localPlayer.DeskTile = _myDesk; _localPlayer.KanbanTile = _myKanban; }
            }

            // task ativa (o timer da mesa conta nela)
            var at = me["activeTask"];
            _hud.SetActiveTask(at != null && at.Type != JTokenType.Null ? (string)at["code"] : null,
                at != null && at.Type != JTokenType.Null ? (string)at["title"] : null);

            var timer = me["activeTimer"];
            if (timer == null || timer.Type == JTokenType.Null)
            {
                _hud.SetActiveTimer(null, null);
            }
            else
            {
                var wi = timer["workItem"];
                var label = wi != null && wi.Type != JTokenType.Null
                    ? (string)wi["code"]
                    : (string)timer["category"] == "reuniao" ? "Reuniao" : "Timer";
                var start = DateTime.Parse((string)timer["startUtc"], null,
                    System.Globalization.DateTimeStyles.AdjustToUniversal);
                _hud.SetActiveTimer(label, start);
            }
        }

        private async Task StopTimerAsync()
        {
            await Api.PostAsync("/api/timer/stop");
            await RefreshMeAsync();
        }

        private static Color RarityColor(string rarity)
        {
            switch (rarity)
            {
                case "Legendary": return SoftArt.Hex("#f5c518");
                case "Epic": return SoftArt.Hex("#a855f7");
                case "Rare": return SoftArt.Hex("#3b82f6");
                default: return SoftArt.Hex("#9ca3af");
            }
        }

        private void Update()
        {
            _hub?.Pump();
            foreach (var v in _avatars.Values) v.Tick(Time.deltaTime);

            _onlineTimer += Time.deltaTime;
            if (_onlineTimer > 1f)
            {
                _onlineTimer = 0;
                RefreshOnlineList();
            }

            if (_connectionLost)
            {
                _connectionLost = false;
                _hud.Toast("Conexão com o servidor caiu — reabra o jogo", Color.red);
            }
        }

        private void RefreshOnlineList()
        {
            var seen = new HashSet<int>();
            var lines = new List<string>();
            foreach (var v in _avatars.Values)
            {
                if (!seen.Add(v.UserId)) continue;
                var marker = v.HasHeadset ? " (fone)" : v.Zone == "meeting" ? " (reuniao)" : v.Zone == "coffee" ? " (cafe)" : "";
                var status = string.IsNullOrEmpty(v.StatusLabel) ? "" : $" — {v.StatusLabel}";
                lines.Add($"{(v.IsBot ? "[bot] " : "")}{v.PlayerName}{status}{marker}");
            }
            _hud.SetOnline(lines);
        }

        private void OnDestroy() => _hub?.Close();
    }
}
