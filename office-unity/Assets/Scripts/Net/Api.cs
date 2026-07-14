using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace OfficeQuest.Net
{
    /// <summary>API REST do backend — o "auth" do protótipo é o header X-User-Id.</summary>
    public static class Api
    {
        public static string BaseUrl = "http://localhost:5210";
        public static int UserId;

        public static async Task<JToken> GetAsync(string path)
        {
            using (var req = UnityWebRequest.Get(BaseUrl + path))
            {
                req.SetRequestHeader("X-User-Id", UserId.ToString());
                await req.SendWebRequest().AsTask();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"GET {path}: {req.error}");
                    return null;
                }
                return JToken.Parse(req.downloadHandler.text);
            }
        }

        public static async Task<JToken> PostAsync(string path, string jsonBody = "{}")
        {
            using (var req = new UnityWebRequest(BaseUrl + path, "POST"))
            {
                req.uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(jsonBody));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.SetRequestHeader("X-User-Id", UserId.ToString());
                await req.SendWebRequest().AsTask();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"POST {path}: {req.error}");
                    return null;
                }
                var text = req.downloadHandler.text;
                return string.IsNullOrEmpty(text) ? null : JToken.Parse(text);
            }
        }

        public static async Task<JToken> PatchAsync(string path, string jsonBody)
        {
            using (var req = new UnityWebRequest(BaseUrl + path, "PATCH"))
            {
                req.uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(jsonBody));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.SetRequestHeader("X-User-Id", UserId.ToString());
                await req.SendWebRequest().AsTask();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"PATCH {path}: {req.error}");
                    return null;
                }
                var text = req.downloadHandler.text;
                return string.IsNullOrEmpty(text) ? null : JToken.Parse(text);
            }
        }

        private static Task AsTask(this UnityWebRequestAsyncOperation op)
        {
            var tcs = new TaskCompletionSource<bool>();
            op.completed += _ => tcs.TrySetResult(true);
            if (op.isDone) tcs.TrySetResult(true);
            return tcs.Task;
        }
    }
}
