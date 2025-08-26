# Password Strength Tester

Serviço web para testar força de passwords e verificar exposição (pwned) via Have I Been Pwned (HIBP) usando k-anonymity.

## Funcionalidades

- Validação de força de password (zxcvbn)
- Verificação de exposição (HIBP, nunca envia password/suffix)
- Cache Redis, rate-limiting, logging estruturado
- API REST e frontend demo
- Docker-ready

## Setup rápido

```bash
cp .env.example .env
docker-compose up --build
```

Aceda a [http://localhost:8000](http://localhost:8000) (API) e [http://localhost:8000/web/demo.html](http://localhost:8000/web/demo.html) (demo).

## Endpoints principais

- `POST /api/v1/pwned-range` — body: `{ "prefix": "5BAA6" }`
- `POST /api/v1/check` — body: `{ "prefix": "...", "suffix": "..." }`
- `POST /api/v1/score` — body: `{ "zxcvbn": {...} }`

## Segurança & Privacidade

- Nunca armazena passwords ou hashes completos.
- Só recebe prefixo SHA-1 (5 chars) do cliente.
- Cache HIBP em Redis (TTL 24h).
- Rate limiting por IP/API key.
- Logs nunca contêm passwords ou hashes completos.

## Testes

```bash
pytest --cov
```

## Variáveis de ambiente

Ver `.env.example`.

## Notas

- Em produção, configure CORS e segredos adequadamente.
- Para SQLite local, use `sqlite+aiosqlite:///./test.db` em `DATABASE_URL`.
