# Como subir e testar o Office Quest

Este é o roteiro atual do cliente **web Phaser**. O cliente Unity está arquivado e não participa do
produto nem dos testes novos.

## 0. Só quero testar o cliente (sem backend)

Para olhar a cena, andar, sentar, pegar café e conferir mapas **sem subir o backend nem logar**, use
o modo dev — ele pula a portaria de login:

```text
http://localhost:8123/?dev=1&scene=tooq-office-1
```

Trava de segurança: `?dev=1` só vale em **host local** (`localhost`, `127.0.0.1`, `*.localhost`). Em
qualquer domínio real (beta, tunnel, produção) o parâmetro é ignorado e o login normal vale, então
isso nunca vira porta dos fundos publicada. Para deixar ligado sem repetir o parâmetro:
`localStorage.setItem('oq_dev_bypass','1')`.

Nesse modo o jogo roda **offline**: sem inventário/horas persistidos e sem presença/voz em rede
(some sozinho). O que é do cliente funciona — cena, movimento, sentar (assento é claim local),
café, decoração local. Para persistência e multiplayer, suba o backend (seção 1) com
`Auth:DevBypass=true` e use `?userId=`.

## 1. Backend obrigatório (para persistência e rede)

Abra um PowerShell na raiz do repositório:

```powershell
Push-Location .\backend\VirtualOffice.Api
dotnet build
.\bin\Debug\net10.0\VirtualOffice.Api.dll
```

Espere o backend responder em `http://localhost:5210` e deixe o terminal aberto. Executar dentro
dessa pasta mantém o SQLite em `backend/VirtualOffice.Api/office.db`.

O primeiro boot cria usuários, tasks, catálogo de itens e duas instâncias de cada móvel curado para
cada usuário humano. Para zerar tudo, pare o backend, faça uma cópia se necessário, apague
`office.db` e execute novamente.

Abra `http://localhost:5210` para usar o app administrativo de kanban, horas, relatórios e perfil.

## 2. Cliente Phaser

Em outro terminal, na raiz:

```powershell
node client-web/server.js
```

Abra:

```text
http://localhost:8123/#world
```

O servidor não possui dependências npm. Ele também observa `.tmj`, `.tsj` e `.tj`: salvar no Tiled
valida o projeto e recarrega a cena aberta.

O jogador padrão é o usuário `1`. Para outro inventário:

```text
http://localhost:8123/?userId=2#world
```

Essa identidade é apenas de protótipo e vira o header `X-User-Id`. Não é autenticação segura.

## 3. Controles atuais

- `WASD` ou setas: andar;
- `E`: usar o móvel próximo ou entrar/sair por um portal;
- `Tab`: abrir equipamentos e customização;
- `Shift`: usar o veículo equipado;
- `1`–`4`: equipar veículo rapidamente;
- `0`: guardar veículo;
- scroll: zoom;
- `Esc`: fechar menus e interações.

Dentro de uma sala declarada em `rooms[]`, aparece `Decorar <sala>`.

## 4. Testar inventário e decoração

1. Entre no `Escritório Tooq` pelo portal do mundo.
2. Caminhe para `Escritório A` ou `Escritório B`.
3. Clique em `Decorar Escritório A/B`.
4. Confira que cada cartão mostra uma quantidade, por exemplo `2 no inventário`.
5. Escolha um móvel e clique numa posição válida do piso.
6. Feche e reabra a página: a unidade deve continuar na mesma posição.
7. Mova e espelhe o item; a alteração deve persistir.
8. Selecione `Remover` ou `Recolher seus móveis`: a mesma unidade deve voltar ao estoque.

O editor não altera o `.tmj`. Pisos, paredes, portas, ruas e portais continuam sendo level design no
Tiled. Móveis do Tiled são cenário-base; móveis colocados pelo jogador são instâncias persistidas.

## 5. Testar móveis interativos

As interações exigem que o jogador possua e posicione a peça.

### Kanban

1. Coloque `Quadro de planejamento` (`of_171`).
2. Feche o editor, aproxime-se e pressione `E`.
3. Selecione uma task não concluída no seu nome.
4. A mensagem `Atividade ativa atualizada` confirma a escolha.

### Baú

1. Coloque `Armário servidor` (`of_176`), usado temporariamente como visual de baú.
2. Pressione `E` perto dele.
3. Guarde uma unidade disponível; ela deve sair do editor.
4. Retire a unidade; ela deve voltar ao inventário.

### Cadeira e estação

1. Coloque uma estação/computador e uma cadeira a até `2,75` tiles dela.
2. Pressione `E` perto da cadeira ou da estação.
3. Escolha uma atividade: o backend abre um `TimeEntry` e o status vira `🔴 CÓDIGO`.
4. Abra novamente e use `Encerrar contador`.
5. Confira o lançamento em `http://localhost:5210`, na área de horas.

Uma cadeira sem computador próximo explica que a composição está incompleta em vez de iniciar horas.

## 6. Testar sincronização SignalR

1. Abra duas janelas com o mesmo usuário e a mesma sala:

   ```text
   http://localhost:8123/?userId=1#tooq-office
   ```

2. Entre no mesmo escritório nas duas e abra o editor.
3. Coloque ou mova uma peça na primeira janela.
4. A segunda deve refletir inclusão, movimento e remoção sem recarregar.
5. Guarde/retire um item no baú e confira a atualização do estoque.

Os eventos atuais são `FurniturePlaced`, `FurnitureMoved`, `FurnitureRemoved`,
`InventoryChanged`, `ChestChanged` e `WorkSessionChanged`. Eles sincronizam mobília e inventário;
avatares Phaser ainda não possuem presença por cena.

## 7. URLs úteis de desenvolvimento

```text
# Abrir uma cena
http://localhost:8123/?scene=world
http://localhost:8123/?scene=tooq-office&spawn=entrance

# Mostrar colisões
http://localhost:8123/?scene=tooq-office&debug=collisions

# Abrir diretamente o editor de uma sala
http://localhost:8123/?decorateRoom=office-a#tooq-office

# Prévia das interações (combinar com decorateRoom para carregar as instâncias)
http://localhost:8123/?decorateRoom=office-a&interactionPreview=kanban#tooq-office
http://localhost:8123/?decorateRoom=office-a&interactionPreview=chest#tooq-office
http://localhost:8123/?decorateRoom=office-a&interactionPreview=workstation#tooq-office

# Prévia de equipamento
http://localhost:8123/?scene=tooq-office&equipmentPreview=motorcycle&equipmentDirection=up
```

## 8. LiveKit opcional

O cliente Phaser ainda não integrou A/V, mas o app web antigo continua usando LiveKit:

```powershell
& ".\livekit\start-livekit.ps1"
```

Espere a porta HTTP `7880`. Sem LiveKit, mapa, inventário, decoração e horas funcionam normalmente.

## 9. Verificação antes de entregar

```powershell
node --test client-web/tools/*.test.mjs
dotnet build backend/VirtualOffice.Api/VirtualOffice.Api.csproj
git diff --check
```

Além dos testes, abra o cliente, leia o console e confira visualmente o fluxo alterado. Ao controlar
o avatar por automação, desative `scene.input.keyboard.enabled` somente durante o teste e religue ao
terminar.

## 10. Problemas comuns

| Sintoma | Causa/solução |
|---|---|
| Editor abre com `0 no inventário` | Backend parado, usuário inexistente ou CORS/porta incorreta. Confira `http://localhost:5210/api/game/inventory` com `X-User-Id`. |
| `address already in use` | Já existe backend ou cliente rodando nessa porta; encerre o processo anterior. |
| O mapa abre, mas mobília não persiste | O Phaser funciona offline, porém a API é a fonte de verdade; suba o backend. |
| Móvel do Tiled não pode ser arrastado no editor do jogo | Correto: ele é cenário-base. Só instâncias possuídas são editáveis pelo jogador. |
| Outro usuário vê o móvel, mas não consegue editá-lo | Correto: a API valida o dono da instância. Permissões compartilhadas ainda não existem. |
| Cadeira não abre a estação | Posicione um item `workstation` a no máximo `2,75` tiles. |
| Já existe um contador ativo | Encerre o timer no app web ou na estação antes de iniciar outro. |
| Build mostra `NU1903` | Alerta conhecido de `SQLitePCLRaw`; não quebra o protótipo, mas deve ser resolvido antes de produção. |
