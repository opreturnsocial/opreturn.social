# CONTRIBUTING

## dev

To run the dev build:

1. Copy .env.example → .env in each app directory
2. Run yarn install in the root workspace
3. Start Polar with 1 bitcoin core node
4. cd apps/cache-server && yarn db:migrate && yarn db:generate
5. cd apps/facilitator && yarn db:migrate && yarn db:generate
6. Start Polar with a regtest node
7. yarn dev:cache, yarn dev:facilitator, yarn dev:frontend (3 terminals)
