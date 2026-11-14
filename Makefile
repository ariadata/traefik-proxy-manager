.PHONY: init install run dev-web build start clean compose-up compose-down help

init:
	bash ./scripts/init.sh

install:
	npm install
	npm install --prefix web

run:
	npm run dev

dev-web:
	npm run dev:web

build:
	npm run build

start:
	npm start

clean:
	rm -rf node_modules web/node_modules server/dist web/dist

compose-up: init
	docker compose up -d --build

compose-down:
	docker compose down

help:
	@echo "Node $$(node -v) (pin: $$(cat .nvmrc))"
	@echo "Targets: init install run dev-web build start clean compose-up compose-down"
