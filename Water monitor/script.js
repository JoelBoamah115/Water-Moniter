// import { Chart } from "@/components/ui/chart"
class WaterMonitoringDashboard {
  constructor() {
    this.config = {
      channelId: "3018403",
      readApiKey: "L9GH5CDPBODGVBDJ",
      updateInterval: 10000,
      ranges: {
        ph: { min: 6.5, max: 8.5 },
        turbidity: { min: 0, max: 5 },
        temperature: { min: 15, max: 30 },
        waterlevel: { min: 50, max: 200 },
      },
    }

    this.sensorData = {
      ph: [],
      turbidity: [],
      temperature: [],
      waterlevel: [],
    }

    this.chart = null
    this.updateTimer = null
    this.isConnected = false

    this.init()
  }

  init() {
    this.loadSettings()
    this.setupChart()
    this.updateRangeDisplays()
    this.startDataFetching()

    // Setup event listeners
    document.getElementById("timeRange").addEventListener("change", () => {
      this.updateChart()
    })
  }

  loadSettings() {
    const saved = localStorage.getItem("waterMonitorSettings")
    if (saved) {
      this.config = { ...this.config, ...JSON.parse(saved) }
    }

    // Load settings into form
    document.getElementById("channelId").value = this.config.channelId || ""
    document.getElementById("readApiKey").value = this.config.readApiKey || ""
    document.getElementById("updateInterval").value = this.config.updateInterval

    // Load ranges
    Object.keys(this.config.ranges).forEach((sensor) => {
      document.getElementById(`${sensor}Min`).value = this.config.ranges[sensor].min
      document.getElementById(`${sensor}Max`).value = this.config.ranges[sensor].max
    })
  }

  saveSettings() {
    // Get ThingSpeak settings
    this.config.channelId = document.getElementById("channelId").value
    this.config.readApiKey = document.getElementById("readApiKey").value
    this.config.updateInterval = Number.parseInt(document.getElementById("updateInterval").value)

    // Get ranges
    Object.keys(this.config.ranges).forEach((sensor) => {
      const min = Number.parseFloat(document.getElementById(`${sensor}Min`).value)
      const max = Number.parseFloat(document.getElementById(`${sensor}Max`).value)

      if (!isNaN(min) && !isNaN(max)) {
        this.config.ranges[sensor] = { min, max }
      }
    })

    // Save to localStorage
    localStorage.setItem("waterMonitorSettings", JSON.stringify(this.config))

    // Update displays
    this.updateRangeDisplays()

    // Restart data fetching with new interval
    this.startDataFetching()

    this.closeSettings()
    this.showNotification("Settings saved successfully!", "success")
  }

  updateRangeDisplays() {
    Object.keys(this.config.ranges).forEach((sensor) => {
      const range = this.config.ranges[sensor]
      document.getElementById(`${sensor}Range`).textContent = `${range.min} - ${range.max}`
    })
  }

  async fetchSensorData() {
    if (!this.config.channelId || !this.config.readApiKey) {
      this.updateConnectionStatus(false, "Configuration required")
      return
    }

    try {
      const timeRange = document.getElementById("timeRange").value
      const url = `https://api.thingspeak.com/channels/${this.config.channelId}/feeds.json?api_key=${this.config.readApiKey}&results=${timeRange}`

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      if (data.feeds && data.feeds.length > 0) {
        this.processSensorData(data.feeds)
        this.updateConnectionStatus(true, "Connected")
        this.updateLastUpdated()
      } else {
        throw new Error("No data received")
      }
    } catch (error) {
      console.error("Error fetching data:", error)
      this.updateConnectionStatus(false, "Connection error")
      this.showAlert("Failed to fetch sensor data. Please check your configuration.")
    }
  }

  processSensorData(feeds) {
    // Clear existing data
    Object.keys(this.sensorData).forEach((sensor) => {
      this.sensorData[sensor] = []
    })

    // Process feeds
    feeds.forEach((feed) => {
      const timestamp = new Date(feed.created_at)

      // Field mapping: field1=pH, field2=turbidity, field3=temperature, field4=waterlevel
      if (feed.field1 !== null) {
        this.sensorData.ph.push({
          value: Number.parseFloat(feed.field1),
          timestamp: timestamp,
        })
      }

      if (feed.field2 !== null) {
        this.sensorData.turbidity.push({
          value: Number.parseFloat(feed.field2),
          timestamp: timestamp,
        })
      }

      if (feed.field3 !== null) {
        this.sensorData.temperature.push({
          value: Number.parseFloat(feed.field3),
          timestamp: timestamp,
        })
      }

      if (feed.field4 !== null) {
        this.sensorData.waterlevel.push({
          value: Number.parseFloat(feed.field4),
          timestamp: timestamp,
        })
      }
    })

    // Update displays
    this.updateSensorCards()
    this.updateChart()
    this.checkAlerts()
  }

  updateSensorCards() {
    Object.keys(this.sensorData).forEach((sensor) => {
      const data = this.sensorData[sensor]
      const valueElement = document.getElementById(`${sensor}Value`)
      const statusElement = document.getElementById(`${sensor}Status`)

      if (data.length > 0) {
        const latestValue = data[data.length - 1].value
        valueElement.textContent = latestValue.toFixed(sensor === "waterlevel" ? 0 : 1)

        // Check if value is in safe range
        const range = this.config.ranges[sensor]
        const isInRange = latestValue >= range.min && latestValue <= range.max

        statusElement.className = `status-badge ${isInRange ? "ok" : "error"}`
        statusElement.innerHTML = `<i class="fas fa-circle"></i><span>${isInRange ? "OK" : "Alert"}</span>`
      } else {
        valueElement.textContent = "--"
        statusElement.className = "status-badge"
        statusElement.innerHTML = '<i class="fas fa-circle"></i><span>No Data</span>'
      }
    })
  }

  setupChart() {
    const ctx = document.getElementById("sensorChart").getContext("2d")

    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "sensor values",
            data: [],
            borderColor: "#667eea",
            backgroundColor: "rgba(102, 126, 234, 0.1)",
            tension: 0.4,
            yAxisID: "y",
          },
          {
            label: "Turbidity (NTU)",
            data: [],
            borderColor: "#f5576c",
            backgroundColor: "rgba(245, 87, 108, 0.1)",
            tension: 0.4,
            yAxisID: "y1",
          },
          {
            label: "Temperature (°C)",
            data: [],
            borderColor: "#4facfe",
            backgroundColor: "rgba(79, 172, 254, 0.1)",
            tension: 0.4,
            yAxisID: "y2",
          },
          {
            label: "Water Level (cm)",
            data: [],
            borderColor: "#43e97b",
            backgroundColor: "rgba(67, 233, 123, 0.1)",
            tension: 0.4,
            yAxisID: "y3",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            position: "top",
          },
          tooltip: {
            mode: "index",
            intersect: false,
          },
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: "Time",
            },
          },
          y: {
            type: "linear",
            display: true,
            position: "left",
            title: {
              display: true,
              text: "pH",
            },
            grid: {
              drawOnChartArea: false,
            },
          },
          y1: {
            type: "linear",
            display: false,
            position: "right",
            grid: {
              drawOnChartArea: false,
            },
          },
          y2: {
            type: "linear",
            display: false,
            position: "right",
            grid: {
              drawOnChartArea: false,
            },
          },
          y3: {
            type: "linear",
            display: false,
            position: "right",
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    })
  }

  updateChart() {
    if (!this.chart) return

    const labels = []
    const datasets = this.chart.data.datasets

    // Clear existing data
    datasets.forEach((dataset) => {
      dataset.data = []
    })

    // Find common timestamps
    const allTimestamps = new Set()
    Object.values(this.sensorData).forEach((sensorArray) => {
      sensorArray.forEach((point) => {
        allTimestamps.add(point.timestamp.getTime())
      })
    })

    const sortedTimestamps = Array.from(allTimestamps).sort()

    sortedTimestamps.forEach((timestamp) => {
      const date = new Date(timestamp)
      labels.push(date.toLocaleTimeString())

      // pH data
      const phPoint = this.sensorData.ph.find((p) => p.timestamp.getTime() === timestamp)
      datasets[0].data.push(phPoint ? phPoint.value : null)

      // Turbidity data
      const turbidityPoint = this.sensorData.turbidity.find((p) => p.timestamp.getTime() === timestamp)
      datasets[1].data.push(turbidityPoint ? turbidityPoint.value : null)

      // Temperature data
      const tempPoint = this.sensorData.temperature.find((p) => p.timestamp.getTime() === timestamp)
      datasets[2].data.push(tempPoint ? tempPoint.value : null)

      // Water level data
      const levelPoint = this.sensorData.waterlevel.find((p) => p.timestamp.getTime() === timestamp)
      datasets[3].data.push(levelPoint ? levelPoint.value : null)
    })

    this.chart.data.labels = labels
    this.chart.update()
  }

  checkAlerts() {
    const alerts = []

    Object.keys(this.sensorData).forEach((sensor) => {
      const data = this.sensorData[sensor]
      if (data.length > 0) {
        const latestValue = data[data.length - 1].value
        const range = this.config.ranges[sensor]

        if (latestValue < range.min || latestValue > range.max) {
          const sensorName = sensor.charAt(0).toUpperCase() + sensor.slice(1)
          alerts.push(`${sensorName}: ${latestValue.toFixed(1)} (Range: ${range.min}-${range.max})`)
        }
      }
    })

    if (alerts.length > 0) {
      this.showAlert(`Sensor values out of range: ${alerts.join(", ")}`)
    } else {
      this.closeAlert()
    }
  }

  showAlert(message) {
    const alertBanner = document.getElementById("alertBanner")
    const alertMessage = document.getElementById("alertMessage")

    alertMessage.textContent = message
    alertBanner.style.display = "block"
  }

  closeAlert() {
    document.getElementById("alertBanner").style.display = "none"
  }

  updateConnectionStatus(connected, message) {
    const statusDot = document.getElementById("connectionStatus")
    const statusText = document.getElementById("connectionText")

    this.isConnected = connected
    statusDot.className = `status-dot ${connected ? "connected" : "error"}`
    statusText.textContent = message
  }

  updateLastUpdated() {
    const now = new Date()
    document.getElementById("lastUpdated").textContent = now.toLocaleString()
  }

  startDataFetching() {
    // Clear existing timer
    if (this.updateTimer) {
      clearInterval(this.updateTimer)
    }

    // Fetch data immediately
    this.fetchSensorData()

    // Set up recurring fetch
    this.updateTimer = setInterval(() => {
      this.fetchSensorData()
    }, this.config.updateInterval)
  }

  showNotification(message, type = "info") {
    // Simple notification - you could enhance this with a proper notification system
    console.log(`${type.toUpperCase()}: ${message}`)
  }

  openSettings() {
    document.getElementById("settingsModal").classList.add("active")
  }

  closeSettings() {
    document.getElementById("settingsModal").classList.remove("active")
  }
}

// Global functions for HTML event handlers
function openSettings() {
  dashboard.openSettings()
}

function closeSettings() {
  dashboard.closeSettings()
}

function saveSettings() {
  dashboard.saveSettings()
}

function closeAlert() {
  dashboard.closeAlert()
}

// Initialize dashboard when page loads
let dashboard
document.addEventListener("DOMContentLoaded", () => {
  dashboard = new WaterMonitoringDashboard()
})
