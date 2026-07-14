using OfficeQuest.Net;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Input e regras do jogador local: movimento com colisão, sentar (E),
    /// emotes (1-4), zonas (reunião/café) e câmera com zoom.
    /// Posições em "server units" (28 por tile), iguais às do protótipo web.
    /// </summary>
    public class LocalPlayer : MonoBehaviour
    {
        public AvatarView View;
        public MiniSignalR Hub;
        public Ui.Hud Hud;
        public Camera Cam;
        public AvManager Av;
        public Vector2Int DeskTile = new Vector2Int(-1, -1);   // mesa do dev (assento)
        public Vector2Int KanbanTile = new Vector2Int(-1, -1); // quadro kanban da sala
        public System.Action OnKanban;                          // abre o seletor de task ativa

        private const float Speed = 180f;      // su/s (~ mesmo do web)
        private string _zone = "";
        private float _sendTimer;
        private bool _dirty;
        private Vector2Int _sitTile = new Vector2Int(-1, -1);
        private bool _kanbanHintShown;

        // movimento por mouse (clique-para-andar) + intenção do clique
        private Vector2? _moveTarget;          // destino em server units
        private int _clickIntent;              // 0 = só mover, 1 = sentar, 2 = kanban
        private Vector2Int _clickSit;
        private float _prevDist, _stuckT;

        private void Update()
        {
            if (View == null || Hub == null) return;
            var dt = Time.deltaTime;

            if (Hud == null || !Hud.IsTyping)
            {
                HandleMouseClick();
                var manual = HandleMovement(dt);   // WASD tem prioridade e cancela o destino do mouse
                if (manual) CancelMoveTarget();
                else AutoMove(dt);
                HandleSit();
                HandleEmotes();
                if (Input.GetKeyDown(KeyCode.F)) ToggleHeadset();
            }

            HandleZone();
            HandleKanbanHint();

            _sendTimer += dt;
            if (_sendTimer >= .1f && _dirty)
            {
                _sendTimer = 0;
                _dirty = false;
                _ = Hub.InvokeAsync("Move", View.CurrentSu.x, View.CurrentSu.y, View.Dir);
            }
        }

        private bool HandleMovement(float dt)
        {
            float dx = 0, dy = 0; // dy positivo = para baixo (padrão do servidor/web)
            if (Input.GetKey(KeyCode.W) || Input.GetKey(KeyCode.UpArrow)) dy -= 1;
            if (Input.GetKey(KeyCode.S) || Input.GetKey(KeyCode.DownArrow)) dy += 1;
            if (Input.GetKey(KeyCode.A) || Input.GetKey(KeyCode.LeftArrow)) dx -= 1;
            if (Input.GetKey(KeyCode.D) || Input.GetKey(KeyCode.RightArrow)) dx += 1;

            if (dx == 0 && dy == 0) return false; // sem WASD: o AutoMove cuida de parar/andar

            if (View.Sitting) StandUp(); // levantou ao andar

            var v = new Vector2(dx, dy).normalized * Speed * dt;
            View.Dir = Mathf.Abs(dx) > Mathf.Abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
            View.Moving = true;

            var p = View.CurrentSu;
            if (CanStand(p.x + v.x, p.y)) p.x += v.x;
            if (CanStand(p.x, p.y + v.y)) p.y += v.y;
            View.CurrentSu = p;
            View.TargetSu = p;
            _dirty = true;
            return true;
        }

        private void CancelMoveTarget() { _moveTarget = null; _clickIntent = 0; }

        /// <summary>Clique esquerdo: anda até o ponto; em cadeira senta, no próprio quadro abre o kanban.</summary>
        private void HandleMouseClick()
        {
            if (!Input.GetMouseButtonDown(0)) return;
            if (Hud != null && Hud.PointerOverUi(Input.mousePosition)) return; // clique foi na HUD
            if (Cam == null) return;

            var w = Cam.ScreenToWorldPoint(Input.mousePosition);
            var su = OfficeMap.WorldToSu(new Vector3(w.x, w.y, 0));

            // próprio quadro kanban
            if (KanbanTile.x >= 0)
            {
                var kc = new Vector2(KanbanTile.x * OfficeMap.TileSu + 14, KanbanTile.y * OfficeMap.TileSu + 14);
                if (Vector2.Distance(su, kc) < 34f)
                {
                    _clickIntent = 2; _moveTarget = kc + new Vector2(0, 34);
                    _prevDist = float.MaxValue; _stuckT = 0; return;
                }
            }
            // cadeira (ponto de sentar) mais próxima do clique
            Vector2Int? sit = null; var best = 24f;
            foreach (var sp in OfficeMap.SitSpots)
            {
                var c = new Vector2(sp.x * OfficeMap.TileSu + 14, sp.y * OfficeMap.TileSu + 14);
                var d = Vector2.Distance(su, c);
                if (d < best) { best = d; sit = sp; }
            }
            if (sit != null)
            {
                _clickIntent = 1; _clickSit = sit.Value;
                var sc = new Vector2(sit.Value.x * OfficeMap.TileSu + 14, sit.Value.y * OfficeMap.TileSu + 14);
                _moveTarget = sc + new Vector2(0, 26);
                _prevDist = float.MaxValue; _stuckT = 0; return;
            }
            // chão livre → só andar até lá
            if (View.Sitting) StandUp();
            _clickIntent = 0; _moveTarget = su; _prevDist = float.MaxValue; _stuckT = 0;
        }

        /// <summary>Move o jogador em direção ao destino do clique, com colisão e anti-travamento.</summary>
        private void AutoMove(float dt)
        {
            if (_moveTarget == null) { if (!View.Sitting) View.Moving = false; return; }

            var to = _moveTarget.Value - View.CurrentSu;
            var dist = to.magnitude;
            if (dist < 10f) { ArriveMoveTarget(); return; }

            if (View.Sitting) StandUp();
            var step = to.normalized * Speed * dt;
            View.Dir = Mathf.Abs(step.x) > Mathf.Abs(step.y) ? (step.x > 0 ? "right" : "left") : (step.y > 0 ? "down" : "up");
            View.Moving = true;

            var p = View.CurrentSu; var moved = false;
            if (CanStand(p.x + step.x, p.y)) { p.x += step.x; moved = true; }
            if (CanStand(p.x, p.y + step.y)) { p.y += step.y; moved = true; }
            View.CurrentSu = p; View.TargetSu = p; _dirty = true;

            // se parou de se aproximar (parede no caminho), resolve a intenção e desiste
            if (dist > _prevDist - 0.4f) _stuckT += dt; else _stuckT = 0;
            _prevDist = dist;
            if (!moved || _stuckT > 0.7f) ArriveMoveTarget();
        }

        private void ArriveMoveTarget()
        {
            View.Moving = false;
            var intent = _clickIntent;
            CancelMoveTarget();
            if (intent == 2 && NearKanban()) OnKanban?.Invoke();
            else if (intent == 1)
            {
                var c = new Vector2(_clickSit.x * OfficeMap.TileSu + 14, _clickSit.y * OfficeMap.TileSu + 14);
                if (Vector2.Distance(View.CurrentSu, c) < 44f) SitAtSpot(_clickSit);
            }
        }

        private void SitAtSpot(Vector2Int spot)
        {
            View.CurrentSu = new Vector2(spot.x * OfficeMap.TileSu + 14, spot.y * OfficeMap.TileSu + 18);
            View.TargetSu = View.CurrentSu;
            View.Dir = "sit"; View.Moving = false; _dirty = true;
            _sitTile = spot;
            _ = Hub.InvokeAsync("SitAt", spot.x, spot.y);
        }

        // caixa de colisão nos pés, idêntica à do web (±7 su, 8 su de profundidade)
        private static bool CanStand(float x, float y) =>
            !OfficeMap.IsSolidSu(x - 7, y) && !OfficeMap.IsSolidSu(x + 7, y) &&
            !OfficeMap.IsSolidSu(x - 7, y - 8) && !OfficeMap.IsSolidSu(x + 7, y - 8);

        private void HandleSit()
        {
            if (!Input.GetKeyDown(KeyCode.E)) return;

            // perto do próprio quadro kanban → abre o seletor de task ativa
            if (NearKanban())
            {
                OnKanban?.Invoke();
                return;
            }

            if (View.Sitting)
            {
                // tenta levantar para um lado livre (mesa/cadeira podem bloquear)
                Vector2[] candidates =
                {
                    View.CurrentSu + new Vector2(0, 14),
                    View.CurrentSu + new Vector2(0, -20),
                    View.CurrentSu + new Vector2(20, 0),
                    View.CurrentSu + new Vector2(-20, 0),
                };
                foreach (var c in candidates)
                {
                    if (!CanStand(c.x, c.y)) continue;
                    View.CurrentSu = c;
                    View.TargetSu = c;
                    break;
                }
                StandUp();
                return;
            }

            Vector2Int? best = null;
            var bestDist = 40f; // ~1.4 tiles
            foreach (var spot in OfficeMap.SitSpots)
            {
                var center = new Vector2(spot.x * OfficeMap.TileSu + 14, spot.y * OfficeMap.TileSu + 14);
                var d = Vector2.Distance(View.CurrentSu, center);
                if (d < bestDist) { bestDist = d; best = spot; }
            }
            if (best == null)
            {
                Hud?.Toast("Chegue perto de uma cadeira para sentar (E)");
                return;
            }
            SitAtSpot(best.Value);
        }

        private void StandUp()
        {
            View.Dir = "down";
            View.TargetSu = View.CurrentSu;
            _dirty = true;
            if (_sitTile.x < 0) return;
            _sitTile = new Vector2Int(-1, -1);
            _ = Hub.InvokeAsync("SitAt", -1, -1);
        }

        private bool NearKanban()
        {
            if (KanbanTile.x < 0) return false;
            var c = new Vector2(KanbanTile.x * OfficeMap.TileSu + 14, KanbanTile.y * OfficeMap.TileSu + 14);
            return Vector2.Distance(View.CurrentSu, c) < 48f; // ~1.7 tiles
        }

        private void HandleKanbanHint()
        {
            var near = NearKanban();
            if (near && !_kanbanHintShown)
            {
                _kanbanHintShown = true;
                Hud?.Toast("Aperte E no quadro para escolher sua task ativa");
            }
            else if (!near) _kanbanHintShown = false;
        }

        private void HandleEmotes()
        {
            string emote = null;
            if (Input.GetKeyDown(KeyCode.Alpha1)) emote = ":like:";
            if (Input.GetKeyDown(KeyCode.Alpha2)) emote = ":heart:";
            if (Input.GetKeyDown(KeyCode.Alpha3)) emote = ":laugh:";
            if (Input.GetKeyDown(KeyCode.Alpha4)) emote = ":coffee:";
            if (emote != null) _ = Hub.InvokeAsync("Chat", emote);
        }

        private void HandleZone()
        {
            var zone = OfficeMap.ZoneAtSu(View.CurrentSu.x, View.CurrentSu.y);
            if (zone == _zone) return;
            _zone = zone;
            _ = Hub.InvokeAsync("SetZone", zone);
            RefreshHeadsetUi();
        }

        /// <summary>Pega/solta o fone de reunião (tecla F ou botão da HUD).</summary>
        public void ToggleHeadset()
        {
            if (View.HasHeadset) _ = Hub.InvokeAsync("DropHeadset");
            else if (_zone == "meeting") _ = Hub.InvokeAsync("PickUpHeadset");
            else Hud?.Toast("Os fones ficam na sala de reunião — pegue um lá dentro.");
        }

        /// <summary>Atualiza banner e botão conforme zona + fone (chamado também no evento Headset).</summary>
        public void RefreshHeadsetUi()
        {
            if (Hud == null) return;
            var banner = _zone != "" ? _zone : View.HasHeadset ? "headset" : "";
            Hud.ShowZoneBanner(banner);
            Hud.UpdateHeadsetButton(View.HasHeadset, _zone == "meeting");
            // a call de A/V acompanha a participação na reunião
            Av?.SetMembership(_zone == "meeting" || View.HasHeadset);
        }

        // níveis de zoom pixel-perfect (16:9, altura múltipla de 36 → escala inteira p/ PPU 16)
        private static readonly Vector2Int[] ZoomLevels =
        {
            new Vector2Int(256, 144), new Vector2Int(320, 180), new Vector2Int(384, 216),
            new Vector2Int(448, 252), new Vector2Int(512, 288),
        };
        private int _zoomLevel = 1; // 320x180
        private PixelPerfectCamera _ppc;

        private void LateUpdate()
        {
            if (Cam == null || View == null) return;
            if (_ppc == null) _ppc = Cam.GetComponent<PixelPerfectCamera>();

            // zoom por passos discretos: muda a resolução de referência (mantém pixels quadrados)
            var scroll = Input.GetAxis("Mouse ScrollWheel");
            if (_ppc != null && Mathf.Abs(scroll) > .01f)
            {
                _zoomLevel = Mathf.Clamp(_zoomLevel - (scroll > 0 ? 1 : -1), 0, ZoomLevels.Length - 1);
                _ppc.refResolutionX = ZoomLevels[_zoomLevel].x;
                _ppc.refResolutionY = ZoomLevels[_zoomLevel].y;
            }

            var target = View.transform.position + new Vector3(0, .8f, -10);
            var half = Cam.orthographicSize; // definido pelo PixelPerfectCamera
            var halfW = half * Cam.aspect;
            target.x = Mathf.Clamp(target.x, Mathf.Min(halfW, OfficeMap.W / 2f), Mathf.Max(OfficeMap.W - halfW, OfficeMap.W / 2f));
            target.y = Mathf.Clamp(target.y, Mathf.Min(half, OfficeMap.H / 2f), Mathf.Max(OfficeMap.H - half, OfficeMap.H / 2f));
            Cam.transform.position = Vector3.Lerp(Cam.transform.position, target, 10f * Time.deltaTime);
        }
    }
}
