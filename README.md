
# Password Strength Tester

Um serviço web moderno para testar a força de passwords e verificar se foram expostas em bases de dados públicas (Have I Been Pwned), utilizando k-anonymity para máxima privacidade.

## Visão Geral

Este projeto oferece:
- **Validação de força de password** usando [zxcvbn](https://github.com/dropbox/zxcvbn) (frontend)
- **Verificação de exposição** via [HIBP](https://haveibeenpwned.com/API/v3#PwnedPasswords) sem nunca enviar a password ou hash completo
- **API REST** robusta com FastAPI
- **Frontend demo** interativo
- **Cache Redis** para otimizar chamadas HIBP
- **Rate limiting** por IP
- **Logging estruturado** em JSON
- Pronto para Docker e CI/CD

## Arquitetura

- **Backend:** FastAPI, Python 3.10+, SQLAlchemy (PostgreSQL/SQLite), Redis
- **Frontend:** HTML/CSS/JS (zxcvbn.js)
- **Docker:** Containers para app, Redis e DB
- **Testes:** Pytest

Estrutura principal:

```
├── app/           # Backend FastAPI
│   ├── main.py    # App principal
│   ├── api/       # Endpoints REST
│   ├── core/      # Cache, logging, hibp
│   ├── models.py  # Modelos SQLAlchemy
│   ├── schemas.py # Schemas Pydantic
│   └── ...
├── web/           # Frontend demo
│   ├── demo.html
│   ├── demo.js
│   └── demo.css
├── tests/         # Testes Pytest
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .env.example   # Modelo de variáveis ambiente
```

## Como funciona

1. **Frontend** calcula força da password (zxcvbn) e SHA-1 localmente
2. Só o **prefixo SHA-1** (5 chars) é enviado para o backend
3. Backend consulta HIBP (ou cache Redis) e devolve se o prefixo/suffix foi exposto
4. Nenhuma password ou hash completo é transmitido ou guardado

## Instalação e Execução

1. Clone o repositório:
	```bash
	git clone https://github.com/JoaoAlves05/Password-Tester.git
	cd Password-Tester
	```
2. Copie o modelo de ambiente:
	```bash
	cp .env.example .env
	# Edite .env com as suas configs (NUNCA comite .env)
	```
3. Execute com Docker:
	```bash
	docker-compose up --build
	```
4. Aceda:
	- API: [http://localhost:8000](http://localhost:8000)
	- Demo: [http://localhost:8000/web/demo.html](http://localhost:8000/web/demo.html)

## Endpoints Principais

### Pwned Passwords
- `POST /api/v1/pwned-range` — Verifica se o prefixo SHA-1 existe
  - Body: `{ "prefix": "5BAA6" }`
- `POST /api/v1/check` — Verifica se o prefixo/suffix está exposto
  - Body: `{ "prefix": "...", "suffix": "..." }`

### Password Score
- `POST /api/v1/score` — Recebe resultado zxcvbn do cliente
  - Body: `{ "zxcvbn": {...} }`

## Segurança & Privacidade

- Nunca armazena passwords ou hashes completos
- Só recebe prefixo SHA-1 (5 chars) do cliente
- Cache HIBP em Redis (TTL 24h)
- Rate limiting por IP/API key
- Logs nunca contêm passwords ou hashes completos
- CORS configurável por ambiente

## Testes

```bash
pytest --cov
```

## Variáveis de Ambiente

Veja `.env.example` para todos os parâmetros necessários:

- `REDIS_URL` — URL do Redis
- `DATABASE_URL` — URL da base de dados
- `SECRET_KEY` — Chave secreta da app
- `ALLOWED_ORIGINS` — URLs permitidos para CORS

## Desenvolvimento

- Código Python em `app/`
- Frontend demo em `web/`
- Testes em `tests/`
- Use o [`.env.example`](.env.example) como referência para configs
- Nunca comite o `.env` real

## CI/CD

Pipeline GitHub Actions para testes, lint e integração contínua.

## Notas Adicionais

- Em produção, configure CORS e segredos adequadamente
- Para SQLite local, use `sqlite+aiosqlite:///./test.db` em `DATABASE_URL`
- Recomenda-se usar Docker para ambiente isolado

---
**Dúvidas ou sugestões?** Abra uma issue ou contacte o autor.
