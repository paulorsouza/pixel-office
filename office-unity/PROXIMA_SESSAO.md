# Próxima sessão — começar por aqui

> **HANDOFF ARQUIVADO.** Não comece por este arquivo; a fonte atual é `../CONTEXT.md`.

Handoff de 2026-07-14. Estamos executando o `virtual-office/PLANO_CLIENTE_V2.md` em modo
"recomeçar do zero". O bloqueio da sessão passada foi o **MCP do Unity**. Este doc destrava.

---

## 1. Consertar o MCP (fazer ANTES de abrir a próxima sessão do Claude)

O problema: cada chamada MCP levava >10s e o bridge (Node) desistia em 10s, fechando o socket
antes do Unity responder (o erro `[MCP Unity] WebSocket error: sending data` que apareceu).

**O que já deixei pronto:** criei `C:\Users\prs\Claude Sessions\ProjectSettings\McpUnitySettings.json`
com `RequestTimeoutSeconds: 60`. O bridge lê isso **ao iniciar** — como ele reinicia junto com a
sessão do Claude, a próxima sessão já vai esperar 60s em vez de 10s. **Você não precisa fazer nada
nesse arquivo.**

**O que VOCÊ precisa fazer para o MCP responder rápido:**

1. **Feche o Unity completamente** (limpa sockets MCP acumulados desta sessão).
2. **Reabra o Unity** no projeto `office-unity` e deixe compilar/importar (a barra de progresso
   sumir). Sem erro no Console = ok.
3. **Confirme o servidor MCP ligado:** `Tools ▸ MCP Unity ▸ Server Window` → deve estar "started"
   na porta 8090. Se não, clique **Start Server**.
4. **Confirme o No Throttling:** `Edit ▸ Preferences ▸ General ▸ Interaction Mode = No Throttling`.
5. **CRÍTICO — mantenha a janela do Unity em foco / na frente** enquanto o Claude trabalha. Não
   minimize nem deixe atrás do Claude. É isso que faz o editor "tickar" e responder rápido ao MCP.
   (Se ainda ficar lento com a janela em foco, o backup é o modo guiado — funciona.)

**Ao iniciar a próxima sessão do Claude:** abra a sessão a partir da pasta
`C:\Users\prs\Claude Sessions` (pra o bridge pegar a config de 60s). A primeira coisa que o Claude
vai fazer é testar o MCP com uma chamada leve. Se responder (mesmo que em 10–20s), estamos livres.

---

## 2. Estado atual do projeto (o que já foi feito)

- **Fase 0 — FEITA e verificada limpa** (log sem erro de compilação). Cliente antigo arquivado
  (movido, reversível) em `office-unity/_legacy_client_v2/Assets/`.
- **Preservado** em `Assets/`: `Settings/` (URP2D), assets URP na raiz,
  `StreamingAssets/LimeZu/` (arte-fonte: 12 chars, 339 móveis, room_builder), `Scripts/Net/`
  (Api.cs + MiniSignalR.cs).
- **F1 começada:** escrito `Assets/Editor/AssetPipeline.cs` — menu **`Office Quest ▸ 1 · Import Art (F1)`**.
  Ele copia a arte de StreamingAssets → Assets/Art e configura os importers (PPU16, Point, mipmaps,
  fatiamento). **Ainda NÃO foi rodado.**
- Manifest limpo (sem pacote pendente que possa dar erro ao abrir).

## 3. Primeiros passos assim que o MCP estiver vivo

1. Claude roda o menu `Office Quest ▸ 1 · Import Art (F1)` (via MCP `execute_menu_item`, ou você roda).
2. Claude lê o Console (via MCP) e verifica no disco os `.meta` (PPU/fatiamento/pivô).
3. **F1b** — tiles + RuleTiles de parede autoconectáveis: adicionar o pacote **2D Tilemap Extras**
   pelo `Window ▸ Package Manager` (deixe a UI escolher a versão certa pro Unity 6.5), depois o
   Claude gera as RuleTiles (vai renderizar o atlas rotulado pra mapear as células).
4. **F1c** — 1 prefab por móvel (com colisor + YSort).
5. Depois, **F2** — a sala de referência (o gate visual do plano).

Tudo o que foi decidido está registrado na memória do Claude (arquivo do projeto).
