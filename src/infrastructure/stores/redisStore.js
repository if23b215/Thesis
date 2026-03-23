const { createClient } = require('redis');

async function testRedis() {
  const client = createClient();

  client.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  await client.connect();

  await client.set('test', 'ok');
  const value = await client.get('test');

  console.log(value === 'ok' ? 'node-redis works' : `unexpected value: ${value}`);

  await client.close();
}

module.exports = { testRedis };