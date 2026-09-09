.PHONY: setup check test dashboard status audit help
setup:
	npm ci
	npm run setup
check:
	npm run check
test:
	npm test
dashboard:
	npm run dashboard
status:
	npm run jobs -- status
audit:
	npm run jobs -- audit
help:
	@printf 'make setup | check | test | dashboard | status | audit\nRead SETUP.md for the agent-led interview.\n'
