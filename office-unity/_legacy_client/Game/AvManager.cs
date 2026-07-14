using System.Collections;
using System.Collections.Generic;
using LiveKit;
using LiveKit.Proto;              // TrackPublishOptions, TrackSource, encodings
using OfficeQuest.Net;
using UnityEngine;
using Room = LiveKit.Room;        // LiveKit.Proto também define Room e RoomOptions
using RoomOptions = LiveKit.RoomOptions;
using AudioSource = UnityEngine.AudioSource;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Call de áudio/vídeo da reunião via LiveKit.
    /// Entra/sai automaticamente conforme a participação na reunião (sala ou fone).
    /// Mic = microfone real; Câmera = webcam; Tela = captura da janela do jogo.
    /// </summary>
    public class AvManager : MonoBehaviour
    {
        public Ui.Hud Hud;

        private Room _room;
        private bool _wanted;
        private bool _connecting;

        // publicações locais
        private LocalAudioTrack _micTrack;
        private MicrophoneSource _micSource;
        private GameObject _micObject;
        private LocalVideoTrack _camTrack;
        private TextureVideoSource _camSource;
        private WebCamTexture _webcam;
        private LocalVideoTrack _screenTrack;
        private ScreenVideoSource _screenSource;

        public bool MicOn { get; private set; }
        public bool CamOn { get; private set; }
        public bool ScreenOn { get; private set; }
        public bool Connected => _room != null && !_connecting;

        private readonly List<GameObject> _audioObjects = new List<GameObject>();

        public void SetMembership(bool inMeeting)
        {
            if (_wanted == inMeeting) return;
            _wanted = inMeeting;
            if (inMeeting) StartCoroutine(JoinCo());
            else StartCoroutine(LeaveCo());
        }

        // ---------- conexão ----------
        private IEnumerator JoinCo()
        {
            if (_room != null || _connecting) yield break;
            _connecting = true;
            Hud?.UpdateAvBar(true, connecting: true, MicOn, CamOn, ScreenOn);

            var tokenTask = Api.PostAsync("/api/av/token");
            while (!tokenTask.IsCompleted) yield return null;
            var info = tokenTask.Result;
            if (info == null)
            {
                Hud?.Toast("Call: backend recusou o token (esta na reuniao?)");
                _connecting = false;
                Hud?.UpdateAvBar(false, false, false, false, false);
                yield break;
            }

            _room = new Room();
            _room.TrackSubscribed += OnTrackSubscribed;
            _room.TrackUnsubscribed += OnTrackUnsubscribed;
            _room.ParticipantDisconnected += OnParticipantDisconnected;

            var connect = _room.Connect((string)info["url"], (string)info["token"], new RoomOptions());
            yield return connect;

            _connecting = false;
            if (connect.IsError)
            {
                Hud?.Toast("Call: falha ao conectar no LiveKit (servidor esta rodando?)");
                CleanupRoom();
                yield break;
            }
            Hud?.Toast("Conectado a call da reuniao — ligue o mic na barra");
            Hud?.UpdateAvBar(true, false, MicOn, CamOn, ScreenOn);
        }

        private IEnumerator LeaveCo()
        {
            _wanted = false;
            if (MicOn) yield return StopMicCo();
            if (CamOn) yield return StopCamCo();
            if (ScreenOn) yield return StopScreenCo();
            CleanupRoom();
            yield break;
        }

        private void CleanupRoom()
        {
            try { _room?.Disconnect(); } catch { /* encerrando */ }
            _room = null;
            foreach (var go in _audioObjects) if (go != null) Destroy(go);
            _audioObjects.Clear();
            Hud?.ClearAvTiles();
            Hud?.UpdateAvBar(false, false, false, false, false);
        }

        private void OnDestroy() => CleanupRoom();

        // ---------- publicações ----------
        public void ToggleMic() { if (Connected) StartCoroutine(MicOn ? StopMicCo() : StartMicCo()); }
        public void ToggleCam() { if (Connected) StartCoroutine(CamOn ? StopCamCo() : StartCamCo()); }
        public void ToggleScreen() { if (Connected) StartCoroutine(ScreenOn ? StopScreenCo() : StartScreenCo()); }

        private IEnumerator StartMicCo()
        {
            if (Microphone.devices.Length == 0)
            {
                Hud?.Toast("Nenhum microfone encontrado");
                yield break;
            }
            _micObject = new GameObject("lk-mic");
            _micObject.transform.SetParent(transform, false);
            _micSource = new MicrophoneSource(Microphone.devices[0], _micObject);
            _micTrack = LocalAudioTrack.CreateAudioTrack("mic", _micSource, _room);

            var options = new TrackPublishOptions
            {
                AudioEncoding = new AudioEncoding { MaxBitrate = 64000 },
                Source = TrackSource.SourceMicrophone,
            };
            var publish = _room.LocalParticipant.PublishTrack(_micTrack, options);
            yield return publish;
            if (publish.IsError)
            {
                Hud?.Toast("Falha ao publicar o microfone");
                yield break;
            }
            _micSource.Start();
            MicOn = true;
            Hud?.UpdateAvBar(true, false, MicOn, CamOn, ScreenOn);
        }

        private IEnumerator StopMicCo()
        {
            if (_micTrack != null)
            {
                var unpublish = _room.LocalParticipant.UnpublishTrack(_micTrack, true);
                yield return unpublish;
            }
            _micSource?.Stop();
            if (_micObject != null) Destroy(_micObject);
            _micTrack = null; _micSource = null; _micObject = null;
            MicOn = false;
            Hud?.UpdateAvBar(true, false, MicOn, CamOn, ScreenOn);
        }

        private IEnumerator StartCamCo()
        {
            if (WebCamTexture.devices.Length == 0)
            {
                Hud?.Toast("Nenhuma camera encontrada");
                yield break;
            }
            _webcam = new WebCamTexture(640, 480, 24);
            _webcam.Play();
            // espera a webcam realmente iniciar
            var waited = 0f;
            while (_webcam.width <= 16 && waited < 3f) { waited += Time.deltaTime; yield return null; }

            _camSource = new TextureVideoSource(_webcam);
            _camTrack = LocalVideoTrack.CreateVideoTrack("camera", _camSource, _room);
            var options = new TrackPublishOptions
            {
                VideoCodec = VideoCodec.Vp8,
                VideoEncoding = new VideoEncoding { MaxBitrate = 512000, MaxFramerate = 24 },
                Simulcast = true,
                Source = TrackSource.SourceCamera,
            };
            var publish = _room.LocalParticipant.PublishTrack(_camTrack, options);
            yield return publish;
            if (publish.IsError)
            {
                Hud?.Toast("Falha ao publicar a camera");
                _webcam.Stop();
                yield break;
            }
            _camSource.Start();
            StartCoroutine(_camSource.Update());
            CamOn = true;
            Hud?.SetAvTile("local-cam", "Voce", _webcam);
            Hud?.UpdateAvBar(true, false, MicOn, CamOn, ScreenOn);
        }

        private IEnumerator StopCamCo()
        {
            if (_camTrack != null)
            {
                var unpublish = _room.LocalParticipant.UnpublishTrack(_camTrack, true);
                yield return unpublish;
            }
            _camSource?.Stop();
            if (_webcam != null) { _webcam.Stop(); _webcam = null; }
            _camTrack = null; _camSource = null;
            CamOn = false;
            Hud?.RemoveAvTile("local-cam");
            Hud?.UpdateAvBar(true, false, MicOn, CamOn, ScreenOn);
        }

        private IEnumerator StartScreenCo()
        {
            _screenSource = new ScreenVideoSource();
            _screenTrack = LocalVideoTrack.CreateVideoTrack("screen", _screenSource, _room);
            var options = new TrackPublishOptions
            {
                VideoCodec = VideoCodec.Vp8,
                VideoEncoding = new VideoEncoding { MaxBitrate = 1_200_000, MaxFramerate = 15 },
                Source = TrackSource.SourceScreenshare,
            };
            var publish = _room.LocalParticipant.PublishTrack(_screenTrack, options);
            yield return publish;
            if (publish.IsError)
            {
                Hud?.Toast("Falha ao compartilhar a tela");
                yield break;
            }
            _screenSource.Start();
            StartCoroutine(_screenSource.Update());
            ScreenOn = true;
            Hud?.UpdateAvBar(true, false, MicOn, CamOn, ScreenOn);
        }

        private IEnumerator StopScreenCo()
        {
            if (_screenTrack != null)
            {
                var unpublish = _room.LocalParticipant.UnpublishTrack(_screenTrack, true);
                yield return unpublish;
            }
            _screenSource?.Stop();
            _screenTrack = null; _screenSource = null;
            ScreenOn = false;
            Hud?.UpdateAvBar(true, false, MicOn, CamOn, ScreenOn);
        }

        // ---------- mídia remota ----------
        private void OnTrackSubscribed(IRemoteTrack track, RemoteTrackPublication publication, RemoteParticipant participant)
        {
            if (track is RemoteVideoTrack videoTrack)
            {
                var id = $"{participant.Sid}-{publication.Sid}";
                var label = AvatarView.Sanitize(participant.Name ?? participant.Identity);
                if (publication.Source == TrackSource.SourceScreenshare) label += " (tela)";
                var stream = new VideoStream(videoTrack);
                stream.TextureReceived += tex => Hud?.SetAvTile(id, label, tex);
                StartCoroutine(stream.Update());
            }
            else if (track is RemoteAudioTrack audioTrack)
            {
                var audObject = new GameObject($"lk-audio-{audioTrack.Sid}");
                audObject.transform.SetParent(transform, false);
                var source = audObject.AddComponent<AudioSource>();
                var stream = new AudioStream(audioTrack, source);
                _audioObjects.Add(audObject);
            }
        }

        private void OnTrackUnsubscribed(IRemoteTrack track, RemoteTrackPublication publication, RemoteParticipant participant)
        {
            Hud?.RemoveAvTile($"{participant.Sid}-{publication.Sid}");
        }

        private void OnParticipantDisconnected(Participant participant)
        {
            Hud?.RemoveAvTilesByPrefix(participant.Sid);
        }
    }
}
