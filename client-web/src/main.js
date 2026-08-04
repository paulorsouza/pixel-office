// Office Quest — runtime de cenas Phaser orientado a dados.
import { furnitureSeat, renderScene, updateAutomaticDoors } from './MapRenderer.js';
import {
  createEquipmentMenu,
  createEquipmentVisual,
  movementProfile,
  prepareEquipmentCatalog,
  riderAnimationSpec,
} from './EquipmentSystem.js';
import {
  createCharacterCustomizer,
  createCharacterVisual,
  preloadCharacterAssets,
} from './CharacterSystem.js';
import {
  createRoomDecorationEditor,
  preloadRoomDecorationAssets,
  roomAtPoint,
  voiceZoneAtPoint,
} from './RoomDecorationSystem.js';
import { preloadMechanics } from './mechanics/index.js';
import { createFloorPicker } from './FloorPicker.js';
import {
  CAMPUS_SCENE,
  PERSONAL_WING_SCENE,
  personalWingIndex,
  resolveSceneTarget,
} from './FloorNavigation.js';
import { createHudShell } from './hud/HudShell.js';
import { createDock } from './hud/Dock.js';
import { createTimeDock } from './hud/TimeDock.js';
import { auth } from './auth.js';
import { renderHelp } from './hud/HelpSheet.js';
import { createMainMenu } from './hud/MainMenu.js';
import { createGearSections } from './hud/GearSections.js';
import { createWorkSections } from './hud/WorkSections.js';
import { createKeyboardGuard } from './hud/KeyboardGuard.js';
import { createDevMapSync } from './DevMapSync.js';
import { loadTiledSceneMaps } from './TiledRuntimeLoader.js';
import { createGameItemsClient } from './GameItemsSystem.js';
import { createFurnitureInteractionSystem } from './FurnitureInteractionSystem.js';
import { createNavigationSystem } from './NavigationSystem.js';
import { createClickToMove } from './ClickToMove.js';
import { createTouchControls } from './TouchControls.js';
import { createPresence } from './PresenceSystem.js';
import { createCardGamePanel, CARD_SECTIONS } from './cardgame/CardGamePanel.js';
import { createArrangeDicePanel } from './casino/ArrangeDicePanel.js';
import { createNerdSlotsPanel } from './casino/NerdSlotsPanel.js';
import { createBlackjackPanel } from './casino/BlackjackPanel.js';
import { createPokemonCasinoTablePanel } from './casino/PokemonCasinoTablePanel.js';
import { createProximityVoice } from './ProximityVoice.js';
import { createMeetingHeadsets } from './MeetingHeadset.js';
import { ensureSession } from './LoginScreen.js';
import {
  createCoffeeLifecycle,
  updateCoffeeLifecycle,
} from './CoffeeLifecycle.js';

const DIR = { right: 0, up: 6, left: 12, down: 18 };

const worldAssetPath = (asset) => `assets/world/${asset}.png`;

async function fetchJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Não foi possível carregar ${path}`);
  return response.json();
}

function showBootstrapMapError(error) {
  const root = document.createElement('div');
  root.id = 'map-load-error';
  root.innerHTML = '<strong>Não foi possível abrir o mapa do Tiled</strong><span></span>';
  root.querySelector('span').textContent = error?.message || String(error);
  document.body.append(root);
}

// Portaria: sem sessão, o mundo nem carrega (em dev, ?userId= passa direto).
await ensureSession();

const manifest = await fetchJson('maps/scenes.json');
const animatedAssets = await fetchJson('assets/animations/catalog.json');
// `prepare` resolve os presets de piloto uma vez; quem lê o catálogo depois
// (RemoteAvatar, prévia de veículo) já encontra `riderDirections` pronto.
const equipmentCatalog = prepareEquipmentCatalog(await fetchJson('assets/equipment/catalog.json'));
const characterCatalog = await fetchJson('assets/character/catalog.json');
const furnitureCatalog = await fetchJson('assets/furniture/catalog.json');
const cardGameCatalog = await fetchJson('assets/cardgame/catalog.json');
const cardGameTypeChart = await fetchJson('assets/cardgame/type-chart.json');
const gameItems = createGameItemsClient();
await gameItems.initialize();
const presence = createPresence({
  userId: gameItems.userId,
  catalogs: { character: characterCatalog, equipment: equipmentCatalog },
});
await presence.initialize();
// a porta automática de uma sala: chave derivada, registrada no render
const roomDoorKey = (roomId) => (window.__scene?.automaticDoors || [])
  .find((door) => door.key.startsWith(`door:${roomId}:`))?.key || null;

// alterna um claim: se é meu, solto; se está livre, pego; se é de outro, avisa
async function toggleClaim(entityId, kind, takenMessage) {
  if (!entityId) return;
  const current = presence.claimOf(entityId);
  if (current?.mine) { presence.releaseEntity(entityId); return; }
  if (current) { proximityVoice.toast(takenMessage(current.name)); return; }
  if (!(await presence.claimEntity(entityId, kind))) {
    proximityVoice.toast('Alguém chegou primeiro');
  }
}

// "Soltar o fone" pelo HUD precisa devolver o fone ao suporte na cena atual
const proximityVoice = createProximityVoice({
  presence,
  // notify=true: além de devolver o fone ao suporte, avisa o backend (encerra a reunião)
  onReleaseHeadset: () => window.__scene?.headsets?.releaseAll(true),
  // trava da porta e reserva da sala: estado efêmero com dono, vindo do hub
  roomState: (roomId) => ({
    locked: roomId ? presence.claimOf(roomDoorKey(roomId)) : null,
    reserved: roomId ? presence.claimOf(`room:${roomId}`) : null,
  }),
  onToggleLock: (roomId) => toggleClaim(
    roomDoorKey(roomId), 'door-lock', (name) => `A porta foi trancada por ${name}`,
  ),
  onToggleReserve: (roomId) => toggleClaim(
    roomId && `room:${roomId}`, 'room', (name) => `A sala está reservada por ${name}`,
  ),
});
await proximityVoice.initialize();
// O menu nasce mais abaixo (depende do chassi da HUD), mas o cardgame precisa
// falar com ele: mandar para o Baralho quando faltam cartas, sair da frente
// quando a partida começa. A referência é preenchida na seção da HUD.
let mainMenu = null;
const cardGame = createCardGamePanel({
  presence,
  catalog: cardGameCatalog,
  typeChart: cardGameTypeChart,
  gameItems,
  onToast: (message) => proximityVoice.toast(message),
  openMenu: (section) => mainMenu?.open(section),
  closeMenu: () => mainMenu?.close(),
  isMenuOpen: () => Boolean(mainMenu?.isOpen()),
});
// Conta assumida por outra janela: solta o microfone junto com a presença, senão
// esta aba continuaria falando na call de um avatar que já saiu do mundo.
presence.events.addEventListener('session-ended', () => { proximityVoice.shutdown(); });
const vehicleEquipment = equipmentCatalog.items.filter((item) => item.slot === 'vehicle');
let sceneMaps;
try {
  sceneMaps = await loadTiledSceneMaps(manifest);
} catch (error) {
  showBootstrapMapError(error);
  throw error;
}
const PLAYER_HOME_SCENE = 'player-home-shell';
const personalDirectory = gameItems.personalRooms();

function sceneTemplateId(sceneRef) {
  return String(sceneRef || '').split('@', 1)[0];
}

function playerHomeId(sceneRef) {
  const [template, homeId] = String(sceneRef || '').split('@');
  return template === PLAYER_HOME_SCENE && /^house-\d{2}$/.test(homeId || '') ? homeId : null;
}

// O prédio nasce com dois andares de salas pessoais; o backend só acrescenta quando lota.
const MIN_PERSONAL_FLOORS = 2;
const personalFloorCount = () => Math.max(
  MIN_PERSONAL_FLOORS,
  personalDirectory?.wingCount || 0,
);
const floorPicker = createFloorPicker(personalFloorCount);

function sceneExists(sceneRef) {
  const template = sceneTemplateId(sceneRef);
  if (!sceneMaps[template]) return false;
  const wing = personalWingIndex(sceneRef);
  return wing == null || wing < personalFloorCount();
}

function materializeScene(sceneRef) {
  const template = sceneTemplateId(sceneRef);
  const map = JSON.parse(JSON.stringify(sceneMaps[template]));
  if (!map) throw new Error(`Cena desconhecida: ${sceneRef}`);
  const homeId = playerHomeId(sceneRef);
  if (homeId) {
    map.id = sceneRef;
    map.name = `Casa ${Number(homeId.slice(-2))}`;
    map.subtitle = 'Interior vazio · futura casa comprável';
    map.portals = (map.portals || []).map((portal) => (
      portal.id === 'return-home'
        ? { ...portal, targetSpawn: `${homeId}-exit` }
        : portal
    ));
    return map;
  }
  const wing = personalWingIndex(sceneRef);
  if (wing == null) return map;

  const assignments = new Map((personalDirectory?.rooms || [])
    .filter((room) => room.wingIndex === wing)
    .map((room) => [room.slotIndex, room]));
  map.id = sceneRef;
  // O térreo é o campus, então o primeiro andar de salas é o 1º andar.
  map.name = `${wing + 1}º andar`;
  map.subtitle = 'Salas públicas do time · entre, visite e converse';
  map.rooms = (map.rooms || []).map((room) => {
    // Poço do elevador não é slot de ninguém: sem isto ele vira uma "Sala disponível".
    if (room.slotIndex == null) return room;
    const assignment = assignments.get(room.slotIndex);
    if (!assignment) return {
      ...room,
      id: `vacant-${wing}-${room.slotIndex}`,
      name: 'Sala disponível',
      decoratable: false,
      vacant: true,
    };
    return {
      ...room,
      id: assignment.roomKey,
      name: `Sala de ${assignment.owner.name}`,
      ownerId: assignment.owner.id,
      ownerColor: assignment.owner.color,
      decoratable: assignment.mine,
      vacant: false,
    };
  });
  map.portals = (map.portals || []).filter((portal) => {
    if (!portal.wingDelta) return true;
    const targetWing = wing + portal.wingDelta;
    return targetWing >= 0 && targetWing < personalFloorCount();
  });
  return map;
}
// Espelhos no módulo do que a cena cria: a HUD é global e as cenas vão e voltam,
// então o dock e o registro de painéis apontam para cá, não para a cena.
let roomDecorationEditor = null;
let furnitureInteractions = null;
let decorateRoom = null;   // sala decorável sob o avatar, ou null
// O loadout é do servidor: este menu lê e escreve pela API, não guarda estado próprio.
const equipmentMenu = createEquipmentMenu(equipmentCatalog, {
  isBlocked: () => roomDecorationEditor?.isOpen() || false,
  loadEquipment: () => gameItems.equipment(),
  setSlot: (slot, instanceId) => gameItems.setEquipmentSlot(slot, instanceId),
  openLootbox: (instanceId) => gameItems.openLootbox(instanceId),
  onToast: (message) => proximityVoice.toast(message),
});
for (const event of ['inventory', 'EquipmentChanged']) {
  gameItems.events.addEventListener(event, () => equipmentMenu.refresh());
}
// porta trancada é estado com dono (a automática, não): o claim vem do hub
const doorLock = (doorKey) => Boolean(doorKey && presence.claimOf(doorKey));

// aparência publicada na presença: camadas do personagem + veículo em uso.
// `onChange` dispara já na construção do customizer, então a seleção vem por parâmetro
// (o const ainda está na zona morta neste ponto).
let activeVehicleId = null;
const publishAppearance = (selection) => presence.setAppearance({
  character: selection || characterCustomizer.getSelection(),
  vehicle: activeVehicleId,
});
const characterCustomizer = createCharacterCustomizer(characterCatalog, {
  onChange: (selection) => publishAppearance(selection),
});
const query = new URLSearchParams(location.search);
const requestedScene = query.get('scene') || location.hash.replace(/^#/, '');
const initialScene = sceneExists(requestedScene) ? requestedScene : manifest.startScene;
const initialSpawn = query.get('spawn') || 'default';
const equipmentPreview = vehicleEquipment.find(
  (item) => item.id === query.get('equipmentPreview'),
) || null;
const requestedEquipmentDirection = query.get('equipmentDirection');
const interactionPreview = query.get('interactionPreview');
const equipmentPreviewDirection = Object.hasOwn(DIR, requestedEquipmentDirection)
  ? requestedEquipmentDirection
  : null;
createDevMapSync(() => window.__scene?.currentSceneId);

// ---------------------------------------------------------------- HUD
// O dock é a única porta de entrada dos menus: antes cada um trazia o próprio
// botão fixo ("Meu menu" no topo direito, "Decorar sala" logo abaixo) e a tira
// de teclas ocupava o rodapé para dizer sempre a mesma coisa.
//
// A voz NÃO entra aqui de propósito: a barra da reunião já é permanente e é o
// único lugar que conhece o estado do call — um segundo controle divergiria.
const hud = createHudShell();
// Dono único do teclado da cena: campo de texto em foco devolve as letras ao
// navegador, painel aberto congela o mundo. Ver o comentário do módulo.
const keyboardGuard = createKeyboardGuard({
  getKeyboard: () => window.__scene?.input?.keyboard ?? null,
  isBlocked: () => Boolean(window.__scene?.uiIsBlocking?.()),
});
const arrangeDicePanel = createArrangeDicePanel({
  gameItems,
  hud,
  onToast: (message) => proximityVoice.toast(message),
});
const nerdSlotsPanel = createNerdSlotsPanel({
  gameItems,
  hud,
  onToast: (message) => proximityVoice.toast(message),
});
const blackjackPanel = createBlackjackPanel({
  gameItems,
  hud,
  onToast: (message) => proximityVoice.toast(message),
});
const pokemonCasinoPanel = createPokemonCasinoTablePanel({
  gameItems,
  hud,
  catalog: cardGameCatalog,
  typeChart: cardGameTypeChart,
  onToast: (message) => proximityVoice.toast(message),
});
// ---------------------------------------------------------------- o menu
// Uma janela só, com a identidade do cardgame. Cada área registra a SUA seção:
// este arquivo não sabe desenhar álbum, quadro nem inventário.
mainMenu = createMainMenu(hud);
createGearSections({ menu: mainMenu, equipmentMenu, characterCustomizer });
const workSections = createWorkSections({
  menu: mainMenu,
  gameItems,
  onToast: (message) => proximityVoice.toast(message),
});
for (const section of CARD_SECTIONS) {
  mainMenu.register({
    ...section,
    group: 'cards',
    render: (host, api) => cardGame.renderSection(section.id, host, api),
  });
}
// Decorar é AÇÃO, não tela: entra na lista só onde faz sentido, fecha o menu e
// devolve a pessoa ao mundo com o editor aberto.
mainMenu.register({
  id: 'decorate',
  group: 'world',
  icon: '✦',
  label: 'Decorar a sala',
  visible: () => Boolean(decorateRoom),
  render: (_host, api) => { api.close(); roomDecorationEditor?.open(); },
});
mainMenu.register({
  id: 'help',
  group: 'world',
  icon: '?',
  label: 'Como jogar',
  render: (host, api) => renderHelp(host, api.setHeader),
});

// O dock virou UM botão: "menus no canto" foi exatamente a reclamação. O que
// existe é uma porta; tudo o que dá para abrir está atrás dela.
//
// A exceção é "Decorar": não é uma TELA que se abre de qualquer lugar, é uma
// ação presa a um lugar — só existe em pé dentro da sua sala. Escondida atrás
// do menu ela não se anuncia (ninguém abre o menu para descobrir que ali dentro
// apareceu um item novo). Contextual no dock, ela some sozinha ao sair da sala,
// então não volta a ser "menu no canto".
const dock = createDock(hud, [
  {
    id: 'menu',
    icon: '☰',
    label: 'Menu',
    hint: 'Personagem, itens, trabalho e cartas',
    onSelect: () => mainMenu.toggle('character'),
  },
  {
    id: 'decorate',
    icon: '✦',
    label: 'Decorar',
    hint: 'Mover e guardar os móveis desta sala',
    visible: () => Boolean(decorateRoom),
    onSelect: () => { mainMenu.close(); roomDecorationEditor?.open(); },
  },
]);

// Quem bloqueia o mundo se registra; `uiIsBlocking()` só pergunta.
// Tab abre e fecha o menu; Esc fecha. Era o `EquipmentSystem` quem tomava conta
// do Tab, de volta quando ele ainda tinha janela própria — com dois donos, a
// tecla abria uma tela e fechava outra no mesmo toque.
window.addEventListener('keydown', (event) => {
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
    || document.activeElement?.isContentEditable;
  if (editing || event.repeat) return;
  if (event.code === 'Tab') {
    event.preventDefault();
    // Painel de móvel, editor de decoração e mesa de jogo estão na frente: o
    // menu não passa por cima deles.
    if (!mainMenu.isOpen() && window.__scene?.uiIsBlocking?.()) return;
    mainMenu.toggle('character');
  } else if (event.code === 'Escape' && mainMenu.isOpen()) {
    event.preventDefault();
    mainMenu.close();
  }
});

// Card fixo de horas (canto superior esquerdo). Lê as MESMAS rotas do painel de
// Horas e recarrega por evento do hub; tocar nele abre a seção certa do menu.
const timeDock = createTimeDock({
  apiBase: gameItems.apiBase,
  token: () => auth.token(),
  userId: gameItems.userId,
  events: gameItems.events,
  onOpenHours: () => mainMenu.open('hours'),
  onToast: (message) => proximityVoice.toast(message),
});
window.__timeDock = timeDock;

hud.register({ id: 'cardgame', isOpen: () => cardGame.isBlocking() });
hud.register({ id: 'floor-picker', isOpen: () => floorPicker.isOpen() });
hud.register({ id: 'decoration', isOpen: () => Boolean(roomDecorationEditor?.isOpen()) });
hud.register({ id: 'furniture', isOpen: () => Boolean(furnitureInteractions?.isOpen()) });

function loadImageOnce(scene, key, path) {
  if (!scene.textures.exists(key)) scene.load.image(key, path);
}

function updateSceneHud(map) {
  document.querySelector('#scene-name').textContent = map.name;
  document.querySelector('#scene-subtitle').textContent = map.subtitle || '';
}

function showPortalPrompt(portal) {
  const prompt = document.querySelector('#portal-prompt');
  prompt.classList.toggle('on', Boolean(portal));
  prompt.querySelector('span').textContent = portal?.label || '';
}

class MapScene extends Phaser.Scene {
  constructor() {
    super('map-runtime');
  }

  init(data = {}) {
    this.currentSceneId = data.sceneId || initialScene;
    this.currentSceneTemplateId = sceneTemplateId(this.currentSceneId);
    this.spawnId = data.spawnId || initialSpawn;
    // O Tiled fornece a estrutura/base; móveis do jogador chegam separadamente pela API.
    this.map = materializeScene(this.currentSceneId);
  }

  preload() {
    preloadCharacterAssets(this, characterCatalog);
    preloadRoomDecorationAssets(this, furnitureCatalog);
    preloadMechanics(this, this.map);
    if (!this.textures.exists('tiles')) {
      this.load.spritesheet('tiles', 'assets/tiles/room_builder.png', {
        frameWidth: 16,
        frameHeight: 16,
      });
    }
    if (!this.textures.exists('adam_run')) {
      this.load.spritesheet('adam_run', 'assets/chars/Adam_run.png', {
        frameWidth: 16,
        frameHeight: 32,
      });
    }
    if (!this.textures.exists('adam_idle')) {
      this.load.spritesheet('adam_idle', 'assets/chars/Adam_idle_anim.png', {
        frameWidth: 16,
        frameHeight: 32,
      });
    }
    if (!this.textures.exists('adam_sit')) {
      const seatedRider = vehicleEquipment.find((item) => item.riderSheet === 'adam_sit');
      this.load.spritesheet('adam_sit', 'assets/chars/Adam_sit.png', {
        frameWidth: seatedRider?.riderFrameWidth || 32,
        frameHeight: 32,
      });
    }

    for (const floor of ['wood', 'carpet', 'cream', 'sage', 'water']) {
      loadImageOnce(this, `floor_${floor}`, `assets/floors/floor_${floor}.png`);
    }
    loadImageOnce(this, 'grass', worldAssetPath('grass'));
    // fone de reunião: vem de map.rooms, não de objeto do Tiled, então não
    // entra em map.assets e precisa ser pedido aqui
    if ((this.map.rooms || []).some((room) => room.meeting || room.id === 'meeting')) {
      loadImageOnce(this, 'headset_wall', worldAssetPath('headset_wall'));
      loadImageOnce(this, 'headset_wall_empty', worldAssetPath('headset_wall_empty'));
    }
    // xícara de café: item de mão, não é mobília, então também não está em map.assets
    if (!this.textures.exists('coffee_cup')) {
      const cup = animatedAssets.coffee_cup;
      this.load.spritesheet('coffee_cup', cup.path, {
        frameWidth: cup.frameWidth,
        frameHeight: cup.frameHeight,
      });
    }

    const directTiledKeys = new Set();
    for (const descriptor of (this.map.tiledTextures || [])) {
      if (
        descriptor.key === 'tiles'
        || descriptor.key === 'office_door'
        || animatedAssets[descriptor.key]
      ) continue;
      if (this.textures.exists(descriptor.key)) {
        directTiledKeys.add(descriptor.key);
        continue;
      }
      if (descriptor.type === 'spritesheet') {
        this.load.spritesheet(descriptor.key, descriptor.url, {
          frameWidth: descriptor.frameWidth,
          frameHeight: descriptor.frameHeight,
          margin: descriptor.margin || 0,
          spacing: descriptor.spacing || 0,
        });
      } else {
        this.load.image(descriptor.key, descriptor.url);
      }
      directTiledKeys.add(descriptor.key);
    }

    for (const asset of (this.map.assets || [])) {
      if (directTiledKeys.has(asset)) continue;
      const animated = animatedAssets[asset];
      if (animated) {
        if (!this.textures.exists(asset)) {
          this.load.spritesheet(asset, animated.path, {
            frameWidth: animated.frameWidth,
            frameHeight: animated.frameHeight,
          });
        }
        continue;
      }
      if (asset === 'office_door') {
        if (!this.textures.exists(asset)) {
          this.load.spritesheet(asset, worldAssetPath(asset), {
            frameWidth: 48,
            frameHeight: 32,
          });
        }
        continue;
      }
      const path = asset.startsWith('of_')
        ? `assets/furniture/office/${asset}.png`
        : worldAssetPath(asset);
      loadImageOnce(this, asset, path);
    }
  }

  create() {
    const tile = this.map.tile || 16;
    updateSceneHud(this.map);
    showPortalPrompt(null);
    // Preserva a query: sem `location.search` aqui, trocar de cena apagava
    // ?dev=1, ?userId=, ?api= e ?touch= da URL, e um refresh caía no login.
    history.replaceState(null, '', `${location.pathname}${location.search}#${this.currentSceneId}`);

    const hasOutdoorArea = this.map.kind === 'world' || Boolean(this.map.yard);
    this.cameras.main.setBackgroundColor(
      this.map.background || (hasOutdoorArea ? '#5c8f3e' : '#20222c'),
    );
    this.solids = this.physics.add.staticGroup();
    this.animatedAssets = animatedAssets;
    // a xícara não vem de map.assets, então a animação dela é criada à parte
    for (const asset of ['coffee_cup', ...(this.map.assets || [])]) {
      const animated = animatedAssets[asset];
      if (!animated || this.anims.exists(animated.animation)) continue;
      this.anims.create({
        key: animated.animation,
        frames: this.anims.generateFrameNumbers(asset, {
          start: animated.start,
          end: animated.end,
        }),
        frameRate: animated.frameRate,
        repeat: animated.repeat,
      });
    }
    const { spawns, portals, mechanics } = renderScene(this, this.map, this.solids, {
      arrangeDicePanel,
      nerdSlotsPanel,
      blackjackPanel,
      pokemonCasinoPanel,
      presence,
      onToast: (message) => proximityVoice.toast(message),
    });
    this.portals = portals;
    this.mechanicsRuntime = mechanics;

    const spawn = spawns[this.spawnId] || spawns.default || Object.values(spawns)[0];
    this.player = this.physics.add.sprite(
      spawn.x * tile + tile / 2,
      spawn.y * tile,
      'adam_idle',
      DIR.down,
    );
    this.player.body.setSize(10, 8).setOffset(3, 22);
    this.playerBodyOffsetX = 3;
    this.setPlayerBodyFrameWidth = (frameWidth) => {
      const offsetX = Math.round((frameWidth - 10) / 2);
      if (offsetX === this.playerBodyOffsetX) return;
      this.player.body.setSize(10, 8).setOffset(offsetX, 22);
      this.playerBodyOffsetX = offsetX;
    };
    this.physics.add.collider(this.player, this.solids);
    this.characterVisual = createCharacterVisual(
      this,
      characterCatalog,
      characterCustomizer,
      this.player,
    );

    if (query.get('debug') === 'collisions') {
      this.physics.world.createDebugGraphic();
      this.physics.world.drawDebug = true;
    }

    const createAnimation = (key, sheet, start, end, frameRate) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(sheet, { start, end }),
        frameRate,
        repeat: -1,
      });
    };
    for (const [direction, start] of Object.entries(DIR)) {
      createAnimation(`run-${direction}`, 'adam_run', start, start + 5, 12);
      createAnimation(`idle-${direction}`, 'adam_idle', start, start + 5, 5);
      for (const equipment of vehicleEquipment) {
        const animationSpec = riderAnimationSpec(equipment, direction, start);
        createAnimation(
          `equipment-${equipment.id}-${direction}`,
          animationSpec.sheet,
          animationSpec.start,
          animationSpec.end,
          animationSpec.frameRate,
        );
      }
    }

    this.moveKeys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.headsetKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.equipmentVisual = createEquipmentVisual(this);
    this.handleInteract = async () => {
      if (this.seated) { this.standUp(); return; }   // E sentado = levantar
      if (this.furnitureInteractions && await this.furnitureInteractions.interact()) return;
      if (this.mechanicsRuntime && await this.mechanicsRuntime.interact(this.player)) return;
      if (
        this.activePortal
        && !this.transitioning
        && !this.roomDecorationEditor?.isOpen()
        && this.time.now >= this.interactionUnlockAt
      ) {
        this.changeScene(this.activePortal);
      }
    };
    // F é só do fone: separado do E para não disputar com portal, móvel e assento
    this.handleHeadset = () => { this.headsets?.interact(); };
    this.interactKey.on('down', this.handleInteract);
    this.headsetKey.on('down', this.handleHeadset);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.interactKey.off('down', this.handleInteract);
      this.headsetKey.off('down', this.handleHeadset);
    });
    this.lastDirection = equipmentPreviewDirection || 'down';
    this.activePortal = null;
    this.transitioning = false;
    this.interactionUnlockAt = this.time.now + 450;

    const camera = this.cameras.main;
    const cameraBounds = this.map.camera?.bounds || {
      x: 0,
      y: 0,
      w: this.map.w,
      h: this.map.h,
    };
    const cameraBoundsPx = {
      x: cameraBounds.x * tile,
      y: cameraBounds.y * tile,
      w: cameraBounds.w * tile,
      h: cameraBounds.h * tile,
    };
    camera.setBounds(
      cameraBoundsPx.x,
      cameraBoundsPx.y,
      cameraBoundsPx.w,
      cameraBoundsPx.h,
    );
    camera.startFollow(this.player, true, 0.12, 0.12);
    this.zoom = this.map.camera?.zoom || 2.2;
    this.applyCameraZoom = (requestedZoom) => {
      const overviewZoom = Math.min(
        this.scale.gameSize.width / cameraBoundsPx.w,
        this.scale.gameSize.height / cameraBoundsPx.h,
      );
      const minZoom = Math.max(this.map.camera?.minZoom || 0.75, overviewZoom);
      const maxZoom = Math.max(this.map.camera?.maxZoom || 4, minZoom);
      this.zoom = Phaser.Math.Clamp(requestedZoom, minZoom, maxZoom);
      camera.setZoom(this.zoom);
      const visibleWidth = this.scale.gameSize.width / this.zoom;
      const visibleHeight = this.scale.gameSize.height / this.zoom;
      const horizontalMargin = Math.max(0, (visibleWidth - cameraBoundsPx.w) / 2);
      const verticalMargin = Math.max(0, (visibleHeight - cameraBoundsPx.h) / 2);
      camera.setBounds(
        cameraBoundsPx.x - horizontalMargin,
        cameraBoundsPx.y - verticalMargin,
        cameraBoundsPx.w + horizontalMargin * 2,
        cameraBoundsPx.h + verticalMargin * 2,
      );
    };
    this.applyCameraZoom(this.zoom);
    camera.roundPixels = true;
    camera.fadeIn(220, 20, 22, 30);

    this.input.on('wheel', (_pointer, _objects, _dx, dy) => {
      this.applyCameraZoom(this.zoom - dy * 0.0015);
    });

    this.handleResize = () => this.applyCameraZoom(this.zoom);
    this.scale.on('resize', this.handleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.handleResize);
    });

    this.roomDecorationEditor = createRoomDecorationEditor(
      this,
      this.map,
      furnitureCatalog,
      equipmentMenu,
      gameItems,
    );
    roomDecorationEditor = this.roomDecorationEditor;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (roomDecorationEditor === this.roomDecorationEditor) roomDecorationEditor = null;
    });
    const debugRoom = query.get('decorateRoom');
    if (debugRoom) this.roomDecorationEditor.open(debugRoom);

    this.seated = null;
    this.coffee = null;
    this.activeWorkSession = null;
    this.furnitureInteractions = createFurnitureInteractionSystem(
      this,
      this.map,
      gameItems,
      equipmentMenu,
      {
        onSeat: (record) => this.sitOn(record),
        onCoffee: () => this.takeCoffee(),
        onWorkStarted: (session) => { this.activeWorkSession = session; },
        onWorkStopped: () => { this.activeWorkSession = null; },
        onWorkStatus: (message) => proximityVoice.toast(message),
        onBlockingChange: () => keyboardGuard.refresh(),
        // Quadro e relógio de ponto do cenário abrem a seção do menu: a UI de
        // trabalho existe uma vez só, e agora mora lá.
        openMenu: (section) => mainMenu.open(section),
        activeTaskId: this.activeTaskId,
        onActiveTaskChange: (item) => { this.activeTaskId = item?.id ?? null; },
        onTimerChange: () => { this.activeWorkSession = null; },
        onReward: (reward) => {
          if (reward?.xp || reward?.gold) {
            proximityVoice.toast(`+${reward.xp ?? 0} XP · +${reward.gold ?? 0} 🪙`);
          }
        },
      },
    );
    furnitureInteractions = this.furnitureInteractions;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (furnitureInteractions === this.furnitureInteractions) furnitureInteractions = null;
    });

    // Recompensas e objetivos chegam pelo hub e valem mesmo com o painel fechado.
    gameItems.events.addEventListener('RewardGranted', (event) => {
      const { message } = event.detail ?? {};
      if (message) proximityVoice.toast(message);
    });
    gameItems.events.addEventListener('ObjectiveCompleted', (event) => {
      const completions = event.detail ?? [];
      this.furnitureInteractions.celebrate(completions);
      workSections.celebrate(completions);
      for (const c of completions) proximityVoice.toast(`${c.icon} Objetivo: ${c.name} · +${c.gold} 🪙`);
    });
    this.interactionPreviewPending = interactionPreview;

    // Movimento por destino (clique no desktop, toque no celular). A grade sai dos
    // mesmos retângulos de `this.solids` que a física usa, então nunca diverge.
    this.navigation = createNavigationSystem(this, this.map);
    // Um predicado só para "tem painel na frente": clique, pinça e botão de ação
    // precisam concordar. A lista não mora mais aqui — cada painel se registra no
    // chassi da HUD, senão o próximo painel novo fica de fora como quase ficou o
    // cardgame. O que sobra é o que não é painel: transição e xadrez da cena.
    this.uiIsBlocking = () => (
      this.transitioning
      || this.chessOpen
      || hud.isBlocking()
    );
    this.clickToMove = createClickToMove(this, this.navigation, {
      isBlocked: this.uiIsBlocking,
      // Tocar sentado levanta e caminha; sem isto o comando parecia ignorado.
      onBeforeMove: () => { if (this.seated) this.standUp(); },
      onTap: (pointer) => cardGame.handleWorldTap(pointer),
      onUnreachable: () => proximityVoice.toast('Não dá para chegar aí'),
    });

    // Botão de ação e pinça. Os handlers são os MESMOS do teclado: confirmar no
    // celular e apertar E no desktop passam pelo mesmo caminho.
    this.touchControls = createTouchControls(this, {
      isBlocked: this.uiIsBlocking,
      onAction: () => this.handleInteract(),
      onHeadset: () => this.handleHeadset(),
      onZoom: (factor) => this.applyCameraZoom(this.zoom * factor),
    });

    window.__scene = this;
    // A cena reinicia a cada troca de mapa e o KeyboardPlugin é outro: o guarda
    // precisa reaplicar o estado no plugin novo.
    keyboardGuard.reset();
    window.__equipment = equipmentMenu;
    window.__mainMenu = mainMenu;
    window.__character = characterCustomizer;
    window.__decoration = this.roomDecorationEditor;
    window.__gameItems = gameItems;
    window.__furnitureInteractions = this.furnitureInteractions;
    window.__presence = presence;
    window.__cardGame = cardGame;

    // presença em rede: avatares remotos nesta cena + voz por proximidade
    presence.attach(this, this.currentSceneId, this.player);
    proximityVoice.attachScene(this.currentSceneId);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => presence.detach());

    // fone das salas de reunião: pegar fixa o call daquela sala até soltar
    // o backend também conhece o fone: é ele que mantém o lançamento de horas da
    // reunião aberto enquanto a pessoa circula fora da sala (PickUpHeadset/DropHeadset)
    this.headsets = createMeetingHeadsets(this, this.map, {
      onGrab: (meetingRoom) => {
        proximityVoice.pinToRoom(this.currentSceneId, meetingRoom);
        presence.pickUpHeadset();
      },
      onRelease: () => {
        proximityVoice.releasePin();
        presence.dropHeadset();
      },
    });
    // sair da cena segurando o fone também encerra a reunião no backend
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.headsets?.hasHeld()) presence.dropHeadset();
      this.standUp();   // o servidor também libera no SetScene, mas o local precisa limpar
    });

    // sala de reunião: entrar dispara o lançamento de horas (SetZone no backend)
    // marca-se com id "meeting" ou a flag extraJson meeting:true numa sala existente
    const meetingRoom = (this.map.rooms || []).find((room) => room.meeting || room.id === 'meeting');
    this.meetingRect = meetingRoom
      ? { x: meetingRoom.x * tile, y: meetingRoom.y * tile, w: meetingRoom.w * tile, h: meetingRoom.h * tile }
      : null;
  }

  update(time, delta) {
    this.mechanicsRuntime.update(time, delta);
    // Rede de segurança do teclado: os eventos de foco cobrem o caso normal, mas
    // um painel que abre/fecha sozinho (recompensa, convite de duelo) não passa
    // por foco nenhum. Comparação de dois booleanos por frame.
    keyboardGuard.refresh();
    // A entrada de decoração é um item do menu: some quando a sala sob o avatar
    // não é decorável. `refresh` só redesenha quando a lista visível muda.
    //
    // O único motivo de "não dá para decorar agora" é o avatar não estar parado
    // numa sala — ou seja, transição de cena. Painel aberto NÃO entra aqui: a
    // única porta para o editor é o menu, e `equipmentMenu.isOpen()` passou a
    // significar "a seção Itens está na tela", que é exatamente o estado em que
    // o menu está aberto. Com ele na conta, a entrada "Decorar a sala" era
    // apagada no mesmo quadro em que o menu abria — ela nunca aparecia.
    decorateRoom = this.roomDecorationEditor.updateAvailability(
      this.player,
      this.transitioning,
    );
    dock.refresh();
    mainMenu.refresh();
    this.activeFurniturePrompt = this.furnitureInteractions.update(
      this.player,
      this.transitioning || equipmentMenu.isOpen() || this.roomDecorationEditor.isOpen(),
    );
    this.activeMechanicPrompt = this.mechanicsRuntime.activeInteraction(this.player);
    if (this.interactionPreviewPending && this.furnitureInteractions.openForType(this.interactionPreviewPending)) {
      this.roomDecorationEditor.close();
      this.interactionPreviewPending = null;
    }
    if (this.uiIsBlocking()) {
      showPortalPrompt(null);
      this.touchControls.update({ blocked: true });
      this.player.body.setVelocity(0, 0);
      this.player.anims.play(`idle-${this.lastDirection}`, true);
      this.setPlayerBodyFrameWidth(16);
      this.characterVisual.update(
        this.seated?.dir || this.lastDirection,
        this.seated ? (this.seated.pose || 'sit') : 'idle',
        !this.seated,
        this.time.now,
        this.seated?.depth,
      );
      this.equipmentVisual.hide();
      this.activeHeadsetPrompt = this.headsets.update(this.player, true);
      presence.updateLocal(this.player.x, this.player.y, this.lastDirection);
      presence.interpolate(delta);
      // portas continuam reagindo com menu aberto: quem abre pode ser outro avatar
      updateAutomaticDoors(this, this.doorOccupants(), doorLock);
      proximityVoice.update();
      this.syncMeetingZone();
      this.syncVoiceChannel();
      this.updateCoffee();
      return;
    }

    const keys = this.moveKeys;
    // sentado: qualquer tecla de movimento levanta; enquanto isso o avatar fica na cadeira
    if (this.seated) {
      const wantsToMove = ['A', 'D', 'W', 'S', 'LEFT', 'RIGHT', 'UP', 'DOWN']
        .some((key) => keys[key]?.isDown);
      if (wantsToMove) this.standUp();
    }
    if (this.seated) {
      showPortalPrompt(null);
      this.touchControls.update({ seated: true });
      this.player.body.setVelocity(0, 0);
      this.player.setPosition(this.seated.x, this.seated.y);
      this.setPlayerBodyFrameWidth(16);
      this.characterVisual.update(
        this.seated.dir, this.seated.pose || 'sit', false, this.time.now, this.seated.depth,
      );
      this.equipmentVisual.hide();
      presence.updateLocal(this.player.x, this.player.y, this.seated.dir);
      presence.interpolate(delta);
      updateAutomaticDoors(this, this.doorOccupants(), doorLock);
      proximityVoice.update();
      this.syncMeetingZone();
      this.syncVoiceChannel();
      this.updateCoffee();
      return;
    }
    const profile = movementProfile(
      equipmentCatalog,
      equipmentPreview?.id || equipmentMenu.getEquippedId(),
      this.shiftKey.isDown || Boolean(equipmentPreview),
    );
    const speed = profile.speed;
    // veículo entra/sai (Shift): republica a aparência para os outros verem a troca
    const vehicleNow = profile.active ? profile.equipment.id : null;
    if (vehicleNow !== activeVehicleId) {
      activeVehicleId = vehicleNow;
      publishAppearance();
    }
    let vx = 0;
    let vy = 0;
    if (keys.A.isDown || keys.LEFT.isDown) vx = -speed;
    else if (keys.D.isDown || keys.RIGHT.isDown) vx = speed;
    if (keys.W.isDown || keys.UP.isDown) vy = -speed;
    else if (keys.S.isDown || keys.DOWN.isDown) vy = speed;

    // Teclado manda: qualquer tecla cancela o destino do clique. Assim o desktop
    // continua idêntico ao que era — o caminho do teclado não passa por nada novo.
    if (vx || vy) {
      this.navigation.cancel();
    } else {
      const routed = this.navigation.step(this.player.body, speed);
      if (routed) { vx = routed.vx; vy = routed.vy; }
    }

    this.player.body.setVelocity(vx, vy);
    if (vx && vy) this.player.body.velocity.normalize().scale(speed);

    let direction = this.lastDirection;
    if (vx < 0) direction = 'left';
    else if (vx > 0) direction = 'right';
    else if (vy < 0) direction = 'up';
    else if (vy > 0) direction = 'down';
    const moving = Boolean(vx || vy);
    const animation = profile.active
      ? `equipment-${profile.equipment.id}-${direction}`
      : `${moving ? 'run' : 'idle'}-${direction}`;
    this.player.anims.play(animation, true);
    const riderFrameWidth = profile.active
      ? riderAnimationSpec(profile.equipment, direction, DIR[direction]).frameWidth
      : 16;
    this.setPlayerBodyFrameWidth(riderFrameWidth);
    this.lastDirection = direction;
    this.player.setDepth(this.player.body.bottom);
    const characterPose = profile.active
      ? (profile.equipment.id === 'motorcycle' ? 'sit' : 'idle')
      : (moving ? 'walk' : 'idle');
    this.characterVisual.update(direction, characterPose, moving || profile.active, this.time.now);
    this.equipmentVisual.update(
      this.player,
      profile.equipment,
      direction,
      profile.active,
      moving,
      this.time.now,
    );
    updateAutomaticDoors(this, this.doorOccupants(), doorLock);
    this.updatePortalInteraction();
    this.activeHeadsetPrompt = this.headsets.update(
      this.player,
      this.transitioning || equipmentMenu.isOpen() || this.roomDecorationEditor.isOpen(),
    );
    const prompt = this.activeFurniturePrompt || this.activeMechanicPrompt
      || this.activeHeadsetPrompt || this.activePortal;
    showPortalPrompt(prompt);
    // Mesma prioridade da HUD; o 'kind' diz se o botao dispara E ou F.
    this.touchControls.update({
      prompt,
      kind: (!this.activeFurniturePrompt && !this.activeMechanicPrompt && this.activeHeadsetPrompt)
        ? 'headset' : 'action',
    });
    presence.updateLocal(this.player.x, this.player.y, direction);
    presence.interpolate(delta);
    proximityVoice.update();
    this.syncMeetingZone();
    this.syncVoiceChannel();
    this.updateCoffee();
  }

  updatePortalInteraction() {
    const tile = this.map.tile || 16;
    const footX = this.player.body.center.x / tile;
    const footY = this.player.body.bottom / tile;
    const portal = this.portals.find((candidate) => (
      footX >= candidate.x
      && footX <= candidate.x + candidate.w
      && footY >= candidate.y
      && footY <= candidate.y + candidate.h
    )) || null;

    if (portal?.id !== this.activePortal?.id) {
      this.activePortal = portal;
    }

  }

  syncMeetingZone() {
    const r = this.meetingRect;
    const inside = !!r && this.player.x >= r.x && this.player.x <= r.x + r.w
      && this.player.y >= r.y && this.player.y <= r.y + r.h;
    presence.setZone(inside ? 'meeting' : '');
  }

  // ---- assento: a cadeira vira estado com dono, então ninguém senta em cima de ninguém ----
  async sitOn(record) {
    if (this.seated || !record?.item) return false;
    // móvel do cenário não tem placement no backend; a posição no mapa é estável
    // e igual em todos os clientes, então serve de chave do claim
    const entityId = record.item.placementId
      ? `furniture:${record.item.placementId}`
      : `scenery:${record.item.id}@${record.item.x},${record.item.y}`;
    // Onde o avatar encosta: a âncora do móvel é o centro-inferior do quadro, mas o
    // assento desenhado fica acima dela (e nas peças de 32 px, meio tile à esquerda).
    // `furnitureSeat` resolve as duas origens do encaixe — cenário do Tiled e peça
    // do catálogo — e já aplica o espelhamento da cadeira girada no editor.
    const tile = this.map.tile || 16;
    const seat = furnitureSeat(record.item);
    const dir = seat.dir;
    const anchor = {
      x: Math.round(record.display.x + seat.x * tile),
      y: Math.round(record.display.y + seat.y * tile),
      dir,
      // pose: `sit` só tem lateral boa; a estação usa idle de costas (trabalhando)
      pose: seat.pose,
      // desenhar o avatar acima do móvel em que senta
      depth: record.display.depth + 1,
    };
    if (!(await presence.claimEntity(entityId, 'seat', anchor))) {
      const who = presence.claimOf(entityId)?.name;
      proximityVoice.toast(who ? `${who} já está nessa cadeira` : 'Essa cadeira está ocupada');
      return false;
    }
    this.seated = { entityId, ...anchor };
    this.player.body.setVelocity(0, 0);
    this.player.setPosition(anchor.x, anchor.y);
    this.lastDirection = dir;
    this.showSeatCover(record);
    return true;
  }

  // A estação é mesa + cadeira num quadro só: mesmo desenhando o avatar acima dela,
  // ele fica por cima da cadeira inteira (parece em pé nela). `seatCover` redesenha
  // a faixa de baixo do móvel (a cadeira) na frente do avatar, então as pernas
  // ficam encaixadas no assento. É a única forma de "aninhar" o avatar num sprite
  // composto sem fatiar a arte.
  showSeatCover(record) {
    const cover = furnitureSeat(record.item).cover;
    if (!cover) return;
    const src = record.display;
    const frameH = src.frame?.realHeight ?? src.height;
    const frameW = src.frame?.realWidth ?? src.width;
    this.seatCover = this.add.image(src.x, src.y, src.texture.key, src.frame?.name)
      .setOrigin(src.originX, src.originY)
      .setFlipX(src.flipX)
      .setDepth(this.seated.depth + 0.5)
      .setCrop(0, frameH - cover, frameW, cover);
  }

  hideSeatCover() {
    this.seatCover?.destroy();
    this.seatCover = null;
  }

  standUp() {
    if (!this.seated) return;
    presence.releaseEntity(this.seated.entityId);
    this.seated = null;
    this.hideSeatCover();
    if (this.activeWorkSession) {
      this.activeWorkSession = null;
      gameItems.stopWork().catch(() => {
        proximityVoice.toast('Não foi possível encerrar o contador de horas');
      });
    }
  }

  // ---- café: tira na bancada, carrega, e bebe sentado ----
  takeCoffee() {
    if (this.coffee) { proximityVoice.toast('Você já está com um café'); return; }
    const sprite = this.add.sprite(this.player.x, this.player.y, 'coffee_cup')
      .setOrigin(0.5, 1);
    if (this.anims.exists('coffee-cup-steam')) sprite.play('coffee-cup-steam');
    this.coffee = {
      sprite,
      ...createCoffeeLifecycle(this.time.now),
    };
    proximityVoice.toast('Café na mão — sente para tomar (a xícara some ao terminar)');
  }

  dropCoffee() {
    this.coffee?.sprite.destroy();
    this.coffee = null;
  }

  updateCoffee() {
    const cafe = this.coffee;
    if (!cafe) return;
    const sentado = Boolean(this.seated);
    const base = this.player.body.bottom;
    // sentado a xícara fica no colo; em pé, ao lado do corpo
    const dx = sentado ? 0 : (this.lastDirection === 'left' ? -7 : 7);
    cafe.sprite.setPosition(this.player.x + dx, base + (sentado ? -7 : -3));
    cafe.sprite.setDepth(base + 1);
    const lifecycle = updateCoffeeLifecycle(cafe, this.time.now, sentado);
    if (lifecycle) {
      this.dropCoffee();
      proximityVoice.toast(lifecycle === 'finished'
        ? 'Café tomado'
        : 'O café esfriou e a xícara foi guardada');
      return;
    }
  }

  // sensores das portas veem TODOS os avatares da cena, não só o local
  doorOccupants() {
    const occupants = [{ x: this.player.body.center.x, y: this.player.body.center.y }];
    for (const peer of presence.peersInScene()) occupants.push({ x: peer.x, y: peer.y });
    return occupants;
  }

  // Cada sala fechada tem seu próprio call. Áreas abertas ou um prédio inteiro também
  // podem declarar `voice` no mapa; corredor e quintal continuam sem canal.
  syncVoiceChannel() {
    const tile = this.map.tile || 16;
    const x = this.player.body.center.x / tile;
    const y = this.player.body.center.y / tile;
    const area = roomAtPoint(this.map, x, y) || voiceZoneAtPoint(this.map, x, y);
    proximityVoice.updateLocation(area ? { id: area.id, name: area.name || area.id } : null);
  }

  // O elevador não tem destino fixo: pergunta o andar e só então troca de cena.
  async chooseFloorAndGo(portal) {
    if (this.transitioning || floorPicker.isOpen()) return;
    const currentWing = personalWingIndex(this.currentSceneId);
    const choice = await floorPicker.open(currentWing);
    if (!choice) return;
    this.changeScene({
      ...portal,
      chooseFloor: false,
      floorDelta: 0,
      targetScene: choice.floor == null ? CAMPUS_SCENE : PERSONAL_WING_SCENE,
      targetWing: choice.floor ?? 0,
      targetSpawn: 'from-elevator',
    });
  }

  changeScene(portal) {
    if (portal.chooseFloor) { this.chooseFloorAndGo(portal); return; }
    const targetScene = resolveSceneTarget(portal, this.currentSceneId);
    const floorDelta = Number(portal.floorDelta || 0);
    if (this.transitioning || this.roomDecorationEditor?.isOpen()) return;
    if (!sceneExists(targetScene)) {
      // Escada do último andar: sem aviso, apertar `E` parece bug em vez de "não existe".
      if (floorDelta > 0) proximityVoice.toast('O prédio termina aqui — não há andar acima');
      return;
    }
    this.transitioning = true;
    showPortalPrompt(null);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.restart({
        sceneId: targetScene,
        spawnId: portal.targetSpawn || 'default',
      });
    });
    this.cameras.main.fadeOut(220, 20, 22, 30);
  }
}

window.__phaserGame = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
  // Toque explícito: por padrão o Phaser liga o touch por detecção de recurso, e
  // num navegador sem toque ele nem registra os listeners. Deixar declarado evita
  // depender dessa detecção. activePointers > 1 é o que permite pinça depois.
  input: { mouse: true, touch: true, activePointers: 3 },
  pixelArt: true,
  backgroundColor: '#20222c',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [MapScene],
});
