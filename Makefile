VOICE_BIN := packages/voice/.venv/bin
CODEGEN_HEADER := \# GENERATED from @stark-ai/contracts — DO NOT EDIT. Regenerate with 'make codegen'.

.PHONY: codegen test-contracts dev-offline dev-voice

dev-offline: ## start offline hub and fake voice stub
	env -u NO_COLOR npx concurrently --handle-input --default-input-target voice -n hub,voice -c cyan,green \
	  "cd packages/core && npm run dev:hub" \
	  "packages/voice/.venv/bin/python packages/voice/fake_voice.py"

dev-voice: ## start offline hub and real offline voice client
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
