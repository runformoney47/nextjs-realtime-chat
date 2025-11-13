const { Redis } = require('@upstash/redis')
require('dotenv').config({ path: '.env.local' })

const db = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

// Generate fake users
function generateUsers(count) {
  const users = []
  for (let i = 1; i <= count; i++) {
    users.push({
      id: `user-${i}`,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`,
      createdAt: new Date().toISOString()
    })
  }
  return users
}

async function seedUsers(userCount = 100) {
  try {
    console.log(`Seeding ${userCount} users...`)
    
    const users = generateUsers(userCount)
    
    // Store each user in Redis
    for (const user of users) {
      await db.set(`user:${user.id}`, JSON.stringify(user))
      console.log(`Created user: ${user.name}`)
    }
    
    console.log(`Successfully seeded ${userCount} users!`)
  } catch (error) {
    console.error('Error seeding users:', error)
  }
}

// Run the script
const userCount = process.argv[2] ? parseInt(process.argv[2]) : 100
seedUsers(userCount)

