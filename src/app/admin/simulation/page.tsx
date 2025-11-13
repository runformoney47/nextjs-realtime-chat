'use client'

import { useState, useEffect } from 'react'

export default function SimulationDashboard() {
  const [activeUsers, setActiveUsers] = useState(0)
  const [messages, setMessages] = useState<string[]>([])
  const [isSimulating, setIsSimulating] = useState(false)

  const startSimulation = async () => {
    setIsSimulating(true)
    // Start simulation script
    try {
      const response = await fetch('/api/simulation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCount: 50 })
      })
      
      if (response.ok) {
        console.log('Simulation started')
      }
    } catch (error) {
      console.error('Failed to start simulation:', error)
    }
  }

  const stopSimulation = async () => {
    setIsSimulating(false)
    try {
      await fetch('/api/simulation/stop', { method: 'POST' })
      console.log('Simulation stopped')
    } catch (error) {
      console.error('Failed to stop simulation:', error)
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Chat Simulation Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-100 p-4 rounded">
          <h3 className="font-semibold">Active Users</h3>
          <p className="text-2xl">{activeUsers}</p>
        </div>
        
        <div className="bg-green-100 p-4 rounded">
          <h3 className="font-semibold">Messages Sent</h3>
          <p className="text-2xl">{messages.length}</p>
        </div>
        
        <div className="bg-yellow-100 p-4 rounded">
          <h3 className="font-semibold">Status</h3>
          <p className="text-2xl">{isSimulating ? 'Running' : 'Stopped'}</p>
        </div>
      </div>

      <div className="space-x-4 mb-6">
        <button
          onClick={startSimulation}
          disabled={isSimulating}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          Start Simulation
        </button>
        
        <button
          onClick={stopSimulation}
          disabled={!isSimulating}
          className="bg-red-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          Stop Simulation
        </button>
      </div>

      <div className="bg-gray-100 p-4 rounded h-64 overflow-y-auto">
        <h3 className="font-semibold mb-2">Simulation Log</h3>
        {messages.map((msg, index) => (
          <div key={index} className="text-sm mb-1">
            {msg}
          </div>
        ))}
      </div>
    </div>
  )
}

