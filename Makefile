VOICE_BIN := packages/voice/.venv/bin
CODEGEN_HEADER := \# GENERATED from @stark-ai/contracts — DO NOT EDIT. Regenerate with 'make codegen'.

.PHONY: codegen test-contracts test-mcp-tools setup-mcp-screen dev-offline dev-voice

test-mcp-tools: ## run MCP tool server tests
	cd tools/mcp-os && npm test
	cd tools/mcp-files && npm test
	cd tools/mcp-web && npm test
	cd tools/mcp-productivity && npm test
	cd tools/mcp-dev && npm test
	cd tools/mcp-screen && PYTHONPATH=. ./.venv/bin/pytest tests -q

setup-mcp-screen: ## create the mcp-screen venv and install its pinned official MCP SDK dependencies
	python3 -m venv tools/mcp-screen/.venv
	tools/mcp-screen/.venv/bin/python -m pip install --upgrade pip
	tools/mcp-screen/.venv/bin/python -m pip install -r tools/mcp-screen/requirements.txt

dev-offline: ## start offline hub and fake voice stub; hub loads MCP servers from tools/mcp.config.json
	env -u NO_COLOR npx concurrently --handle-input --default-input-target voice -n hub,voice -c cyan,green \
	  "cd packages/core && npm run dev:hub" \
	  "packages/voice/.venv/bin/python packages/voice/fake_voice.py"

dev-voice: ## start offline hub and real offline voice client; hub loads MCP servers from tools/mcp.config.json
	@curl -sf -m 2 http://localhost:8880/v1/models >/dev/null 2>&1 || \
	  echo "⚠️  Kokoro TTS non raggiungibile su :8880 — le risposte saranno MUTE. Avvialo con: docker compose -f docker/docker-compose.yml up -d"
	env -u NO_COLOR npx concurrently --handle-input --default-input-target voice -n hub,voice -c cyan,green \
	  "cd packages/core && npm run dev:hub" \
	  "cd packages/voice && ./.venv/bin/python -m offline_voice"

codegen: ## Zod → JSON Schema → Pydantic (run after ANY contract change)
	cd packages/contracts && npm run gen
	$(VOICE_BIN)/datamodel-codegen \
	  --input packages/contracts/dist-schema/events.schema.json \
	  --input-file-type jsonschema \
	  --output packages/voice/contracts_gen/events.py \
	  --output-model-type pydantic_v2.BaseModel \
	  --target-python-version 3.12 \
	  --disable-timestamp \
	  --custom-file-header "$(CODEGEN_HEADER)"
	$(VOICE_BIN)/datamodel-codegen \
	  --input packages/contracts/dist-schema/persona.schema.json \
	  --input-file-type jsonschema \
	  --output packages/voice/contracts_gen/persona.py \
	  --output-model-type pydantic_v2.BaseModel \
	  --target-python-version 3.12 \
	  --disable-timestamp \
	  --custom-file-header "$(CODEGEN_HEADER)"

test-contracts: ## contract tests on both sides of the boundary
	cd packages/contracts && npm test
	cd packages/voice && ./.venv/bin/pytest tests/test_contracts.py -v
