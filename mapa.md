# 🗺️ Mapa do Sistema — PokeTche

Um panorama de como o PokeTche funciona: onde cada dado mora, o que são os
processos que você roda no desenvolvimento e como o tablet conversa com tudo.

Resumo em uma frase: **Postgres (Docker, :5434) = todos os dados do app · Supabase
= só o login · Cloudflare R2 = só os arquivos de imagem.** Os 2 terminais (API +
Metro) são as ferramentas de desenvolvimento que ligam o seu PC ao tablet via USB.

---

## O desenho geral

```
   TABLET (Galaxy Tab)                    SEU PC (Windows)                    NUVEM
 ┌─────────────────────┐          ┌──────────────────────────────┐      ┌──────────────┐
 │  App dev client     │  USB     │  TERMINAL 2: Metro (8081)     │      │  Supabase    │
 │  com.poketche.app   │◄────────►│  serve o código JS do app     │      │  (Auth)      │
 │                     │  adb     │                               │      │  e-mail/senha│
 │                     │ reverse  │  TERMINAL 1: API (3000)       │      │  sessões     │
 │                     │◄────────►│  Fastify (backend)            │◄────►│  (login)     │
 └─────────────────────┘          │        │                      │      └──────────────┘
                                  │        ▼                      │      ┌──────────────┐
                                  │  Postgres (5434, Docker)      │      │ Cloudflare R2│
                                  │  catálogo, coleções, preços…  │      │ (imagens)    │
                                  └──────────────────────────────┘      └──────────────┘
                                  (API busca imagem no R2 ou na fonte) ─────────►
```

---

## 1. Quais são os bancos de dados?

O Postgres roda em **Docker**, com **2 containers** (ver `docker-compose.yml`):

| Container         | Porta (host) | Persistência                              | Pra quê                                                                 |
| ----------------- | ------------ | ----------------------------------------- | ---------------------------------------------------------------------- |
| `poketche-db`     | **5434**     | volume `poketche-db-data` (**permanente**) | O banco **de verdade** — é aqui que está TUDO (catálogo, coleções, usuários…). |
| `poketche-db-test`| 5435         | `tmpfs` (RAM, **apagado a cada subida**)   | Só os testes automatizados (`vitest`) usam. O app **nunca** toca nele.  |

Na prática, **o único banco de dados de negócio é o `poketche-db` na porta 5434**.
O outro é descartável, só pra rodar testes.

> ⚠️ O Supabase **não é o banco de dados de negócio** — é um serviço só de login
> (ver seção 5).

---

## 2. O que são os 2 terminais?

São as **2 janelas** que o `start.ps1` abre:

- **Terminal 1 — API (porta 3000):** o backend Fastify (`pnpm --filter api dev`).
  É quem conversa com o Postgres e responde as telas do app em JSON.
- **Terminal 2 — Metro (porta 8081):** o servidor de desenvolvimento do Expo. Ele
  **entrega o código JavaScript/TypeScript do app** pro tablet e faz o hot reload
  quando você edita.

O tablet acessa os dois pelo cabo USB, graças ao `adb reverse` (túnel): no tablet,
`localhost:8081` vira o Metro e `localhost:3000` vira a API. Por isso não depende
de Wi-Fi nem de firewall.

> Se fechar qualquer uma das duas janelas, o app perde a conexão correspondente
> (sem Metro não recarrega o código; sem API as telas ficam sem dados).

---

## 3. Como funciona (o fluxo)

1. O tablet abre o **dev client** (o app nativo instalado, `com.poketche.app`).
2. Ele baixa o **bundle de código** do **Metro** (8081) pelo USB.
3. Ao usar o app, ele faz chamadas HTTP pra **API** (3000) pelo USB.
4. A API consulta o **Postgres** (5434) e devolve os dados.
5. Login: o app fala com o **Supabase**, recebe um token, e manda esse token pra
   API, que só o valida (via JWKS — a API nunca vê a senha).

---

## 4. Onde ficam as imagens e as informações das cartas?

Duas coisas **separadas**:

- **Informações das cartas** (nome, número, raridade, traduções PT/EN, **e a URL
  da imagem**) → **Postgres**, nas tabelas `card_set`, `card`, `card_translation`.
  Foi isso que o job `catalog-sync` carregou (174 edições / ~20k cartas /
  ~31k traduções).
- **Os arquivos de imagem em si** → o Postgres guarda só o *link*; os *bytes* da
  imagem vêm de um **cache próprio no Cloudflare R2** (bucket `poketche-images`).
  Se a imagem não estiver no cache, a API busca na fonte original
  (pokemontcg.io / TCGdex), grava no R2 e serve. Endpoint:
  `GET /catalog/images/:translationId/:size` (`small` | `large`).

---

## 5. Onde ficam as informações dos usuários?

Divididas de propósito em **dois lugares**:

- **Login / identidade** (e-mail, **senha**, sessão) → **Supabase Auth** (nuvem).
  A API **nunca guarda senha** — ela só verifica o token JWT que o Supabase emitiu.
- **Perfil e dados do usuário no app** (nome de exibição, preferências,
  **coleção**, wishlists, endereços, reputação) → **Postgres**, na tabela
  `user_profile` e nas relacionadas.

O elo entre os dois: no schema, `UserProfile.id` é literalmente o **mesmo id** do
usuário no Supabase (`id String @id // = id do Supabase Auth`).

---

## 6. Onde cada coisa mora (tabela-resumo)

| Dado                                            | Onde                          |
| ----------------------------------------------- | ----------------------------- |
| Catálogo (edições, cartas, traduções PT/EN)     | Postgres (`card_set`, `card`, `card_translation`) |
| Coleção do usuário, wishlists, preços, snapshots| Postgres                      |
| Perfil, preferências, endereços, reputação      | Postgres (`user_profile`)     |
| E-mail, senha, sessão de login                  | Supabase Auth (nuvem)         |
| Arquivos de imagem das cartas (bytes)           | Cloudflare R2 (`poketche-images`) |
| Evidências de disputa (futuro, US6)             | Cloudflare R2 (`poketche-disputes`) |

---

## Portas de referência

| Serviço            | Endereço                    |
| ------------------ | --------------------------- |
| API (Fastify)      | `http://localhost:3000`     |
| Health check       | `http://localhost:3000/health` |
| Metro (Expo)       | `http://localhost:8081`     |
| Postgres (dev)     | `localhost:5434`            |
| Postgres (teste)   | `localhost:5435`            |
| App no aparelho    | `com.poketche.app`          |

---

## Como subir tudo

```powershell
.\start.ps1              # fluxo diário (app já instalado no tablet)
.\start.ps1 -Rebuild     # primeira vez, ou quando mudar dependência NATIVA
.\start.ps1 -NoBackend   # se Postgres/API já estiverem rodando
```
