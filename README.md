
`npm install`
`touch .env`
`set -o allexport`
`source .env`
`npm run start:dev`

Watch out for production deployment, the `hull-node` it pointed at development branch,
so in case of heroku installation you need:

https://devcenter.heroku.com/articles/nodejs-support#devdependencies

