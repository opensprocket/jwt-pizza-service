# 🍕 jwt-pizza-service

![Coverage badge](https://pizza-factory.cs329.click/api/badge/jbreiter/jwtpizzaservicecoverage)

Backend service for making JWT pizzas. This service tracks users and franchises and orders pizzas. All order requests are passed to the JWT Pizza Factory where the pizzas are made.

JWTs are used for authentication objects.

## Deployment

In order for the server to work correctly it must be configured by providing a `config.js` file.

```js
module.exports =  {
    // Your JWT secret can be any random string you would like. It just needs to be secret.
   jwtSecret: 'yourjwtsecrethere',
   db: {
   connection: {
      host: '127.0.0.1',
      user: 'root',
      password: 'yourpasswordhere',
      database: 'pizza',
      connectTimeout: 60000,
   },
   listPerPage: 10,
   },
   factory: {
   url: 'https://pizza-factory.cs329.click',
   apiKey: 'yourapikeyhere',
   },
};
```

You will also need to create and populate a `.env` file in order to use the included `docker-compose.yml` stack (which runs the MySQL server). Put the root password that you want to use in the container into the .env file. 

```
MYSQL_ROOT_PASSWORD=your_root_password_here
```
Double check to make sure that `.env` files have been added to the `.gitignore` file.

Create a `docker-compose.yml` file with the following contents (you may want to check and make sure that you are on the latest LTS version of MySQL): 

```
services:
  db:
    image: mysql:8.4.7
    container_name: mysql-db
    restart: unless-stopped
    ports:
      - "3306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}
    volumes:
      - db-data:/var/lib/mysql

volumes:
  db-data:
  
```

Start the docker stack by making sure docker is installed and/or running (as appropriate for your system) and then running the following from a terminal session in the root directory of the project:

```
docker compose up -d
```

To stop the docker stack run the following (also from the root directory of the project):

```
docker compose down
```





## Endpoints

You can get the documentation for all endpoints by making the following request.

```sh
curl localhost:3000/api/docs
```

## Development notes

Install the required packages.

```sh
npm install express jsonwebtoken mysql2 bcrypt
```

Nodemon is assumed to be installed globally so that you can have hot reloading when debugging.

```sh
npm -g install nodemon
```
