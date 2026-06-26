require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$connect()
  .then(() => { console.log('CONNECTED TO DB'); prisma.$disconnect(); })
  .catch(err => { console.error('FAILED TO CONNECT', err); prisma.$disconnect(); });
