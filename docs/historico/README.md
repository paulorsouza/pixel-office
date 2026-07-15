# Histórico — arquivo morto (⚠️ contém fatos obsoletos)

Estes arquivos são uma **cópia da memória do Claude Code** (que vivia em
`~/.claude/projects/.../memory/`), trazida pra dentro do repo em 2026-07-15 pra ficar
**portátil e versionada** — utilizável por qualquer ferramenta (Codex, Cursor, etc.),
sem depender do Claude.

## ⚠️ NÃO use isto como fonte de verdade técnica

Este material foi **acumulado ao longo de meses** (a maior parte na era Unity) e **partes já foram
corrigidas depois**. Exemplos de erros que estão aqui dentro:

- A **ordem das direções** das folhas de personagem LimeZu aparece como `down/up/left/right`.
  **Está errado.** O correto, verificado nos pixels, é **`right(0-5), up(6-11), left(12-17), down(18-23)`**.
- Várias decisões de arquitetura (Unity, Tauri, roof-reveal, tilemap via script) foram **revertidas**.

**A fonte de verdade é [`../../CONTEXT.md`](../../CONTEXT.md).** Ele tem os fatos verificados,
corrigidos e datados.

## Para que serve então?

Para responder **"por que chegamos aqui"** — o rastro das decisões, o que já foi tentado e falhou,
e por quê. É contexto histórico, não instrução.

## Arquivos

| Arquivo | O que é |
|---|---|
| `00-indice-memoria.md` | O índice que o Claude carregava a cada sessão |
| `01-historico-projeto.md` | **O grandão** (532 linhas): todo o histórico desde 2026-07-07 — protótipo, backend, cliente Unity, tentativas de arte, pivôs |
| `02-decisao-web-poc.md` | A decisão de ir pra web (Phaser) e o resumo do POC |
