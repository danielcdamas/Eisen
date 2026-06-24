# Eisen — Matriz de Eisenhower (PWA)

> Priorização de tarefas é o segredo para o sucesso.

App de produtividade baseado na **Matriz de Eisenhower**. É um **PWA** (Progressive
Web App): roda no navegador, funciona **offline**, e pode ser **instalado** no
celular/tablet/PC **sem instalar nada** — basta abrir a URL.

O princípio norteador do produto: **o maior inimigo de um app de produtividade é o
atrito**. A prioridade nº 1 é **capturar e classificar uma tarefa em segundos**.

## Como usar (sem instalar nada na sua máquina)

Como é HTML/CSS/JS puro (sem build, sem dependências), há três caminhos:

1. **Abrir online** — hospede a pasta em qualquer hospedagem estática
   (Vercel, GitHub Pages, Netlify) e acesse pela URL. No celular, use o menu do
   navegador → **"Adicionar à tela inicial" / "Instalar app"**.
2. **GitHub Pages** — em *Settings → Pages*, publique a branch. A URL gerada já
   serve o PWA com HTTPS (necessário para service worker e instalação).
3. **Local rápido** (opcional, só se quiser testar no PC) — qualquer servidor
   estático, por exemplo `python3 -m http.server` na pasta do projeto, e abrir
   `http://localhost:8000`.

> O service worker (offline) e a instalação exigem **HTTPS** (ou `localhost`).
> Abrir o `index.html` direto pelo `file://` mostra o app, mas sem offline/instalação.

## Funcionalidades do MVP (v1)

Conforme o briefing — foco em vencer o atrito:

- **Captura rápida** (FAB **＋**, < 3 s, só texto) com parsing de `#projeto` e `@pessoa`.
- **Caixa de Entrada** pré-matriz: jogue a tarefa agora, classifique depois.
- **Matriz 2×2** com **arrastar-e-soltar** (PC/tablet) e **tocar-e-segurar**
  (celular) para mover tarefas entre quadrantes.
- **Visão "Hoje"** (atrasadas + para hoje + Q1).
- **Datas**: vencimento (prazo) e planejada (quando pretende fazer) — separadas.
- **Etiquetas + projeto/contexto** (`#projeto` / `@pessoa`) com filtro.
- **Links** na tarefa.
- **Concluir / arquivar / excluir** com **lixeira** e *desfazer*.
- **Busca e filtros** instantâneos.
- **Responsividade adaptativa**: celular = 1 quadrante por aba + FAB; tablet =
  matriz 2×2; PC = matriz completa + atalhos de teclado + nav lateral.
- **Offline-first / local-first** com **IndexedDB** (dados gravados primeiro no
  dispositivo).
- **Acessibilidade**: alvos de toque ≥ 48 px, navegação por teclado, rótulos
  ARIA, contraste, suporte a *reduced motion*.
- **Vício saudável**: micro-celebração de "Hoje concluído" e **ofensiva (streak)
  gentil** — nunca punitiva, sem dark patterns.

### Atalhos de teclado (PC)

| Tecla | Ação |
|-------|------|
| `N` | Nova tarefa |
| `/` | Buscar |
| `T` / `M` / `I` | Hoje / Matriz / Entrada |
| `1`–`4` | Selecionar quadrante (na Matriz) |
| `Esc` | Fechar |

## Privacidade

Nesta versão, **todos os dados ficam no seu dispositivo** (IndexedDB). Nada é
enviado a servidores. Em *Configurações* há **exportar/importar backup** (`.json`).
Sincronização em nuvem é Fase 2/3 (ver briefing).

## Estrutura

```
index.html              Casco do app e todas as telas
css/styles.css          Estilos + responsividade adaptativa + temas
js/db.js                Camada local-first sobre IndexedDB
js/app.js               Estado, views, captura, gestos, atalhos
manifest.webmanifest    Metadados do PWA (instalação)
sw.js                   Service worker (offline)
icons/                  Ícones do app
```

## Roadmap (do briefing)

- **Fase 2**: NLP na entrada (sempre como *sugestão* editável), perguntas guiadas,
  áudio (com fallback), lembretes/notificações configuráveis, recorrência,
  delegação 1-clique, anexos, revisão semanal, analytics Q1×Q2.
- **Fase 3**: Modo Foco / Pomodoro, widgets, webhooks & API, captura de motivo ao
  eliminar, sincronização multi-dispositivo.

### Decisões registradas
- **Plataformas-alvo v1**: Android, tablet e desktop (navegador). iOS/Safari não
  é alvo primário do v1 (muda premissas de push e voz).
- **Auto-routing**: apenas **alerta visual**, nunca classificação silenciosa.
- **Áudio**: *fast-follow* com fallback, validar suporte de voz em spike técnico.
