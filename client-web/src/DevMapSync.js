// Feedback do pipeline Tiled durante desenvolvimento local.

function createStatus() {
  const root = document.createElement('div');
  root.id = 'map-sync-status';
  root.hidden = true;
  root.innerHTML = '<strong></strong><span></span><button type="button" aria-label="Fechar aviso">×</button>';
  document.body.append(root);
  root.querySelector('button').onclick = () => { root.hidden = true; };
  return root;
}

function show(root, tone, title, message = '') {
  root.dataset.tone = tone;
  root.querySelector('strong').textContent = title;
  root.querySelector('span').textContent = message;
  root.hidden = false;
}

export function createDevMapSync(getSceneId) {
  if (!['localhost', '127.0.0.1'].includes(location.hostname) || !window.EventSource) return null;
  const status = createStatus();
  const events = new EventSource('/__office-quest/events');
  let reloadTimer = null;

  events.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'ready') return;
    if (payload.type === 'map-syncing') {
      show(status, 'syncing', 'Salvando mapa…', payload.sceneId);
      return;
    }
    if (payload.type === 'map-error') {
      clearTimeout(reloadTimer);
      show(status, 'error', `Erro no mapa ${payload.sceneId}`, payload.message);
      return;
    }
    if (payload.type === 'map-updated') {
      show(status, 'saved', 'Mapa atualizado', payload.sceneId);
      if (payload.sceneId !== '*' && getSceneId() !== payload.sceneId) {
        reloadTimer = setTimeout(() => { status.hidden = true; }, 3500);
        return;
      }
      reloadTimer = setTimeout(() => location.reload(), 180);
    }
  };

  return {
    close() {
      clearTimeout(reloadTimer);
      events.close();
      status.remove();
    },
  };
}
