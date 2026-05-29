import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission()
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
