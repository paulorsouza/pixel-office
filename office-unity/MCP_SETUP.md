# Conectar o Claude ao Unity (MCP) — mcp-unity (Node)

> **ARQUIVADO.** O cliente atual é Phaser e é validado diretamente no navegador.

Usa o **mcp-unity** (CoderGamester), servidor em Node. Objetivo: numa **sessão nova** do Claude Code,
eu passo a **enxergar e dirigir o Unity direto** (inspecionar cena/console, rodar comandos) — fim do
trabalho às cegas.

## Já feito (pelo Claude) ✅
- Servidor Node clonado e compilado em `C:\Users\prs\Claude Sessions\mcp-unity-server\Server~\build\index.js`.
- Pacote Unity adicionado ao `office-unity/Packages/manifest.json` (`com.gamelovers.mcp-unity`).
- Config do Claude Code criada em `C:\Users\prs\Claude Sessions\.mcp.json` (aponta pro Node + servidor).

## O que VOCÊ faz agora

### 1. Unity importa o pacote
- Volte pra janela do Unity e espere ele **importar o pacote novo** (baixa o `mcp-unity` do GitHub e
  compila). Quando terminar, aparece um menu **Tools ▸ MCP Unity**.

### 2. Ligar o servidor DENTRO do Unity
- **Tools ▸ MCP Unity ▸ Server Window** ▸ clique **Start Server**.
- Deve mostrar o servidor escutando (WebSocket, porta **8090**). Deixe o Unity aberto.

### 3. Reiniciar o Claude Code
- **Feche e reabra o Claude Code** (nesta pasta `Claude Sessions`) — as ferramentas MCP só carregam ao
  iniciar a sessão.
- Ao abrir, ele deve **perguntar se aprova o servidor MCP `mcp-unity`** → **aprove** (Yes/Trust).

### 4. Pronto
- Na sessão nova, me diga "testa o MCP do Unity" — eu chamo uma ferramenta (ex.: ler a cena/console)
  pra confirmar que estou enxergando o editor.

---

## Importante
- **Não funciona nesta conversa atual** — só na **próxima** (depois de reiniciar o Claude Code).
- Precisa do **Unity aberto com o Server ligado** (passo 2) toda vez que quiser que eu controle o editor.
- Se der erro no passo 1 (importar pacote), me manda o print — pode ser só o clone do git demorando.
