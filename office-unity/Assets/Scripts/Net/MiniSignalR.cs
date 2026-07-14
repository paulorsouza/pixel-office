using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace OfficeQuest.Net
{
    /// <summary>
    /// Cliente mínimo do protocolo JSON do SignalR sobre WebSocket puro.
    /// Faz o negotiate (para conhecermos nosso connectionId), handshake,
    /// invocações fire-and-forget e ping. Mensagens recebidas são enfileiradas
    /// e despachadas na main thread via Pump() — obrigatório para tocar na API do Unity.
    /// </summary>
    public class MiniSignalR
    {
        private const char RecordSeparator = (char)0x1e;

        private ClientWebSocket _ws;
        private CancellationTokenSource _cts;
        private readonly ConcurrentQueue<(string target, JArray args)> _inbox = new ConcurrentQueue<(string, JArray)>();
        private readonly Dictionary<string, Action<JArray>> _handlers = new Dictionary<string, Action<JArray>>();
        private readonly StringBuilder _partial = new StringBuilder();

        public string ConnectionId { get; private set; }
        public bool Connected => _ws != null && _ws.State == WebSocketState.Open;
        public event Action Closed;

        public void On(string target, Action<JArray> handler) => _handlers[target] = handler;

        /// <param name="httpHubUrl">ex.: http://localhost:5210/hub/office</param>
        public async Task ConnectAsync(string httpHubUrl)
        {
            _cts = new CancellationTokenSource();

            // negotiate para obter connectionId/connectionToken
            using (var http = new HttpClient())
            {
                var res = await http.PostAsync(httpHubUrl + "/negotiate?negotiateVersion=1", new StringContent(""));
                res.EnsureSuccessStatusCode();
                var neg = JObject.Parse(await res.Content.ReadAsStringAsync());
                ConnectionId = (string)neg["connectionId"];
                var token = (string)(neg["connectionToken"] ?? neg["connectionId"]);

                var wsUrl = httpHubUrl.Replace("https://", "wss://").Replace("http://", "ws://")
                    + "?id=" + Uri.EscapeDataString(token);
                _ws = new ClientWebSocket();
                await _ws.ConnectAsync(new Uri(wsUrl), _cts.Token);
            }

            await SendRawAsync("{\"protocol\":\"json\",\"version\":1}");
            _ = Task.Run(ReceiveLoopAsync);
            _ = Task.Run(PingLoopAsync);
        }

        public Task InvokeAsync(string target, params object[] args)
        {
            if (!Connected) return Task.CompletedTask;
            var msg = JsonConvert.SerializeObject(new { type = 1, target, arguments = args });
            return SendRawAsync(msg);
        }

        /// <summary>Despacha na main thread as mensagens recebidas — chamar a cada frame.</summary>
        public void Pump()
        {
            while (_inbox.TryDequeue(out var m))
            {
                if (_handlers.TryGetValue(m.target, out var h))
                {
                    try { h(m.args); }
                    catch (Exception e) { UnityEngine.Debug.LogError($"handler {m.target}: {e}"); }
                }
            }
        }

        public void Close()
        {
            try { _cts?.Cancel(); _ws?.Dispose(); } catch { /* encerrando */ }
            _ws = null;
        }

        private async Task SendRawAsync(string json)
        {
            var bytes = Encoding.UTF8.GetBytes(json + RecordSeparator);
            try
            {
                await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token);
            }
            catch { Closed?.Invoke(); }
        }

        private async Task ReceiveLoopAsync()
        {
            var buffer = new byte[16 * 1024];
            try
            {
                while (_ws != null && _ws.State == WebSocketState.Open)
                {
                    var result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), _cts.Token);
                    if (result.MessageType == WebSocketMessageType.Close) break;
                    _partial.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    if (!result.EndOfMessage) continue;

                    var data = _partial.ToString();
                    _partial.Clear();
                    var frames = data.Split(RecordSeparator);
                    for (var i = 0; i < frames.Length; i++)
                    {
                        var frame = frames[i];
                        if (string.IsNullOrEmpty(frame)) continue;
                        // frame incompleto (sem separador no fim) volta para o buffer
                        if (i == frames.Length - 1 && !data.EndsWith(RecordSeparator.ToString()))
                        {
                            _partial.Append(frame);
                            break;
                        }
                        HandleFrame(frame);
                    }
                }
            }
            catch (Exception) { /* conexão caiu */ }
            Closed?.Invoke();
        }

        private void HandleFrame(string frame)
        {
            var obj = JObject.Parse(frame);
            var type = (int?)obj["type"] ?? 0;
            if (type == 1) // invocation vinda do servidor
            {
                var target = (string)obj["target"];
                var args = (JArray)obj["arguments"] ?? new JArray();
                _inbox.Enqueue((target, args));
            }
            // type 6 = ping (ignorado), type 7 = close, sem type = resposta do handshake
        }

        private async Task PingLoopAsync()
        {
            while (Connected)
            {
                await Task.Delay(15000, _cts.Token).ContinueWith(_ => { });
                if (_cts.IsCancellationRequested) return;
                await SendRawAsync("{\"type\":6}");
            }
        }
    }
}
