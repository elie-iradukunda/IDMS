import { Sequelize } from 'sequelize';
import 'dotenv/config';

// Without this, Sequelize fails deep inside node:url with
// "The \"url\" argument must be of type string. Received undefined" — a stack
// trace that says nothing about the actual problem, which is simply that
// nobody set the connection string. Say so plainly instead.
if (!process.env.DATABASE_URL) {
  console.error(
    'Startup refused: DATABASE_URL is not set.\n'
    + '  Local:   copy disability-ims-backend/.env.example to .env and fill it in.\n'
    + '  Railway: add a MySQL database, then set DATABASE_URL=${{MySQL.MYSQL_URL}} on the app service.',
  );
  process.exit(1);
}

// MySQL connection for the Disability Support IMS
export const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'mysql',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: { max: 10, min: 0, idle: 10000 },
});
