import { Sequelize } from 'sequelize';
import 'dotenv/config';

// MySQL connection for the Disability Support IMS
export const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'mysql',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: { max: 10, min: 0, idle: 10000 },
});
