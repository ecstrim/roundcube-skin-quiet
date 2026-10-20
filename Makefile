COMPOSE := UID=$(shell id -u) GID=$(shell id -g) docker compose -f dev/compose.yml
LESS_SRC := skins/quiet/styles/styles.less
# Roundcube image tag of the dev stack, and the source of Elastic's LESS (see "Upgrading Roundcube" in the skin README).
export RC_TAG ?= 1.6.20-apache

.PHONY: up down seed css e2e shots showcase deps

up:
	$(COMPOSE) up -d mail roundcube roundcube-plain dovecot roundcube-threads

down:
	$(COMPOSE) down

# Same fixtures into GreenMail (:8460/:8461) and Dovecot (:8462, threads).
seed:
	$(COMPOSE) run --rm seed
	$(COMPOSE) run --rm -e IMAP_HOST=dovecot -e IMAP_PORT=143 seed

# Elastic's LESS sources are build inputs only (git-ignored): copied from the dev Roundcube image.
skins/elastic/styles/styles.less:
	mkdir -p skins/elastic
	docker run --rm --user $(shell id -u):$(shell id -g) --entrypoint sh -v $(CURDIR)/skins/elastic:/out roundcube/roundcubemail:$(RC_TAG) \
	  -c 'cp -r /usr/src/roundcubemail/skins/elastic/. /out/ 2>/dev/null || cp -r /var/www/html/skins/elastic/. /out/'

# Compile the Quiet skin LESS (no-op until the skin has styles); scheme-* are the colour-scheme variants. Rewrites Elastic's relative urls (fonts, images)
# so they resolve to ../../elastic/ at runtime.
css: deps skins/elastic/styles/styles.less
	@if [ -f $(LESS_SRC) ]; then \
	  $(COMPOSE) run --rm node sh -c 'for f in styles embed print scheme-cobalt scheme-teal scheme-indigo; do \
	    npx lessc --rewrite-urls=all --clean-css="--s1 --advanced" skins/quiet/styles/$$f.less > skins/quiet/styles/$$f.min.css || exit 1; done'; \
	else echo "css: $(LESS_SRC) not present yet, nothing to build"; fi

# Stamp file: npm ci only reruns when package-lock.json is newer than the last install.
deps: node_modules/.stamp

node_modules/.stamp: package-lock.json package.json
	$(COMPOSE) run --rm node sh -c 'npm ci --no-audit --no-fund && touch node_modules/.stamp'

e2e: deps
	$(COMPOSE) run --rm e2e npx playwright test $(ARGS)

shots: deps
	$(COMPOSE) run --rm -e SHOTS=1 e2e npx playwright test tests/shots/shots.spec.ts $(ARGS)

# README screenshots into docs/screenshots/ (committed), from the separate `demo` mailbox.
showcase: deps
	$(COMPOSE) run --rm seed python showcase.py
	$(COMPOSE) run --rm -e SHOTS=1 e2e npx playwright test tests/shots/showcase.spec.ts $(ARGS)
