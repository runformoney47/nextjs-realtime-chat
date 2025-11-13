const { chromium } = require('playwright')
require('dotenv').config({ path: '.env.local' })

async function simulateUsers(userCount = 10) {
  const browsers = []
  
  console.log(`Starting simulation with ${userCount} users...`)
  
  for (let i = 0; i < userCount; i++) {
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext()
    const page = await context.newPage()
    
    // Simulate user behavior
    await simulateUserBehavior(page, i)
    
    browsers.push(browser)
  }
  
  // Keep browsers open for a while
  await new Promise(resolve => setTimeout(resolve, 30000))
  
  // Clean up
  for (const browser of browsers) {
    await browser.close()
  }
}

async function simulateUserBehavior(page, userIndex) {
  try {
    // Navigate to login page
    await page.goto('http://localhost:3000/login')
    
    // Wait for Google login button
    await page.waitForSelector('button[type="button"]')
    
    // Click login (this will open Google OAuth)
    await page.click('button[type="button"]')
    
    // Wait a bit
    await page.waitForTimeout(2000)
    
    // Simulate typing in chat (if logged in)
    try {
      await page.waitForSelector('textarea', { timeout: 5000 })
      const chatInput = await page.$('textarea')
      if (chatInput) {
        await chatInput.fill(`Hello from simulated user ${userIndex}!`)
        await page.keyboard.press('Enter')
      }
    } catch (e) {
      console.log(`User ${userIndex}: Could not find chat input`)
    }
    
    // Simulate random actions
    setInterval(async () => {
      try {
        // Randomly send messages
        if (Math.random() > 0.7) {
          const chatInput = await page.$('textarea')
          if (chatInput) {
            await chatInput.fill(`Random message from user ${userIndex} at ${new Date().toLocaleTimeString()}`)
            await page.keyboard.press('Enter')
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }, 5000 + Math.random() * 10000) // Random interval between 5-15 seconds
    
  } catch (error) {
    console.error(`Error simulating user ${userIndex}:`, error)
  }
}

// Run simulation
const userCount = process.argv[2] ? parseInt(process.argv[2]) : 5
simulateUsers(userCount)

